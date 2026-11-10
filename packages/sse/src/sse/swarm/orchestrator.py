"""Strategic Systems Engine - Swarm Orchestration Engine.

Coordinates the autonomous sub-agent convergence loop:
Architect -> Builder -> Red Team -> Runtime -> Auditor -> Healer.
Operates inside sandboxed temporary or dedicated workspaces with zero leakage.
"""

from __future__ import annotations

import contextlib
import shutil
import sys
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sse.swarm.agents.architect import ArchitectAgent
from sse.swarm.agents.auditor import SecurityAuditorAgent
from sse.swarm.agents.builder import BuilderAgent
from sse.swarm.agents.healer import HealerAgent
from sse.swarm.agents.red_team import RedTeamAgent
from sse.swarm.agents.runtime import RuntimeSupervisorAgent
from sse.swarm.contracts import SwarmWorkspaceState, TaskStatus
from sse.swarm.security_sandbox import SandboxedWorkspaceGuard


class SwarmOrchestrationEngine:
    """Autonomous multi-agent orchestration engine driving software deliverables to convergence."""

    def __init__(
        self,
        workspace_base_dir: Path | str | None = None,
        max_iterations: int = 5,
        test_timeout_sec: float = 15.0,
        architect: ArchitectAgent | None = None,
        builder: BuilderAgent | None = None,
        runtime: RuntimeSupervisorAgent | None = None,
        auditor: SecurityAuditorAgent | None = None,
        red_team: RedTeamAgent | None = None,
        healer: HealerAgent | None = None,
    ) -> None:
        self.workspace_base_dir = Path(workspace_base_dir) if workspace_base_dir else None
        self.max_iterations = max_iterations
        self.test_timeout_sec = test_timeout_sec

        self.architect = architect or ArchitectAgent()
        self.builder = builder or BuilderAgent()
        self.runtime = runtime or RuntimeSupervisorAgent(default_timeout=test_timeout_sec)
        self.auditor = auditor or SecurityAuditorAgent()
        self.red_team = red_team or RedTeamAgent()
        self.healer = healer or HealerAgent()

    def create_sandboxed_workspace(self, project_name: str) -> SwarmWorkspaceState:
        """Allocate an isolated sandbox directory on disk."""
        if self.workspace_base_dir:
            self.workspace_base_dir.mkdir(parents=True, exist_ok=True)
            root_path = Path(tempfile.mkdtemp(prefix=f"swarm_{project_name}_", dir=str(self.workspace_base_dir)))
        else:
            root_path = Path(tempfile.mkdtemp(prefix=f"swarm_{project_name}_"))

        return SwarmWorkspaceState(
            project_name=project_name,
            root_path=root_path,
            status=TaskStatus.PENDING,
            max_iterations=self.max_iterations,
        )

    def flush_files_to_disk(self, state: SwarmWorkspaceState) -> None:
        """Write in-memory file artifacts to the physical workspace directory with path confinement."""
        guard = SandboxedWorkspaceGuard(state.root_path)
        for rel_path, artifact in state.files.items():
            guard.safe_write(rel_path, artifact.content, executable=artifact.executable)

    def export_workspace(self, state: SwarmWorkspaceState, destination_dir: Path | str) -> Path:
        """Export completed workspace artifacts to designated destination directory."""
        dest = Path(destination_dir).resolve()
        dest.mkdir(parents=True, exist_ok=True)

        for rel_path, artifact in state.files.items():
            out_file = dest / rel_path
            out_file.parent.mkdir(parents=True, exist_ok=True)
            out_file.write_text(artifact.content, encoding="utf-8")

        state.log(f"Exported {len(state.files)} artifacts to '{dest}'.")
        return dest

    def cleanup_workspace(self, state: SwarmWorkspaceState) -> None:
        """Remove temporary sandbox directory."""
        if state.root_path.exists():
            with contextlib.suppress(OSError):
                shutil.rmtree(state.root_path, ignore_errors=True)

    def develop_and_verify(
        self,
        specification: str | dict[str, Any],
        project_name: str | None = None,
        phase_callback: Callable[[str, int, str], None] | None = None,
    ) -> SwarmWorkspaceState:
        """Execute full autonomous multi-agent software engineering lifecycle (develop and verify)."""
        return self.execute_lifecycle(
            task_specification=specification,
            phase_callback=phase_callback,
            cleanup_on_finish=False,
        )

    def execute_lifecycle(
        self,
        task_specification: str | dict[str, Any],
        phase_callback: Callable[[str, int, str], None] | None = None,
        cleanup_on_finish: bool = False,
    ) -> SwarmWorkspaceState:
        """Execute full autonomous multi-agent software engineering lifecycle.

        Convergence Loop:
          Architect -> Builder -> Red Team -> (Runtime -> Auditor -> Healer)*
        """

        def notify(phase: str, iter_count: int, msg: str) -> None:
            if phase_callback:
                phase_callback(phase, iter_count, msg)

        # Step 1: Architectural Formulation
        notify("ARCHITECT", 0, "Deconstructing specification into architectural contracts and component specs...")
        blueprint = self.architect.design(task_specification)

        # Step 2: Workspace Allocation
        state = self.create_sandboxed_workspace(blueprint.project_name)
        state.log(f"Allocated sandbox workspace at '{state.root_path}'.")

        # Step 3: Source Code & Test Synthesis (Builder)
        notify("BUILDER", 0, f"Synthesizing zero-mock codebase for '{blueprint.project_name}'...")
        self.builder.build(blueprint, state)

        # Step 4: Adversarial Test Injection (Red Team)
        notify("RED_TEAM", 0, f"Generating boundary-value and concurrency tests for domain '{blueprint.domain}'...")
        self.red_team.inject_adversarial_tests(state, blueprint.domain)

        # Step 5: The Iterative Convergence Loop
        state.status = TaskStatus.RUNNING

        while state.iteration_count < state.max_iterations:
            state.iteration_count += 1
            cur_iter = state.iteration_count

            notify("RUNTIME", cur_iter, f"Flushing artifacts to sandbox and executing live test suite (Iteration {cur_iter}/{state.max_iterations})...")
            self.flush_files_to_disk(state)

            # Determine test command: prefer run_tests.py if present
            if "run_tests.py" in state.files:
                test_cmd = [sys.executable, "run_tests.py"]
            else:
                test_cmd = [sys.executable, "-m", "unittest", "discover", "-s", "tests"]

            exec_res = self.runtime.run_command(test_cmd, cwd=state.root_path, timeout_sec=self.test_timeout_sec)
            state.test_results = [exec_res]

            # Security Audit Phase
            notify("AUDITOR", cur_iter, "Executing static security analysis across all workspace artifacts...")
            state.status = TaskStatus.AUDITING
            findings = self.auditor.audit_workspace(state)

            # Convergence Check:
            tests_passed = (exec_res.exit_code == 0)
            has_high_or_crit = state.has_critical_or_high_vulnerabilities()

            if tests_passed and not has_high_or_crit:
                state.status = TaskStatus.COMPLETED
                state.log(f"Convergence achieved at iteration {cur_iter}! All tests passed with zero CRITICAL/HIGH vulnerabilities.")
                notify("CONVERGED", cur_iter, "All tests passed cleanly and zero high/critical security findings detected.")
                break

            # Need Healing / Patching
            notify("HEALER", cur_iter, f"Applying automated remediations (Tests Passed: {tests_passed}, Vulns: {len(findings)})...")
            state.status = TaskStatus.PATCHING
            patches = self.healer.heal(state)

            if patches == 0 and not tests_passed:
                state.log("Healer applied zero patches on failing tests; attempting fallback.")

        if state.status != TaskStatus.COMPLETED:
            state.status = TaskStatus.FAILED
            state.log(f"Swarm convergence failed to satisfy all invariants within {state.max_iterations} iterations.")
            notify("FAILED", state.iteration_count, "Max iterations reached without satisfying all invariants.")

        if cleanup_on_finish and state.status == TaskStatus.COMPLETED:
            self.cleanup_workspace(state)

        return state
