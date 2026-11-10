"""Strategic Systems Engine - Sub-Agent Workspace Sandbox & Privilege Scrubber.

Enforces zero host credential leakage, strict directory confinement with canonical
symlink/NTFS-junction and path-traversal defense, and resource-bounded execution to
protect the host against rogue agent behaviors.
"""

from __future__ import annotations

import contextlib
import os
import re
import subprocess
import time
from pathlib import Path

from sse.swarm.contracts import ExecutionResult

# Sensitive environment variable patterns to scrub from sub-agent processes
SENSITIVE_ENV_PATTERNS = [
    re.compile(
        r".*(?:KEY|TOKEN|SECRET|AUTH|PASS|PASSWORD|CREDENTIAL|PRIVATE|COOKIE|SESSION|DATABASE_URL|DSN).*",
        re.IGNORECASE,
    ),
]

# Explicit safe environment variable allowlist
SAFE_ENV_ALLOWLIST = {
    "PATH",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "PYTHONPATH",
    "LANG",
    "LC_ALL",
    "USERPROFILE",
    "HOME",
    "WINDIR",
    "COMSPEC",
    "SHELL",
    "TERM",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PROCESSOR_ARCHITECTURE",
}


def get_sanitized_environment(extra_env: dict[str, str] | None = None) -> dict[str, str]:
    """Extract a host-scrubbed environment dictionary preventing credential leakage.

    Only passes explicitly allowlisted environment variables, scrubs any variable
    matching sensitive patterns (keys, tokens, credentials), and sets
    PYTHONDONTWRITEBYTECODE=1 to prevent host disk pollution.
    """
    clean_env: dict[str, str] = {}

    for k, v in os.environ.items():
        k_upper = k.upper()
        # Must be in allowlist and must not match sensitive pattern
        if k_upper in SAFE_ENV_ALLOWLIST and not any(pattern.match(k) for pattern in SENSITIVE_ENV_PATTERNS):
            clean_env[k] = v

    # Add extra caller-provided environment variables if non-sensitive
    if extra_env:
        for k, v in extra_env.items():
            if not any(pattern.match(k) for pattern in SENSITIVE_ENV_PATTERNS):
                clean_env[k] = str(v)

    # Hardened standard flags
    clean_env["PYTHONDONTWRITEBYTECODE"] = "1"
    return clean_env


def _is_within_sandbox(target: Path, sandbox_root: Path) -> bool:
    """Return True strictly when target equals sandbox_root or has sandbox_root in its parents."""
    return target == sandbox_root or sandbox_root in target.parents


def _is_link_or_junction(path: Path) -> bool:
    """Detect POSIX/Windows symlinks as well as Windows NTFS directory junctions."""
    with contextlib.suppress(OSError):
        if path.is_symlink():
            return True
    if hasattr(path, "is_junction"):
        with contextlib.suppress(OSError):
            if path.is_junction():
                return True
    return False


class SandboxedWorkspaceGuard:
    """Directory confinement guard enforcing strict path containment within a sandbox root."""

    def __init__(self, sandbox_root: Path | str) -> None:
        self.sandbox_root = Path(sandbox_root).resolve(strict=False)
        self.sandbox_root.mkdir(parents=True, exist_ok=True)
        # Re-resolve cleanly after creation in case parent directories were symlinks
        self.sandbox_root = self.sandbox_root.resolve(strict=False)

    def is_path_safe(self, target: Path | str) -> bool:
        """Check whether a target path is safely contained inside the sandbox root."""
        try:
            self.resolve_safe_path(target)
            return True
        except (PermissionError, ValueError):
            return False

    def resolve_safe_path(self, relative_path: Path | str) -> Path:
        """Resolve a file path canonically and verify strict containment inside sandbox_root.

        Defends against:
        - Relative traversal tokens (`../`, `..\\`)
        - Absolute paths and Windows drive-letter escapes
        - Symlinks, nested directory symlinks, and Windows NTFS junctions pointing outside root
        - Null-byte path injection

        Raises:
            PermissionError: If any traversal or sandbox escape attempt is detected.
        """
        raw_str = str(relative_path).strip()
        if not raw_str:
            raise PermissionError("Path traversal blocked: empty path provided.")
        if "\x00" in raw_str:
            raise PermissionError("Path traversal blocked: null byte injection detected.")

        candidate = Path(raw_str)

        # Reject drive letters or UNC/rooted absolute paths outside sandbox_root
        if candidate.is_absolute() or candidate.drive:
            resolved_abs = candidate.resolve(strict=False)
            if not _is_within_sandbox(resolved_abs, self.sandbox_root):
                raise PermissionError(
                    f"Path traversal escape denied: '{raw_str}' resolves to outside directory '{resolved_abs}'"
                )
            unresolved_target = candidate
        else:
            unresolved_target = self.sandbox_root / candidate

        # 1. Inspect every ancestor from unresolved_target up to sandbox_root for symlinks/junctions
        cursor = unresolved_target
        while True:
            if _is_link_or_junction(cursor):
                link_real = cursor.resolve(strict=False)
                if not _is_within_sandbox(link_real, self.sandbox_root):
                    raise PermissionError(
                        f"Symlink/junction redirection exploit blocked (Path traversal): "
                        f"'{raw_str}' targets outside sandbox '{link_real}'"
                    )
            if cursor == self.sandbox_root or cursor.parent == cursor:
                break
            cursor = cursor.parent

        # 2. Canonical resolution with strict=False (supports non-existent targets cleanly)
        resolved_candidate = unresolved_target.resolve(strict=False)

        # 3. Verify resolved path lies strictly inside sandbox_root's hierarchy via .parents check
        if not _is_within_sandbox(resolved_candidate, self.sandbox_root):
            raise PermissionError(
                f"Path traversal exploit blocked: '{raw_str}' escapes sandbox '{self.sandbox_root}' "
                f"(resolved: '{resolved_candidate}')"
            )

        return resolved_candidate

    def safe_write(self, relative_path: str, content: str | bytes, executable: bool = False) -> Path:
        """Safely write content to a file strictly confined within the sandbox."""
        safe_path = self.resolve_safe_path(relative_path)
        safe_path.parent.mkdir(parents=True, exist_ok=True)

        if isinstance(content, bytes):
            safe_path.write_bytes(content)
        else:
            safe_path.write_text(content, encoding="utf-8")

        if executable and hasattr(safe_path, "chmod"):
            with contextlib.suppress(OSError):
                safe_path.chmod(0o755)

        return safe_path

    def safe_read(self, relative_path: str) -> str:
        """Safely read content from a file strictly confined within the sandbox."""
        safe_path = self.resolve_safe_path(relative_path)
        if not safe_path.is_file():
            raise FileNotFoundError(f"Safe read failed: file '{safe_path}' does not exist.")
        return safe_path.read_text(encoding="utf-8")


class HardenedProcessExecutor:
    """Supervised subprocess execution runner with privilege scrubbing, timeouts, and buffer bounds."""

    def __init__(
        self,
        guard: SandboxedWorkspaceGuard,
        default_timeout_sec: float = 15.0,
        max_output_bytes: int = 100_000,
    ) -> None:
        self.guard = guard
        self.default_timeout_sec = float(default_timeout_sec)
        self.max_output_bytes = int(max_output_bytes)

    def run_command(
        self,
        command: list[str] | tuple[str, ...],
        cwd_relative: str = ".",
        timeout_sec: float | None = None,
        extra_env: dict[str, str] | None = None,
    ) -> ExecutionResult:
        """Execute tokenized command array in sandbox with sanitized env, timeout, and capture bounds."""
        if isinstance(command, str) or not isinstance(command, (list, tuple)) or not command:
            raise PermissionError(
                "Shell execution denied: command must be a non-empty tokenized argument list (shell=False)."
            )

        arg_list = [str(arg) for arg in command]
        timeout = float(timeout_sec) if timeout_sec is not None else self.default_timeout_sec
        work_dir = self.guard.resolve_safe_path(cwd_relative)

        # Setup scrubbed environment
        execution_env = get_sanitized_environment(extra_env=extra_env)

        # Ensure PYTHONPATH includes workspace root and workspace/src
        src_dir = work_dir / "src"
        if src_dir.exists():
            current_pp = execution_env.get("PYTHONPATH", "")
            execution_env["PYTHONPATH"] = (
                f"{src_dir}{os.pathsep}{work_dir}{os.pathsep}{current_pp}"
                if current_pp
                else f"{src_dir}{os.pathsep}{work_dir}"
            )

        t0 = time.perf_counter()
        timed_out = False
        stdout_str = ""
        stderr_str = ""
        exit_code = -1

        try:
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

        # Enforce maximum capture bounds to prevent memory denial-of-service
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
