"""End-to-End Integration Verification Tests for AIVA ↔ SSE Gateway Pipeline.

Verifies:
1. Hardware compute allocation and OOM deadlock pruning.
2. Bayesian intent disambiguation via Expected Value of Perfect Information (EVPI).
3. Destructive action governance clearance via 2-of-3 threshold quorum.
4. Autonomous Sub-Agent Swarm closed-loop software construction and export.
5. AivaToolRouter tool schema registration and zero-crash dynamic tool dispatch.
"""

from __future__ import annotations

import time
from pathlib import Path

from sse.aiva.router import AivaToolRouter
from sse.gateway.client import AivaStrategicIntelligenceClient
from sse.ingestion.telemetry_bridge import NodeTelemetry
from sse.security.hardening import ThresholdQuorumPolicy
from sse.storage.hardened_ledger import HardenedLedger
from sse.tri_node.sovereign_core import NodeID


def test_aiva_compute_deadlock_resolution(tmp_path: Path) -> None:
    """Verify hardware allocation correctly prunes OOM scenarios and returns valid target nodes."""
    ledger_path = tmp_path / "deadlock_ledger.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path)
    client = AivaStrategicIntelligenceClient(ledger=ledger)

    # 1. Normal task: fits comfortably within available VRAM
    # Node A: 4.0 GB available, task needs 1.5 GB
    fake_telemetry_normal = NodeTelemetry(
        node_id="PC_A",
        cpu_percent=25.0,
        ram_used_gb=8.0,
        ram_total_gb=32.0,
        disk_free_gb=100.0,
        disk_total_gb=500.0,
        has_gpu=True,
        gpu_name="RTX 3050",
        vram_used_gb=4.0,
        vram_total_gb=8.0,
        vram_available_gb=4.0,
        timestamp=time.time(),
    )

    res_normal = client.resolve_compute_deadlock(
        task_vram_gb=1.5,
        task_cpu_sec_a=2.0,
        task_cpu_sec_b=15.0,
        telemetry_override=fake_telemetry_normal,
    )

    assert res_normal["target"] == "LOCAL_PC_A"
    assert res_normal["oom_risk"] == 0.0
    assert len(res_normal["compact_payload"]) < 350
    assert "DEADLOCK_RESOLVED" in res_normal["compact_payload"]

    # 2. OOM deadlock: task requires 12.0 GB VRAM, exceeding Node A's 4.0 GB headroom
    # Tier-1 IESDS must strictly eliminate LOCAL_PC_A and route to DISTRIBUTED or REMOTE_PC_B
    res_oom = client.resolve_compute_deadlock(
        task_vram_gb=12.0,
        task_cpu_sec_a=2.0,
        task_cpu_sec_b=6.0,
        telemetry_override=fake_telemetry_normal,
    )

    assert res_oom["target"] in ("DISTRIBUTED", "REMOTE_PC_B")
    assert res_oom["oom_risk"] == 1.0
    assert len(res_oom["compact_payload"]) < 350

    # Verify ledger append
    records = ledger.read_records()
    assert len(records) == 2
    assert records[0]["payload"]["type"] == "COMPUTE_ALLOCATION"


def test_aiva_intent_disambiguation_evpi() -> None:
    """Verify EVPI engine triggers CLARIFY on high-uncertainty / high-penalty splits and EXECUTE on clear winners."""
    client = AivaStrategicIntelligenceClient()

    # Case 1: Close-call distribution with high penalty for mistake
    # P(delete)=0.5, P(archive)=0.5; penalty for mistaken delete is 150.0, mistaken archive is 30.0
    probs_ambiguous = {"delete_database": 0.5, "archive_database": 0.5}
    penalties_high = {"delete_database": 150.0, "archive_database": 30.0}

    action_type, prompt = client.evaluate_intent_disambiguation(
        hypotheses_probs=probs_ambiguous,
        misclassification_penalties=penalties_high,
        clarification_cost=8.0,
    )

    assert action_type == "CLARIFY"
    assert prompt is not None
    assert "Ambiguous intent detected" in prompt
    assert "delete_database" in prompt
    assert "archive_database" in prompt

    # Case 2: Clear dominant distribution with low Bayes risk
    # P(view_logs)=0.98, P(delete_database)=0.02
    probs_dominant = {"view_logs": 0.98, "delete_database": 0.02}
    penalties_dom = {"delete_database": 200.0, "view_logs": 0.0}

    action_type_dom, chosen_action = client.evaluate_intent_disambiguation(
        hypotheses_probs=probs_dominant,
        misclassification_penalties=penalties_dom,
        clarification_cost=8.0,
    )

    assert action_type_dom == "EXECUTE"
    assert chosen_action == "view_logs"


def test_aiva_quorum_action_clearance(tmp_path: Path) -> None:
    """Verify high-impact actions require 2-of-3 threshold quorum and log to the hardened ledger."""
    ledger_path = tmp_path / "gov_ledger.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path)
    policy = ThresholdQuorumPolicy(min_threshold=2)
    client = AivaStrategicIntelligenceClient(ledger=ledger, quorum_policy=policy)

    now = time.time()
    action = "WIPE_CACHE_SERVICE"
    target = "redis_cluster_01"

    # 1. Single signature fails quorum requirement
    sig_a = policy.sign_action(NodeID.PC_A.value, f"{action}:{target}", now)
    approved_single, reason_single = client.verify_action_clearance(
        action_name=action,
        target_entity=target,
        signatures={NodeID.PC_A.value: sig_a},
        timestamp=now,
    )

    assert approved_single is False
    assert "INSUFFICIENT_SIGNATURES" in reason_single

    # 2. Dual valid signature (PC-A + Mobile) satisfies 2-of-3 quorum
    sig_mobile = policy.sign_action(NodeID.MOBILE.value, f"{action}:{target}", now)
    approved_dual, reason_dual = client.verify_action_clearance(
        action_name=action,
        target_entity=target,
        signatures={NodeID.PC_A.value: sig_a, NodeID.MOBILE.value: sig_mobile},
        timestamp=now,
    )

    assert approved_dual is True
    assert "QUORUM_VERIFIED" in reason_dual

    # 3. Verify ledger integrity
    records = ledger.read_records()
    assert len(records) == 2
    assert records[0]["payload"]["approved"] is False
    assert records[1]["payload"]["approved"] is True
    valid, _, _ = ledger.verify_integrity()
    assert valid is True


def test_aiva_autonomous_swarm_build(tmp_path: Path) -> None:
    """Verify autonomous swarm build compiles, executes tests, audits vulnerabilities, and exports files."""
    export_dir = tmp_path / "exported_limiter"
    ledger_path = tmp_path / "swarm_ledger.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path)
    client = AivaStrategicIntelligenceClient(ledger=ledger)

    spec = "Implement a TokenBucketRateLimiter with consume(tokens) and refill() methods."
    result = client.dispatch_autonomous_swarm_build(
        task_specification=spec,
        export_directory=export_dir,
        project_name="token_limiter_service",
    )

    # 1. Assert swarm converged and completed
    assert result["status"] in ("COMPLETED", "CONVERGED")
    assert result["iterations"] >= 1
    assert result["file_count"] >= 3
    assert result["vulnerabilities_remaining"] == 0

    # 2. Assert physical files exported to disk
    assert export_dir.exists()
    assert (export_dir / "src/limiter/token_bucket.py").exists()
    assert (export_dir / "run_tests.py").exists()

    # 3. Context budget compliance
    assert len(result["compact_payload"]) < 350
    assert "SWARM_BUILD_COMPLETE" in result["compact_payload"]

    # 4. Assert ledger record created
    records = ledger.read_records()
    assert len(records) == 1
    assert records[0]["payload"]["type"] == "SWARM_BUILD_COMPLETION"


def test_aiva_tool_router_dispatch(tmp_path: Path) -> None:
    """Verify AivaToolRouter tool schemas and dynamic tool dispatch execution."""
    ledger_path = tmp_path / "router_ledger.jsonl"
    ledger = HardenedLedger(node_id="PC_A", ledger_path=ledger_path)
    client = AivaStrategicIntelligenceClient(ledger=ledger)
    router = AivaToolRouter(client=client)

    # 1. Check schemas
    schemas = router.get_tool_schemas()
    schema_names = [s["name"] for s in schemas]
    assert "sse_allocate_compute" in schema_names
    assert "sse_disambiguate_intent" in schema_names
    assert "sse_verify_governance" in schema_names
    assert "sse_build_software" in schema_names

    # 2. Execute compute allocation tool
    alloc_res = router.execute_tool(
        "sse_allocate_compute",
        {
            "task_vram_gb": 1.0,
            "task_cpu_sec_a": 1.0,
            "task_cpu_sec_b": 10.0,
        },
    )
    assert alloc_res["target"] == "LOCAL_PC_A"

    # 3. Execute intent disambiguation tool
    evpi_res = router.execute_tool(
        "sse_disambiguate_intent",
        {
            "hypotheses_probs": {"act_a": 0.99, "act_b": 0.01},
            "misclassification_penalties": {"act_b": 10.0, "act_a": 0.0},
        },
    )
    assert evpi_res["decision"] == "EXECUTE"
    assert evpi_res["detail"] == "act_a"

    # 4. Unknown tool error safety
    err_res = router.execute_tool("unknown_tool_xyz", {})
    assert err_res["status"] == "ERROR"
