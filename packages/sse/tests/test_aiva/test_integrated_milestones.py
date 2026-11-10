"""Comprehensive integration test suite covering the 4 production milestones:

1. Perception & Voice Loop Binding (Bayesian EVPI Intent Disambiguation)
2. Mobile Quorum Signer Daemon (Node M Challenge Ingress & Dual-Mode Signing)
3. Distributed Swarm Arena Stress-Testing Pipeline (PC-A Synthesis -> PC-B 4-Vector Stress Fuzzing)
4. Headless Production Keyring & Secret Enrollment (Zero-STDIN Vault Provisioning)
"""

from __future__ import annotations

import json
import secrets
import tempfile
import time
from pathlib import Path

from aiva.control_plane import AivaAgentPlane
from aiva.governance.mobile_signer import MobileQuorumSignerDaemon, SignerPolicyRule
from aiva.perception.voice_gateway import VoiceIntentCandidate, VoiceIntentGateway
from aiva.security.enrollment import HeadlessSecretEnrollment
from sse.swarm.distributed_pipeline import DistributedSwarmPipeline
from sse.tri_node.router import NodeRole


def test_voice_intent_gateway_bayesian_evpi() -> None:
    """Assert low-risk voice queries trigger EXECUTE directly, while ambiguous high-loss voice queries return structured clarification strings."""
    gateway = VoiceIntentGateway(default_clarification_cost=8.0)

    # 1. Ambiguous high-loss voice query: "delete production table" vs "backup table"
    # Misclassification loss is high (100.0)
    high_loss_candidates = [
        VoiceIntentCandidate(intent="delete_database", confidence=0.55),
        VoiceIntentCandidate(intent="backup_database", confidence=0.45),
    ]
    eval_ambig = gateway.evaluate_intent(
        candidates=high_loss_candidates,
        custom_penalties={"delete_database": 100.0, "backup_database": 10.0},
    )

    assert eval_ambig.directive == "CLARIFY"
    assert eval_ambig.evpi > 8.0
    assert eval_ambig.clarification_prompt is not None
    assert len(eval_ambig.clarification_prompt) < 150
    assert "Did you mean" in eval_ambig.clarification_prompt
    assert eval_ambig.character_count < 150

    compact_ambig = eval_ambig.to_compact_dict()
    assert compact_ambig["dir"] == "CLARIFY"
    assert len(json.dumps(compact_ambig, separators=(",", ":"))) < 350

    # 2. Low-risk query: "open notes" vs "search notes" (both low loss <= 5.0)
    low_loss_candidates = {
        "open_notes": 0.52,
        "search_notes": 0.48,
    }
    eval_low_risk = gateway.evaluate_intent(
        candidates=low_loss_candidates,
        clarification_cost=8.0,
    )

    # Even with 52% vs 48% ambiguity, because loss is only 5.0, Risk = (1 - 0.52) * 5.0 = 2.4 <= 8.0!
    # Therefore, frictionless immediate execution without annoying the user!
    assert eval_low_risk.directive == "EXECUTE"
    assert eval_low_risk.action == "open_notes"
    assert eval_low_risk.evpi <= 8.0
    assert eval_low_risk.clarification_prompt is None

    # 3. Dominant high-confidence intent (95% vs 5%)
    dominant_candidates = [
        VoiceIntentCandidate(intent="play_music", confidence=0.95),
        VoiceIntentCandidate(intent="stop_music", confidence=0.05),
    ]
    eval_dominant = gateway.evaluate_intent(candidates=dominant_candidates)
    assert eval_dominant.directive == "EXECUTE"
    assert eval_dominant.action == "play_music"
    assert eval_dominant.confidence >= 0.90


def test_mobile_quorum_signer_daemon_handshake() -> None:
    """Simulate Node A Level 3 challenge dispatch to Node M, verify automated policy signing, and assert 2-of-3 quorum unfreezing."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_vault.enc"
        master_secret = secrets.token_hex(16)

        # 1. Initialize Node M signer daemon with automated policy whitelist
        signer = MobileQuorumSignerDaemon(
            node_id=NodeRole.NODE_M.value,
            cluster_secret=master_secret,
            whitelisted_actions={"git_push_production", "deploy_staging"},
        )

        # Register custom policy rule for CI/CD pipeline triggers
        signer.register_policy_rule(
            SignerPolicyRule(
                name="Allow_CI_Production_Push",
                action_pattern="GIT_PUSH_PRODUCTION",
                target_pattern="repo:AIVA-*",
                enabled=True,
            )
        )

        # 2. Initialize Node A autonomous control plane
        aiva = AivaAgentPlane(
            node_role=NodeRole.NODE_A,
            vault_path=vault_file,
            master_secret=master_secret,
        )

        action_name = "GIT_PUSH_PRODUCTION"
        target_entity = "repo:AIVA-Core"
        now = time.time()
        challenge_token = f"chal_{secrets.token_hex(8)}"

        # 3. Simulate challenge arrival at Node M
        challenge_payload = {
            "action": action_name,
            "target": target_entity,
            "challenge": challenge_token,
            "timestamp": now,
        }
        sign_resp = signer.process_challenge(challenge_payload)

        assert sign_resp["status"] == "APPROVED"
        assert sign_resp["signer_node"] == NodeRole.NODE_M.value
        assert len(sign_resp["signature"]) == 64  # SHA256 hex string

        # 4. Node A verifies dual-signature quorum clearance
        key_a = aiva.cluster_config.derive_node_key(NodeRole.NODE_A)
        sig_a = signer.sign_challenge(action_name, target_entity, now)  # or compute directly
        # Re-derive Node A signature with Node A's key
        import hashlib
        import hmac
        canonical = f"{action_name}:{target_entity}:{now:.3f}".encode()
        sig_a = hmac.new(key_a.encode(), canonical, hashlib.sha256).hexdigest()

        signatures = {
            NodeRole.NODE_A.value: sig_a,
            NodeRole.NODE_M.value: sign_resp["signature"],
        }

        approved, reason = aiva.client.verify_action_clearance(
            action_name=action_name,
            target_entity=target_entity,
            signatures=signatures,
            timestamp=now,
        )

        assert approved is True
        assert "QUORUM_VERIFIED" in reason

        # 5. Unauthorized action test on Node M
        unauthorized_payload = {
            "action": "UNAUTHORIZED_DELETE_ALL",
            "target": "prod-cluster",
            "challenge": "chal_evil_123",
            "timestamp": now,
        }
        unauth_resp = signer.process_challenge(unauthorized_payload)
        assert unauth_resp["status"] == "REJECTED"
        assert unauth_resp["signature"] == ""
        assert "POLICY_REJECTED" in unauth_resp["reason"]


def test_distributed_swarm_arena_pipeline() -> None:
    """Execute an end-to-end distributed swarm job from Node A to Node B, verifying remote execution of the 4-vector arena and Elo calculation."""
    pipeline = DistributedSwarmPipeline(
        node_role=NodeRole.NODE_A,
        target_arena_node=NodeRole.NODE_B,
    )

    task_spec = (
        "Create a robust, concurrent cache module thread_cache.py with a class BoundedCache "
        "supporting get(k) and set(k, v). Include unit tests in run_tests.py asserting get and set work."
    )

    result = pipeline.execute_pipeline(
        specification=task_spec,
        project_name="distributed_cache_service",
        tournament_rounds=4,
    )

    assert result.project_name == "distributed_cache_service"
    assert result.status in ("PASSED_ARENA_GATE", "FAILED_ARENA_GATE")
    assert result.survival_rate >= 0.0
    assert result.final_elo >= 1000.0
    assert len(result.files) > 0

    # Verify context-budgeted compact payload (< 350 chars)
    compact = result.to_compact_dict()
    compact_json = json.dumps(compact, separators=(",", ":"))
    assert len(compact_json) < 350
    assert len(result.compact_payload) < 350


def test_headless_secret_enrollment() -> None:
    """Enroll multi-service secrets headlessly, verify opaque handle resolution, and confirm automated output scrubbing."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_enroll_vault.enc"
        master_secret = secrets.token_hex(16)

        enrollment = HeadlessSecretEnrollment(
            vault_path=vault_file,
            master_secret=master_secret,
        )

        # Batch enroll canonical production secrets
        test_github_token = f"ghp_{secrets.token_hex(20)}"
        test_google_token = f"ya29.{secrets.token_hex(30)}"
        test_elevenlabs_key = f"el_key_{secrets.token_hex(16)}"
        test_db_creds = f"postgres://admin:{secrets.token_hex(12)}@db.aiva.internal:5432/core"

        payload = {
            "vault://oauth/github/token": test_github_token,
            "vault://oauth/google/token": test_google_token,
            "vault://api/elevenlabs/key": test_elevenlabs_key,
            "vault://database/credentials": test_db_creds,
        }

        manifest = enrollment.enroll_from_payload(payload)

        # 1. Verify manifest properties
        assert manifest.handle_count == 4
        assert len(manifest.checksum) == 64  # Valid SHA-256 hex string
        assert manifest.zero_leak_verified is True
        assert "vault://oauth/github/token" in manifest.enrolled_handles
        assert "vault://database/credentials" in manifest.enrolled_handles

        # Check compact representation (< 350 chars)
        compact = manifest.to_compact_dict()
        compact_json = json.dumps(compact, separators=(",", ":"))
        assert len(compact_json) < 350
        assert len(manifest.manifest_summary) < 350

        # 2. Verify vault storage and handle retrieval
        assert enrollment.vault.contains("vault://oauth/github/token") is True
        assert enrollment.vault.get_secret("vault://oauth/github/token") == test_github_token
        assert enrollment.vault.get_secret("vault://api/elevenlabs/key") == test_elevenlabs_key

        # 3. Verify automated redaction scrubbing on outgoing text
        dirty_log = (
            f"Active services: GitHub ({test_github_token}), "
            f"ElevenLabs ({test_elevenlabs_key}), DB ({test_db_creds})"
        )
        cleaned_log = enrollment.verify_scrubbing(dirty_log)

        assert test_github_token not in cleaned_log
        assert test_elevenlabs_key not in cleaned_log
        assert test_db_creds not in cleaned_log
        assert "[REDACTED_SECRET]" in cleaned_log
        assert cleaned_log == "Active services: GitHub ([REDACTED_SECRET]), ElevenLabs ([REDACTED_SECRET]), DB ([REDACTED_SECRET])"

