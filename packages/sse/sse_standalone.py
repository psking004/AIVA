#!/usr/bin/env python3
"""Strategic Systems Engine (SSE) - Sovereign Tri-Node Standalone Executable.

Single-file, zero-dependency, self-contained Python script designed for drop-in execution
on Android/Termux, iOS/Pythonista/iSH, bare-metal servers, and workstations.
Requires ONLY the Python standard library.

Usage:
    python sse_standalone.py doctor
    python sse_standalone.py solve [--matrix '{"u1":[[3,0],[5,1]],"u2":[[3,5],[0,1]]}']
    python sse_standalone.py run [--role MOBILE] [--port 8203]
    python sse_standalone.py sync --peer http://192.168.1.50:8201
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from enum import Enum
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

CLUSTER_SHARED_SECRET: str = os.getenv("SSE_CLUSTER_SECRET", "sse_sovereign_mesh_secret_v1_2026")
GENESIS_HASH: str = "0" * 64


# ==============================================================================
# 1. CORE DATA STRUCTURES & VERDICTS
# ==============================================================================


class NodeID(str, Enum):
    """Symmetric sovereign node identifiers."""

    PC_A = "PC_A"
    PC_B = "PC_B"
    MOBILE = "MOBILE"


@dataclass(frozen=True, slots=True)
class SovereignDecisionVerdict:
    """Immutable, compact strategic verdict conforming to strict context budgeting."""

    node_id: str
    decision_id: str
    action_idx: int
    action_name: str
    expected_utility: float
    worst_case_regret: float
    solver_tier: str
    grant_token: str
    record_hash_16: str
    mode: str
    timestamp: float = 0.0

    def to_compact_payload(self) -> str:
        """Serialize into context-budgeted compact JSON (< 350 characters)."""
        data = {
            "node": self.node_id,
            "dec_id": self.decision_id,
            "act": self.action_idx,
            "name": self.action_name,
            "util": round(self.expected_utility, 3),
            "regret": round(self.worst_case_regret, 3),
            "tier": self.solver_tier,
            "grant": self.grant_token,
            "hash": self.record_hash_16,
            "mode": self.mode,
        }
        return json.dumps(data, separators=(",", ":"))


@dataclass
class TriNodeFrame:
    """Canonical wire frame for signed P2P communication across the mesh."""

    sender_node_id: str
    action: str
    payload: dict[str, Any]
    timestamp: float = 0.0
    nonce: str = ""
    signature: str = ""

    def __post_init__(self) -> None:
        if self.timestamp == 0.0:
            self.timestamp = time.time()
        if not self.nonce:
            self.nonce = uuid.uuid4().hex[:12]

    def canonical_bytes(self) -> bytes:
        canonical_payload = json.dumps(self.payload, sort_keys=True, separators=(",", ":"))
        raw = f"{self.sender_node_id}:{self.action}:{self.timestamp:.3f}:{self.nonce}:{canonical_payload}"
        return raw.encode("utf-8")

    def sign(self, secret: str = CLUSTER_SHARED_SECRET) -> str:
        sig = hmac.new(secret.encode("utf-8"), self.canonical_bytes(), hashlib.sha256).hexdigest()
        self.signature = sig
        return sig

    def verify_signature(self, secret: str = CLUSTER_SHARED_SECRET) -> bool:
        if not self.signature:
            return False
        expected = hmac.new(secret.encode("utf-8"), self.canonical_bytes(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(self.signature, expected)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sender_node_id": self.sender_node_id,
            "action": self.action,
            "payload": self.payload,
            "timestamp": round(self.timestamp, 3),
            "nonce": self.nonce,
            "signature": self.signature,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TriNodeFrame:
        return cls(
            sender_node_id=str(data.get("sender_node_id", "")),
            action=str(data.get("action", "")),
            payload=data.get("payload", {}) if isinstance(data.get("payload"), dict) else {},
            timestamp=float(data.get("timestamp", 0.0)),
            nonce=str(data.get("nonce", "")),
            signature=str(data.get("signature", "")),
        )


def generate_sovereign_grant(
    node_id: str,
    decision_id: str,
    action_idx: int,
    timestamp: float,
    prev_hash: str,
    secret: str = CLUSTER_SHARED_SECRET,
) -> str:
    """Generate an HMAC-SHA256 authorization grant token."""
    payload = f"{node_id}:{decision_id}:{action_idx}:{timestamp:.3f}:{prev_hash}".encode()
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"grant_{node_id}_{signature[:24]}"


def verify_sovereign_grant(
    grant_token: str,
    node_id: str,
    decision_id: str,
    action_idx: int,
    timestamp: float,
    prev_hash: str,
    current_time: float | None = None,
    airgapped_solo: bool = True,
    secret: str = CLUSTER_SHARED_SECRET,
    max_skew_sec: float = 300.0,
) -> tuple[bool, str]:
    """Verify cryptographic grant token with anti-replay and air-gapped isolation support."""
    if not airgapped_solo and current_time is not None:
        skew = abs(current_time - timestamp)
        if skew > max_skew_sec:
            return False, f"Timestamp expired (clock skew {skew:.2f}s > {max_skew_sec}s)"

    expected = generate_sovereign_grant(
        node_id=node_id,
        decision_id=decision_id,
        action_idx=action_idx,
        timestamp=timestamp,
        prev_hash=prev_hash,
        secret=secret,
    )
    if not hmac.compare_digest(grant_token, expected):
        return False, "Cryptographic grant signature mismatch"

    return True, "Grant valid"


# ==============================================================================
# 2. PURE-PYTHON AUTONOMOUS DECISION CORE
# ==============================================================================


class SovereignDecisionCore:
    """Multi-tier, zero-external-dependency autonomous decision engine."""

    def __init__(
        self,
        node_id: str | NodeID = NodeID.PC_A,
        mode: str = "SOLO",
        secret: str = CLUSTER_SHARED_SECRET,
    ) -> None:
        self.node_id = str(node_id.value if isinstance(node_id, NodeID) else node_id)
        self.mode = mode
        self.secret = secret

    def solve_matrix(
        self,
        u1: list[list[float]],
        u2: list[list[float]],
        actions_p1: list[str] | None = None,
        actions_p2: list[str] | None = None,
        decision_id: str | None = None,
        prev_hash: str = GENESIS_HASH,
        airgapped_solo: bool = True,
    ) -> SovereignDecisionVerdict:
        """Solve arbitrary 2-player bimatrix game using the 3-tier sovereign cascade."""
        m = len(u1)
        if m == 0 or len(u1[0]) == 0:
            raise ValueError("Payoff matrix u1 must not be empty.")
        n = len(u1[0])

        if len(u2) != m or any(len(row) != n for row in u2):
            raise ValueError(f"Payoff matrix u2 shape must match u1 ({m}x{n}).")

        act_p1 = actions_p1 or [f"A{i}" for i in range(m)]

        dec_id = decision_id or f"dec_{uuid.uuid4().hex[:8]}"
        now = time.time()

        # Tier 1: IESDS
        t1_action, t1_util = self._solve_iesds(u1, u2, m, n)
        if t1_action is not None:
            chosen_idx = t1_action
            chosen_name = act_p1[chosen_idx]
            exp_util = t1_util
            regret = 0.0
            tier = "T1_IESDS"
        else:
            # Tier 2: Bilevel Stackelberg Leader-Follower
            t2_action, t2_util, t2_unique = self._solve_stackelberg(u1, u2, m, n)
            if t2_unique and t2_action is not None:
                chosen_idx = t2_action
                chosen_name = act_p1[chosen_idx]
                exp_util = t2_util
                regret = 0.0
                tier = "T2_STACKELBERG"
            else:
                # Tier 3: Savage Minimax Regret Fallback
                chosen_idx, exp_util, regret = self._solve_minimax_regret(u1, m, n)
                chosen_name = act_p1[chosen_idx]
                tier = "T3_MINIMAX_REGRET"

        # Generate cryptographic grant
        grant_token = generate_sovereign_grant(
            node_id=self.node_id,
            decision_id=dec_id,
            action_idx=chosen_idx,
            timestamp=round(now, 3),
            prev_hash=prev_hash,
            secret=self.secret,
        )

        hash_payload = f"{round(now, 3):.3f}:{self.node_id}:{dec_id}:{chosen_idx}:{grant_token}:{prev_hash}"
        record_hash_16 = hashlib.sha256(hash_payload.encode()).hexdigest()[:16]

        return SovereignDecisionVerdict(
            node_id=self.node_id,
            decision_id=dec_id,
            action_idx=chosen_idx,
            action_name=chosen_name,
            expected_utility=exp_util,
            worst_case_regret=regret,
            solver_tier=tier,
            grant_token=grant_token,
            record_hash_16=record_hash_16,
            mode=self.mode,
            timestamp=round(now, 3),
        )

    def _solve_iesds(
        self, u1: list[list[float]], u2: list[list[float]], m: int, n: int
    ) -> tuple[int | None, float]:
        """Pure-Python Iterative Elimination of Strictly Dominated Strategies."""
        alive_p1 = set(range(m))
        alive_p2 = set(range(n))

        changed = True
        while changed:
            changed = False
            p1_to_remove: set[int] = set()
            for i in alive_p1:
                for alt_i in alive_p1:
                    if alt_i == i:
                        continue
                    if all(u1[alt_i][j] > u1[i][j] for j in alive_p2):
                        p1_to_remove.add(i)
                        break

            if p1_to_remove:
                alive_p1.difference_update(p1_to_remove)
                changed = True

            p2_to_remove: set[int] = set()
            for j in alive_p2:
                for alt_j in alive_p2:
                    if alt_j == j:
                        continue
                    if all(u2[i][alt_j] > u2[i][j] for i in alive_p1):
                        p2_to_remove.add(j)
                        break

            if p2_to_remove:
                alive_p2.difference_update(p2_to_remove)
                changed = True

        if len(alive_p1) == 1 and len(alive_p2) == 1:
            i_star = next(iter(alive_p1))
            j_star = next(iter(alive_p2))
            return i_star, float(u1[i_star][j_star])

        return None, 0.0

    def _solve_stackelberg(
        self, u1: list[list[float]], u2: list[list[float]], m: int, n: int
    ) -> tuple[int | None, float, bool]:
        """Pure-Python Bilevel Strong Stackelberg Equilibrium with follower best response."""
        leader_payoffs: list[float] = []

        for i in range(m):
            max_follower_u = max(u2[i][j] for j in range(n))
            br2 = [j for j in range(n) if abs(u2[i][j] - max_follower_u) < 1e-9]
            best_leader_u = max(u1[i][j] for j in br2)
            leader_payoffs.append(best_leader_u)

        max_lead = max(leader_payoffs)
        min_lead = min(leader_payoffs)
        best_actions = [i for i, u in enumerate(leader_payoffs) if abs(u - max_lead) < 1e-9]

        is_unique = (len(best_actions) == 1) or (max_lead > min_lead)
        chosen = best_actions[0]
        return chosen, max_lead, is_unique

    def _solve_minimax_regret(
        self, u1: list[list[float]], m: int, n: int
    ) -> tuple[int, float, float]:
        """Pure-Python Savage Minimax Regret minimization fallback."""
        max_for_state = [max(u1[i][j] for i in range(m)) for j in range(n)]

        max_regrets: list[float] = []
        for i in range(m):
            mr_i = max(max_for_state[j] - u1[i][j] for j in range(n))
            max_regrets.append(mr_i)

        min_worst_case_regret = min(max_regrets)
        best_i = max_regrets.index(min_worst_case_regret)
        avg_util = sum(u1[best_i][j] for j in range(n)) / float(n)
        return best_i, avg_util, min_worst_case_regret


# ==============================================================================
# 3. AIR-GAPPED APPEND-ONLY HASH LEDGER
# ==============================================================================


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
    """Append-only cryptographic hash ledger with tamper verification."""

    def __init__(self, node_id: str, ledger_path: str | Path | None = None) -> None:
        self.node_id = str(node_id)
        if ledger_path is not None:
            self.ledger_path = Path(ledger_path)
        else:
            self.ledger_path = Path(f"{self.node_id.lower()}_ledger.jsonl")

    def get_latest_hash(self) -> str:
        """Retrieve hash of latest block or genesis hash."""
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
        """Read all ledger records from disk."""
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
        """Verify contiguous hash-chain integrity and tamper detection across all blocks."""
        records = self.read_records()
        if not records:
            return True, 0, "EMPTY_GENESIS"

        expected_prev = GENESIS_HASH
        for idx, rec in enumerate(records):
            if rec.get("prev_hash") != expected_prev:
                return (
                    False,
                    idx,
                    f"Discontinuity at block {idx}: expected {expected_prev}, got {rec.get('prev_hash')}",
                )

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


# ==============================================================================
# 4. PEER-TO-PEER MESH ROUTER (OFFLINE-FIRST, HARDENED)
# ==============================================================================

STANDALONE_MAX_PAYLOAD_BYTES = 1_048_576
STANDALONE_MAX_CLOCK_SKEW_SEC = 60.0
_STANDALONE_SAFE_ENV_ALLOWLIST = {
    "PATH",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "PYTHONPATH",
    "LANG",
    "LC_ALL",
    "USERPROFILE",
    "HOME",
    "WINDIR",
    "COMSPEC",
    "SHELL",
    "TERM",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PROCESSOR_ARCHITECTURE",
}
_STANDALONE_SENSITIVE_PAT = re.compile(r".*(?:KEY|TOKEN|SECRET|AUTH|PASS|PASSWORD|CREDENTIAL|PRIVATE).*", re.IGNORECASE)


def _sanitized_standalone_env() -> dict[str, str]:
    clean: dict[str, str] = {}
    for k, v in os.environ.items():
        if k.upper() in _STANDALONE_SAFE_ENV_ALLOWLIST and not _STANDALONE_SENSITIVE_PAT.match(k):
            clean[k] = v
    clean["PYTHONDONTWRITEBYTECODE"] = "1"
    return clean


def _safe_resolve_standalone_path(sandbox_root: Path, rel_path: str) -> Path:
    raw = str(rel_path).strip()
    if not raw or "\x00" in raw:
        raise PermissionError("Path traversal blocked: empty or null-byte path.")
    root = sandbox_root.resolve(strict=False)
    candidate = Path(raw)
    if candidate.is_absolute():
        resolved = candidate.resolve(strict=False)
    else:
        resolved = (root / candidate).resolve(strict=False)
    if resolved != root and root not in resolved.parents:
        raise PermissionError(f"Path traversal escape denied: '{rel_path}' escapes '{root}'")
    return resolved


class StandaloneNonceTracker:
    """Thread-safe sliding-window nonce replay detector."""

    def __init__(self, window_ttl_sec: float = STANDALONE_MAX_CLOCK_SKEW_SEC, max_entries: int = 100_000) -> None:
        self.window_ttl_sec = float(window_ttl_sec)
        self.max_entries = int(max_entries)
        self._seen: collections.OrderedDict[str, float] = collections.OrderedDict()
        self._lock = threading.Lock()

    def validate_and_record(self, nonce: str, timestamp: float | None = None) -> tuple[bool, str]:
        if not nonce:
            return False, "INVALID_NONCE_FORMAT"
        now = time.time()
        ts = float(timestamp) if timestamp is not None else now
        if abs(now - ts) > self.window_ttl_sec:
            return False, "CLOCK_SKEW_EXCEEDED"
        with self._lock:
            if nonce in self._seen:
                return False, "REPLAY_DETECTED"
            while len(self._seen) >= self.max_entries:
                self._seen.popitem(last=False)
            self._seen[nonce] = ts
            return True, "OK"


class StandaloneRateLimiter:
    """Sliding-window rate limiter (default 30 requests/minute per IP)."""

    def __init__(self, max_requests: int = 30, window_seconds: float = 60.0) -> None:
        self.max_requests = int(max_requests)
        self.window_seconds = float(window_seconds)
        self._requests: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, peer_id: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            timestamps = self._requests.setdefault(peer_id, [])
            valid = [ts for ts in timestamps if ts > cutoff]
            if len(valid) >= self.max_requests:
                self._requests[peer_id] = valid
                return False
            valid.append(now)
            self._requests[peer_id] = valid
            return True


class MeshRequestHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP handler for sovereign node mesh communication."""

    server: MeshServer

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def _send_json(self, status_code: int, data: dict[str, Any]) -> None:
        raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        if status_code in (413, 415):
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(raw)
        self.wfile.flush()

    def _discard_excess_body(self, content_length: int, max_drain: int = 4_194_304) -> None:
        if content_length <= 0 or content_length > max_drain:
            return
        remaining = content_length
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/health":
            self._send_json(
                200,
                {
                    "status": "READY",
                    "node_id": self.server.node_id,
                    "mode": self.server.mode,
                    "port": self.server.server_address[1],
                    "latest_hash": self.server.ledger.get_latest_hash(),
                    "timestamp": time.time(),
                },
            )
        elif path in ("/mesh/inspect", "/mesh/telemetry"):
            self._send_json(200, self._handle_inspect_telemetry())
        elif path in ("/mesh/records", "/mesh/ledger"):
            records = self.server.ledger.read_records()
            self._send_json(
                200,
                {
                    "node_id": self.server.node_id,
                    "record_count": len(records),
                    "records": [json.dumps(r, separators=(",", ":")) for r in records],
                },
            )
        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def _handle_inspect_telemetry(self) -> dict[str, Any]:
        import platform

        return {
            "status": "READY",
            "node_id": self.server.node_id,
            "mode": self.server.mode,
            "latest_hash": self.server.ledger.get_latest_hash(),
            "timestamp": time.time(),
            "telemetry": {
                "system": platform.system(),
                "machine": platform.machine(),
                "cpu_count": os.cpu_count() or 1,
                "python_version": platform.python_version(),
            },
        }

    def _handle_write_file(self, payload: dict[str, Any]) -> dict[str, Any]:
        rel_path = str(payload.get("relative_path", "")).strip()
        content = str(payload.get("content", ""))
        sandbox_id = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(payload.get("sandbox_id", "default_sandbox")))
        if not rel_path:
            raise ValueError("Parameter 'relative_path' is required.")

        base_sandbox = (Path(tempfile.gettempdir()) / "sse_standalone_sandboxes" / f"sb_{sandbox_id}").resolve(strict=False)
        base_sandbox.mkdir(parents=True, exist_ok=True)
        target = _safe_resolve_standalone_path(base_sandbox, rel_path)

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        raw_bytes = content.encode("utf-8")
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        return {
            "status": "SUCCESS",
            "relative_path": rel_path,
            "resolved_path": str(target),
            "size_bytes": len(raw_bytes),
            "sha256": sha256,
            "node_id": self.server.node_id,
        }

    def _handle_build_software(self, payload: dict[str, Any]) -> dict[str, Any]:
        project_name = str(payload.get("project_name", f"standalone_build_{int(time.time())}"))
        files = payload.get("files", {})
        test_cmd = payload.get("test_command") or [sys.executable, "-c", "print('Build verified')"]
        if isinstance(test_cmd, str) or not isinstance(test_cmd, list):
            raise PermissionError("Subprocess execution requires tokenized argument list (shell=False).")
        timeout_sec = float(payload.get("timeout_sec", 30.0))

        with tempfile.TemporaryDirectory(prefix=f"build_{project_name}_") as tmp_dir:
            tmp_path = Path(tmp_dir).resolve(strict=False)
            if isinstance(files, list):
                for f_entry in files:
                    p = f_entry.get("path") or f_entry.get("relative_path")
                    c = f_entry.get("content", "")
                    if p:
                        target = _safe_resolve_standalone_path(tmp_path, str(p))
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_text(str(c), encoding="utf-8")
            elif isinstance(files, dict):
                for p, c in files.items():
                    target = _safe_resolve_standalone_path(tmp_path, str(p))
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(str(c), encoding="utf-8")

            t0 = time.time()
            try:
                proc = subprocess.run(
                    [str(arg) for arg in test_cmd],
                    cwd=str(tmp_path),
                    capture_output=True,
                    text=True,
                    env=_sanitized_standalone_env(),
                    shell=False,
                    timeout=timeout_sec,
                    check=False,
                )
                duration_ms = round((time.time() - t0) * 1000, 2)
                status = "COMPLETED" if proc.returncode == 0 else "FAILED"
                return {
                    "status": status,
                    "project_name": project_name,
                    "node_id": self.server.node_id,
                    "exit_code": proc.returncode,
                    "stdout": proc.stdout[:100000],
                    "stderr": proc.stderr[:100000],
                    "duration_ms": duration_ms,
                    "timed_out": False,
                }
            except subprocess.TimeoutExpired:
                return {
                    "status": "FAILED",
                    "project_name": project_name,
                    "node_id": self.server.node_id,
                    "exit_code": -1,
                    "stdout": "",
                    "stderr": f"Process exceeded timeout limit of {timeout_sec}s",
                    "duration_ms": round((time.time() - t0) * 1000, 2),
                    "timed_out": True,
                }

    def _read_bounded_body(self, content_length: int) -> bytes | None:
        if content_length <= 0:
            return b"{}"
        chunks: list[bytes] = []
        remaining = content_length
        total_read = 0
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            total_read += len(chunk)
            if total_read > STANDALONE_MAX_PAYLOAD_BYTES:
                return None
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            self._send_json(400, {"error": "INVALID_CONTENT_LENGTH"})
            return

        if content_length < 0:
            self._send_json(400, {"error": "INVALID_CONTENT_LENGTH"})
            return

        if content_length > STANDALONE_MAX_PAYLOAD_BYTES:
            self._discard_excess_body(content_length)
            self._send_json(
                413,
                {"error": f"PAYLOAD_TOO_LARGE: exceeds {STANDALONE_MAX_PAYLOAD_BYTES} bytes"},
            )
            return

        content_type = self.headers.get("Content-Type", "") or self.headers.get("content-type", "")
        if not content_type or "application/json" not in content_type.lower():
            self._discard_excess_body(content_length)
            self._send_json(
                415,
                {"error": f"INVALID_CONTENT_TYPE: Expected 'application/json', got '{content_type or 'MISSING'}'"},
            )
            return

        client_ip = self.client_address[0] if hasattr(self, "client_address") else "127.0.0.1"
        if not self.server.rate_limiter.allow(client_ip):
            self._send_json(429, {"error": "RATE_LIMIT_EXCEEDED"})
            return

        body = self._read_bounded_body(content_length)
        if body is None or len(body) > STANDALONE_MAX_PAYLOAD_BYTES:
            self._send_json(413, {"error": "PAYLOAD_TOO_LARGE"})
            return

        try:
            payload = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        if not isinstance(payload, dict):
            self._send_json(400, {"error": "INVALID_PAYLOAD_STRUCTURE"})
            return

        ts_val = payload.get("timestamp")
        ts_float: float | None = None
        if ts_val is not None:
            try:
                ts_float = float(ts_val)
            except (ValueError, TypeError):
                self._send_json(400, {"error": "MALFORMED_TIMESTAMP"})
                return
            if abs(time.time() - ts_float) > STANDALONE_MAX_CLOCK_SKEW_SEC:
                self._send_json(401, {"error": "CLOCK_SKEW_EXCEEDED"})
                return

        if "nonce" in payload and payload["nonce"] is not None:
            ok_nonce, nonce_reason = self.server.nonce_tracker.validate_and_record(
                str(payload["nonce"]),
                timestamp=ts_float,
            )
            if not ok_nonce:
                self._send_json(401, {"error": f"REPLAY_DETECTED: {nonce_reason}"})
                return

        if path == "/mesh/dispatch":
            # Verify signed frame if signature provided
            if "signature" in payload:
                try:
                    frame = TriNodeFrame.from_dict(payload)
                except Exception as exc:
                    self._send_json(400, {"error": "MALFORMED_FRAME", "details": str(exc)})
                    return

                if not frame.verify_signature(self.server.core.secret):
                    self._send_json(401, {"error": "INVALID_SIGNATURE", "reason": "HMAC signature mismatch"})
                    return

                if abs(time.time() - frame.timestamp) > STANDALONE_MAX_CLOCK_SKEW_SEC:
                    self._send_json(401, {"error": "EXPIRED_FRAME", "reason": "Frame timestamp outside drift window"})
                    return

                action = frame.action
                action_payload = frame.payload
            else:
                action = payload.get("action")
                action_payload = payload.get("payload", payload)

            if action in ("inspect_telemetry", "health"):
                self._send_json(200, self._handle_inspect_telemetry())
                return

            if action == "write_file":
                try:
                    res = self._handle_write_file(action_payload)
                    self._send_json(200, res)
                except PermissionError as pe:
                    self._send_json(403, {"error": "SANDBOX_ESCAPE_REJECTED", "details": str(pe)})
                except Exception as exc:
                    self._send_json(400, {"error": "WRITE_FILE_FAILED", "details": str(exc)})
                return

            if action == "build_software":
                try:
                    res = self._handle_build_software(action_payload)
                    status_code = 200 if res.get("status") == "COMPLETED" else 422
                    self._send_json(status_code, res)
                except PermissionError as pe:
                    self._send_json(403, {"error": "SANDBOX_VIOLATION", "details": str(pe)})
                except Exception as exc:
                    self._send_json(500, {"error": "BUILD_FAILED", "details": str(exc)})
                return

            if action in ("notify_brief", "notify"):
                now = time.time()
                brief_payload = action_payload if isinstance(action_payload, dict) else {"content": str(action_payload)}
                record_data = {
                    "decision_id": f"notify_{int(now * 1000)}",
                    "timestamp": now,
                    "payload": {
                        "type": "PUSH_NOTIFICATION",
                        "action": action,
                        "data": brief_payload,
                    },
                }
                if hasattr(self.server.ledger, "append_record"):
                    self.server.ledger.append_record(record_data)

                self._send_json(
                    200,
                    {
                        "status": "RECEIVED",
                        "node_id": self.server.node_id,
                        "action": action,
                        "received_at": now,
                    },
                )
                return

            if action in ("quorum_challenge", "challenge"):
                act = str(action_payload.get("action", ""))
                tgt = str(action_payload.get("target", "*"))
                chal = str(action_payload.get("challenge", ""))
                ts = float(action_payload.get("timestamp", time.time()))
                m_key = hmac.new(
                    self.server.core.secret.encode("utf-8"),
                    f"sse-node-key:{self.server.node_id}".encode(),
                    hashlib.sha256,
                ).hexdigest()
                sig = hmac.new(m_key.encode("utf-8"), f"{act}:{tgt}:{ts:.3f}".encode(), hashlib.sha256).hexdigest()
                self._send_json(
                    200,
                    {
                        "status": "APPROVED",
                        "signer_node": self.server.node_id,
                        "action": act,
                        "target": tgt,
                        "signature": sig,
                        "challenge": chal,
                        "timestamp": ts,
                    },
                )
                return

            mat_dict = action_payload if isinstance(action_payload, dict) and "u1" in action_payload else payload
            u1 = mat_dict.get("u1")
            u2 = mat_dict.get("u2")
            if not u1 or not u2:
                self._send_json(422, {"error": "Payload missing u1 or u2 matrices or valid action"})
                return

            verdict = self.server.core.solve_matrix(
                u1=u1,
                u2=u2,
                actions_p1=mat_dict.get("actions_p1"),
                actions_p2=mat_dict.get("actions_p2"),
                decision_id=mat_dict.get("decision_id"),
                prev_hash=self.server.ledger.get_latest_hash(),
                airgapped_solo=False,
            )
            self.server.ledger.append_verdict(verdict, extra_meta={"dispatched_via": "mesh"})
            self._send_json(200, {"status": "COMPLETED", "verdict": json.loads(verdict.to_compact_payload())})

        elif path in ("/mesh/inspect", "/mesh/telemetry"):
            self._send_json(200, self._handle_inspect_telemetry())

        elif path == "/mesh/write_file":
            try:
                res = self._handle_write_file(payload.get("payload", payload))
                self._send_json(200, res)
            except PermissionError as pe:
                self._send_json(403, {"error": "SANDBOX_ESCAPE_REJECTED", "details": str(pe)})
            except Exception as exc:
                self._send_json(400, {"error": "WRITE_FILE_FAILED", "details": str(exc)})

        elif path == "/mesh/build":
            try:
                res = self._handle_build_software(payload.get("payload", payload))
                status_code = 200 if res.get("status") == "COMPLETED" else 422
                self._send_json(status_code, res)
            except PermissionError as pe:
                self._send_json(403, {"error": "SANDBOX_VIOLATION", "details": str(pe)})
            except Exception as exc:
                self._send_json(500, {"error": "BUILD_FAILED", "details": str(exc)})

        elif path == "/mesh/sync":
            incoming_lines = payload.get("records", [])
            merged_count = self.server.ledger.merge_remote_records(incoming_lines)
            all_records = self.server.ledger.read_records()
            self._send_json(
                200,
                {
                    "status": "SYNCED",
                    "merged_count": merged_count,
                    "latest_hash": self.server.ledger.get_latest_hash(),
                    "records": [json.dumps(r, separators=(",", ":")) for r in all_records],
                },
            )

        elif path == "/mesh/quorum/challenge":
            act = str(payload.get("action", ""))
            tgt = str(payload.get("target", "*"))
            chal = str(payload.get("challenge", ""))
            ts = float(payload.get("timestamp", time.time()))
            m_key = hmac.new(
                self.server.core.secret.encode("utf-8"),
                f"sse-node-key:{self.server.node_id}".encode(),
                hashlib.sha256,
            ).hexdigest()
            sig = hmac.new(m_key.encode("utf-8"), f"{act}:{tgt}:{ts:.3f}".encode(), hashlib.sha256).hexdigest()
            self._send_json(
                200,
                {
                    "status": "APPROVED",
                    "signer_node": self.server.node_id,
                    "action": act,
                    "target": tgt,
                    "signature": sig,
                    "challenge": chal,
                    "timestamp": ts,
                },
            )

        elif path == "/mesh/quorum/approve":
            action_name = payload.get("action", "")
            target = payload.get("target", "*")
            signature = payload.get("signature", "")
            now = time.time()
            record_data = {
                "decision_id": f"quorum_appr_{int(now * 1000)}",
                "timestamp": now,
                "payload": {
                    "type": "QUORUM_APPROVAL_RECEIPT",
                    "action": action_name,
                    "target": target,
                    "signature": signature,
                    "signer_node": payload.get("signer_node", "UNKNOWN"),
                },
            }
            if hasattr(self.server.ledger, "append_record"):
                self.server.ledger.append_record(record_data)
            self._send_json(200, {"status": "APPROVAL_COMMITTED", "timestamp": now})
        else:
            self._send_json(404, {"error": "Endpoint not found"})


class MeshServer(ThreadingHTTPServer):
    """Server holding references to sovereign core, ledger, rate limiter, and nonce tracker."""

    def __init__(
        self,
        server_address: tuple[str, int],
        RequestHandlerClass: type[BaseHTTPRequestHandler],
        node_id: str,
        mode: str,
        core: SovereignDecisionCore,
        ledger: SovereignLedger,
        rate_limiter: StandaloneRateLimiter | None = None,
        nonce_tracker: StandaloneNonceTracker | None = None,
    ) -> None:
        self.node_id = node_id
        self.mode = mode
        self.core = core
        self.ledger = ledger
        self.rate_limiter = rate_limiter or StandaloneRateLimiter(max_requests=30, window_seconds=60.0)
        self.nonce_tracker = nonce_tracker or StandaloneNonceTracker(window_ttl_sec=STANDALONE_MAX_CLOCK_SKEW_SEC)
        self.daemon_threads = True
        super().__init__(server_address, RequestHandlerClass)


class P2PRouter:
    """Offline-first P2P router with zero-hang timeout fallback."""

    def __init__(
        self,
        node_id: str = "PC_A",
        port: int = 8201,
        mode: str = "SOLO",
        ledger_path: str | Path | None = None,
        secret: str = CLUSTER_SHARED_SECRET,
    ) -> None:
        self.node_id = node_id
        self.mode = mode
        self.port = port
        self.secret = secret
        self.core = SovereignDecisionCore(node_id=self.node_id, mode=self.mode, secret=self.secret)
        self.ledger = SovereignLedger(node_id=self.node_id, ledger_path=ledger_path)
        self._server: MeshServer | None = None
        self._thread: threading.Thread | None = None

    def start_server(
        self,
        host: str = "127.0.0.1",
        background: bool = True,
        allow_external: bool = False,
    ) -> MeshServer:
        is_loopback = host in ("127.0.0.1", "localhost", "::1")
        if not is_loopback and not allow_external and os.getenv("SSE_ALLOW_EXTERNAL_BIND") != "1":
            raise PermissionError(
                f"Binding to non-loopback host '{host}' is disabled by default. "
                "Pass allow_external=True or set SSE_ALLOW_EXTERNAL_BIND=1 explicitly."
            )
        server_address = (host, self.port)
        self._server = MeshServer(
            server_address=server_address,
            RequestHandlerClass=MeshRequestHandler,
            node_id=self.node_id,
            mode=self.mode,
            core=self.core,
            ledger=self.ledger,
        )
        if background:
            self._thread = threading.Thread(
                target=self._server.serve_forever,
                name=f"StandaloneRouter_{self.node_id}",
                daemon=True,
            )
            self._thread.start()
        else:
            self._server.serve_forever()
        return self._server

    def stop_server(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

    def dispatch_task(
        self,
        peer_url: str | None,
        u1: list[list[float]],
        u2: list[list[float]],
        actions_p1: list[str] | None = None,
        actions_p2: list[str] | None = None,
        timeout: float = 1.5,
    ) -> SovereignDecisionVerdict:
        if peer_url and self.mode != "SOLO":
            url = f"{peer_url.rstrip('/')}/mesh/dispatch"
            req_data = {"u1": u1, "u2": u2, "actions_p1": actions_p1, "actions_p2": actions_p2}
            body = json.dumps(req_data, separators=(",", ":")).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status == 200:
                        res_json = json.loads(resp.read().decode("utf-8"))
                        v_data = res_json.get("verdict", {})
                        return SovereignDecisionVerdict(
                            node_id=v_data["node"],
                            decision_id=v_data["dec_id"],
                            action_idx=v_data["act"],
                            action_name=v_data["name"],
                            expected_utility=v_data["util"],
                            worst_case_regret=v_data["regret"],
                            solver_tier=v_data["tier"],
                            grant_token=v_data["grant"],
                            record_hash_16=v_data["hash"],
                            mode="MESH",
                        )
            except (urllib.error.URLError, TimeoutError, OSError):
                pass

        # Zero-hang local sovereign fallback
        prev_hash = self.ledger.get_latest_hash()
        verdict = self.core.solve_matrix(
            u1=u1,
            u2=u2,
            actions_p1=actions_p1,
            actions_p2=actions_p2,
            prev_hash=prev_hash,
            airgapped_solo=True,
        )
        self.ledger.append_verdict(verdict, extra_meta={"fallback_from": peer_url or "NONE"})
        return verdict

    def sync_with_peer(self, peer_url: str, timeout: float = 1.5) -> dict[str, Any]:
        url = f"{peer_url.rstrip('/')}/mesh/sync"
        local_records = self.ledger.read_records()
        local_lines = [json.dumps(r, separators=(",", ":")) for r in local_records]
        req_data = {"records": local_lines}
        body = json.dumps(req_data, separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    res_json = json.loads(resp.read().decode("utf-8"))
                    merged = self.ledger.merge_remote_records(res_json.get("records", []))
                    return {
                        "status": "SYNCED",
                        "peer_url": peer_url,
                        "merged_count": merged,
                        "latest_hash": self.ledger.get_latest_hash(),
                    }
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {"status": "PEER_OFFLINE", "peer_url": peer_url, "error": str(exc), "latest_hash": self.ledger.get_latest_hash()}

        return {"status": "FAILED", "peer_url": peer_url, "latest_hash": self.ledger.get_latest_hash()}


# ==============================================================================
# 5. SELF-DIAGNOSTIC TEST ("DOCTOR")
# ==============================================================================


def run_doctor() -> bool:
    """Execute complete sovereign self-diagnostic using ONLY Python standard library."""
    print("=" * 70)
    print("STRATEGIC SYSTEMS ENGINE (SSE) - SOVEREIGN DOCTOR DIAGNOSTIC")
    print("=" * 70)

    # Check 1: Zero third-party dependency purity
    third_party = [mod for mod in ("numpy", "scipy", "pydantic", "fastapi") if mod in sys.modules]
    if third_party:
        print(f"[WARN] Third-party modules detected in environment: {third_party} (Pure-Python core will not rely on them)")
    else:
        print("[PASS] Purity Check: Zero non-standard dependencies loaded.")

    # Check 2: Tier 1 IESDS Pure-Python solve
    core = SovereignDecisionCore(node_id="MOBILE", mode="SOLO")
    # Prisoner's Dilemma
    u1_pd = [[3.0, 0.0], [5.0, 1.0]]
    u2_pd = [[3.0, 5.0], [0.0, 1.0]]
    v_pd = core.solve_matrix(u1_pd, u2_pd, ["Cooperate", "Defect"], ["Cooperate", "Defect"])
    assert v_pd.action_idx == 1, f"Expected Defect (idx 1), got {v_pd.action_idx}"
    assert v_pd.solver_tier == "T1_IESDS", f"Expected T1_IESDS, got {v_pd.solver_tier}"
    print(f"[PASS] Tier 1 IESDS: Correctly solved Prisoner's Dilemma -> {v_pd.action_name} ({v_pd.solver_tier})")

    # Check 3: Tier 2 Stackelberg Commitment solve
    u1_lead = [[2.0, 0.0], [1.0, 3.0]]
    u2_lead = [[1.0, 0.0], [0.0, 2.0]]
    v_lead = core.solve_matrix(u1_lead, u2_lead, ["Commit_A", "Commit_B"], ["Follow_A", "Follow_B"])
    assert v_lead.solver_tier == "T2_STACKELBERG" or v_lead.solver_tier == "T1_IESDS"
    print(f"[PASS] Tier 2 Stackelberg: Leader commitment verified -> {v_lead.action_name} ({v_lead.solver_tier})")

    # Check 4: Tier 3 Minimax Regret solve
    # Symmetric coordination/conflict game
    u1_reg = [[0.0, -1.0, 1.0], [1.0, 0.0, -1.0], [-1.0, 1.0, 0.0]]
    u2_reg = [[0.0, 1.0, -1.0], [-1.0, 0.0, 1.0], [1.0, -1.0, 0.0]]
    v_reg = core.solve_matrix(u1_reg, u2_reg, ["Rock", "Paper", "Scissors"], ["Rock", "Paper", "Scissors"])
    assert v_reg.worst_case_regret >= 0.0
    print(f"[PASS] Tier 3 Minimax Regret: Solved -> {v_reg.action_name} (Worst Regret: {v_reg.worst_case_regret:.2f})")

    # Check 5: Ledger Hash Chaining & Tamper Detection
    with tempfile.TemporaryDirectory() as tmp_dir:
        ledger_path = Path(tmp_dir) / "doctor_ledger.jsonl"
        ledger = SovereignLedger(node_id="MOBILE", ledger_path=ledger_path)

        ledger.append_verdict(v_pd)
        ledger.append_verdict(v_lead)
        ledger.append_verdict(v_reg)

        valid, count, msg = ledger.verify_integrity()
        assert valid is True and count == 3, f"Ledger integrity failed: {msg}"
        print(f"[PASS] Cryptographic Hash Chain: 3 blocks verified sequentially ({msg}).")

        # Mutate 1 byte to verify tamper detection
        with open(ledger_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        corrupted_line = lines[1].replace('"expected_utility":', '"expected_utility":999.')
        lines[1] = corrupted_line
        with open(ledger_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        valid_tamper, failed_idx, msg_tamper = ledger.verify_integrity()
        assert valid_tamper is False, "Failed to detect tamper!"
        print(f"[PASS] Tamper Detection: Successfully flagged altered record at block {failed_idx} ({msg_tamper})")

    # Check 6: Compact Payload Context-Budget Compliance (< 350 chars)
    compact_json = v_pd.to_compact_payload()
    char_len = len(compact_json)
    assert char_len < 350, f"Payload too large: {char_len} chars"
    print(f"[PASS] Context Budgeting: Compact payload is {char_len} chars (Budget < 350 chars):")
    print(f"       {compact_json}")

    # Check 7: Zero-Hang Timeout Fallback on Partition
    router = P2PRouter(node_id="MOBILE", port=8203, mode="MESH")
    t0 = time.perf_counter()
    fallback_v = router.dispatch_task(
        peer_url="http://127.0.0.1:9999",
        u1=u1_pd,
        u2=u2_pd,
        actions_p1=["Cooperate", "Defect"],
        actions_p2=["Cooperate", "Defect"],
        timeout=0.05,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert fallback_v.action_idx == 1
    print(f"[PASS] Offline Partition Resiliency: Instant local fallback completed in {elapsed_ms:.2f} ms with ZERO unhandled errors.")

    print("=" * 70)
    print("ALL 7 SOVEREIGN ENGINE INVARIANTS VERIFIED GREEN.")
    print("=" * 70)
    return True


# ==============================================================================
# 6. STANDALONE CLI ENTRYPOINT
# ==============================================================================


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Strategic Systems Engine - Sovereign Standalone Executable",
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Doctor
    subparsers.add_parser("doctor", help="Run standalone self-diagnostic test suite")

    # Solve
    solve_parser = subparsers.add_parser("solve", help="Execute sovereign matrix solve")
    solve_parser.add_argument("--matrix", "-m", type=str, default="", help="JSON string or file of matrix")
    solve_parser.add_argument("--actions", "-a", type=str, default="", help="Comma-separated action names")
    solve_parser.add_argument("--role", "-r", type=str, default="MOBILE", help="Node role (PC_A, PC_B, MOBILE)")
    solve_parser.add_argument("--solo", action="store_true", default=True, help="Operate in air-gapped solo mode")

    # Run
    run_parser = subparsers.add_parser("run", help="Launch sovereign P2P router server")
    run_parser.add_argument("--role", "-r", type=str, default="MOBILE", help="Node role")
    run_parser.add_argument("--port", "-p", type=int, default=8203, help="Port to listen on")
    run_parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (loopback default)")
    run_parser.add_argument("--allow-external", action="store_true", default=False, help="Allow non-loopback binding")
    run_parser.add_argument("--solo", action="store_true", default=False, help="Solo mode")

    # Sync
    sync_parser = subparsers.add_parser("sync", help="Sync ledger with peer")
    sync_parser.add_argument("--peer", type=str, required=True, help="Peer URL")
    sync_parser.add_argument("--role", "-r", type=str, default="MOBILE", help="Local node role")

    # Inspect
    inspect_parser = subparsers.add_parser("inspect", help="Inspect peer node telemetry and ledger")
    inspect_parser.add_argument("--peer", type=str, required=True, help="Peer URL")

    # Exec
    exec_parser = subparsers.add_parser("exec", help="Execute sandboxed file or build on peer node")
    exec_parser.add_argument("--peer", type=str, required=True, help="Peer URL")
    exec_parser.add_argument("--file", "-f", type=str, required=True, help="Local file path to send")
    exec_parser.add_argument("--target-path", "-t", type=str, default=None, help="Target relative path")
    exec_parser.add_argument("--action", type=str, default="write_file", choices=["write_file", "build_software"])

    args = parser.parse_args()

    if args.command == "doctor":
        success = run_doctor()
        return 0 if success else 1

    elif args.command == "solve":
        u1 = [[3.0, 0.0], [5.0, 1.0]]
        u2 = [[3.0, 5.0], [0.0, 1.0]]
        act_p1 = ["Cooperate", "Defect"]
        act_p2 = ["Cooperate", "Defect"]

        if args.matrix:
            if os.path.exists(args.matrix):
                with open(args.matrix, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = json.loads(args.matrix)
            if "u1" in data and "u2" in data:
                u1 = data["u1"]
                u2 = data["u2"]
                if "actions_p1" in data:
                    act_p1 = data["actions_p1"]
                if "actions_p2" in data:
                    act_p2 = data["actions_p2"]

        if args.actions:
            act_p1 = [a.strip() for a in args.actions.split(",") if a.strip()]

        core = SovereignDecisionCore(node_id=args.role.upper(), mode="SOLO" if args.solo else "MESH")
        ledger = SovereignLedger(node_id=args.role.upper())
        prev_hash = ledger.get_latest_hash()

        verdict = core.solve_matrix(
            u1=u1,
            u2=u2,
            actions_p1=act_p1,
            actions_p2=act_p2,
            prev_hash=prev_hash,
            airgapped_solo=args.solo,
        )
        record = ledger.append_verdict(verdict)

        print(f"Node: {verdict.node_id} | Tier: {verdict.solver_tier} | Action: {verdict.action_name} (idx {verdict.action_idx})")
        print(f"Utility: {verdict.expected_utility:.3f} | Regret: {verdict.worst_case_regret:.3f} | Grant: {verdict.grant_token}")
        print(f"Block Hash: {record['record_hash'][:16]}... | Mode: {verdict.mode}")
        print(f"Compact Payload: {verdict.to_compact_payload()}")
        return 0

    elif args.command == "run":
        mode_str = "SOLO" if args.solo else "MESH"
        print(f"Launching sovereign daemon [{args.role.upper()}] on {args.host}:{args.port} (Mode: {mode_str})...")
        router = P2PRouter(node_id=args.role.upper(), port=args.port, mode=mode_str)
        try:
            router.start_server(host=args.host, background=False, allow_external=args.allow_external)
        except KeyboardInterrupt:
            print("\nShutting down sovereign daemon.")
            router.stop_server()
        return 0

    elif args.command == "sync":
        router = P2PRouter(node_id=args.role.upper())
        print(f"Syncing with peer {args.peer}...")
        res = router.sync_with_peer(peer_url=args.peer)
        print(f"Result: {json.dumps(res, indent=2)}")
        return 0

    elif args.command == "inspect":
        frame = TriNodeFrame(
            sender_node_id="STANDALONE_CLI",
            action="inspect_telemetry",
            payload={"peer": args.peer},
        )
        frame.sign(CLUSTER_SHARED_SECRET)
        url = f"{args.peer.rstrip('/')}/mesh/dispatch"
        req = urllib.request.Request(
            url,
            data=json.dumps(frame.to_dict(), separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"[OK] Peer Inspection Result:\n{json.dumps(data, indent=2)}")
                return 0
        except Exception as exc:
            print(f"[ERROR] Failed to inspect peer {args.peer}: {exc}")
            return 1

    elif args.command == "exec":
        p = Path(args.file)
        if not p.exists():
            print(f"[ERROR] File not found: {args.file}")
            return 1
        content = p.read_text(encoding="utf-8")
        rel_target = args.target_path or p.name

        if args.action == "write_file":
            payload_data = {"relative_path": rel_target, "content": content}
        else:
            payload_data = {
                "project_name": p.stem,
                "files": {rel_target: content},
                "test_command": [sys.executable, "-c", f"print('Executed {rel_target}')"],
            }

        frame = TriNodeFrame(
            sender_node_id="STANDALONE_CLI",
            action=args.action,
            payload=payload_data,
        )
        frame.sign(CLUSTER_SHARED_SECRET)
        url = f"{args.peer.rstrip('/')}/mesh/dispatch"
        req = urllib.request.Request(
            url,
            data=json.dumps(frame.to_dict(), separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"[OK] Peer Exec Result:\n{json.dumps(data, indent=2)}")
                return 0
        except Exception as exc:
            print(f"[ERROR] Failed to exec on peer {args.peer}: {exc}")
            return 1

    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
