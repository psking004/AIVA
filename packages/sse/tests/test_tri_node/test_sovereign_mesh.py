"""Unit and Invariant Verification Tests for Sovereign Tri-Node Mesh Architecture.

Verifies:
1. Pure Solo Air-Gapped Execution on PC-A, PC-B, and Mobile.
2. Graceful Network Partition with Instant Fallback.
3. Cryptographic Hash-Chain Integrity and Tamper Rejection.
4. Two-Way Eventual-Consistency Ledger Reconciliation.
5. Multi-Tier Solver Invariants (IESDS -> Stackelberg -> Savage Minimax Regret).
6. Live Peer-to-Peer Router Dispatch and Bidirectional Sync.
"""

from __future__ import annotations

import json
from pathlib import Path

from sse.tri_node.ledger import SovereignLedger
from sse.tri_node.router import P2PRouter
from sse.tri_node.sovereign_core import (
    NodeID,
    OperationalMode,
    SovereignDecisionCore,
    verify_sovereign_grant,
)


def test_pure_solo_execution(tmp_path: Path) -> None:
    """Verify PC-A, PC-B, and Mobile can independently parse, solve, sign, and log in total isolation."""
    nodes = [NodeID.PC_A, NodeID.PC_B, NodeID.MOBILE]

    u1 = [[3.0, 0.0], [5.0, 1.0]]
    u2 = [[3.0, 5.0], [0.0, 1.0]]
    actions_p1 = ["Cooperate", "Defect"]
    actions_p2 = ["Cooperate", "Defect"]

    for node in nodes:
        ledger_path = tmp_path / f"{node.value.lower()}_test_ledger.jsonl"
        core = SovereignDecisionCore(node_id=node, mode=OperationalMode.SOLO)
        ledger = SovereignLedger(node_id=node.value, ledger_path=ledger_path)

        prev_hash = ledger.get_latest_hash()
        verdict = core.solve_matrix(
            u1=u1,
            u2=u2,
            actions_p1=actions_p1,
            actions_p2=actions_p2,
            prev_hash=prev_hash,
            airgapped_solo=True,
        )

        assert verdict.node_id == node.value
        assert verdict.action_idx == 1  # Defect dominates
        assert verdict.action_name == "Defect"
        assert verdict.solver_tier == "T1_IESDS"
        assert verdict.worst_case_regret == 0.0
        assert verdict.mode == "SOLO"

        # Check payload length constraint (< 350 chars)
        payload_str = verdict.to_compact_payload()
        assert len(payload_str) < 350

        # Record and verify HMAC signature
        record = ledger.append_verdict(verdict)
        is_valid_rec, _ = verify_sovereign_grant(
            grant_token=verdict.grant_token,
            node_id=verdict.node_id,
            decision_id=verdict.decision_id,
            action_idx=verdict.action_idx,
            timestamp=record["timestamp"],
            prev_hash=prev_hash,
            airgapped_solo=True,
        )
        assert is_valid_rec is True

        # Assert ledger hash updated
        assert ledger.get_latest_hash() == record["record_hash"]
        assert len(record["record_hash"]) == 64


def test_graceful_network_partition(tmp_path: Path) -> None:
    """Verify router immediately falls back to local execution without socket hangs or unhandled errors."""
    ledger_path = tmp_path / "router_fallback_ledger.jsonl"
    router = P2PRouter(node_id="PC_A", port=8201, mode="MESH", ledger_path=ledger_path)

    u1 = [[3.0, 0.0], [5.0, 1.0]]
    u2 = [[3.0, 5.0], [0.0, 1.0]]

    # Target an unreachable port with short timeout (0.05s)
    verdict = router.dispatch_task(
        peer_url="http://127.0.0.1:9999",
        u1=u1,
        u2=u2,
        actions_p1=["Cooperate", "Defect"],
        actions_p2=["Cooperate", "Defect"],
        timeout=0.05,
    )

    assert verdict.node_id == "PC_A"
    assert verdict.action_idx == 1  # Solved locally
    assert verdict.solver_tier == "T1_IESDS"

    # Verify fallback was logged to ledger
    records = router.ledger.read_records()
    assert len(records) == 1
    assert records[0]["payload"]["meta"]["fallback_from"] == "http://127.0.0.1:9999"


def test_ledger_chain_integrity_and_tamper_rejection(tmp_path: Path) -> None:
    """Verify cryptographic hash chain detects modifications in historical records."""
    ledger_path = tmp_path / "tamper_ledger.jsonl"
    ledger = SovereignLedger(node_id="PC_B", ledger_path=ledger_path)
    core = SovereignDecisionCore(node_id="PC_B", mode="SOLO")

    u1 = [[3.0, 0.0], [5.0, 1.0]]
    u2 = [[3.0, 5.0], [0.0, 1.0]]

    # Generate 5 chained records
    for i in range(5):
        v = core.solve_matrix(
            u1=u1,
            u2=u2,
            decision_id=f"dec_test_{i}",
            prev_hash=ledger.get_latest_hash(),
        )
        ledger.append_verdict(v)

    valid, count, msg = ledger.verify_integrity()
    assert valid is True
    assert count == 5
    assert msg == "VERIFIED_VALID"

    # Corrupt block 2 (alter expected_utility)
    with open(ledger_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    lines[2] = lines[2].replace('"expected_utility":1.0', '"expected_utility":999.0')
    with open(ledger_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    valid_corrupt, failed_idx, err_msg = ledger.verify_integrity()
    assert valid_corrupt is False
    assert failed_idx == 2
    assert "Tamper detected" in err_msg


def test_two_way_ledger_merge(tmp_path: Path) -> None:
    """Verify PC-A and PC-B offline records reconcile into identical contiguous chains."""
    path_a = tmp_path / "node_a_ledger.jsonl"
    path_b = tmp_path / "node_b_ledger.jsonl"

    ledger_a = SovereignLedger(node_id="PC_A", ledger_path=path_a)
    ledger_b = SovereignLedger(node_id="PC_B", ledger_path=path_b)

    core_a = SovereignDecisionCore(node_id="PC_A", mode="SOLO")
    core_b = SovereignDecisionCore(node_id="PC_B", mode="SOLO")

    u1 = [[3.0, 0.0], [5.0, 1.0]]
    u2 = [[3.0, 5.0], [0.0, 1.0]]

    # PC-A generates 5 decisions
    for i in range(5):
        v = core_a.solve_matrix(u1=u1, u2=u2, decision_id=f"dec_a_{i}", prev_hash=ledger_a.get_latest_hash())
        ledger_a.append_verdict(v)

    # PC-B generates 5 decisions
    for j in range(5):
        v = core_b.solve_matrix(u1=u1, u2=u2, decision_id=f"dec_b_{j}", prev_hash=ledger_b.get_latest_hash())
        ledger_b.append_verdict(v)

    assert len(ledger_a.read_records()) == 5
    assert len(ledger_b.read_records()) == 5

    # Exchange records
    lines_a = [json.dumps(r) for r in ledger_a.read_records()]
    lines_b = [json.dumps(r) for r in ledger_b.read_records()]

    merged_to_a = ledger_a.merge_remote_records(lines_b)
    merged_to_b = ledger_b.merge_remote_records(lines_a)

    assert merged_to_a == 5
    assert merged_to_b == 5

    records_a = ledger_a.read_records()
    records_b = ledger_b.read_records()

    assert len(records_a) == 10
    assert len(records_b) == 10

    # Assert both ledgers have identical hash sequences and latest hashes
    assert ledger_a.get_latest_hash() == ledger_b.get_latest_hash()

    for ra, rb in zip(records_a, records_b, strict=True):
        assert ra["record_hash"] == rb["record_hash"]
        assert ra["prev_hash"] == rb["prev_hash"]
        assert ra["decision_id"] == rb["decision_id"]

    # Verify both chains pass cryptographic integrity checks
    valid_a, count_a, _ = ledger_a.verify_integrity()
    valid_b, count_b, _ = ledger_b.verify_integrity()
    assert valid_a is True and count_a == 10
    assert valid_b is True and count_b == 10


def test_three_tiers_pure_python() -> None:
    """Verify mathematical correctness of the 3 solver tiers without external dependencies."""
    core = SovereignDecisionCore(node_id="MOBILE", mode="SOLO")

    # Tier 1: Prisoner's Dilemma -> Defect (T1_IESDS)
    u1_pd = [[3.0, 0.0], [5.0, 1.0]]
    u2_pd = [[3.0, 5.0], [0.0, 1.0]]
    v_pd = core.solve_matrix(u1_pd, u2_pd, ["Cooperate", "Defect"], ["Cooperate", "Defect"])
    assert v_pd.solver_tier == "T1_IESDS"
    assert v_pd.action_idx == 1
    assert v_pd.worst_case_regret == 0.0

    # Tier 2: Stackelberg Leader Commitment
    # Leader prefers committing to Commit_B (Follower best-responds with Follow_B, yielding 3.0 to leader)
    u1_lead = [[2.0, 0.0], [1.0, 3.0]]
    u2_lead = [[1.0, 0.0], [0.0, 2.0]]
    v_lead = core.solve_matrix(u1_lead, u2_lead, ["Commit_A", "Commit_B"], ["Follow_A", "Follow_B"])
    assert v_lead.solver_tier in ("T1_IESDS", "T2_STACKELBERG")
    assert v_lead.action_name == "Commit_B"

    # Tier 3: Rock-Paper-Scissors (Zero-Sum, indeterminate pure equilibria)
    u1_rps = [[0.0, -1.0, 1.0], [1.0, 0.0, -1.0], [-1.0, 1.0, 0.0]]
    u2_rps = [[0.0, 1.0, -1.0], [-1.0, 0.0, 1.0], [1.0, -1.0, 0.0]]
    v_rps = core.solve_matrix(u1_rps, u2_rps, ["Rock", "Paper", "Scissors"], ["Rock", "Paper", "Scissors"])
    assert v_rps.solver_tier == "T3_MINIMAX_REGRET"
    assert v_rps.worst_case_regret == 2.0  # Max loss is 1.0 against best response +1.0 = regret 2.0


def test_p2p_router_dispatch_and_sync(tmp_path: Path) -> None:
    """Verify live P2PRouter HTTP server dispatch and ledger synchronization between two nodes."""
    path_a = tmp_path / "router_a_ledger.jsonl"
    path_b = tmp_path / "router_b_ledger.jsonl"

    router_a = P2PRouter(node_id="PC_A", port=8211, mode="MESH", ledger_path=path_a)
    router_b = P2PRouter(node_id="PC_B", port=8212, mode="MESH", ledger_path=path_b)

    # Start servers in background
    router_a.start_server(host="127.0.0.1", background=True)
    router_b.start_server(host="127.0.0.1", background=True)

    try:
        u1 = [[3.0, 0.0], [5.0, 1.0]]
        u2 = [[3.0, 5.0], [0.0, 1.0]]

        # Dispatch task from A to B
        verdict = router_a.dispatch_task(
            peer_url="http://127.0.0.1:8212",
            u1=u1,
            u2=u2,
            actions_p1=["Cooperate", "Defect"],
            actions_p2=["Cooperate", "Defect"],
            timeout=2.0,
        )
        assert verdict.node_id == "PC_B"
        assert verdict.action_name == "Defect"

        # Verify B logged the execution
        records_b = router_b.ledger.read_records()
        assert len(records_b) == 1

        # Synchronize A with B
        sync_res = router_a.sync_with_peer(peer_url="http://127.0.0.1:8212", timeout=2.0)
        assert sync_res["status"] == "SYNCED"
        assert sync_res["merged_count"] == 1

        records_a = router_a.ledger.read_records()
        assert len(records_a) == 1
        assert records_a[0]["record_hash"] == records_b[0]["record_hash"]

    finally:
        router_a.stop_server()
        router_b.stop_server()
