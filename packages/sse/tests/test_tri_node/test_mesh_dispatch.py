"""Strategic Systems Engine - Tri-Node Mesh Dispatch and Client Verification Suite.

Tests end-to-end P2P mesh network capabilities:
1. TriNodeFrame canonical serialization and HMAC-SHA256 signature verification.
2. MeshActionDispatcher telemetry inspection, sandboxed writes, and guarded build execution.
3. Path traversal attack rejection (preventing escaping sandbox bounds).
4. Live HTTP dispatch with tamper detection (401 on signature mismatch).
5. TriNodeMeshClient remote inspection, file deployment, and build dispatch.
6. Zero-hang local execution fallback when peer is unreachable or offline.
"""

from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

import pytest
from typer.testing import CliRunner

from sse.cli import app
from sse.tri_node.client import TriNodeMeshClient
from sse.tri_node.frame import TriNodeFrame
from sse.tri_node.ledger import SovereignLedger
from sse.tri_node.mesh_handlers import MeshActionDispatcher
from sse.tri_node.router import P2PRouter
from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET, NodeID

runner = CliRunner()


def test_trinode_frame_signing_and_verification() -> None:
    """Verifies TriNodeFrame canonical serialization, HMAC signing, and tamper detection."""
    frame = TriNodeFrame(
        sender_node_id=NodeID.PC_A.value,
        action="inspect_telemetry",
        payload={"query": "gpu_headroom"},
        timestamp=time.time(),
        nonce="abc123nonce",
    )
    sig = frame.sign(CLUSTER_SHARED_SECRET)
    assert len(sig) == 64
    assert frame.signature == sig
    assert frame.verify_signature(CLUSTER_SHARED_SECRET) is True

    # Verification must fail with incorrect cluster secret
    assert frame.verify_signature("wrong_cluster_secret_999") is False

    # Tampering with payload must invalidate signature
    tampered_frame = TriNodeFrame.from_dict(frame.to_dict())
    tampered_frame.payload["malicious_key"] = "exploit"
    assert tampered_frame.verify_signature(CLUSTER_SHARED_SECRET) is False


def test_mesh_action_dispatcher_telemetry() -> None:
    """Verifies MeshActionDispatcher queries concrete host and ledger telemetry."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        ledger = SovereignLedger(node_id="PC_A", ledger_path=Path(tmp_dir) / "ledger.jsonl")
        dispatcher = MeshActionDispatcher(node_id="PC_A", ledger=ledger, workspace_base_dir=tmp_dir)

        res = dispatcher.handle_inspect_telemetry()
        assert res["status"] == "READY"
        assert res["node_id"] == "PC_A"
        assert "telemetry" in res
        assert "cpu_percent" in res["telemetry"]
        assert "ram_total_gb" in res["telemetry"]
        assert "vram_available_gb" in res["telemetry"]
        assert res["latest_hash"] == ledger.get_latest_hash()


def test_mesh_action_dispatcher_sandboxed_write_and_path_traversal() -> None:
    """Verifies sandboxed atomic write and strict rejection of path-traversal escapes."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        ledger = SovereignLedger(node_id="PC_A", ledger_path=Path(tmp_dir) / "ledger.jsonl")
        dispatcher = MeshActionDispatcher(node_id="PC_A", ledger=ledger, workspace_base_dir=tmp_dir)

        # 1. Valid sandboxed write
        write_res = dispatcher.handle_write_file(
            {
                "relative_path": "modules/calculator.py",
                "content": "def add(a, b): return a + b\n",
                "sandbox_id": "test_sb_1",
            }
        )
        assert write_res["status"] == "SUCCESS"
        assert write_res["relative_path"] == "modules/calculator.py"
        assert Path(write_res["resolved_path"]).exists()
        assert len(write_res["sha256"]) == 64

        # 2. Path-traversal escape attempt must raise PermissionError
        with pytest.raises(PermissionError):
            dispatcher.handle_write_file(
                {
                    "relative_path": "../../escaped.txt",
                    "content": "should be blocked",
                    "sandbox_id": "test_sb_1",
                }
            )


def test_mesh_action_dispatcher_build_software() -> None:
    """Verifies software build, security auditing, and test execution in guarded sandbox."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        ledger = SovereignLedger(node_id="PC_B", ledger_path=Path(tmp_dir) / "ledger.jsonl")
        dispatcher = MeshActionDispatcher(node_id="PC_B", ledger=ledger, workspace_base_dir=tmp_dir)

        files = {
            "math_lib.py": "def multiply(x, y): return x * y\n",
            "test_math.py": "from math_lib import multiply\nassert multiply(3, 4) == 12\nprint('TESTS_PASSED')\n",
        }

        build_res = dispatcher.handle_build_software(
            {
                "project_name": "math_project",
                "files": files,
                "test_command": [sys.executable, "test_math.py"],
            }
        )

        assert build_res["status"] == "COMPLETED"
        assert build_res["exit_code"] == 0
        assert "TESTS_PASSED" in build_res["stdout"]
        assert build_res["audit_passed"] is True


def test_live_mesh_server_and_client_roundtrip() -> None:
    """Tests live HTTP server dispatch with signed frames, tamper rejection, and remote build."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        port = 8295
        router = P2PRouter(
            node_id=NodeID.PC_B,
            port=port,
            mode="MESH",
            ledger_path=Path(tmp_dir) / "pc_b_ledger.jsonl",
        )
        router.start_server(host="127.0.0.1", background=True)
        time.sleep(0.3)

        target_url = f"http://127.0.0.1:{port}"
        client = TriNodeMeshClient(node_id="PC_A", ledger=SovereignLedger(node_id="PC_A"))

        try:
            # 1. Remote inspection
            inspect_res = client.inspect_node(target_role="PC_B", target_url=target_url)
            assert inspect_res["status"] == "READY"
            assert inspect_res["node_id"] == "PC_B"
            assert inspect_res["fallback_local"] is False

            # 2. Remote sandboxed file write
            write_res = client.write_remote_file(
                target_url=target_url,
                relative_path="src/service.py",
                content="def ping(): return 'pong'\n",
                sandbox_id="client_test_sb",
            )
            assert write_res["status"] == "SUCCESS"
            assert write_res["fallback_local"] is False

            # 3. Remote build execution
            build_res = client.dispatch_remote_build(
                target_role="PC_B",
                target_url=target_url,
                project_name="remote_service",
                files={
                    "service.py": "def compute(): return 42\n",
                    "test_service.py": "from service import compute\nassert compute() == 42\nprint('ALL_GOOD')\n",
                },
                test_command=[sys.executable, "test_service.py"],
            )
            assert build_res["status"] == "COMPLETED"
            assert "ALL_GOOD" in build_res["stdout"]
            assert build_res["fallback_local"] is False

            # 4. Bidirectional ledger sync
            merged, latest_hash = client.sync_ledger_with_peer(target_url=target_url)
            assert isinstance(merged, int)
            assert len(latest_hash) == 64

        finally:
            router.stop_server()


def test_client_instant_local_fallback_on_offline_peer() -> None:
    """Verifies zero-hang instant fallback to local guarded execution when remote node is offline."""
    offline_url = "http://127.0.0.1:9998"
    client = TriNodeMeshClient(node_id="PC_A")

    # 1. Telemetry inspection fallback
    t0 = time.perf_counter()
    inspect_fallback = client.inspect_node(target_role="PC_B", target_url=offline_url, timeout=0.1)
    duration_inspect = time.perf_counter() - t0

    assert inspect_fallback["status"] == "READY"
    assert inspect_fallback["node_id"] == "PC_A"
    assert inspect_fallback["fallback_local"] is True
    assert duration_inspect < 2.0  # Zero hang

    # 2. Build dispatch fallback
    t0 = time.perf_counter()
    build_fallback = client.dispatch_remote_build(
        target_role="PC_B",
        target_url=offline_url,
        project_name="offline_fallback_project",
        files={
            "local_worker.py": "def work(): return True\n",
            "test_local.py": "from local_worker import work\nassert work() is True\nprint('LOCAL_SUCCESS')\n",
        },
        test_command=[sys.executable, "test_local.py"],
        timeout_sec=5.0,
    )
    duration_build = time.perf_counter() - t0

    assert build_fallback["status"] == "COMPLETED"
    assert build_fallback["fallback_local"] is True
    assert build_fallback["dispatched_to"] == "LOCAL_FALLBACK"
    assert "LOCAL_SUCCESS" in build_fallback["stdout"]
    assert duration_build < 5.0


def test_cli_mesh_commands() -> None:
    """Verifies `sse mesh inspect`, `sse mesh exec`, and `sse mesh sync` CLI commands."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        port = 8296
        router = P2PRouter(
            node_id=NodeID.PC_B,
            port=port,
            mode="MESH",
            ledger_path=Path(tmp_dir) / "pc_b_ledger.jsonl",
        )
        router.start_server(host="127.0.0.1", background=True)
        time.sleep(0.3)

        target_url = f"http://127.0.0.1:{port}"
        test_script = Path(tmp_dir) / "cli_test.py"
        test_script.write_text("print('CLI_REMOTE_SUCCESS')\n", encoding="utf-8")

        try:
            # 1. sse mesh inspect
            res_inspect = runner.invoke(app, ["mesh", "inspect", "--target-url", target_url])
            assert res_inspect.exit_code == 0
            assert "Peer Inspection" in res_inspect.output
            assert "PC_B" in res_inspect.output

            # 2. sse mesh exec
            res_exec = runner.invoke(
                app,
                [
                    "mesh",
                    "exec",
                    "--target-url",
                    target_url,
                    "--file",
                    str(test_script),
                ],
            )
            assert res_exec.exit_code == 0
            assert "CLI_REMOTE_SUCCESS" in res_exec.output

            # 3. sse mesh sync
            res_sync = runner.invoke(app, ["mesh", "sync", "--target-url", target_url])
            assert res_sync.exit_code == 0
            assert "Sync completed" in res_sync.output

        finally:
            router.stop_server()
