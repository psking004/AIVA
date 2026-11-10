"""System Hardening Verification Tests for SSE Security Architecture.

Verifies:
1. test_nonce_replay_rejection: Nonce replay detection, sliding TTL window, and stale expiration.
2. test_threshold_quorum_authorization: 2-of-3 threshold multi-signature verification.
3. test_sandbox_path_traversal_defense: Strict path confinement and directory traversal defense.
4. test_atomic_file_locking_ledger: Concurrent multi-threaded atomic file locking without corruption.
5. test_ingress_rate_limiting_and_payload_caps: 1 MB payload limits and rate limiter caps.
"""

from __future__ import annotations

import concurrent.futures
import time
from pathlib import Path

import pytest

from sse.security.hardening import NonceTracker, ThresholdQuorumPolicy
from sse.storage.hardened_ledger import HardenedLedger
from sse.swarm.security_sandbox import SandboxedWorkspaceGuard
from sse.tri_node.firewall import EndpointRateLimiter, MeshFirewallConfig, MeshPayloadFirewall
from sse.tri_node.sovereign_core import NodeID


def test_nonce_replay_rejection() -> None:
    """Assert immediate duplicate nonce rejection and stale timestamp expiration."""
    tracker = NonceTracker(window_ttl_sec=3.0, max_entries=50)
    now = time.time()

    # Initial valid nonce
    ok, reason = tracker.validate_and_record("nonce_alpha", timestamp=now)
    assert ok is True
    assert reason == "OK"

    # Immediate replay must be rejected
    ok_replay, reason_replay = tracker.validate_and_record("nonce_alpha", timestamp=now)
    assert ok_replay is False
    assert reason_replay == "REPLAY_DETECTED"

    # Stale/expired nonce (> 3.0s ago) must be rejected
    ok_stale, reason_stale = tracker.validate_and_record("nonce_stale", timestamp=now - 5.0)
    assert ok_stale is False
    assert reason_stale == "EXPIRED_TIMESTAMP"


def test_threshold_quorum_authorization() -> None:
    """Assert quorum requirements: single rejection, dual approval, and tampered signature rejection."""
    policy = ThresholdQuorumPolicy(min_threshold=2)
    now = time.time()
    action = "TERMINATE_WORKER:worker_node_b"

    sig_pca = policy.sign_action(NodeID.PC_A.value, action, now)
    sig_mobile = policy.sign_action(NodeID.MOBILE.value, action, now)

    # 1. Single signature rejection (insufficient quorum)
    ok_single, msg_single = policy.verify_quorum(action, now, {NodeID.PC_A.value: sig_pca})
    assert ok_single is False
    assert "INSUFFICIENT_SIGNATURES" in msg_single

    # 2. Dual valid signature approval (PC-A + Mobile)
    ok_dual, msg_dual = policy.verify_quorum(
        action,
        now,
        {NodeID.PC_A.value: sig_pca, NodeID.MOBILE.value: sig_mobile},
    )
    assert ok_dual is True
    assert "QUORUM_VERIFIED" in msg_dual

    # 3. Tampered signature rejection
    ok_tamper, msg_tamper = policy.verify_quorum(
        action,
        now,
        {NodeID.PC_A.value: "0" * 64, NodeID.MOBILE.value: sig_mobile},
    )
    assert ok_tamper is False
    assert "QUORUM_FAILED" in msg_tamper


def test_sandbox_path_traversal_defense(tmp_path: Path) -> None:
    """Assert PermissionError is raised on traversal attacks (../../windows/system32, /etc/shadow)."""
    sandbox_root = tmp_path / "sandbox_confinement"
    guard = SandboxedWorkspaceGuard(sandbox_root)

    # Escape attempt: relative traversal above root
    with pytest.raises(PermissionError, match="Path traversal"):
        guard.resolve_safe_path("../../windows/system32")

    # Escape attempt: absolute Unix root path
    with pytest.raises(PermissionError, match="Path traversal"):
        guard.resolve_safe_path("/etc/shadow")

    # Escape attempt: absolute Windows system path
    with pytest.raises(PermissionError, match="Path traversal"):
        guard.resolve_safe_path(Path("C:/Windows/System32/cmd.exe"))

    # Valid internal path must succeed
    safe_target = guard.resolve_safe_path("src/module/service.py")
    assert safe_target.is_relative_to(sandbox_root.resolve())


def test_atomic_file_locking_ledger(tmp_path: Path) -> None:
    """Test concurrent multi-threaded append operations to ensure zero record interleaving or corruption."""
    ledger_path = tmp_path / "atomic_concurrent_ledger.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path)

    thread_count = 6
    writes_per_thread = 5

    def thread_worker(tid: int) -> None:
        th_ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path)
        for i in range(writes_per_thread):
            th_ledger.atomic_append_record({
                "decision_id": f"th_{tid}_write_{i}",
                "timestamp": time.time(),
                "payload": {"thread_id": tid, "step": i},
            })

    with concurrent.futures.ThreadPoolExecutor(max_workers=thread_count) as executor:
        futures = [executor.submit(thread_worker, t) for t in range(thread_count)]
        for f in concurrent.futures.as_completed(futures):
            f.result()

    records = ledger.read_records()
    assert len(records) == thread_count * writes_per_thread

    # Entire chain must be mathematically intact
    valid, count, msg = ledger.verify_integrity()
    assert valid is True
    assert count == thread_count * writes_per_thread
    assert msg == "VERIFIED_VALID"


def test_ingress_rate_limiting_and_payload_caps() -> None:
    """Assert 1 MB body rejections and rate-limiting threshold enforcement."""
    # 1. 1 MB body ceiling
    config = MeshFirewallConfig(max_payload_bytes=1_048_576)
    firewall = MeshPayloadFirewall(config)

    oversized = b"X" * (1_048_576 + 1024)
    valid_sz, _, err_sz = firewall.validate_payload(oversized)
    assert valid_sz is False
    assert "PAYLOAD_TOO_LARGE" in err_sz

    # 2. EndpointRateLimiter allowing up to 30 requests per minute
    limiter = EndpointRateLimiter(max_requests=30, window_seconds=60.0)
    peer_ip = "192.168.1.100"

    # Send 30 requests within budget
    for _ in range(30):
        assert limiter.allow(peer_id=peer_ip) is True

    # 31st request in the same window must be rejected
    assert limiter.allow(peer_id=peer_ip) is False

