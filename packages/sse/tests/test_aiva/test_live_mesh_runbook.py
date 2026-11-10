"""End-to-End Live Cluster Runbook Integration Test Suite.

Simulates the full physical deployment across the Sovereign Tri-Node Mesh:
- Node A (PC-A: Orchestrator, Port 8281)
- Node B (PC-B: Browser & Compute Worker, Port 8282)
- Node M (Mobile: Root-of-Trust Authorizer, Port 8283)

Verifies:
1. ClusterNetworkConfig resolution and HMAC key derivation.
2. CLI Vault initialization and secret handle storage.
3. Node A remote task delegation to Node B via signed TriNodeFrame frames.
4. Node B task execution, ledger append, and push notification to Node M.
5. Level 3 Irreversible Action freezing and 2-of-3 threshold quorum approval.
6. Proactive daemon supervisor single-cycle execution.
"""

from __future__ import annotations

import secrets
import sys
import tempfile
import time
from pathlib import Path

from typer.testing import CliRunner

from aiva.cli_vault import vault_cli_app
from aiva.governance.guardrails import AivaGuardrailGate, AutonomyTier
from aiva.proactive.runner import DaemonSupervisor
from aiva.security.vault import SecureCredentialVault
from sse.config.cluster import ClusterNetworkConfig
from sse.security.hardening import ThresholdQuorumPolicy
from sse.storage.hardened_ledger import HardenedLedger
from sse.tri_node.client import TriNodeMeshClient
from sse.tri_node.frame import TriNodeFrame
from sse.tri_node.router import P2PRouter
from sse.tri_node.sovereign_core import NodeID

cli_runner = CliRunner()


def test_cluster_network_config_resolution() -> None:
    """Verifies ClusterNetworkConfig resolution, port extraction, and HMAC key derivation."""
    cfg = ClusterNetworkConfig(
        node_a_url="http://192.168.1.101:8201",
        node_b_url="http://192.168.1.102:8202",
        node_m_url="http://192.168.1.103:8203",
        cluster_secret="cluster_secret_verification_token_1234",
    )

    assert cfg.get_node_url(NodeID.PC_A) == "http://192.168.1.101:8201"
    assert cfg.get_node_port(NodeID.PC_A) == 8201

    assert cfg.get_node_url(NodeID.PC_B) == "http://192.168.1.102:8202"
    assert cfg.get_node_port(NodeID.PC_B) == 8202

    assert cfg.get_node_url(NodeID.MOBILE) == "http://192.168.1.103:8203"
    assert cfg.get_node_port(NodeID.MOBILE) == 8203

    keys = cfg.get_all_node_keys()
    assert len(keys) == 3
    assert len(keys[NodeID.PC_A.value]) == 64
    assert len(keys[NodeID.PC_B.value]) == 64
    assert len(keys[NodeID.MOBILE.value]) == 64
    assert keys[NodeID.PC_A.value] != keys[NodeID.PC_B.value]


def test_cli_vault_init_set_list_roundtrip() -> None:
    """Verifies `sse vault init`, `sse vault set`, and `sse vault list` CLI flow."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        vault_file = Path(tmp_dir) / "test_aiva_vault.enc"
        master_secret = secrets.token_hex(16)

        # 1. Init vault
        res_init = cli_runner.invoke(
            vault_cli_app,
            ["init", "--vault-path", str(vault_file), "--passphrase", master_secret],
        )
        assert res_init.exit_code == 0
        assert "Vault initialized successfully" in res_init.output
        assert vault_file.exists()

        # 2. Store secret
        sample_secret = f"gho_{secrets.token_hex(16)}"
        res_set = cli_runner.invoke(
            vault_cli_app,
            [
                "set",
                "--category",
                "credentials",
                "--service",
                "github",
                "--key",
                "token",
                "--value",
                sample_secret,
                "--vault-path",
                str(vault_file),
                "--passphrase",
                master_secret,
            ],
        )
        assert res_set.exit_code == 0
        assert "vault://credentials/github/token" in res_set.output

        # 3. List secrets (assert handle shown, secret value not leaked)
        res_list = cli_runner.invoke(
            vault_cli_app,
            ["list", "--vault-path", str(vault_file), "--passphrase", master_secret],
        )
        assert res_list.exit_code == 0
        assert "vault://credentials/github/token" in res_list.output
        assert sample_secret not in res_list.output


def test_live_tri_node_mesh_and_quorum_runbook() -> None:
    """Live multi-node simulation across Node A (8281), Node B (8282), and Node M (8283)."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        base_dir = Path(tmp_dir)
        port_a, port_b, port_m = 8281, 8282, 8283

        # 1. Spin up Node A, Node B, and Node M daemons
        router_a = P2PRouter(node_id=NodeID.PC_A, port=port_a, mode="MESH", ledger_path=base_dir / "ledger_a.jsonl")
        router_b = P2PRouter(node_id=NodeID.PC_B, port=port_b, mode="MESH", ledger_path=base_dir / "ledger_b.jsonl")
        router_m = P2PRouter(node_id=NodeID.MOBILE, port=port_m, mode="MESH", ledger_path=base_dir / "ledger_m.jsonl")

        router_a.start_server(host="127.0.0.1", background=True)
        router_b.start_server(host="127.0.0.1", background=True)
        router_m.start_server(host="127.0.0.1", background=True)
        time.sleep(0.3)

        url_b = f"http://127.0.0.1:{port_b}"
        url_m = f"http://127.0.0.1:{port_m}"

        client_a = TriNodeMeshClient(node_id="PC_A", ledger=router_a.ledger)
        vault_a = SecureCredentialVault(vault_path=base_dir / "vault_a.enc", master_secret=secrets.token_hex(16))

        try:
            # 2. Node A initializes vault and stores a token handle
            auth_token = f"auth_{secrets.token_hex(16)}"
            token_handle = "vault://credentials/github/deploy_key"
            vault_a.store_secret(token_handle, auth_token)
            assert vault_a.contains(token_handle) is True

            # 3. Node A delegates a compute build task to Node B over /mesh/dispatch
            build_res = client_a.dispatch_remote_build(
                target_role="PC_B",
                target_url=url_b,
                project_name="runbook_worker_task",
                files={
                    "worker.py": "def process(): return 'WORKER_SUCCESS'\n",
                    "test_worker.py": "from worker import process\nassert process() == 'WORKER_SUCCESS'\nprint('VERIFIED')\n",
                },
                test_command=[sys.executable, "test_worker.py"],
            )
            assert build_res["status"] == "COMPLETED"
            assert "VERIFIED" in build_res["stdout"]
            assert build_res["fallback_local"] is False

            # 4. Node B pushes status notification to Node M
            frame_to_m = TriNodeFrame(
                sender_node_id=NodeID.PC_B.value,
                target_node_id=NodeID.MOBILE.value,
                action="notify_brief",
                payload={"summary": "Compute task on PC-B completed successfully."},
            )
            frame_to_m.sign()
            push_res = client_a._send_signed_frame(
                target_url=url_m,
                action="notify_brief",
                payload=frame_to_m.to_dict(),
                timeout=2.0,
            )
            assert push_res["status"] == "RECEIVED"

            # 5. Node A triggers Level 3 Action -> Quorum Gate freezes until Node M signs
            policy = ThresholdQuorumPolicy(min_threshold=2)
            ledger_a = HardenedLedger(node_id="PC_A", ledger_path=base_dir / "ledger_a.jsonl")
            gate = AivaGuardrailGate(node_id="PC_A", quorum_policy=policy, ledger=ledger_a)

            action_name = "push_main"
            # Unsigned execution must HALT
            l3_halt = gate.evaluate_and_execute(
                action_name=action_name,
                payload={"branch": "master", "target": "production"},
                execute_fn=lambda: "DEPLOYED_LIVE",
            )
            assert l3_halt["status"] == "HALTED_AWAITING_QUORUM"
            assert l3_halt["tier"] == int(AutonomyTier.LEVEL_3_IRREVERSIBLE)
            assert l3_halt["quorum_required"] is True

            # Node A and Mobile sign challenge
            now = time.time()
            sig_a = gate.sign_challenge("PC_A", action_name, now)
            sig_m = gate.sign_challenge("MOBILE", action_name, now)

            # Execution proceeds with 2 valid signatures
            l3_exec = gate.evaluate_and_execute(
                action_name=action_name,
                payload={"branch": "master", "target": "production"},
                execute_fn=lambda: "DEPLOYED_LIVE",
                signatures={"PC_A": sig_a, "MOBILE": sig_m},
                timestamp=now,
            )
            assert l3_exec["status"] == "EXECUTED"
            assert l3_exec["quorum_verified"] is True
            assert l3_exec["result"] == "DEPLOYED_LIVE"

            # 6. Proactive Daemon Supervisor single cycle test on Node B
            supervisor = DaemonSupervisor(
                node_id="PC_B",
                mobile_url=url_m,
                ledger_path=base_dir / "ledger_b.jsonl",
            )
            cycle_res = supervisor.run_cycle()
            assert cycle_res["status"] == "DISPATCHED"
            assert cycle_res["pushed_to_mobile"] is True

        finally:
            router_a.stop_server()
            router_b.stop_server()
            router_m.stop_server()


def test_physical_cluster_ignition_phases_1_to_4() -> None:
    """Verifies complete physical cluster ignition across all 4 operational phases."""
    from scripts.live_cluster_ignition import (
        run_phase_1_startup_and_discovery,
        run_phase_2_vault_and_accounts,
        run_phase_3_proactive_brief,
        run_phase_4_live_quorum_verification,
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        temp_dir = Path(tmp_dir)

        # Phase 1: Startup & Peer Discovery
        router_a, router_b, router_m = run_phase_1_startup_and_discovery(temp_dir)

        try:
            # Phase 2: Zero-Leak Vault & Accounts
            run_phase_2_vault_and_accounts(temp_dir)

            # Phase 3: Proactive Brief Synthesis & Push to Node M
            cycle_res = run_phase_3_proactive_brief(temp_dir, router_b)
            assert cycle_res["status"] == "DISPATCHED"
            assert cycle_res["pushed_to_mobile"] is True

            # Phase 4: Quorum Verification (1-sig reject, dual-sig execute & audit)
            run_phase_4_live_quorum_verification(temp_dir)

        finally:
            router_a.stop_server()
            router_b.stop_server()
            router_m.stop_server()
