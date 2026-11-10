"""Strategic Systems Engine - Swarm Runtime Supervisor Agent.

Executes and monitors subprocesses inside isolated workspaces, enforcing
strict execution timeouts, scrubbed environment variables, tokenized command
execution (shell=False), and bounded output telemetry capture.
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

from sse.swarm.contracts import ExecutionResult
from sse.swarm.security_sandbox import get_sanitized_environment


class RuntimeSupervisorAgent:
    """Sub-agent responsible for process isolation, execution supervision, and telemetry capture."""

    def __init__(
        self,
        agent_id: str = "Runtime_01",
        default_timeout: float = 15.0,
        max_output_bytes: int = 100_000,
    ) -> None:
        self.agent_id = agent_id
        self.default_timeout = default_timeout
        self.max_output_bytes = int(max_output_bytes)

    def run_command(
        self,
        command: list[str] | tuple[str, ...],
        cwd: Path | str,
        timeout_sec: float | None = None,
        env: dict[str, str] | None = None,
    ) -> ExecutionResult:
        """Execute command in target workspace with privilege scrubbing, timeout, and output bounds."""
        if isinstance(command, str) or not isinstance(command, (list, tuple)) or not command:
            raise PermissionError(
                "Shell string execution forbidden; pass a non-empty tokenized argument list."
            )

        arg_list = [str(arg) for arg in command]
        timeout = timeout_sec or self.default_timeout
        work_dir = Path(cwd).resolve(strict=False)

        # Scrub host environment to prevent credential leakage
        execution_env = get_sanitized_environment(extra_env=env)

        # Ensure PYTHONPATH includes workspace root and workspace/src
        src_path = str(work_dir / "src")
        root_path = str(work_dir)
        current_pythonpath = execution_env.get("PYTHONPATH", "")
        execution_env["PYTHONPATH"] = (
            f"{src_path}{os.pathsep}{root_path}{os.pathsep}{current_pythonpath}"
            if current_pythonpath
            else f"{src_path}{os.pathsep}{root_path}"
        )

        t0 = time.perf_counter()
        timed_out = False
        stdout_str = ""
        stderr_str = ""
        exit_code = -1

        try:
            # Execute strictly with tokenized argv array and shell=False
            process = subprocess.Popen(
                arg_list,
                cwd=str(work_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=execution_env,
                shell=False,
            )

            try:
                stdout_str, stderr_str = process.communicate(timeout=timeout)
                exit_code = process.returncode
            except subprocess.TimeoutExpired:
                timed_out = True
                process.kill()
                stdout_str, stderr_str = process.communicate()
                exit_code = -1
                stderr_str += f"\n[ERROR] Command timed out after {timeout:.2f} seconds."

        except Exception as exc:
            exit_code = -1
            stderr_str = f"Subprocess spawning error: {exc}"

        duration_ms = (time.perf_counter() - t0) * 1000.0

        if len(stdout_str) > self.max_output_bytes:
            stdout_str = (
                stdout_str[: self.max_output_bytes]
                + f"\n... [TRUNCATED: Output exceeded buffer limit of {self.max_output_bytes} bytes]"
            )

        if len(stderr_str) > self.max_output_bytes:
            stderr_str = (
                stderr_str[: self.max_output_bytes]
                + f"\n... [TRUNCATED: Stderr exceeded buffer limit of {self.max_output_bytes} bytes]"
            )

        return ExecutionResult(
            command=arg_list,
            exit_code=exit_code,
            stdout=stdout_str,
            stderr=stderr_str,
            duration_ms=round(duration_ms, 2),
            timed_out=timed_out,
        )
