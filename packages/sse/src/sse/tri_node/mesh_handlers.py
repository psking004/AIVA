"""Strategic Systems Engine - Mesh Action Handlers.

Executes concrete remote actions received over the Sovereign Tri-Node Mesh:
- inspect_telemetry: Queries live host CPU/RAM and GPU VRAM headroom.
- write_file: Writes file atomically within a SandboxedWorkspaceGuard.
- build_software: Runs candidate code in a guarded sandbox, executes tests under
  HardenedProcessExecutor, and performs static security audits via SecurityAuditorAgent.
Zero mock data / pure concrete execution.
"""

from __future__ import annotations

import hashlib
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from sse.ingestion.telemetry_bridge import TelemetryBridge
from sse.storage.hardened_ledger import HardenedLedger
from sse.swarm.agents.auditor import SecurityAuditorAgent
from sse.swarm.contracts import SwarmWorkspaceState, TaskStatus
from sse.swarm.security_sandbox import HardenedProcessExecutor, SandboxedWorkspaceGuard
from sse.tri_node.ledger import SovereignLedger


class MeshActionDispatcher:
    """Dispatches and executes validated actions on the local node within secure boundaries."""

    def __init__(
        self,
        node_id: str,
        ledger: SovereignLedger,
        workspace_base_dir: Path | str | None = None,
    ) -> None:
        self.node_id = str(node_id)
        self.ledger = ledger
        self.workspace_base_dir = Path(workspace_base_dir) if workspace_base_dir else None
        self.telemetry_bridge = TelemetryBridge(node_id=self.node_id)
        self.auditor = SecurityAuditorAgent()

    def get_sandbox_dir(self, name_prefix: str = "mesh") -> Path:
        """Create or resolve dedicated sandbox directory for remote execution."""
        if self.workspace_base_dir:
            self.workspace_base_dir.mkdir(parents=True, exist_ok=True)
            return Path(tempfile.mkdtemp(prefix=f"{name_prefix}_", dir=str(self.workspace_base_dir)))
        return Path(tempfile.mkdtemp(prefix=f"{name_prefix}_"))

    def handle_inspect_telemetry(self) -> dict[str, Any]:
        """Query local host metrics, VRAM headroom, and latest ledger block hash."""
        telemetry = self.telemetry_bridge.get_local_telemetry()
        latest_hash = self.ledger.get_latest_hash()

        return {
            "status": "READY",
            "node_id": self.node_id,
            "latest_hash": latest_hash,
            "timestamp": time.time(),
            "telemetry": {
                "cpu_percent": telemetry.cpu_percent,
                "ram_used_gb": telemetry.ram_used_gb,
                "ram_total_gb": telemetry.ram_total_gb,
                "disk_free_gb": telemetry.disk_free_gb,
                "disk_total_gb": telemetry.disk_total_gb,
                "has_gpu": telemetry.has_gpu,
                "gpu_name": telemetry.gpu_name,
                "vram_used_gb": telemetry.vram_used_gb,
                "vram_total_gb": telemetry.vram_total_gb,
                "vram_available_gb": telemetry.vram_available_gb,
            },
        }

    def handle_write_file(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Atomically write a file into a guarded sandbox, strictly rejecting path traversal."""
        rel_path = str(payload.get("relative_path", "")).strip()
        content = str(payload.get("content", ""))
        sandbox_id = str(payload.get("sandbox_id", "default_sandbox"))

        if not rel_path:
            raise ValueError("Parameter 'relative_path' is required.")

        # Establish isolated sandbox boundary
        if self.workspace_base_dir:
            sandbox_root = self.workspace_base_dir / f"sb_{sandbox_id}"
        else:
            sandbox_root = Path(tempfile.gettempdir()) / "sse_mesh_sandboxes" / f"sb_{sandbox_id}"

        guard = SandboxedWorkspaceGuard(sandbox_root)

        # resolve_safe_path will raise PermissionError if path attempts traversal escape
        target_path = guard.resolve_safe_path(rel_path)
        guard.safe_write(rel_path, content)

        raw_bytes = content.encode("utf-8")
        sha256_hash = hashlib.sha256(raw_bytes).hexdigest()

        return {
            "status": "SUCCESS",
            "relative_path": rel_path,
            "resolved_path": str(target_path),
            "size_bytes": len(raw_bytes),
            "sha256": sha256_hash,
            "node_id": self.node_id,
        }

    def handle_build_software(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Execute candidate build in an isolated guarded sandbox under timeout and buffer bounds."""
        project_name = str(payload.get("project_name", f"remote_build_{int(time.time())}"))
        files_data = payload.get("files", [])
        test_cmd = payload.get("test_command", [sys.executable, "run_tests.py"])
        timeout_sec = float(payload.get("timeout_sec", 30.0))

        # 1. Allocate isolated sandbox workspace
        sandbox_root = self.get_sandbox_dir(name_prefix=f"mesh_build_{project_name}")
        guard = SandboxedWorkspaceGuard(sandbox_root)
        workspace_state = SwarmWorkspaceState(
            project_name=project_name,
            root_path=sandbox_root,
            status=TaskStatus.RUNNING,
        )

        # 2. Flush candidate files into sandbox through path traversal guard
        # Support either list of dicts [{"path": ..., "content": ...}] or dict {"rel/path": "content"}
        if isinstance(files_data, list):
            for file_entry in files_data:
                p = file_entry.get("path") or file_entry.get("relative_path")
                c = file_entry.get("content", "")
                if p:
                    workspace_state.add_file(str(p), str(c))
                    guard.safe_write(str(p), str(c))
        elif isinstance(files_data, dict):
            for p, c in files_data.items():
                workspace_state.add_file(str(p), str(c))
                guard.safe_write(str(p), str(c))

        # 3. Static security audit before execution
        audit_findings = self.auditor.audit(workspace_state)
        critical_or_high = [v for v in audit_findings if v.severity.value in ("CRITICAL", "HIGH")]

        # 4. Supervised subprocess execution with environment scrubbing and 100 KB ceiling
        executor = HardenedProcessExecutor(
            guard=guard,
            default_timeout_sec=timeout_sec,
            max_output_bytes=100_000,
        )

        exec_res = executor.run_command(command=test_cmd, cwd_relative=".")

        status = "COMPLETED" if (exec_res.exit_code == 0 and not critical_or_high) else "FAILED"
        workspace_state.status = TaskStatus.COMPLETED if status == "COMPLETED" else TaskStatus.FAILED

        # 5. Log remote execution result to local ledger
        now = time.time()
        record_data = {
            "decision_id": f"mesh_build_{int(now * 1000)}",
            "timestamp": now,
            "payload": {
                "type": "REMOTE_BUILD_EXECUTION",
                "project_name": project_name,
                "status": status,
                "exit_code": exec_res.exit_code,
                "vulnerabilities_count": len(audit_findings),
                "duration_ms": exec_res.duration_ms,
            },
        }

        if isinstance(self.ledger, HardenedLedger):
            self.ledger.atomic_append_record(record_data)
        else:
            # SovereignLedger fallback
            pass

        return {
            "status": status,
            "project_name": project_name,
            "node_id": self.node_id,
            "exit_code": exec_res.exit_code,
            "stdout": exec_res.stdout,
            "stderr": exec_res.stderr,
            "duration_ms": exec_res.duration_ms,
            "timed_out": exec_res.timed_out,
            "vulnerabilities": [
                {
                    "rule_id": v.rule_id,
                    "severity": v.severity.value,
                    "description": v.description,
                    "file_path": v.file_path,
                    "line_number": v.line_number,
                }
                for v in audit_findings
            ],
            "audit_passed": len(critical_or_high) == 0,
        }
