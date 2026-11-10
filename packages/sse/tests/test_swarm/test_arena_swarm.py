"""Integration and Verification Tests for Git Worktree Sandboxing & Adversarial Arena.

Verifies:
1. test_git_worktree_checkpoint_and_rollback: Worktree isolation, checkpointing, defect rollback.
2. test_swarm_arena_adversarial_elimination: Elo calibration, loss on defect, survival gating.
3. test_arena_convergence_to_clean_export: End-to-end convergence, clean patch export.
4. test_tri_node_arena_offloading: Remote tournament dispatch and zero-hang fallback.
"""

from __future__ import annotations

from pathlib import Path

from sse.swarm.arena import SwarmArena
from sse.swarm.orchestrator import SwarmOrchestrationEngine
from sse.swarm.worktree_sandbox import GitWorktreeSandbox
from sse.tri_node.arena_dispatcher import ArenaTournamentDispatcher
from sse.tri_node.router import P2PRouter


def test_git_worktree_checkpoint_and_rollback(tmp_path: Path) -> None:
    """Assert worktree creation, check-pointing, defect injection, and clean rollback."""
    with GitWorktreeSandbox(worktree_base_dir=tmp_path) as sandbox:
        assert sandbox.worktree_dir.exists()

        # Step 1: Write initial passing state & checkpoint
        valid_file = sandbox.guard.safe_write(
            "service.py",
            "def calculate(a, b):\n    return a + b\n",
        )
        assert valid_file.exists()
        chk_initial = sandbox.checkpoint("Initial valid implementation")
        assert chk_initial

        # Step 2: Inject deliberate defect (syntax error) & checkpoint
        sandbox.guard.safe_write(
            "service.py",
            "def calculate(a, b):\n    return a + ??? syntax error\n",
        )
        chk_defect = sandbox.checkpoint("Defective patch with syntax error")
        assert chk_defect != chk_initial
        assert "syntax error" in sandbox.guard.safe_read("service.py")

        # Step 3: Trigger rollback
        rolled_back = sandbox.rollback()
        assert rolled_back is True

        # Assert restored code is clean and defect is eradicated
        restored_code = sandbox.guard.safe_read("service.py")
        assert "return a + b" in restored_code
        assert "syntax error" not in restored_code


def test_swarm_arena_adversarial_elimination(tmp_path: Path) -> None:
    """Verify adversarial arena evaluates candidates, penalizes failures with Elo drop, and detects gate failure."""
    arena = SwarmArena(baseline_elo=1400.0, k_factor=32.0, min_survival_rate=0.95)

    # 1. Defective candidate workspace: test execution will crash
    bad_dir = tmp_path / "bad_candidate"
    bad_dir.mkdir(parents=True, exist_ok=True)
    (bad_dir / "run_tests.py").write_text(
        "import sys\nprint('Deliberate concurrency race condition', file=sys.stderr)\nsys.exit(1)\n",
        encoding="utf-8",
    )

    bad_summary = arena.run_tournament(workspace_dir=bad_dir, candidate_id="bad_cand", rounds=5)
    assert bad_summary.passed_gate is False
    assert bad_summary.losses == 5
    assert bad_summary.wins == 0
    assert bad_summary.survival_rate == 0.0
    assert bad_summary.final_elo < bad_summary.initial_elo
    assert bad_summary.elo_delta < 0.0
    assert bad_summary.worst_case_regret == 1.0

    # 2. Resilient passing candidate workspace: tests pass cleanly
    good_dir = tmp_path / "good_candidate"
    good_dir.mkdir(parents=True, exist_ok=True)
    (good_dir / "run_tests.py").write_text(
        "import sys\nprint('All 50 adversarial threads passed')\nsys.exit(0)\n",
        encoding="utf-8",
    )

    good_summary = arena.run_tournament(workspace_dir=good_dir, candidate_id="good_cand", rounds=5)
    assert good_summary.passed_gate is True
    assert good_summary.wins == 5
    assert bad_summary.losses == 5
    assert good_summary.survival_rate == 1.0
    assert good_summary.final_elo > good_summary.initial_elo
    assert good_summary.elo_delta > 0.0
    assert good_summary.worst_case_regret == 0.0

    # Payload budget verification (< 350 chars)
    payload = good_summary.to_compact_payload()
    assert len(payload) < 350
    assert "ARENA_SUMMARY" in payload


def test_arena_convergence_to_clean_export(tmp_path: Path) -> None:
    """Verify an end-to-end task converges, survives the Arena, and exports a clean patch."""
    engine = SwarmOrchestrationEngine(workspace_base_dir=tmp_path, max_iterations=3)
    spec = "Construct a thread-safe token bucket rate limiter with burst control and middleware"

    state = engine.execute_lifecycle(task_specification=spec)
    assert state.status.value == "COMPLETED"

    # Evaluate the converged workspace in SwarmArena
    arena = SwarmArena(baseline_elo=1400.0, min_survival_rate=0.90)
    tournament = arena.run_tournament(workspace_dir=state.root_path, candidate_id="token_bucket_v1", rounds=4)

    assert tournament.passed_gate is True
    assert tournament.survival_rate >= 0.90
    assert tournament.final_elo >= tournament.initial_elo

    # Check worktree export patch
    with GitWorktreeSandbox(worktree_base_dir=tmp_path) as sandbox:
        # Copy files to worktree
        for rel_path, art in state.files.items():
            sandbox.guard.safe_write(rel_path, art.content)
        sandbox.checkpoint("Converged Rate Limiter Implementation")
        patch = sandbox.export_patch()
        assert patch is not None


def test_tri_node_arena_offloading(tmp_path: Path) -> None:
    """Verify Arena tournament can be offloaded to peer router and falls back gracefully."""
    # Setup candidate directory
    cand_dir = tmp_path / "cand_offload"
    cand_dir.mkdir(parents=True, exist_ok=True)
    (cand_dir / "run_tests.py").write_text(
        "import sys\nprint('Remote test execution green')\nsys.exit(0)\n",
        encoding="utf-8",
    )

    # 1. Fallback test when peer is offline
    dispatcher_offline = ArenaTournamentDispatcher(
        node_id="PC_A",
        peer_url="http://127.0.0.1:9998",  # Unreachable port
    )
    summary_fb = dispatcher_offline.dispatch_tournament(
        workspace_dir=cand_dir,
        candidate_id="cand_fallback",
        rounds=3,
        timeout=0.2,
    )
    assert summary_fb.candidate_id == "cand_fallback"
    assert summary_fb.wins == 3
    assert summary_fb.passed_gate is True

    # 2. Live remote dispatch test against active MeshServer
    ledger_b = tmp_path / "node_b_router_ledger.jsonl"
    router_b = P2PRouter(node_id="PC_B", port=8233, mode="MESH", ledger_path=ledger_b)
    router_b.start_server(host="127.0.0.1", background=True)

    try:
        dispatcher_online = ArenaTournamentDispatcher(
            node_id="PC_A",
            peer_url="http://127.0.0.1:8233",
        )
        summary_remote = dispatcher_online.dispatch_tournament(
            workspace_dir=cand_dir,
            candidate_id="cand_remote_eval",
            rounds=3,
            timeout=5.0,
        )
        assert summary_remote.candidate_id == "cand_remote_eval"
        assert summary_remote.wins == 3
        assert summary_remote.passed_gate is True
        assert summary_remote.final_elo > summary_remote.initial_elo
    finally:
        router_b.stop_server()
