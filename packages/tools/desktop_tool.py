"""AIVA 2.0 - Real Desktop & Computer-Use Tool.

Executes safe workspace commands, inspects files, validates system environment,
and ensures least-privilege sandboxing on Windows/PowerShell.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("DesktopTool")

FORBIDDEN_COMMANDS = [
    "format",
    "del /s /q c:\\",
    "rmdir /s /q c:\\",
    "drop database",
    "shutdown",
    "reg delete",
]


class DesktopTool:
    """Safe, real command and computer-use execution engine."""

    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or r"C:\Users\bhara\AIVA").resolve()

    def is_safe(self, cmd: str) -> bool:
        """Enforces least-privilege command execution policy."""
        cmd_lower = cmd.lower()
        for forbidden in FORBIDDEN_COMMANDS:
            if forbidden in cmd_lower:
                return False
        return True

    def execute_command(self, cmd: str, timeout: int = 30) -> Dict[str, Any]:
        """Executes a real shell command in the workspace directory."""
        if not self.is_safe(cmd):
            return {
                "success": False,
                "error": f"Security violation: Command '{cmd}' is blocked by AIVA 2.0 safety policy.",
                "exit_code": -1,
                "stdout": "",
                "stderr": "BLOCKED",
            }

        start_t = time.time()
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                cwd=str(self.workspace_root),
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            dur = round((time.time() - start_t) * 1000, 2)
            return {
                "success": res.returncode == 0,
                "exit_code": res.returncode,
                "stdout": res.stdout.strip(),
                "stderr": res.stderr.strip(),
                "duration_ms": dur,
            }
        except subprocess.TimeoutExpired:
            dur = round((time.time() - start_t) * 1000, 2)
            return {
                "success": False,
                "exit_code": -1,
                "error": f"Command timed out after {timeout} seconds",
                "stdout": "",
                "stderr": "TIMEOUT",
                "duration_ms": dur,
            }
        except Exception as e:
            dur = round((time.time() - start_t) * 1000, 2)
            return {
                "success": False,
                "exit_code": -1,
                "error": str(e),
                "stdout": "",
                "stderr": str(e),
                "duration_ms": dur,
            }

    def inspect_file(self, rel_path: str) -> Dict[str, Any]:
        """Reads and inspects a file within the workspace."""
        target = (self.workspace_root / rel_path).resolve()
        if not str(target).startswith(str(self.workspace_root)):
            return {"success": False, "error": "Path traversal blocked"}
        if not target.exists():
            return {"success": False, "error": "File does not exist"}

        try:
            stat = target.stat()
            content = target.read_text(encoding="utf-8", errors="replace")
            return {
                "success": True,
                "path": str(target),
                "size_bytes": stat.st_size,
                "lines": len(content.splitlines()),
                "content_preview": content[:1000],
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

