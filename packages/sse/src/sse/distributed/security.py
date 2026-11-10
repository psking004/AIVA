"""Strategic Systems Engine - Cluster HMAC Security & Authentication.

Provides cryptographic authorization token creation and constant-time verification
for offloaded distributed compute tasks across PC-A and PC-B.
"""

from __future__ import annotations

import hashlib
import hmac
import os

DEFAULT_CLUSTER_SECRET: str = os.getenv("SSE_CLUSTER_SECRET", "sse_cluster_secret_v1_pc_a_pc_b")


def generate_cluster_grant(timestamp: float, secret: str = DEFAULT_CLUSTER_SECRET) -> str:
    """Generate HMAC-SHA256 authorization grant token for the given timestamp epoch."""
    payload = f"{timestamp:.3f}".encode()
    sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"grant_{sig}"


def verify_cluster_grant(
    grant_header: str | None,
    timestamp: float,
    current_time: float,
    secret: str = DEFAULT_CLUSTER_SECRET,
    max_skew_sec: float = 300.0,
) -> tuple[bool, str]:
    """Verify cryptographic grant token with timestamp anti-replay tolerance.

    Args:
        grant_header: The incoming `X-Auth-Grant` token header.
        timestamp: The timestamp declared in the request payload.
        current_time: Current system epoch timestamp.
        secret: Shared cluster secret.
        max_skew_sec: Maximum permissible clock skew in seconds (default 300.0s).

    Returns:
        (is_valid, reason_str)
    """
    if not grant_header:
        return False, "Missing X-Auth-Grant header"

    # Anti-replay / timestamp expiration check
    skew = abs(current_time - timestamp)
    if skew > max_skew_sec:
        return False, f"Request timestamp expired (clock skew {skew:.2f}s > {max_skew_sec}s)"

    expected_grant = generate_cluster_grant(timestamp, secret=secret)
    if not hmac.compare_digest(grant_header, expected_grant):
        return False, "Cryptographic grant signature mismatch"

    return True, "Grant verified successfully"
