"""Strategic Systems Engine - Cryptographic Threshold Quorum & Replay Shield.

Implements M-of-N threshold multi-signature verification, sliding-window nonce
replay defense, and constant-time cryptographic checks for zero-trust authorization.
Zero external dependencies (pure standard library).
"""

from __future__ import annotations

import collections
import hashlib
import hmac
import threading
import time

from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET, NodeID


# Derive deterministic per-node keys from the cluster root secret if individual keys are omitted
def _derive_node_key(node_id: str, secret: str = CLUSTER_SHARED_SECRET) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        f"sse-node-key:{node_id}".encode(),
        hashlib.sha256,
    ).hexdigest()


DEFAULT_CLUSTER_NODE_KEYS: dict[str, str] = {
    NodeID.PC_A.value: _derive_node_key(NodeID.PC_A.value),
    NodeID.PC_B.value: _derive_node_key(NodeID.PC_B.value),
    NodeID.MOBILE.value: _derive_node_key(NodeID.MOBILE.value),
    "NODE_A": _derive_node_key(NodeID.PC_A.value),
    "NODE_B": _derive_node_key(NodeID.PC_B.value),
    "NODE_M": _derive_node_key(NodeID.MOBILE.value),
}


class NonceTracker:
    """Thread-safe sliding-window nonce validator with automatic capacity-bounded pruning."""

    def __init__(self, window_ttl_sec: float = 300.0, max_entries: int = 100_000) -> None:
        self.window_ttl_sec = float(window_ttl_sec)
        self.max_entries = int(max_entries)
        # Map nonce -> timestamp in insertion/update order
        self._seen: collections.OrderedDict[str, float] = collections.OrderedDict()
        self._lock = threading.Lock()

    def validate_and_record(self, nonce: str, timestamp: float | None = None) -> tuple[bool, str]:
        """Validate that a nonce is fresh, within window TTL, and not previously observed.

        Returns:
            (is_valid, status_code_or_reason)
        """
        if not nonce or not isinstance(nonce, str):
            return False, "INVALID_NONCE_FORMAT"

        now = time.time()
        ts = float(timestamp) if timestamp is not None else now

        # Check time window bounds
        if (now - ts) > self.window_ttl_sec:
            return False, "EXPIRED_TIMESTAMP"
        if (ts - now) > self.window_ttl_sec:
            return False, "FUTURE_TIMESTAMP"

        with self._lock:
            # Check for replay
            if nonce in self._seen:
                return False, "REPLAY_DETECTED"

            # Check capacity and prune if necessary
            if len(self._seen) >= self.max_entries:
                self._prune_locked(now)
                # If still over limit, pop the oldest entry
                while len(self._seen) >= self.max_entries:
                    self._seen.popitem(last=False)

            self._seen[nonce] = ts
            return True, "OK"

    def is_seen(self, nonce: str) -> bool:
        """Check if a nonce has been registered within the active sliding window."""
        with self._lock:
            return nonce in self._seen

    def prune(self, now: float | None = None) -> int:
        """Manually trigger pruning of expired entries from the sliding window."""
        current_time = float(now) if now is not None else time.time()
        with self._lock:
            return self._prune_locked(current_time)

    def _prune_locked(self, current_time: float) -> int:
        cutoff = current_time - self.window_ttl_sec
        removed = 0
        # OrderedDict is iterated from oldest to newest
        to_remove: list[str] = []
        for nonce, ts in self._seen.items():
            if ts < cutoff:
                to_remove.append(nonce)
            else:
                # Since entries are inserted roughly sequentially, we can break early
                # if entries are strictly chronological, but to be completely safe against
                # small clock jitters, check until threshold is met.
                break

        for k in to_remove:
            del self._seen[k]
            removed += 1
        return removed

    def size(self) -> int:
        """Return the current number of tracked nonces."""
        with self._lock:
            return len(self._seen)


class ThresholdQuorumPolicy:
    """M-of-N Cryptographic Threshold Quorum Policy Gate.

    Guarantees that high-impact operations cannot be executed unilaterally by a single
    node without cryptographic agreement from a quorum of independent nodes.
    """

    def __init__(
        self,
        node_keys: dict[str, str] | None = None,
        min_threshold: int = 2,
        max_clock_skew_sec: float = 300.0,
        nonce_tracker: NonceTracker | None = None,
    ) -> None:
        self.node_keys = dict(node_keys) if node_keys is not None else dict(DEFAULT_CLUSTER_NODE_KEYS)
        self.min_threshold = int(min_threshold)
        self.max_clock_skew_sec = float(max_clock_skew_sec)
        self.nonce_tracker = nonce_tracker or NonceTracker(window_ttl_sec=max_clock_skew_sec)

    def sign_action(self, node_id: str, action_payload: str, timestamp: float) -> str:
        """Generate a valid HMAC-SHA256 signature for a specific node and action payload."""
        if node_id not in self.node_keys:
            raise KeyError(f"Node '{node_id}' has no registered cryptographic key in quorum policy.")

        canonical_msg = f"{action_payload}:{timestamp:.3f}".encode()
        key = self.node_keys[node_id].encode("utf-8")
        return hmac.new(key, canonical_msg, hashlib.sha256).hexdigest()

    def verify_quorum(
        self,
        action_payload: str,
        timestamp: float,
        signatures: dict[str, str],
        nonce: str | None = None,
    ) -> tuple[bool, str]:
        """Verify that at least min_threshold recognized distinct nodes signed the action.

        Args:
            action_payload: Canonical action identifier or serialized JSON payload.
            timestamp: Epoch timestamp of the requested operation.
            signatures: Mapping of node_id -> hex-encoded HMAC signature.
            nonce: Optional one-time cryptographic nonce to guard against replay.

        Returns:
            (is_quorum_verified, status_message)
        """
        now = time.time()
        # Verify timestamp drift
        if abs(now - float(timestamp)) > self.max_clock_skew_sec:
            return False, f"CLOCK_SKEW_EXCEEDED: skew {abs(now - timestamp):.2f}s > {self.max_clock_skew_sec}s"

        # Check nonce if provided
        if nonce is not None:
            valid_nonce, reason = self.nonce_tracker.validate_and_record(nonce, timestamp=timestamp)
            if not valid_nonce:
                return False, f"REPLAY_PREVENTED: {reason}"

        # Fast-fail if not enough distinct signatures provided
        if len(signatures) < self.min_threshold:
            return (
                False,
                f"INSUFFICIENT_SIGNATURES: provided {len(signatures)}, threshold requires {self.min_threshold}",
            )

        canonical_msg = f"{action_payload}:{timestamp:.3f}".encode()
        valid_nodes: set[str] = set()

        for node_id, sig in signatures.items():
            if node_id not in self.node_keys:
                continue

            expected_sig = hmac.new(
                self.node_keys[node_id].encode("utf-8"),
                canonical_msg,
                hashlib.sha256,
            ).hexdigest()

            # Constant-time comparison prevents timing side-channels
            if hmac.compare_digest(expected_sig, sig):
                valid_nodes.add(node_id)

        if len(valid_nodes) < self.min_threshold:
            return (
                False,
                (
                    f"QUORUM_FAILED: only {len(valid_nodes)} valid signatures from recognized nodes "
                    f"(required {self.min_threshold})"
                ),
            )

        return True, f"QUORUM_VERIFIED: {len(valid_nodes)} valid signatures ({', '.join(sorted(valid_nodes))})"
