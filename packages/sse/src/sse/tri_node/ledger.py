"""Strategic Systems Engine - Air-Gapped Append-Only Hash Ledger.

Implements a tamper-evident, append-only cryptographic hash chain in JSONL format.
Zero external dependencies (pure standard library).
Supports air-gapped solo logging and multi-node eventual-consistency reconciliation.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from sse.tri_node.sovereign_core import SovereignDecisionVerdict

GENESIS_HASH: str = "0" * 64


def compute_record_hash(
    timestamp: float,
    prev_hash: str,
    node_id: str,
    decision_id: str,
    payload: dict[str, Any],
) -> str:
    """Compute deterministic SHA-256 hash for a ledger block."""
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    raw = f"{timestamp:.3f}:{prev_hash}:{node_id}:{decision_id}:{canonical_payload}".encode()
    return hashlib.sha256(raw).hexdigest()


class SovereignLedger:
    """Append-only cryptographic hash ledger with tamper verification and merge capabilities."""

    def __init__(self, node_id: str, ledger_path: str | Path | None = None) -> None:
        self.node_id = str(node_id)
        if ledger_path is not None:
            self.ledger_path = Path(ledger_path)
        else:
            self.ledger_path = Path(f"{self.node_id.lower()}_ledger.jsonl")

    def get_latest_hash(self) -> str:
        """Retrieve the hash of the latest entry or genesis hash if empty."""
        if not self.ledger_path.exists() or self.ledger_path.stat().st_size == 0:
            return GENESIS_HASH

        try:
            with open(self.ledger_path, "r", encoding="utf-8") as f:
                last_line = ""
                for line in f:
                    stripped = line.strip()
                    if stripped:
                        last_line = stripped
                if last_line:
                    rec = json.loads(last_line)
                    return str(rec.get("record_hash", GENESIS_HASH))
        except Exception:
            return GENESIS_HASH

        return GENESIS_HASH

    def append_verdict(
        self,
        verdict: SovereignDecisionVerdict,
        extra_meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Append a sovereign decision verdict to the cryptographic ledger."""
        prev_hash = self.get_latest_hash()
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

        record_hash = compute_record_hash(
            timestamp=now,
            prev_hash=prev_hash,
            node_id=self.node_id,
            decision_id=verdict.decision_id,
            payload=payload,
        )

        record = {
            "timestamp": round(now, 3),
            "decision_id": verdict.decision_id,
            "node_id": self.node_id,
            "payload": payload,
            "prev_hash": prev_hash,
            "record_hash": record_hash,
        }

        # Parent directory creation
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, separators=(",", ":")) + "\n")
            f.flush()

        return record

    def append_raw_record(self, record_data: dict[str, Any]) -> dict[str, Any]:
        """Append an arbitrary record payload (e.g. notifications, audits) into the hash chain."""
        prev_hash = self.get_latest_hash()
        now = float(record_data.get("timestamp", time.time()))
        dec_id = str(record_data.get("decision_id", f"rec_{int(now * 1000)}"))
        payload = record_data.get("payload", {})

        record_hash = compute_record_hash(
            timestamp=now,
            prev_hash=prev_hash,
            node_id=self.node_id,
            decision_id=dec_id,
            payload=payload,
        )

        record = {
            "timestamp": round(now, 3),
            "decision_id": dec_id,
            "node_id": self.node_id,
            "payload": payload,
            "prev_hash": prev_hash,
            "record_hash": record_hash,
        }

        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, separators=(",", ":")) + "\n")
            f.flush()

        return record

    def append_record(self, item: Any) -> dict[str, Any]:
        """Polymorphic helper that appends a verdict or raw dictionary record."""
        if isinstance(item, dict):
            return self.append_raw_record(item)
        return self.append_verdict(item)

    def read_records(self) -> list[dict[str, Any]]:
        """Read all ledger records from the local file."""
        if not self.ledger_path.exists():
            return []

        records: list[dict[str, Any]] = []
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped:
                    try:
                        records.append(json.loads(stripped))
                    except json.JSONDecodeError:
                        continue
        return records

    def verify_integrity(self) -> tuple[bool, int, str]:
        """Verify contiguous hash-chain integrity and tamper detection across all blocks.

        Returns:
            (is_valid, record_count_or_failed_idx, status_message)
        """
        records = self.read_records()
        if not records:
            return True, 0, "EMPTY_GENESIS"

        expected_prev = GENESIS_HASH

        for idx, rec in enumerate(records):
            # Check prev_hash continuity
            if rec.get("prev_hash") != expected_prev:
                return (
                    False,
                    idx,
                    f"Chain discontinuity at block {idx}: expected prev {expected_prev}, got {rec.get('prev_hash')}",
                )

            # Recompute record_hash
            computed = compute_record_hash(
                timestamp=rec["timestamp"],
                prev_hash=rec["prev_hash"],
                node_id=rec["node_id"],
                decision_id=rec["decision_id"],
                payload=rec["payload"],
            )

            if rec.get("record_hash") != computed:
                return (
                    False,
                    idx,
                    f"Tamper detected at block {idx}: computed {computed}, recorded {rec.get('record_hash')}",
                )

            expected_prev = computed

        return True, len(records), "VERIFIED_VALID"

    def merge_remote_records(self, incoming_jsonl_lines: list[str]) -> int:
        """Merge records from remote peer nodes, deduplicate, and rebuild consistent hash chain."""
        existing_records = self.read_records()
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

        # Combine all records and sort deterministically by timestamp and decision_id
        all_records = existing_records + incoming_records
        all_records.sort(key=lambda r: (float(r["timestamp"]), str(r["decision_id"])))

        # Re-link contiguous hash-chain
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

        # Atomic write back to ledger
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        dir_name = self.ledger_path.parent
        with tempfile.NamedTemporaryFile("w", dir=dir_name, delete=False, encoding="utf-8") as tf:
            temp_name = tf.name
            for r in all_records:
                tf.write(json.dumps(r, separators=(",", ":")) + "\n")
            tf.flush()
            os.fsync(tf.fileno())

        os.replace(temp_name, self.ledger_path)
        return len(incoming_records)

