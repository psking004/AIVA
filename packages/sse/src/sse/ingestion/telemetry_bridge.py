"""Strategic Systems Engine - Live Telemetry Bridge.

Ingests real-time hardware telemetry (CPU, RAM, Disk, and NVIDIA NVML VRAM)
and evaluates dynamic allocation utility tradeoffs between local execution (PC-A),
distributed pipelining (PC-A + PC-B), and remote offload (PC-B).
"""

from __future__ import annotations

import time
import warnings
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class NodeTelemetry:
    """Immutable snapshot of a node's computational and memory capacity."""

    node_id: str
    cpu_percent: float
    ram_used_gb: float
    ram_total_gb: float
    disk_free_gb: float
    disk_total_gb: float
    has_gpu: bool
    gpu_name: str
    vram_used_gb: float
    vram_total_gb: float
    vram_available_gb: float
    timestamp: float


@dataclass(frozen=True, slots=True)
class TelemetryContext:
    """Cluster-wide telemetry context encapsulating local and remote worker states."""

    local_node: NodeTelemetry
    cluster_nodes: dict[str, NodeTelemetry]
    timestamp: float


def query_gpu_telemetry(device_idx: int = 0) -> tuple[bool, str, float, float, float]:
    """Query NVIDIA GPU metrics via NVML, failing gracefully if unavailable.

    Returns:
        (has_gpu, gpu_name, vram_used_gb, vram_total_gb, vram_available_gb)
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                # Prefer nvidia_ml_py or pynvml
                import pynvml

                pynvml.nvmlInit()
                device_count = pynvml.nvmlDeviceGetCount()
                if device_count <= device_idx:
                    pynvml.nvmlShutdown()
                    return False, "None", 0.0, 0.0, 0.0

                handle = pynvml.nvmlDeviceGetHandleByIndex(device_idx)
                raw_name = pynvml.nvmlDeviceGetName(handle)
                gpu_name = raw_name.decode("utf-8") if isinstance(raw_name, bytes) else str(raw_name)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                vram_total = round(float(mem.total) / (1024.0**3), 3)
                vram_used = round(float(mem.used) / (1024.0**3), 3)
                vram_avail = round(max(0.0, (float(mem.total) - float(mem.used)) / (1024.0**3)), 3)
                pynvml.nvmlShutdown()
                return True, gpu_name, vram_used, vram_total, vram_avail
            except Exception:
                return False, "None", 0.0, 0.0, 0.0
    except Exception:
        return False, "None", 0.0, 0.0, 0.0


def query_host_telemetry() -> tuple[float, float, float, float, float]:
    """Query host CPU, RAM, and disk metrics via psutil with zero-division safety.

    Returns:
        (cpu_percent, ram_used_gb, ram_total_gb, disk_free_gb, disk_total_gb)
    """
    try:
        import psutil

        cpu_pct = float(psutil.cpu_percent(interval=None))
        vm = psutil.virtual_memory()
        ram_used = round(float(vm.used) / (1024.0**3), 3)
        ram_total = round(float(vm.total) / (1024.0**3), 3)

        disk = psutil.disk_usage(".")
        disk_free = round(float(disk.free) / (1024.0**3), 3)
        disk_total = round(float(disk.total) / (1024.0**3), 3)
        return cpu_pct, ram_used, ram_total, disk_free, disk_total
    except Exception:
        return 0.0, 0.0, 0.0, 0.0, 0.0


class TelemetryBridge:
    """Manages real-time hardware telemetry ingestion and allocation evaluation."""

    def __init__(self, node_id: str = "PC-A", device_idx: int = 0) -> None:
        self.node_id = node_id
        self.device_idx = device_idx

    def get_local_telemetry(self) -> NodeTelemetry:
        """Collect live telemetry snapshot for local node."""
        cpu_pct, ram_used, ram_total, disk_free, disk_total = query_host_telemetry()
        has_gpu, gpu_name, vram_used, vram_total, vram_avail = query_gpu_telemetry(self.device_idx)

        return NodeTelemetry(
            node_id=self.node_id,
            cpu_percent=cpu_pct,
            ram_used_gb=ram_used,
            ram_total_gb=ram_total,
            disk_free_gb=disk_free,
            disk_total_gb=disk_total,
            has_gpu=has_gpu,
            gpu_name=gpu_name,
            vram_used_gb=vram_used,
            vram_total_gb=vram_total,
            vram_available_gb=vram_avail,
            timestamp=time.time(),
        )

    def evaluate_live_allocation(
        self,
        task_vram_gb: float,
        task_cpu_sec_a: float,
        task_cpu_sec_b: float,
        network_latency_sec: float = 0.12,
        telemetry_override: NodeTelemetry | None = None,
    ) -> dict[str, Any]:
        """Evaluate dynamic compute allocation tradeoffs under live host metrics.

        Tradeoff formulas:
          available_vram = max(0.0, vram_total - vram_used)
          oom_risk = 1.0 if task_vram_gb > available_vram else 0.0
          U_local = -task_cpu_sec_a - (100.0 * oom_risk) - (0.45 * (cpu_percent / 100))
          U_dist = -(task_cpu_sec_b * 0.35 + network_latency_sec) - 0.40
          U_remote = -(task_cpu_sec_b + network_latency_sec) - 0.20

        Returns:
            Dict containing selected target ("LOCAL_PC_A", "DISTRIBUTED", "REMOTE_PC_B"),
            expected utility, component utilities, oom_risk flag, and telemetry snapshot.
        """
        telemetry = telemetry_override or self.get_local_telemetry()

        vram_total = telemetry.vram_total_gb
        vram_used = telemetry.vram_used_gb
        available_vram = max(0.0, vram_total - vram_used)

        oom_risk = 1.0 if task_vram_gb > available_vram else 0.0

        cpu_factor = telemetry.cpu_percent / 100.0 if telemetry.cpu_percent > 0.0 else 0.0

        u_local = -task_cpu_sec_a - (100.0 * oom_risk) - (0.45 * cpu_factor)
        u_dist = -(task_cpu_sec_b * 0.35 + network_latency_sec) - 0.40
        u_remote = -(task_cpu_sec_b + network_latency_sec) - 0.20

        options = [
            ("LOCAL_PC_A", round(u_local, 4)),
            ("DISTRIBUTED", round(u_dist, 4)),
            ("REMOTE_PC_B", round(u_remote, 4)),
        ]

        best_target, best_utility = max(options, key=lambda opt: opt[1])

        return {
            "target": best_target,
            "expected_utility": best_utility,
            "utilities": {
                "LOCAL_PC_A": round(u_local, 4),
                "DISTRIBUTED": round(u_dist, 4),
                "REMOTE_PC_B": round(u_remote, 4),
            },
            "oom_risk": oom_risk,
            "available_vram_gb": round(available_vram, 3),
            "telemetry": telemetry,
        }
