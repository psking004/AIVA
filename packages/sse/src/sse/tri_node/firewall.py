"""Strategic Systems Engine - P2P Mesh Ingress Rate Limiter & Payload Firewall.

Enforces strict request size ceilings, MIME header enforcement, IP/node rate limiting
(30 requests/minute sliding-window & token bucket), JSON schema guards, replay protection
via NonceTracker, and bidirectional clock skew mitigation (<= 60s) for P2P mesh endpoints.
Zero external dependencies (pure standard library).
"""

from __future__ import annotations

import dataclasses
import hashlib
import hmac
import json
import threading
import time
from typing import Any

from sse.security.hardening import NonceTracker
from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET, NodeID


@dataclasses.dataclass
class MeshFirewallConfig:
    """Security firewall configuration for P2P Mesh endpoints."""

    max_payload_bytes: int = 1_048_576  # 1 MB maximum payload ceiling
    max_clock_skew_sec: float = 60.0  # 60s bidirectional max acceptable drift
    rate_limit_per_second: float = 0.5  # 30 requests/minute steady state
    rate_limit_burst: int = 30  # 30 requests/minute burst headroom
    allowed_node_ids: set[str] = dataclasses.field(
        default_factory=lambda: {NodeID.PC_A.value, NodeID.PC_B.value, NodeID.MOBILE.value}
    )
    require_json_content_type: bool = True
    enforce_signatures: bool = False
    cluster_secret: str = CLUSTER_SHARED_SECRET


class PeerRateLimiter:
    """Token bucket rate limiter tracking requests per peer IP or node identity."""

    def __init__(self, rate_per_second: float = 0.5, burst: int = 30) -> None:
        self.rate = float(rate_per_second)
        self.burst = float(burst)
        self._buckets: dict[str, tuple[float, float]] = {}  # peer_id -> (tokens, last_update)
        self._lock = threading.Lock()

    def allow(self, peer_id: str) -> bool:
        """Check whether a request from peer_id is permitted under current token bucket state."""
        now = time.time()
        with self._lock:
            if peer_id not in self._buckets:
                self._buckets[peer_id] = (self.burst - 1.0, now)
                return True

            tokens, last_time = self._buckets[peer_id]
            elapsed = max(0.0, now - last_time)
            # Refill tokens up to burst capacity
            tokens = min(self.burst, tokens + elapsed * self.rate)

            if tokens >= 1.0:
                self._buckets[peer_id] = (tokens - 1.0, now)
                return True

            self._buckets[peer_id] = (tokens, now)
            return False

    def reset(self) -> None:
        """Clear all rate limit state."""
        with self._lock:
            self._buckets.clear()


class EndpointRateLimiter:
    """Sliding-window IP/node rate limiter allowing up to max_requests per window_seconds."""

    def __init__(self, max_requests: int = 30, window_seconds: float = 60.0) -> None:
        self.max_requests = int(max_requests)
        self.window_seconds = float(window_seconds)
        self._requests: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, peer_id: str) -> bool:
        """Check if request from peer_id is within sliding window rate limit."""
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            timestamps = self._requests.setdefault(peer_id, [])
            valid_ts = [ts for ts in timestamps if ts > cutoff]
            if len(valid_ts) >= self.max_requests:
                self._requests[peer_id] = valid_ts
                return False

            valid_ts.append(now)
            self._requests[peer_id] = valid_ts
            return True

    def reset(self) -> None:
        """Reset all rate limiter state."""
        with self._lock:
            self._requests.clear()


class MeshPayloadFirewall:
    """Ingress security gateway validating P2P mesh packets against attacks and floods."""

    def __init__(self, config: MeshFirewallConfig | None = None) -> None:
        self.config = config or MeshFirewallConfig()
        self.rate_limiter = PeerRateLimiter(
            rate_per_second=self.config.rate_limit_per_second,
            burst=self.config.rate_limit_burst,
        )
        self.nonce_tracker = NonceTracker(window_ttl_sec=self.config.max_clock_skew_sec)

    def validate_headers(self, headers: Any, content_length: int) -> tuple[bool, str]:
        """Validate HTTP headers and content length bounds before reading request stream."""
        if content_length < 0:
            return False, "INVALID_CONTENT_LENGTH: Negative Content-Length is not permitted."

        if content_length > self.config.max_payload_bytes:
            return (
                False,
                f"PAYLOAD_TOO_LARGE: Content-Length {content_length} exceeds limit of {self.config.max_payload_bytes} bytes",
            )

        if self.config.require_json_content_type:
            content_type = ""
            if hasattr(headers, "get"):
                content_type = headers.get("Content-Type", "") or headers.get("content-type", "")

            if not content_type or "application/json" not in content_type.lower():
                return (
                    False,
                    f"INVALID_CONTENT_TYPE: Expected 'application/json', got '{content_type or 'MISSING'}'",
                )

        return True, "OK"

    def validate_payload(
        self,
        raw_body: bytes,
        peer_ip: str = "127.0.0.1",
    ) -> tuple[bool, dict[str, Any] | None, str]:
        """Validate raw request body against size, rate-limits, format, identity, skew, and nonce replay.

        Returns:
            (is_valid, parsed_dict_or_None, reason_or_status)
        """
        # 1. Payload size verification
        if len(raw_body) > self.config.max_payload_bytes:
            return (
                False,
                None,
                f"PAYLOAD_TOO_LARGE: Body length {len(raw_body)} exceeds {self.config.max_payload_bytes} bytes",
            )

        # 2. Rate limiting check
        if not self.rate_limiter.allow(peer_ip):
            return (
                False,
                None,
                f"RATE_LIMIT_EXCEEDED: Peer '{peer_ip}' exceeded throughput budget.",
            )

        # 3. JSON deserialization check
        try:
            body_str = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else str(raw_body)
            payload = json.loads(body_str) if body_str.strip() else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            return False, None, f"INVALID_JSON_PAYLOAD: Failed to parse JSON: {exc}"

        if not isinstance(payload, dict):
            return False, None, "INVALID_PAYLOAD_STRUCTURE: Top-level payload must be a JSON object"

        # 4. Sender Node Identity validation (if specified in envelope)
        sender_id = payload.get("sender_node_id") or payload.get("node_id")
        if sender_id is not None:
            clean_sender = str(sender_id).upper()
            if clean_sender not in self.config.allowed_node_ids:
                return (
                    False,
                    None,
                    f"UNRECOGNIZED_NODE_ID: Sender '{sender_id}' is not in authorized cluster nodes: {self.config.allowed_node_ids}",
                )

        # 5. Bidirectional Timestamp and Clock Skew verification
        ts = payload.get("timestamp")
        ts_float: float | None = None
        if ts is not None:
            try:
                ts_float = float(ts)
                now = time.time()
                skew = abs(now - ts_float)
                if skew > self.config.max_clock_skew_sec:
                    return (
                        False,
                        None,
                        f"CLOCK_SKEW_EXCEEDED: Timestamp skew {skew:.2f}s exceeds allowed tolerance {self.config.max_clock_skew_sec}s",
                    )
            except (ValueError, TypeError):
                return False, None, "MALFORMED_TIMESTAMP: Value could not be parsed as float epoch seconds"

        # 6. Sliding-window Nonce Replay Protection
        if "nonce" in payload and payload["nonce"] is not None:
            valid_nonce, nonce_reason = self.nonce_tracker.validate_and_record(
                str(payload["nonce"]),
                timestamp=ts_float,
            )
            if not valid_nonce:
                return (
                    False,
                    None,
                    f"REPLAY_DETECTED: {nonce_reason}",
                )

        # 7. Signature validation (if enforced)
        if self.config.enforce_signatures:
            sig = payload.get("signature")
            if not sig:
                return False, None, "MISSING_REQUIRED_SIGNATURE: Payload signature is mandatory."

            expected_sig = hmac.new(
                self.config.cluster_secret.encode("utf-8"),
                f"{sender_id}:{ts}".encode(),
                hashlib.sha256,
            ).hexdigest()

            if not hmac.compare_digest(expected_sig, str(sig)):
                return False, None, "INVALID_SIGNATURE: Cryptographic message authentication failed."

        return True, payload, "OK"
