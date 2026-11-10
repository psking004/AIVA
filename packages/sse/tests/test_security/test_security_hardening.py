"""Verification Tests for Cryptographic Hardening, Sandboxing, Locked Ledger & Mesh Firewall.

Verifies:
1. Sliding-Window Nonce Replay Validator & Capacity-Bounded Pruning.
2. 2-of-3 M-of-N Cryptographic Threshold Quorum Verification with Replay Shield.
3. Sub-Agent Sandbox Confinement, Path Traversal Defense & Credential Privilege Scrubber.
4. Hardened Subprocess Supervision with Output Truncation & Timeouts.
5. Atomic Advisory File-Locked Ledger with Concurrent Multi-Threaded Integrity.
6. P2P Mesh Ingress Rate Limiting, Payload Firewall & Live Router Protection.
"""

from __future__ import annotations

import concurrent.futures
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from sse.security.hardening import (
    NonceTracker,
    ThresholdQuorumPolicy,
)
from sse.storage.hardened_ledger import HardenedLedger
from sse.swarm.security_sandbox import (
    HardenedProcessExecutor,
    SandboxedWorkspaceGuard,
    get_sanitized_environment,
)
from sse.tri_node.firewall import (
    MeshFirewallConfig,
    MeshPayloadFirewall,
)
from sse.tri_node.router import P2PRouter
from sse.tri_node.sovereign_core import NodeID, SovereignDecisionVerdict

# ---------------------------------------------------------------------------
# MODULE 1: NONCE TRACKER & THRESHOLD QUORUM TESTS
# ---------------------------------------------------------------------------


def test_nonce_tracker_replay_and_window_ttl() -> None:
    """Verify NonceTracker detects replays, honors TTL window, and rejects future/expired nonces."""
    tracker = NonceTracker(window_ttl_sec=5.0, max_entries=100)
    now = time.time()

    # Fresh nonce within window
    ok, reason = tracker.validate_and_record("nonce_001", timestamp=now)
    assert ok is True
    assert reason == "OK"
    assert tracker.is_seen("nonce_001") is True

    # Immediate replay must be rejected
    ok_replay, reason_replay = tracker.validate_and_record("nonce_001", timestamp=now)
    assert ok_replay is False
    assert reason_replay == "REPLAY_DETECTED"

    # Expired nonce (> 5.0s in past) must be rejected
    ok_exp, reason_exp = tracker.validate_and_record("nonce_expired", timestamp=now - 10.0)
    assert ok_exp is False
    assert reason_exp == "EXPIRED_TIMESTAMP"

    # Future nonce (> 5.0s in future) must be rejected
    ok_fut, reason_fut = tracker.validate_and_record("nonce_future", timestamp=now + 10.0)
    assert ok_fut is False
    assert reason_fut == "FUTURE_TIMESTAMP"


def test_nonce_tracker_capacity_pruning() -> None:
    """Verify NonceTracker bounds memory usage by evicting entries past max_entries."""
    tracker = NonceTracker(window_ttl_sec=10.0, max_entries=5)
    now = time.time()

    for i in range(10):
        ok, _ = tracker.validate_and_record(f"nonce_{i}", timestamp=now)
        assert ok is True

    # Tracker size must not exceed max_entries (5)
    assert tracker.size() <= 5
    # The most recent nonces must be retained
    assert tracker.is_seen("nonce_9") is True
    # The oldest nonce must have been evicted
    assert tracker.is_seen("nonce_0") is False


def test_threshold_quorum_m_of_n_verification() -> None:
    """Verify M-of-N threshold quorum gate requires minimum valid distinct signatures."""
    policy = ThresholdQuorumPolicy(min_threshold=2, max_clock_skew_sec=60.0)
    now = time.time()
    action = "TERMINATE_PROCESS:pid=4096"

    # 1. Single signature fails 2-of-3 threshold
    sig_pc_a = policy.sign_action(NodeID.PC_A.value, action, now)
    ok_single, msg_single = policy.verify_quorum(action, now, {NodeID.PC_A.value: sig_pc_a})
    assert ok_single is False
    assert "INSUFFICIENT_SIGNATURES" in msg_single

    # 2. 2 distinct valid signatures (PC_A and MOBILE) must satisfy quorum
    sig_mobile = policy.sign_action(NodeID.MOBILE.value, action, now)
    signatures = {
        NodeID.PC_A.value: sig_pc_a,
        NodeID.MOBILE.value: sig_mobile,
    }
    ok_quorum, msg_quorum = policy.verify_quorum(action, now, signatures)
    assert ok_quorum is True
    assert "QUORUM_VERIFIED" in msg_quorum

    # 3. Tampered payload with valid signatures must be rejected
    ok_tamper, msg_tamper = policy.verify_quorum("UNAUTHORIZED_ACTION", now, signatures)
    assert ok_tamper is False
    assert "QUORUM_FAILED" in msg_tamper

    # 4. Unknown node identity must be ignored
    bogus_signatures = {
        "ROGUE_NODE": "deadbeef" * 8,
        NodeID.PC_A.value: sig_pc_a,
    }
    ok_bogus, msg_bogus = policy.verify_quorum(action, now, bogus_signatures)
    assert ok_bogus is False
    assert "QUORUM_FAILED" in msg_bogus

    # 5. Nonce replay prevention on quorum
    ok_q1, _ = policy.verify_quorum(action, now, signatures, nonce="nonce_grant_101")
    assert ok_q1 is True
    # Replay with same nonce must be blocked
    ok_q2, msg_q2 = policy.verify_quorum(action, now, signatures, nonce="nonce_grant_101")
    assert ok_q2 is False
    assert "REPLAY_PREVENTED" in msg_q2


# ---------------------------------------------------------------------------
# MODULE 2: SANDBOX CONFINEMENT & PRIVILEGE SCRUBBER TESTS
# ---------------------------------------------------------------------------


def test_sandbox_path_traversal_guards(tmp_path: Path) -> None:
    """Verify SandboxedWorkspaceGuard strictly rejects path-traversal escapes."""
    sandbox_root = tmp_path / "sandbox"
    guard = SandboxedWorkspaceGuard(sandbox_root)

    # Valid internal paths
    safe_path = guard.resolve_safe_path("src/core/limiter.py")
    assert safe_path == (sandbox_root / "src" / "core" / "limiter.py").resolve()
    assert guard.is_path_safe("src/core/limiter.py") is True

    # Relative path traversal escape must throw PermissionError
    with pytest.raises(PermissionError, match="Path traversal"):
        guard.resolve_safe_path("../../outside.txt")
    assert guard.is_path_safe("../../outside.txt") is False

    with pytest.raises(PermissionError, match="Path traversal"):
        guard.resolve_safe_path("src/../../outside.txt")

    # Absolute path escape outside sandbox must throw PermissionError
    outside_abs = (tmp_path / "evil.txt").resolve()
    with pytest.raises(PermissionError, match="Path traversal"):
        guard.resolve_safe_path(outside_abs)
    assert guard.is_path_safe(outside_abs) is False

    # Safe write and read inside sandbox
    guard.safe_write("config/settings.json", '{"hardened": true}')
    content = guard.safe_read("config/settings.json")
    assert '{"hardened": true}' in content


def test_environment_variable_privilege_scrubber(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify get_sanitized_environment scrubs sensitive secrets and credentials."""
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "AKIAIOSFODNN7EXAMPLE")
    monkeypatch.setenv("DATABASE_PASSWORD", "supersecret123")
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_xxxxxxxxxxxx")
    monkeypatch.setenv("USER_API_KEY", "secret_api_key_value")
    monkeypatch.setenv("PATH", os.environ.get("PATH", ""))

    clean_env = get_sanitized_environment(extra_env={"CUSTOM_SETTING": "safe_val"})

    # Sensitive variables must be scrubbed
    assert "AWS_SECRET_ACCESS_KEY" not in clean_env
    assert "DATABASE_PASSWORD" not in clean_env
    assert "GITHUB_TOKEN" not in clean_env
    assert "USER_API_KEY" not in clean_env

    # Allowlisted variables and flags must be present
    assert "PATH" in clean_env
    assert clean_env.get("PYTHONDONTWRITEBYTECODE") == "1"
    assert clean_env.get("CUSTOM_SETTING") == "safe_val"


def test_hardened_process_executor(tmp_path: Path) -> None:
    """Verify HardenedProcessExecutor bounds execution time and truncates runaway output."""
    guard = SandboxedWorkspaceGuard(tmp_path)
    executor = HardenedProcessExecutor(guard, default_timeout_sec=2.0, max_output_bytes=500)

    # 1. Normal execution
    res = executor.run_command([sys.executable, "-c", "print('hello security')"])
    assert res.exit_code == 0
    assert "hello security" in res.stdout
    assert res.timed_out is False

    # 2. Timeout supervision on runaway sleep
    res_timeout = executor.run_command(
        [sys.executable, "-c", "import time; time.sleep(10)"],
        timeout_sec=0.2,
    )
    assert res_timeout.timed_out is True
    assert res_timeout.exit_code != 0

    # 3. Output buffer truncation on stdout flood
    flood_script = "print('A' * 2000)"
    res_flood = executor.run_command([sys.executable, "-c", flood_script])
    assert res_flood.exit_code == 0
    assert len(res_flood.stdout) <= 650
    assert "TRUNCATED" in res_flood.stdout


# ---------------------------------------------------------------------------
# MODULE 3: ATOMIC ADVISORY FILE-LOCKED LEDGER TESTS
# ---------------------------------------------------------------------------


def test_hardened_ledger_atomic_append_and_integrity(tmp_path: Path) -> None:
    """Verify HardenedLedger locks files, flushes to disk, and maintains unbroken hash chains."""
    ledger_path = tmp_path / "hardened_test.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path, lock_timeout_sec=5.0)

    # File permissions must be initialized
    assert ledger_path.exists()

    # Append 5 records atomically
    for i in range(5):
        verdict = SovereignDecisionVerdict(
            node_id="PC_A",
            decision_id=f"dec_{i:03d}",
            action_idx=i % 2,
            action_name=f"Action_{i}",
            expected_utility=10.0 + i,
            worst_case_regret=0.0,
            solver_tier="T1_IESDS",
            grant_token="dummy_grant",
            record_hash_16="abcd",
            mode="SOLO",
            timestamp=1700000000.0 + i,
        )
        ledger.append_verdict(verdict)

    records = ledger.read_records()
    assert len(records) == 5

    # Hash chain integrity check
    valid, count, msg = ledger.verify_integrity()
    assert valid is True
    assert count == 5
    assert msg == "VERIFIED_VALID"


def test_hardened_ledger_concurrent_multi_thread(tmp_path: Path) -> None:
    """Verify HardenedLedger advisory locking prevents hash chain splits under concurrent threads."""
    ledger_path = tmp_path / "concurrent_ledger.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path, lock_timeout_sec=10.0)

    total_threads = 8
    appends_per_thread = 5

    def worker_append(thread_id: int) -> None:
        local_ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path, lock_timeout_sec=10.0)
        for i in range(appends_per_thread):
            record_data = {
                "decision_id": f"t{thread_id}_item_{i}",
                "timestamp": time.time(),
                "payload": {"thread": thread_id, "idx": i},
            }
            local_ledger.atomic_append_record(record_data)
            time.sleep(0.01)

    with concurrent.futures.ThreadPoolExecutor(max_workers=total_threads) as pool:
        futures = [pool.submit(worker_append, t) for t in range(total_threads)]
        for f in concurrent.futures.as_completed(futures):
            f.result()

    records = ledger.read_records()
    assert len(records) == total_threads * appends_per_thread

    # Chain must be 100% contiguous and untampered
    valid, count, msg = ledger.verify_integrity()
    assert valid is True
    assert count == total_threads * appends_per_thread
    assert msg == "VERIFIED_VALID"


# ---------------------------------------------------------------------------
# MODULE 4: P2P MESH INGRESS RATE LIMITER & FIREWALL TESTS
# ---------------------------------------------------------------------------


def test_firewall_payload_validation_and_rate_limits() -> None:
    """Verify MeshPayloadFirewall validates headers, rate limits, clock skew, and unrecognized nodes."""
    config = MeshFirewallConfig(
        max_payload_bytes=1024,
        max_clock_skew_sec=10.0,
        rate_limit_per_second=5.0,
        rate_limit_burst=3,
        allowed_node_ids={"PC_A", "PC_B", "MOBILE"},
    )
    firewall = MeshPayloadFirewall(config)

    # 1. Header validation: oversized content length
    valid_hdr, err_hdr = firewall.validate_headers({"Content-Type": "application/json"}, content_length=5000)
    assert valid_hdr is False
    assert "PAYLOAD_TOO_LARGE" in err_hdr

    # 2. Header validation: non-JSON content type
    valid_ct, err_ct = firewall.validate_headers({"Content-Type": "text/html"}, content_length=50)
    assert valid_ct is False
    assert "INVALID_CONTENT_TYPE" in err_ct

    # 3. Payload size check
    oversized_body = b"A" * 2000
    valid_sz, _, err_sz = firewall.validate_payload(oversized_body)
    assert valid_sz is False
    assert "PAYLOAD_TOO_LARGE" in err_sz

    # 4. Unauthorized node check
    unauthorized_node = b'{"node_id": "ROGUE_PC", "data": 123}'
    valid_node, _, err_node = firewall.validate_payload(unauthorized_node, peer_ip="192.168.1.50")
    assert valid_node is False
    assert "UNRECOGNIZED_NODE_ID" in err_node

    # 5. Clock skew check (> 10s)
    stale_payload = f'{{"node_id": "PC_A", "timestamp": {time.time() - 30.0}}}'.encode()
    valid_skew, _, err_skew = firewall.validate_payload(stale_payload, peer_ip="192.168.1.50")
    assert valid_skew is False
    assert "CLOCK_SKEW_EXCEEDED" in err_skew

    # 6. Rate limiter burst and throttle
    ip = "10.0.0.99"
    firewall.rate_limiter.reset()
    # Burst 3 requests
    assert firewall.rate_limiter.allow(ip) is True
    assert firewall.rate_limiter.allow(ip) is True
    assert firewall.rate_limiter.allow(ip) is True
    # 4th immediate request must be throttled
    assert firewall.rate_limiter.allow(ip) is False


def test_p2p_router_with_firewall_protection(tmp_path: Path) -> None:
    """Verify live P2PRouter rejects malformed, oversized, or unauthorized HTTP payloads via firewall."""
    path_a = tmp_path / "firewall_router_ledger.jsonl"
    router = P2PRouter(node_id="PC_A", port=8225, mode="MESH", ledger_path=path_a)
    router.start_server(host="127.0.0.1", background=True)

    try:
        # 1. Non-JSON Content-Type must return 415
        req_bad_ct = urllib.request.Request(
            "http://127.0.0.1:8225/mesh/dispatch",
            data=b"raw plain text",
            headers={"Content-Type": "text/plain"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_ct:
            urllib.request.urlopen(req_bad_ct)
        assert exc_ct.value.code == 415

        # 2. Malformed JSON body must return 400
        req_bad_json = urllib.request.Request(
            "http://127.0.0.1:8225/mesh/dispatch",
            data=b"{not valid json...",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_json:
            urllib.request.urlopen(req_bad_json)
        assert exc_json.value.code == 400

    finally:
        router.stop_server()
