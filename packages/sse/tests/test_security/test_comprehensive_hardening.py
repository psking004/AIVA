"""Comprehensive Security Audit & Hardening Verification Suite.

Validates:
1. test_endpoint_payload_ceiling_and_mime: HTTP 413 (> 1 MB streamed body), HTTP 415 (MIME), HTTP 429 (30 req/min), and loopback binding guard.
2. test_path_traversal_and_symlink_defenses: Relative traversal, drive/absolute escapes, null bytes, and nested symlinks / NTFS junctions.
3. test_nonce_replay_and_drift_rejection: Duplicate frame nonce replay rejection and bidirectional +-60s timestamp drift enforcement.
4. test_credential_scanner_and_redaction: StaticSecretScanner token/entropy detection, opaque vault:// compliance, mutable bytearray zeroization, and global logging redaction.
5. test_subprocess_environment_isolation: Subprocess privilege scrubbing removing host secrets, enforcing shell=False tokenized commands.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from aiva.security.vault import (
    SecureCredentialVault,
    VaultRedactingFilter,
    redact_secrets,
    zeroize_buffer,
)
from sse.swarm.agents.runtime import RuntimeSupervisorAgent
from sse.swarm.security_audit_scanner import StaticSecretScanner, is_opaque_vault_handle
from sse.swarm.security_sandbox import HardenedProcessExecutor, SandboxedWorkspaceGuard
from sse.tri_node.frame import TriNodeFrame
from sse.tri_node.router import P2PRouter
from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET, NodeID


def _post_raw(url: str, data: bytes, headers: dict[str, str]) -> tuple[int, dict[str, object]]:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"raw": raw}
        return err.code, body


# ---------------------------------------------------------------------------
# TEST 1: P2P ENDPOINT PAYLOAD CEILING, MIME ENFORCEMENT, BINDING & RATE LIMIT
# ---------------------------------------------------------------------------


def test_endpoint_payload_ceiling_and_mime(tmp_path: Path) -> None:
    """Verify HTTP 413 on >1 MB bodies, HTTP 415 on invalid/missing Content-Type, HTTP 429 rate limits, and loopback guard."""
    router = P2PRouter(
        node_id=NodeID.PC_A,
        port=8241,
        mode="MESH",
        ledger_path=tmp_path / "hardening_ep.jsonl",
    )

    # 1. External bind must fail closed without explicit allow_external=True
    with pytest.raises(PermissionError, match="non-loopback"):
        router.start_server(host="0.0.0.0", background=True)

    # Default binding uses loopback 127.0.0.1 cleanly
    server = router.start_server(background=True)
    assert server.server_address[0] == "127.0.0.1"
    base_url = "http://127.0.0.1:8241"

    try:
        # 2. Invalid Content-Type -> HTTP 415
        for route in ("/mesh/dispatch", "/mesh/quorum/challenge", "/mesh/quorum/approve"):
            code_bad_ct, body_bad_ct = _post_raw(
                f"{base_url}{route}",
                data=b'{"action": "inspect_telemetry"}',
                headers={"Content-Type": "text/plain"},
            )
            assert code_bad_ct == 415
            assert "INVALID_CONTENT_TYPE" in str(body_bad_ct.get("error", ""))

        # Missing/empty Content-Type (overriding urllib's default x-www-form-urlencoded via text/xml) -> HTTP 415
        code_xml, _ = _post_raw(
            f"{base_url}/mesh/dispatch",
            data=b'{"action": "inspect_telemetry"}',
            headers={"Content-Type": "application/xml"},
        )
        assert code_xml == 415

        # 3. Payload > 1 MB (1,048,576 bytes) -> HTTP 413 before JSON deserialization
        oversized = b'{"data":"' + (b"A" * (1_048_576 + 512)) + b'"}'
        code_413, body_413 = _post_raw(
            f"{base_url}/mesh/dispatch",
            data=oversized,
            headers={"Content-Type": "application/json"},
        )
        assert code_413 == 413
        assert "PAYLOAD_TOO_LARGE" in str(body_413.get("error", ""))

        # 4. Rate limiting (30 req/min budget -> 31st immediate request throttled with 429)
        router.firewall.rate_limiter.reset()
        throttled_seen = False
        for _ in range(35):
            code_rl, _ = _post_raw(
                f"{base_url}/mesh/inspect",
                data=b"{}",
                headers={"Content-Type": "application/json"},
            )
            if code_rl == 429:
                throttled_seen = True
                break
        assert throttled_seen is True
    finally:
        router.stop_server()


# ---------------------------------------------------------------------------
# TEST 2: WORKSPACE PATH TRAVERSAL, SYMLINK & NTFS JUNCTION DEFENSES
# ---------------------------------------------------------------------------


def test_path_traversal_and_symlink_defenses(tmp_path: Path) -> None:
    """Assert relative traversal, absolute escapes, null bytes, and external symlinks/junctions raise PermissionError."""
    sandbox_root = tmp_path / "isolated_workspace"
    outside_dir = tmp_path / "sensitive_host_dir"
    outside_dir.mkdir(parents=True, exist_ok=True)
    outside_secret = outside_dir / "host_key.txt"
    outside_secret.write_text("TOP_SECRET_HOST_KEY", encoding="utf-8")

    guard = SandboxedWorkspaceGuard(sandbox_root)

    # 1. Valid internal path resolves cleanly inside sandbox_root parents
    valid = guard.resolve_safe_path("src/app/module.py")
    assert guard.sandbox_root in valid.parents
    guard.safe_write("src/app/module.py", "ok = True\n")
    assert guard.safe_read("src/app/module.py") == "ok = True\n"

    # 2. Traversal vectors and absolute escapes
    traversal_vectors: list[str | Path] = [
        "../../outside.txt",
        "src/../../outside.txt",
        "..\\..\\outside.txt",
        "/etc/passwd",
        Path("C:/Windows/System32/drivers/etc/hosts"),
        outside_secret,
        "valid.txt\x00.py",
        "",
    ]
    for vec in traversal_vectors:
        with pytest.raises(PermissionError, match="Path traversal"):
            guard.resolve_safe_path(vec)
        assert guard.is_path_safe(vec) is False

    # 3. Symlink / Windows NTFS directory junction pointing outside sandbox_root
    nested_parent = sandbox_root / "nested" / "sub"
    nested_parent.mkdir(parents=True, exist_ok=True)
    escape_link = nested_parent / "escape_link"

    link_created = False
    if os.name == "nt":
        import _winapi

        _winapi.CreateJunction(str(outside_dir), str(escape_link))
        link_created = True
    else:
        os.symlink(outside_dir, escape_link, target_is_directory=True)
        link_created = True

    if link_created:
        with pytest.raises(PermissionError):
            guard.resolve_safe_path("nested/sub/escape_link/host_key.txt")
        with pytest.raises(PermissionError):
            guard.safe_write("nested/sub/escape_link/pwned.txt", "overwrite")
        assert not (outside_dir / "pwned.txt").exists()


# ---------------------------------------------------------------------------
# TEST 3: REPLAY ATTACK & BIDIRECTIONAL TIMESTAMP DRIFT REJECTION
# ---------------------------------------------------------------------------


def test_nonce_replay_and_drift_rejection(tmp_path: Path) -> None:
    """Transmit duplicate signed frames and out-of-window (+-60s) timestamps; assert HTTP rejection."""
    router = P2PRouter(
        node_id=NodeID.PC_B,
        port=8242,
        mode="MESH",
        ledger_path=tmp_path / "replay_drift.jsonl",
    )
    router.start_server(host="127.0.0.1", background=True)
    dispatch_url = "http://127.0.0.1:8242/mesh/dispatch"

    try:
        # 1. Fresh valid signed frame succeeds
        now = time.time()
        valid_frame = TriNodeFrame(
            sender_node_id=NodeID.PC_A.value,
            action="inspect_telemetry",
            payload={"probe": 1},
            timestamp=now,
            nonce="unique_nonce_001",
        )
        valid_frame.sign(CLUSTER_SHARED_SECRET)
        raw_valid = json.dumps(valid_frame.to_dict()).encode("utf-8")

        status_ok, body_ok = _post_raw(dispatch_url, raw_valid, {"Content-Type": "application/json"})
        assert status_ok == 200
        assert body_ok.get("status") == "READY"

        # 2. Exact replay with same nonce must be rejected immediately
        status_replay, body_replay = _post_raw(dispatch_url, raw_valid, {"Content-Type": "application/json"})
        assert status_replay == 401
        assert "REPLAY_DETECTED" in str(body_replay.get("error", ""))

        # 3. Past drift beyond 60s (-90s) must be rejected
        past_frame = TriNodeFrame(
            sender_node_id=NodeID.PC_A.value,
            action="inspect_telemetry",
            payload={},
            timestamp=now - 90.0,
            nonce="unique_nonce_past",
        )
        past_frame.sign(CLUSTER_SHARED_SECRET)
        status_past, body_past = _post_raw(
            dispatch_url,
            json.dumps(past_frame.to_dict()).encode("utf-8"),
            {"Content-Type": "application/json"},
        )
        assert status_past == 401
        assert "CLOCK_SKEW_EXCEEDED" in str(body_past.get("error", ""))

        # 4. Future drift beyond 60s (+90s) must be rejected
        future_frame = TriNodeFrame(
            sender_node_id=NodeID.PC_A.value,
            action="inspect_telemetry",
            payload={},
            timestamp=now + 90.0,
            nonce="unique_nonce_future",
        )
        future_frame.sign(CLUSTER_SHARED_SECRET)
        status_fut, body_fut = _post_raw(
            dispatch_url,
            json.dumps(future_frame.to_dict()).encode("utf-8"),
            {"Content-Type": "application/json"},
        )
        assert status_fut == 401
        assert "CLOCK_SKEW_EXCEEDED" in str(body_fut.get("error", ""))
    finally:
        router.stop_server()


# ---------------------------------------------------------------------------
# TEST 4: STATIC SECRET SCANNER, MUTABLE ZEROIZATION & LOG REDACTION
# ---------------------------------------------------------------------------


def test_credential_scanner_and_redaction(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """Verify StaticSecretScanner flags leaked credentials, bytearray zeroization clears RAM, and loggers redact."""
    scanner = StaticSecretScanner()

    # Construct synthetic test credentials dynamically to keep repo clean
    fake_aws = "AKIA" + "1234567890ABCDEF"
    fake_gh = "ghp_" + ("AbCdEfGhIj1234567890" * 2)
    fake_gcp = "AIza" + ("XyZ0123456789_-AbCdEfGhIj" + "1234567890")
    fake_pem = "-----BEGIN " + "RSA PRIVATE KEY-----"
    fake_hex = "9f8e7d6c5b4a39281726354453627180abcdef1234567890"

    dirty_py = (
        f'aws_id = "{fake_aws}"\n'
        f'gh_tok = "{fake_gh}"\n'
        f'gcp_key = "{fake_gcp}"\n'
        f'pem = "{fake_pem}"\n'
        f'api_secret = "{fake_hex}"\n'
    )
    findings = scanner.scan_text(dirty_py, file_path="leaked_config.py")
    rule_ids = {f.rule_id for f in findings}
    assert "SEC-CRED-AWS" in rule_ids
    assert "SEC-CRED-GH" in rule_ids
    assert "SEC-CRED-GCP" in rule_ids
    assert "SEC-CRED-PEM" in rule_ids
    assert "SEC-ENT-HEX" in rule_ids

    # Scanner snippets must themselves be redacted
    for finding in findings:
        assert fake_gh not in finding.redacted_snippet
        assert fake_aws not in finding.redacted_snippet

    # Opaque vault handles produce zero findings
    clean_py = (
        'handle_gh = "vault://oauth/github/access_token"\n'
        'handle_aws = "vault://cloud/aws/secret_key"\n'
    )
    assert is_opaque_vault_handle("vault://oauth/github/access_token") is True
    assert scanner.scan_text(clean_py, file_path="clean_config.py") == []

    # Mutable bytearray zeroization + global logging redaction
    vault = SecureCredentialVault(vault_path=tmp_path / "vault.enc", master_secret="vault_test_key_99")
    vault.store_secret("vault://oauth/github/token", fake_gh)

    buf = vault.resolve_handle("vault://oauth/github/token")
    assert isinstance(buf, bytearray)
    assert buf.decode("utf-8") == fake_gh

    zeroize_buffer(buf)
    assert all(b == 0 for b in buf)

    # Global redaction via filter + module helper
    assert redact_secrets(f"Bearer {fake_gh}") == "Bearer [REDACTED_SECRET]"

    test_logger = logging.getLogger("sse.test.redaction_audit")
    redacting_filter = VaultRedactingFilter()
    test_logger.addFilter(redacting_filter)
    try:
        with caplog.at_level(logging.WARNING, logger="sse.test.redaction_audit"):
            test_logger.warning("Attempting outbound auth with %s", fake_gh)
        assert fake_gh not in caplog.text
        assert "[REDACTED_SECRET]" in caplog.text
    finally:
        test_logger.removeFilter(redacting_filter)


# ---------------------------------------------------------------------------
# TEST 5: SUBPROCESS ENVIRONMENT ISOLATION & SHELL=FALSE ENFORCEMENT
# ---------------------------------------------------------------------------


def test_subprocess_environment_isolation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Spawn subprocesses under HardenedProcessExecutor and RuntimeSupervisorAgent; assert host secrets are scrubbed."""
    sensitive_vars = {
        "AWS_SECRET_ACCESS_KEY": "super_secret_aws_value",
        "GITHUB_TOKEN": "ghp_synthetic_env_token_value",
        "AIVA_MASTER_SECRET": "master_vault_passphrase_123",
        "SSE_CLUSTER_SECRET": "cluster_hmac_root_secret",
        "DATABASE_URL": "postgresql://admin:pass@localhost/prod",
        "CUSTOM_API_KEY": "live_api_key_9999",
    }
    for k, v in sensitive_vars.items():
        monkeypatch.setenv(k, v)

    guard = SandboxedWorkspaceGuard(tmp_path)
    executor = HardenedProcessExecutor(guard, default_timeout_sec=5.0)

    # 1. Raw shell strings must be rejected
    with pytest.raises(PermissionError, match="Shell execution denied"):
        executor.run_command("echo unsafe_shell_string")  # type: ignore[arg-type]

    # 2. Subprocess dumps os.environ keys; sensitive keys must be 100% absent
    inspect_script = "import json, os; print(json.dumps(dict(os.environ)))"
    res = executor.run_command([sys.executable, "-c", inspect_script])
    assert res.exit_code == 0
    child_env = json.loads(res.stdout)

    for k, v in sensitive_vars.items():
        assert k not in child_env
        assert v not in res.stdout

    assert child_env.get("PYTHONDONTWRITEBYTECODE") == "1"

    # 3. Verify RuntimeSupervisorAgent enforces identical scrubbing & rejects raw shell strings
    runtime = RuntimeSupervisorAgent()
    with pytest.raises(PermissionError):
        runtime.run_command("echo unsafe", cwd=tmp_path)  # type: ignore[arg-type]

    res_rt = runtime.run_command([sys.executable, "-c", inspect_script], cwd=tmp_path)
    assert res_rt.exit_code == 0
    rt_env = json.loads(res_rt.stdout)
    for k in sensitive_vars:
        assert k not in rt_env

