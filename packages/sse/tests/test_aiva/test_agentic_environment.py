"""Verification Suite for AIVA Agentic Operating Environment (7 Pillars).

Tests end-to-end integration:
1. Zero-Leak Credential Vault: AES-256-GCM encryption, handle resolution, and automated redaction.
2. Direct-Fill Form Injection: In-process DOM injection without secret leakage into chat tokens.
3. Proactive Background Daemon: Brief synthesis (< 500 chars) and signed TriNodeFrame dispatch.
4. Cryptographic Guardrails: 3-tier autonomy and 2-of-3 threshold quorum enforcement.
5. OAuth Broker: PKCE generation, token storage into vault, and expiration logic.
6. Structured Long-Term Memory: Biographical profile mutation and episodic ledger logging.
"""

from __future__ import annotations

import secrets
import tempfile
import time
from pathlib import Path

import pytest

from aiva.browser.controller import HeadlessBrowserSupervisor
from aiva.governance.guardrails import AivaGuardrailGate, AutonomyTier
from aiva.integrations.oauth_broker import OAuthBroker
from aiva.memory.profile import AivaMemoryManager
from aiva.proactive.daemon import ProactiveDaemon
from aiva.security.vault import SecureCredentialVault
from sse.security.hardening import ThresholdQuorumPolicy
from sse.storage.hardened_ledger import HardenedLedger
from sse.tri_node.router import P2PRouter
from sse.tri_node.sovereign_core import NodeID


def test_vault_encryption_and_handle_resolution() -> None:
    """Pillar 4: Verifies AES-256-GCM encryption, handle resolution, and secret redaction."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "vault.enc"
        master_secret = secrets.token_hex(32)
        vault = SecureCredentialVault(vault_path=vault_file, master_secret=master_secret)

        # Generate synthetic test secret
        sample_token = f"ghp_{secrets.token_hex(20)}"
        token_handle = "vault://credentials/github/personal_token"

        # Store secret
        vault.store_secret(token_handle, sample_token)
        assert vault.contains(token_handle) is True
        assert vault.list_handles() == [token_handle]

        # Verify resolution
        resolved_bytes = vault.resolve_handle(token_handle)
        assert resolved_bytes == sample_token.encode("utf-8")
        assert vault.get_secret(token_handle) == sample_token

        # Verify automated redaction
        log_message = f"Connecting to upstream service with {sample_token} on port 443"
        redacted = vault.redact_secrets(log_message)
        assert sample_token not in redacted
        assert "[REDACTED_SECRET]" in redacted
        assert "Connecting to upstream service with [REDACTED_SECRET] on port 443" == redacted

        # Test persistence: load with correct key
        vault_loaded = SecureCredentialVault(vault_path=vault_file, master_secret=master_secret)
        assert vault_loaded.get_secret(token_handle) == sample_token

        # Test authentication failure: wrong key cannot decrypt ciphertext
        with pytest.raises(PermissionError):
            SecureCredentialVault(vault_path=vault_file, master_secret="wrong_master_key_9999")

        # Test invalid handle syntax rejection
        with pytest.raises(ValueError):
            vault.store_secret("invalid_prefix_handle", "val")


def test_direct_fill_form_injection() -> None:
    """Pillars 2 & 3: Verifies sandboxed DOM automation, accessibility snapshots, and direct secret injection."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault = SecureCredentialVault(vault_path=Path(tmp_dir) / "v.enc", master_secret=secrets.token_hex(32))
        supervisor = HeadlessBrowserSupervisor(vault=vault, workspace_base_dir=tmp_dir)

        # Store credential in vault
        secret_password = secrets.token_urlsafe(24)
        pass_handle = "vault://credentials/portal/password"
        vault.store_secret(pass_handle, secret_password)

        # Create isolated browser context
        cid = supervisor.create_context("test_ctx")
        assert cid in supervisor.list_contexts()

        # Mock portal HTML
        portal_html = (
            "<html><head><title>Admin Console</title></head>"
            "<body>"
            "<form id='auth_form'>"
            "<input type='text' id='email' name='email' placeholder='Work Email'/>"
            "<input type='password' id='user_secret' name='user_secret' placeholder='Passcode'/>"
            "<button type='submit' id='login_btn'>Enter</button>"
            "</form></body></html>"
        )
        nav_res = supervisor.navigate(cid, "https://console.internal", mock_html=portal_html)
        assert nav_res["title"] == "Admin Console"

        # Check accessibility tree snapshot (compact structure, no giant raw DOM)
        tree = supervisor.get_accessibility_snapshot(cid)
        assert tree["title"] == "Admin Console"
        assert tree["interactive_elements_count"] == 3
        roles = [elem["role"] for elem in tree["elements"]]
        assert "input" in roles
        assert "button" in roles

        # Inject non-secret username
        supervisor.type_text(cid, "#email", "admin@internal.network")
        session = supervisor.get_session(cid)
        assert session.dom_elements["email"]["value"] == "admin@internal.network"

        # Directly inject secret from vault into DOM without leaking through agent tokens
        injection_success = supervisor.fill_secure_field(cid, "#user_secret", pass_handle)
        assert injection_success is True
        assert session.dom_elements["user_secret"]["value"] == secret_password

        # Click submit button
        click_success = supervisor.click(cid, "#login_btn")
        assert click_success is True

        supervisor.close_context(cid)
        assert cid not in supervisor.list_contexts()


def test_oauth_broker_pkce_and_token_storage() -> None:
    """Pillar 1: Verifies PKCE flow generation, token storage into vault, and auto-refresh detection."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault = SecureCredentialVault(vault_path=Path(tmp_dir) / "v.enc", master_secret=secrets.token_hex(32))
        broker = OAuthBroker(vault=vault)

        # 1. PKCE pair generation
        verifier, challenge = broker.generate_pkce_pair()
        assert len(verifier) >= 43
        assert len(challenge) >= 43

        # 2. Authorization URL construction
        auth_url = broker.get_authorization_url(
            service="github",
            client_id="dummy_client_id",
            code_challenge=challenge,
            state="state_xyz",
        )
        assert "https://github.com/login/oauth/authorize" in auth_url
        assert "client_id=dummy_client_id" in auth_url
        assert "code_challenge=" in auth_url
        assert "code_challenge_method=S256" in auth_url

        # 3. Store mock token exchange response
        mock_access = f"gho_{secrets.token_hex(16)}"
        mock_refresh = f"ghr_{secrets.token_hex(16)}"
        token_info = broker.store_token_response(
            service="github",
            token_data={
                "access_token": mock_access,
                "refresh_token": mock_refresh,
                "expires_in": 3600,
                "scope": "repo,user",
            },
        )

        assert token_info["service"] == "github"
        assert vault.contains("vault://oauth/github/access_token") is True
        assert vault.contains("vault://oauth/github/refresh_token") is True
        assert vault.get_secret("vault://oauth/github/access_token") == mock_access

        # Check expiration logic
        assert broker.is_token_expired("github") is False

        # Simulate expiring token
        broker._token_metadata["github"]["expires_at"] = time.time() + 100.0  # < 300s
        assert broker.is_token_expired("github") is True


def test_proactive_daemon_and_brief_push() -> None:
    """Pillar 6: Verifies proactive background scheduler, brief synthesis (< 500 chars), and signed P2P push."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        port = 8297
        router = P2PRouter(
            node_id=NodeID.MOBILE,
            port=port,
            mode="MESH",
            ledger_path=Path(tmp_dir) / "mobile_ledger.jsonl",
        )
        router.start_server(host="127.0.0.1", background=True)
        time.sleep(0.3)

        mobile_url = f"http://127.0.0.1:{port}"
        daemon = ProactiveDaemon(node_id="PC_B", mobile_url=mobile_url)

        # Configure mock state providers
        daemon.set_calendar_provider(lambda: [{"summary": "Q4 Strategy Review", "time": "10:00"}])
        daemon.set_build_provider(lambda: {"status": "GREEN", "passing": 189, "failing": 0})
        daemon.set_issues_provider(lambda: ["Fix memory profile", "Audit sandbox boundaries"])

        # 1. Synthesize morning brief
        brief = daemon.generate_morning_brief()
        assert brief["character_count"] < 500
        assert "AIVA MORNING BRIEF" in brief["summary_text"]
        assert "Q4 Strategy Review" in brief["summary_text"]
        assert "Builds: GREEN" in brief["summary_text"]

        # 2. Push brief to Mobile node over TriNodeFrame mesh endpoint
        push_res = daemon.push_morning_brief()
        assert push_res["status"] == "DISPATCHED"
        assert push_res["pushed_to_mobile"] is True

        # 3. Test background task execution
        executed_tasks: list[str] = []
        daemon.register_task("heartbeat", interval_sec=0.1, task_fn=lambda: executed_tasks.append("heartbeat"))
        ran_count = daemon.step()
        assert ran_count >= 1
        assert "heartbeat" in executed_tasks

        router.stop_server()


def test_guardrail_quorum_rejection_and_approval() -> None:
    """Pillar 7: Verifies 3-tier autonomy gate and 2-of-3 threshold quorum enforcement."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        ledger = HardenedLedger(node_id="PC_A", ledger_path=Path(tmp_dir) / "gov_ledger.jsonl")
        policy = ThresholdQuorumPolicy(min_threshold=2)
        gate = AivaGuardrailGate(node_id="PC_A", quorum_policy=policy, ledger=ledger)

        # 1. Level 1: Read-Only -> Frictionless execution
        l1_res = gate.evaluate_and_execute(
            action_name="read_calendar",
            payload={"date": "today"},
            execute_fn=lambda: "CALENDAR_DATA_READ",
        )
        assert l1_res["status"] == "EXECUTED"
        assert l1_res["tier"] == int(AutonomyTier.LEVEL_1_READ_ONLY)
        assert l1_res["result"] == "CALENDAR_DATA_READ"
        assert l1_res["quorum_required"] is False

        # 2. Level 2: Drafting / Staging -> Executed and audited to ledger
        l2_res = gate.evaluate_and_execute(
            action_name="stage_commit",
            payload={"message": "feat: update solver"},
            execute_fn=lambda: "GIT_STAGED",
        )
        assert l2_res["status"] == "EXECUTED"
        assert l2_res["tier"] == int(AutonomyTier.LEVEL_2_STAGING)
        assert l2_res["audited"] is True

        # 3. Level 3: Irreversible without quorum -> Execution HALTED
        action_payload = "push_main"
        l3_halted = gate.evaluate_and_execute(
            action_name=action_payload,
            payload={"branch": "master", "remote": "origin"},
            execute_fn=lambda: "PUSHED_TO_MAIN",
        )
        assert l3_halted["status"] == "HALTED_AWAITING_QUORUM"
        assert l3_halted["tier"] == int(AutonomyTier.LEVEL_3_IRREVERSIBLE)
        assert l3_halted["quorum_required"] is True
        assert "challenge" in l3_halted

        # 4. Level 3 with only 1 signature -> REJECTED (insufficient quorum)
        now = time.time()
        sig_pca = gate.sign_challenge(node_id="PC_A", action_name=action_payload, timestamp=now)
        l3_single_sig = gate.evaluate_and_execute(
            action_name=action_payload,
            payload={"branch": "master"},
            execute_fn=lambda: "PUSHED_TO_MAIN",
            signatures={"PC_A": sig_pca},
            timestamp=now,
        )
        assert l3_single_sig["status"] == "HALTED_AWAITING_QUORUM"

        # 5. Level 3 with 2 valid signatures (PC-A + Mobile) -> QUORUM VERIFIED & EXECUTED
        sig_mobile = gate.sign_challenge(node_id="MOBILE", action_name=action_payload, timestamp=now)
        l3_approved = gate.evaluate_and_execute(
            action_name=action_payload,
            payload={"branch": "master"},
            execute_fn=lambda: "PUSHED_TO_MAIN",
            signatures={"PC_A": sig_pca, "MOBILE": sig_mobile},
            timestamp=now,
        )
        assert l3_approved["status"] == "EXECUTED"
        assert l3_approved["tier"] == int(AutonomyTier.LEVEL_3_IRREVERSIBLE)
        assert l3_approved["quorum_verified"] is True
        assert l3_approved["result"] == "PUSHED_TO_MAIN"
        assert set(l3_approved["approved_by"]) == {"PC_A", "MOBILE"}


def test_memory_manager_biographical_and_episodic() -> None:
    """Pillar 5: Verifies biographical user profile mutations and episodic ledger recording."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        ledger = HardenedLedger(node_id="PC_A", ledger_path=Path(tmp_dir) / "mem_ledger.jsonl")
        profile_file = Path(tmp_dir) / "profile.json"
        mgr = AivaMemoryManager(node_id="PC_A", ledger=ledger, profile_path=profile_file)

        # Update custom attribute
        mgr.set_attribute("preferred_ide", "VSCode")
        mgr.set_attribute("max_daily_budget_usd", 50.0)

        assert mgr.get_attribute("preferred_ide") == "VSCode"
        assert mgr.get_attribute("max_daily_budget_usd") == 50.0

        # Verify disk persistence
        mgr2 = AivaMemoryManager(node_id="PC_A", ledger=ledger, profile_path=profile_file)
        assert mgr2.get_attribute("preferred_ide") == "VSCode"

        # Record episodic event
        event_id = mgr.record_episodic_event(
            event_type="SOLVER_RUN",
            details={"game": "PrisonersDilemma", "equilibrium": "Defect"},
        )
        assert event_id.startswith("episode_")

        # Verify cryptographic ledger contains the event
        records = ledger.read_records()
        assert len(records) >= 2  # profile update + episodic event
        payloads = [r["payload"] for r in records]
        types = [p.get("type") for p in payloads]
        assert "BIOGRAPHICAL_PROFILE_UPDATE" in types
        assert "EPISODIC_EVENT" in types
