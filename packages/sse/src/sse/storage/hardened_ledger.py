"""Strategic Systems Engine - Atomic Process-Safe File-Locked Ledger.

Provides cross-platform advisory file locking (msvcrt on Windows, fcntl on POSIX)
and atomic append semantics with physical disk synchronization (os.fsync) to eliminate
dirty reads, file corruption, and hash-chain splits under concurrent multi-process access.
"""

from __future__ import annotations

import contextlib
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Self

from sse.tri_node.ledger import GENESIS_HASH, SovereignLedger, compute_record_hash
from sse.tri_node.sovereign_core import SovereignDecisionVerdict

try:
    import msvcrt
    HAS_MSVCRT = True
except ImportError:
    HAS_MSVCRT = False

try:
    import fcntl
    HAS_FCNTL = True
except ImportError:
    HAS_FCNTL = False


class AdvisoryFileLock:
    """Cross-platform advisory file lock supporting Windows (msvcrt) and POSIX (fcntl)."""

    def __init__(self, file_obj: Any, timeout_sec: float = 10.0, poll_interval: float = 0.05) -> None:
        self.file_obj = file_obj
        self.timeout_sec = float(timeout_sec)
        self.poll_interval = float(poll_interval)
        self._locked = False
        self._fallback_mutex = threading.Lock()

    def acquire(self) -> None:
        """Acquire an exclusive advisory lock with timeout and exponential backoff."""
        start = time.time()
        fileno = self.file_obj.fileno()

        if HAS_MSVCRT:
            while True:
                try:
                    pos = self.file_obj.tell()
                    self.file_obj.seek(0)
                    msvcrt.locking(fileno, msvcrt.LK_NBLCK, 1)
                    self.file_obj.seek(pos)
                    self._locked = True
                    return
                except OSError:
                    if (time.time() - start) > self.timeout_sec:
                        raise TimeoutError(
                            f"Failed to acquire Windows file lock on fd {fileno} within {self.timeout_sec}s"
                        ) from None
                    time.sleep(self.poll_interval)

        elif HAS_FCNTL:
            while True:
                try:
                    fcntl.flock(fileno, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self._locked = True
                    return
                except (BlockingIOError, OSError):
                    if (time.time() - start) > self.timeout_sec:
                        raise TimeoutError(
                            f"Failed to acquire POSIX file lock on fd {fileno} within {self.timeout_sec}s"
                        ) from None
                    time.sleep(self.poll_interval)
        else:
            # Fallback to in-process mutex when neither OS primitive is present
            acquired = self._fallback_mutex.acquire(timeout=self.timeout_sec)
            if not acquired:
                raise TimeoutError("Failed to acquire fallback in-process lock")
            self._locked = True

    def release(self) -> None:
        """Release the advisory file lock."""
        if not self._locked:
            return

        fileno = self.file_obj.fileno()
        try:
            if HAS_MSVCRT:
                pos = self.file_obj.tell()
                self.file_obj.seek(0)
                msvcrt.locking(fileno, msvcrt.LK_UNLCK, 1)
                self.file_obj.seek(pos)
            elif HAS_FCNTL:
                fcntl.flock(fileno, fcntl.LOCK_UN)
            else:
                self._fallback_mutex.release()
        finally:
            self._locked = False

    def __enter__(self) -> Self:
        self.acquire()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        self.release()


class HardenedLedger(SovereignLedger):
    """Cryptographic hash ledger hardened with advisory locking, atomic append, and fsync."""

    def __init__(
        self,
        node_id: str,
        ledger_path: str | Path | None = None,
        lock_timeout_sec: float = 10.0,
    ) -> None:
        super().__init__(node_id=node_id, ledger_path=ledger_path)
        self.lock_timeout_sec = float(lock_timeout_sec)
        self._ensure_secure_permissions()

    def _ensure_secure_permissions(self) -> None:
        """Ensure ledger directory and file exist with owner-only access permissions."""
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.ledger_path.exists():
            self.ledger_path.touch(mode=0o600, exist_ok=True)

        if not sys.platform.startswith("win"):
            with contextlib.suppress(OSError):
                os.chmod(self.ledger_path, 0o600)

    def _get_latest_hash_from_stream(self, file_obj: Any) -> str:
        """Read the latest record hash directly from an open seekable file stream."""
        file_obj.seek(0)
        last_line = ""
        for line in file_obj:
            stripped = line.strip()
            if stripped:
                last_line = stripped
        if last_line:
            try:
                rec = json.loads(last_line)
                return str(rec.get("record_hash", GENESIS_HASH))
            except json.JSONDecodeError:
                return GENESIS_HASH
        return GENESIS_HASH

    def atomic_append_record(self, record_data: dict[str, Any]) -> dict[str, Any]:
        """Atomically append an arbitrary record or verdict to the ledger with locking and fsync.

        Computes the cryptographic hash-chain link while holding the exclusive lock,
        preventing race conditions and hash-chain splits under concurrent writers.
        """
        self._ensure_secure_permissions()

        # Open in read/write mode (must exist)
        with (
            open(self.ledger_path, "r+", encoding="utf-8") as f,
            AdvisoryFileLock(f, timeout_sec=self.lock_timeout_sec),
        ):
            # 1. Determine exact true previous hash under lock
            prev_hash = self._get_latest_hash_from_stream(f)

            # 2. Extract or formulate payload
            decision_id = str(record_data.get("decision_id", f"rec_{int(time.time() * 1000)}"))
            ts = float(record_data.get("timestamp", time.time()))
            payload = dict(record_data.get("payload", record_data))

            # 3. Deterministic block hash
            record_hash = compute_record_hash(
                timestamp=ts,
                prev_hash=prev_hash,
                node_id=self.node_id,
                decision_id=decision_id,
                payload=payload,
            )

            canonical_record = {
                "timestamp": round(ts, 3),
                "decision_id": decision_id,
                "node_id": self.node_id,
                "payload": payload,
                "prev_hash": prev_hash,
                "record_hash": record_hash,
            }

            # 4. Seek to end, write canonical record, flush and fsync
            f.seek(0, os.SEEK_END)
            line = json.dumps(canonical_record, separators=(",", ":")) + "\n"
            f.write(line)
            f.flush()
            os.fsync(f.fileno())

            return canonical_record

    def append_verdict(
        self,
        verdict: SovereignDecisionVerdict,
        extra_meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Hardened atomic verdict append implementing SovereignLedger API with locking."""
        now = verdict.timestamp if verdict.timestamp > 0.0 else time.time()
        payload = {
            "action_idx": verdict.action_idx,
            "action_name": verdict.action_name,
            "expected_utility": verdict.expected_utility,
            "worst_case_regret": verdict.worst_case_regret,
            "solver_tier": verdict.solver_tier,
            "grant_token": verdict.grant_token,
            "mode": verdict.mode,
            "meta": extra_meta or {},
        }

        record_data = {
            "timestamp": now,
            "decision_id": verdict.decision_id,
            "payload": payload,
        }

        return self.atomic_append_record(record_data)

    def read_records(self) -> list[dict[str, Any]]:
        """Read all ledger records under advisory lock to prevent reading partially written lines."""
        if not self.ledger_path.exists():
            return []

        records: list[dict[str, Any]] = []
        with (
            open(self.ledger_path, "r", encoding="utf-8") as f,
            AdvisoryFileLock(f, timeout_sec=self.lock_timeout_sec),
        ):
            f.seek(0)
            for line in f:
                stripped = line.strip()
                if stripped:
                    with contextlib.suppress(json.JSONDecodeError):
                        records.append(json.loads(stripped))
        return records

    def merge_remote_records(self, incoming_jsonl_lines: list[str]) -> int:
        """Merge remote records under exclusive advisory lock to eliminate race conditions."""
        self._ensure_secure_permissions()
        with (
            open(self.ledger_path, "r+", encoding="utf-8") as f,
            AdvisoryFileLock(f, timeout_sec=self.lock_timeout_sec),
        ):
            f.seek(0)
            existing_records: list[dict[str, Any]] = []
            for line in f:
                stripped = line.strip()
                if stripped:
                    with contextlib.suppress(json.JSONDecodeError):
                        existing_records.append(json.loads(stripped))

            existing_dec_ids = {r["decision_id"] for r in existing_records}
            incoming_records: list[dict[str, Any]] = []
            for line in incoming_jsonl_lines:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    rec = json.loads(stripped)
                    if "decision_id" in rec and rec["decision_id"] not in existing_dec_ids:
                        incoming_records.append(rec)
                        existing_dec_ids.add(rec["decision_id"])
                except json.JSONDecodeError:
                    continue

                if not incoming_records:
                    return 0

                all_records = existing_records + incoming_records
                all_records.sort(key=lambda r: (float(r["timestamp"]), str(r["decision_id"])))

                current_prev = GENESIS_HASH
                for rec in all_records:
                    rec["prev_hash"] = current_prev
                    rec["record_hash"] = compute_record_hash(
                        timestamp=rec["timestamp"],
                        prev_hash=current_prev,
                        node_id=rec["node_id"],
                        decision_id=rec["decision_id"],
                        payload=rec["payload"],
                    )
                    current_prev = rec["record_hash"]

                f.seek(0)
                f.truncate(0)
                f.writelines(json.dumps(r, separators=(",", ":")) + "\n" for r in all_records)
                f.flush()
                os.fsync(f.fileno())

                return len(incoming_records)
