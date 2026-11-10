"""Unit tests for Live Hardware & Queue Telemetry Ingestion."""

import time

from sse.ingestion.telemetry_bridge import (
    NodeTelemetry,
    TelemetryBridge,
    query_gpu_telemetry,
    query_host_telemetry,
)


def test_query_host_telemetry_validity() -> None:
    """Verify live host telemetry returns non-negative values and does not fail."""
    cpu, ram_used, ram_total, disk_free, disk_total = query_host_telemetry()
    assert cpu >= 0.0
    assert ram_used >= 0.0
    assert ram_total >= 0.0
    assert disk_free >= 0.0
    assert disk_total >= 0.0


def test_query_gpu_telemetry_graceful_handling() -> None:
    """Verify GPU telemetry extraction returns well-typed metrics without raising unhandled errors."""
    has_gpu, gpu_name, vram_used, vram_total, vram_avail = query_gpu_telemetry(0)
    assert isinstance(has_gpu, bool)
    assert isinstance(gpu_name, str)
    assert vram_used >= 0.0
    assert vram_total >= 0.0
    assert vram_avail >= 0.0


def test_telemetry_bridge_snapshot() -> None:
    """Verify TelemetryBridge creates an immutable NodeTelemetry snapshot."""
    bridge = TelemetryBridge(node_id="PC-A", device_idx=0)
    telemetry = bridge.get_local_telemetry()

    assert telemetry.node_id == "PC-A"
    assert telemetry.cpu_percent >= 0.0
    assert telemetry.ram_total_gb >= 0.0
    assert telemetry.timestamp > 0.0


def test_evaluate_live_allocation_iesds_pruning_on_oom() -> None:
    """Verify that when task VRAM exceeds available VRAM, oom_risk triggers and LOCAL_PC_A is pruned."""
    bridge = TelemetryBridge(node_id="PC-A")

    # Synthetic scenario: PC-A has 2.2 GB free VRAM (8.0 - 5.8)
    telemetry_mock = NodeTelemetry(
        node_id="PC-A",
        cpu_percent=45.0,
        ram_used_gb=12.0,
        ram_total_gb=32.0,
        disk_free_gb=100.0,
        disk_total_gb=500.0,
        has_gpu=True,
        gpu_name="NVIDIA GeForce RTX 3050",
        vram_used_gb=5.8,
        vram_total_gb=8.0,
        vram_available_gb=2.2,
        timestamp=time.time(),
    )

    # Task requiring 4.2 GB VRAM (> 2.2 GB available)
    # PC-A execution 2.1s vs PC-B execution 18.0s
    res = bridge.evaluate_live_allocation(
        task_vram_gb=4.2,
        task_cpu_sec_a=2.1,
        task_cpu_sec_b=18.0,
        network_latency_sec=0.12,
        telemetry_override=telemetry_mock,
    )

    assert res["oom_risk"] == 1.0
    assert res["utilities"]["LOCAL_PC_A"] < -100.0  # severely penalized by oom_risk
    assert res["target"] == "DISTRIBUTED"
    # DISTRIBUTED utility: -(18.0 * 0.35 + 0.12) - 0.40 = -(6.3 + 0.12) - 0.40 = -6.82
    # REMOTE_PC_B utility: -(18.0 + 0.12) - 0.20 = -18.32
    assert res["utilities"]["DISTRIBUTED"] > res["utilities"]["REMOTE_PC_B"]


def test_evaluate_live_allocation_local_preferred_when_vram_sufficient() -> None:
    """Verify that when VRAM is sufficient, local GPU speed is preferred."""
    bridge = TelemetryBridge(node_id="PC-A")

    telemetry_mock = NodeTelemetry(
        node_id="PC-A",
        cpu_percent=20.0,
        ram_used_gb=10.0,
        ram_total_gb=32.0,
        disk_free_gb=100.0,
        disk_total_gb=500.0,
        has_gpu=True,
        gpu_name="NVIDIA GeForce RTX 3050",
        vram_used_gb=1.0,
        vram_total_gb=8.0,
        vram_available_gb=7.0,
        timestamp=time.time(),
    )

    # Task requiring 1.5 GB VRAM (< 7.0 GB available)
    # PC-A execution 1.0s vs PC-B execution 15.0s
    res = bridge.evaluate_live_allocation(
        task_vram_gb=1.5,
        task_cpu_sec_a=1.0,
        task_cpu_sec_b=15.0,
        network_latency_sec=0.12,
        telemetry_override=telemetry_mock,
    )

    assert res["oom_risk"] == 0.0
    assert res["target"] == "LOCAL_PC_A"
    assert res["utilities"]["LOCAL_PC_A"] > res["utilities"]["DISTRIBUTED"]

