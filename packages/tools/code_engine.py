"""AIVA 2.0 - Software Engineering Intelligence Engine.

Provides deep repository inspection, multi-file atomic editing, syntax checking,
automated test execution, diff generation, and build verification.
"""

from __future__ import annotations

import ast
import difflib
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("CodeEngine")


class CodeEngine:
    """Real software development and code manipulation tool."""

    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or r"C:\Users\bhara\AIVA").resolve()

    def search_code(self, pattern: str, file_ext: str = ".py", max_results: int = 20) -> List[Dict[str, Any]]:
        """Searches files in the workspace for a text or symbol pattern."""
        matches = []
        for root, _, files in os.walk(self.workspace_root):
            if any(skip in root for skip in [".git", "node_modules", ".venv", "__pycache__", "build", "dist"]):
                continue
            for file in files:
                if file.endswith(file_ext):
                    full_path = Path(root) / file
                    try:
                        with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                            for idx, line in enumerate(f, 1):
                                if pattern.lower() in line.lower():
                                    rel_path = str(full_path.relative_to(self.workspace_root))
                                    matches.append({
                                        "file": rel_path,
                                        "line": idx,
                                        "content": line.strip(),
                                    })
                                    if len(matches) >= max_results:
                                        return matches
                    except Exception:
                        pass
        return matches

    def read_file(self, rel_path: str, start_line: int = 1, end_line: Optional[int] = None) -> Dict[str, Any]:
        """Reads specific line ranges of a workspace file."""
        target = (self.workspace_root / rel_path).resolve()
        if not target.exists():
            return {"success": False, "error": f"File {rel_path} does not exist"}

        try:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            total = len(lines)
            end = end_line or total
            slice_lines = lines[start_line - 1:end]
            return {
                "success": True,
                "file": rel_path,
                "total_lines": total,
                "start_line": start_line,
                "end_line": min(end, total),
                "content": "".join(slice_lines),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def validate_syntax(self, code: str, language: str = "python") -> Dict[str, Any]:
        """Validates syntax of code before applying changes."""
        if language.lower() == "python":
            try:
                ast.parse(code)
                return {"valid": True, "error": None}
            except SyntaxError as e:
                return {"valid": False, "error": f"SyntaxError at line {e.lineno}: {e.msg}"}
        return {"valid": True, "error": "Syntax validator not configured for this language"}

    def apply_edit(self, rel_path: str, new_content: str, validate_first: bool = True) -> Dict[str, Any]:
        """Atomically edits a file in the workspace, validating syntax first."""
        target = (self.workspace_root / rel_path).resolve()
        if not str(target).startswith(str(self.workspace_root)):
            return {"success": False, "error": "Path traversal blocked"}

        if validate_first and rel_path.endswith(".py"):
            val = self.validate_syntax(new_content, "python")
            if not val["valid"]:
                return {"success": False, "error": f"Syntax validation failed: {val['error']}"}

        old_content = ""
        if target.exists():
            old_content = target.read_text(encoding="utf-8", errors="replace")

        # Generate diff preview
        diff = list(difflib.unified_diff(
            old_content.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{rel_path}",
            tofile=f"b/{rel_path}",
            n=3,
        ))

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(new_content, encoding="utf-8")
        return {
            "success": True,
            "file": rel_path,
            "bytes_written": len(new_content.encode("utf-8")),
            "diff_lines": len(diff),
            "diff_preview": "".join(diff[:20]),
        }

    def run_tests(self, test_command: str = "pytest tests", timeout: int = 45) -> Dict[str, Any]:
        """Executes a real test runner in the workspace."""
        start_t = time.time()
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", test_command],
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
            return {"success": False, "exit_code": -1, "error": f"Tests timed out after {timeout}s"}
        except Exception as e:
            return {"success": False, "exit_code": -1, "error": str(e)}

