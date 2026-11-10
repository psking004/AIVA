"""Unit and integration test suite for the AIVA Autonomous Control Plane.

Verifies zero-interaction, typed programmatic control plane operations:
1. Headless Hardware Arbitrage (< 250 chars).
2. Headless Bayesian Intent Disambiguation (EXECUTE vs CLARIFY).
3. Headless Swarm Construction (Local execution and remote delegation).
4. Headless Programmatic Quorum Clearance (Single-signature rejection & dual-signature approval).
5. Headless Zero-Leak Credential Access & Automated Redaction.
"""

from __future__ import annotations

import json
import secrets
import tempfile
from pathlib import Path

from aiva.control_plane import AivaActionResponse, AivaAgentPlane
from sse.tri_node.router import NodeRole


def test_arbitrate_compute_headless() -> None:
    """Assert compute arbitration evaluates telemetry and returns compact payloads under 250 characters."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_vault.enc"
        aiva = AivaAgentPlane(
            node_role=NodeRole.NODE_A,
            vault_path=vault_file,
            master_secret=secrets.token_hex(16),
        )

        resp = aiva.arbitrate_compute(
            vram_needed_gb=4.0,
            cpu_time_sec_pca=10.0,
            cpu_time_sec_pcb=4.0,
        )

        assert isinstance(resp, AivaActionResponse)
        assert resp.success is True
        assert resp.action == "ARBITRATE_COMPUTE"
        assert resp.status_code == "ROUTED"
        assert "target" in resp.data
        assert "util" in resp.data
        assert "oom_risk" in resp.data

        # Verify token budget ceiling (< 250 characters)
        compact = resp.to_compact_dict()
        compact_json = json.dumps(compact, separators=(",", ":"))
        assert len(compact_json) < 250, f"Payload exceeded 250 characters ({len(compact_json)} chars): {compact_json}"
        assert resp.character_count < 250


def test_resolve_intent_headless() -> None:
    """Assert ambiguous intent yields CLARIFY and dominant intent yields EXECUTE."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_vault.enc"
        aiva = AivaAgentPlane(
            node_role=NodeRole.NODE_A,
            vault_path=vault_file,
            master_secret=secrets.token_hex(16),
        )

        # Scenario 1: Ambiguous intent where EVPI > clarification cost -> CLARIFY
        ambiguous_resp = aiva.resolve_intent(
            candidates={"open notes": 0.52, "search notes": 0.48},
            penalties={"open notes": 20.0, "search notes": 20.0},
            clarification_cost=5.0,
        )
        assert ambiguous_resp.success is True
        assert ambiguous_resp.action == "RESOLVE_INTENT"
        assert ambiguous_resp.status_code == "CLARIFY"
        assert ambiguous_resp.data["directive"] == "CLARIFY"
        assert "Ambiguous intent detected" in ambiguous_resp.data["payload"]

        # Budgeted size check (< 350 chars)
        compact_ambig = json.dumps(ambiguous_resp.to_compact_dict(), separators=(",", ":"))
        assert len(compact_ambig) < 350

        # Scenario 2: High confidence dominant intent where EVPI <= clarification cost -> EXECUTE
        dominant_resp = aiva.resolve_intent(
            candidates={"open notes": 0.98, "search notes": 0.02},
            penalties={"open notes": 10.0, "search notes": 10.0},
            clarification_cost=8.0,
        )
        assert dominant_resp.success is True
        assert dominant_resp.action == "RESOLVE_INTENT"
        assert dominant_resp.status_code == "EXECUTE"
        assert dominant_resp.data["directive"] == "EXECUTE"
        assert dominant_resp.data["payload"] == "open notes"

        compact_dom = json.dumps(dominant_resp.to_compact_dict(), separators=(",", ":"))
        assert len(compact_dom) < 350


def test_build_system_headless() -> None:
    """Assert swarm build executes locally or dispatches remotely with machine-parseable status codes."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        export_dir = Path(tmp_dir) / "test_deliverable"
        vault_file = Path(tmp_dir) / "test_vault.enc"

        aiva = AivaAgentPlane(
            node_role=NodeRole.NODE_A,
            vault_path=vault_file,
            master_secret=secrets.token_hex(16),
        )

        task_spec = (
            "Create a Python module math_ops.py with a function add(a, b) that returns a + b. "
            "Include unit test test_math_ops.py asserting add(2, 3) == 5."
        )

        # 1. Local execution on NODE_A
        build_resp = aiva.build_system(
            task_specification=task_spec,
            export_path=export_dir,
            target_node=NodeRole.NODE_A,
        )

        assert isinstance(build_resp, AivaActionResponse)
        assert build_resp.success is True
        assert build_resp.action == "BUILD_SYSTEM"
        assert build_resp.status_code == "COMPLETED"
        assert len(build_resp.data["files"]) > 0
        assert build_resp.data["iterations"] >= 1
        assert build_resp.data["vulns"] == 0

        # Compact size verification (< 350 chars)
        compact = json.dumps(build_resp.to_compact_dict(), separators=(",", ":"))
        assert len(compact) < 350

        # 2. Remote delegation targeting NODE_B (air-gapped loopback fallback)
        remote_resp = aiva.build_system(
            task_specification=task_spec,
            export_path=export_dir / "remote",
            target_node=NodeRole.NODE_B,
        )
        assert isinstance(remote_resp, AivaActionResponse)
        assert remote_resp.action == "BUILD_SYSTEM_REMOTE"
        assert remote_resp.status_code in ("COMPLETED", "PARTITIONED")
        compact_remote = json.dumps(remote_resp.to_compact_dict(), separators=(",", ":"))
        assert len(compact_remote) < 350


def test_governed_action_quorum_headless() -> None:
    """Assert single-signature execution is rejected and dual-signature (PC-A + Mobile) succeeds."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_vault.enc"
        aiva = AivaAgentPlane(
            node_role=NodeRole.NODE_A,
            vault_path=vault_file,
            master_secret=secrets.token_hex(16),
        )

        action_name = "GIT_PUSH_PRODUCTION"
        target_entity = "repo:AIVA-Core"

        # 1. Single signature only (auto_sign_mobile=False) -> Rejection
        rejected_resp = aiva.execute_governed_action(
            action_name=action_name,
            target_entity=target_entity,
            auto_sign_mobile=False,
        )

        assert rejected_resp.success is False
        assert rejected_resp.action == "GOVERNED_EXECUTION"
        assert rejected_resp.status_code == "HALTED_QUORUM_DENIED"
        assert rejected_resp.error_detail is not None
        assert "INSUFFICIENT_SIGNATURES" in rejected_resp.error_detail
        assert rejected_resp.data["signatures_evaluated"] == [NodeRole.NODE_A.value]

        compact_rej = json.dumps(rejected_resp.to_compact_dict(), separators=(",", ":"))
        assert len(compact_rej) < 350

        # 2. Dual signature (auto_sign_mobile=True) -> Approval
        approved_resp = aiva.execute_governed_action(
            action_name=action_name,
            target_entity=target_entity,
            auto_sign_mobile=True,
        )

        assert approved_resp.success is True
        assert approved_resp.action == "GOVERNED_EXECUTION"
        assert approved_resp.status_code == "APPROVED"
        assert approved_resp.error_detail is None
        assert "QUORUM_VERIFIED" in approved_resp.data["reason"]
        assert NodeRole.NODE_A.value in approved_resp.data["signatures_evaluated"]
        assert NodeRole.NODE_M.value in approved_resp.data["signatures_evaluated"]

        compact_app = json.dumps(approved_resp.to_compact_dict(), separators=(",", ":"))
        assert len(compact_app) < 350


def test_zero_leak_scrubbing_headless() -> None:
    """Assert stored secrets are scrubbed to [REDACTED_SECRET] without raising exceptions."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_vault.enc"
        master_secret = secrets.token_hex(16)
        aiva = AivaAgentPlane(
            node_role=NodeRole.NODE_A,
            vault_path=vault_file,
            master_secret=master_secret,
        )

        # Generate sensitive credentials
        raw_secret_token = f"ghp_{secrets.token_hex(20)}"
        raw_api_key = f"sk-live-{secrets.token_hex(24)}"

        # Verify opaque handle generation
        handle1 = aiva.get_secret_handle("oauth", "github", "access_token")
        assert handle1 == "vault://oauth/github/access_token"

        handle2 = aiva.get_secret_handle("credentials", "openai", "api_key")
        assert handle2 == "vault://credentials/openai/api_key"

        # Store secrets in headless vault
        aiva.vault.store_secret(handle1, raw_secret_token)
        aiva.vault.store_secret(handle2, raw_api_key)

        # Test zero-leak scrubbing on outgoing text
        dirty_prompt = f"Calling GitHub API with token {raw_secret_token} and OpenAI key {raw_api_key}"
        cleaned = aiva.scrub_text(dirty_prompt)

        assert raw_secret_token not in cleaned
        assert raw_api_key not in cleaned
        assert "[REDACTED_SECRET]" in cleaned
        assert cleaned == "Calling GitHub API with token [REDACTED_SECRET] and OpenAI key [REDACTED_SECRET]"
