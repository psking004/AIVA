"""Strategic Systems Engine - Swarm Automated Healer Agent.

Ingests test failure stack traces, stderr outputs, and security audit findings,
applying targeted source code patches to achieve test passage and security convergence.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sse.swarm.contracts import SwarmWorkspaceState


class HealerAgent:
    """Sub-agent responsible for automated code repair and vulnerability remediation."""

    def __init__(self, agent_id: str = "Healer_01") -> None:
        self.agent_id = agent_id

    def heal(self, state: SwarmWorkspaceState) -> int:
        """Analyze test failures and security findings, applying source edits.

        Returns the number of distinct patches applied.
        """
        patches_applied = 0

        # Phase 1: Remediate Security Vulnerabilities
        if state.vulnerabilities:
            state.log(f"[{self.agent_id}] Analyzing {len(state.vulnerabilities)} security findings for remediation.")
            patches_applied += self._remediate_vulnerabilities(state)

        # Phase 2: Remediate Test Failures / Syntax Errors
        failed_tests = [res for res in state.test_results if res.exit_code != 0]
        if failed_tests:
            state.log(f"[{self.agent_id}] Analyzing {len(failed_tests)} test execution failure traces.")
            patches_applied += self._remediate_test_failures(state, failed_tests)

        state.log(f"[{self.agent_id}] Healing cycle complete. Total patches applied: {patches_applied}.")
        return patches_applied

    def _remediate_vulnerabilities(self, state: SwarmWorkspaceState) -> int:
        """Apply targeted remediation for detected security vulnerabilities."""
        patches = 0

        for finding in list(state.vulnerabilities):
            file_path = finding.file_path
            if file_path not in state.files:
                continue

            artifact = state.files[file_path]
            content = artifact.content
            lines = content.splitlines()

            line_idx = finding.line_number - 1
            if line_idx < 0 or line_idx >= len(lines):
                line_idx = 0

            orig_line = lines[line_idx] if 0 <= line_idx < len(lines) else ""

            # Dynamic line search if content shifted from prior patches
            if finding.rule_id == "SEC-001":
                if not any(k in orig_line.lower() for k in ("api", "key", "token", "pass", "secret", "akia", "postgres")):
                    for i, l in enumerate(lines):
                        if any(k in l.lower() for k in ("api", "key", "token", "pass", "secret", "akia", "postgres")):
                            line_idx = i
                            orig_line = l
                            break
            elif finding.rule_id == "SEC-002":
                if not any(k in orig_line.upper() for k in ("SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE")):
                    for i, l in enumerate(lines):
                        if any(k in l.upper() for k in ("SELECT", "INSERT", "UPDATE", "DELETE", "EXECUTE")):
                            line_idx = i
                            orig_line = l
                            break
            elif finding.rule_id == "SEC-003":
                if not any(k in orig_line for k in ("eval(", "exec(", "os.system(", "shell=True")):
                    for i, l in enumerate(lines):
                        if any(k in l for k in ("eval(", "exec(", "os.system(", "shell=True")):
                            line_idx = i
                            orig_line = l
                            break

            # SEC-001: Hardcoded Secrets & Credentials
            if finding.rule_id == "SEC-001":
                # Replace assignment value with os.getenv
                # E.g., api_key = "secret_12345" -> api_key = os.getenv("API_KEY", "")
                match = re.match(r"^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*['\"][^'\"]+['\"]", orig_line)
                if match:
                    indent, var_name = match.group(1), match.group(2)
                    env_name = var_name.upper()
                    lines[line_idx] = f'{indent}{var_name} = os.getenv("{env_name}", "")'
                    # Ensure `import os` is present in file
                    new_content = "\n".join(lines) + "\n"
                    if "import os" not in new_content:
                        new_content = "import os\n" + new_content
                    state.add_file(file_path, new_content, executable=artifact.executable)
                    patches += 1

                # Database URI match: postgres://user:pass@host/db -> os.getenv("DATABASE_URL")
                elif "postgres" in orig_line:
                    lines[line_idx] = re.sub(
                        r"['\"]postgres(?:ql)?://[a-zA-Z0-9_]+:[^@\s]+@[a-zA-Z0-9_\-\.:]+/[a-zA-Z0-9_]+['\"]",
                        'os.getenv("DATABASE_URL", "postgresql://localhost/db")',
                        orig_line,
                    )
                    new_content = "\n".join(lines) + "\n"
                    if "import os" not in new_content:
                        new_content = "import os\n" + new_content
                    state.add_file(file_path, new_content, executable=artifact.executable)
                    patches += 1

            # SEC-002: SQL Injection Vectors
            elif finding.rule_id == "SEC-002":
                orig_line = lines[line_idx]
                # E.g. cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
                # -> cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                fstring_match = re.search(r'f["\'](SELECT\s+.*WHERE\s+([a-zA-Z0-9_]+)\s*=\s*)\{([a-zA-Z0-9_]+)\}["\']', orig_line, re.IGNORECASE)
                if fstring_match:
                    prefix, _col, param = fstring_match.group(1), fstring_match.group(2), fstring_match.group(3)
                    safe_call = f'"{prefix}?", ({param},)'
                    lines[line_idx] = orig_line[: fstring_match.start()] + safe_call + orig_line[fstring_match.end() :]
                    state.add_file(file_path, "\n".join(lines) + "\n", executable=artifact.executable)
                    patches += 1
                else:
                    # General replacement of dynamic f-string in execute
                    lines[line_idx] = re.sub(
                        r'execute\(\s*f["\']([^"\'\{]+)\{([^}]+)\}([^"\']*)["\']\s*\)',
                        r'execute("\1?\3", (\2,))',
                        orig_line,
                    )
                    state.add_file(file_path, "\n".join(lines) + "\n", executable=artifact.executable)
                    patches += 1

            # SEC-003: Dangerous Execution Sinks
            elif finding.rule_id == "SEC-003":
                orig_line = lines[line_idx]
                if "eval(" in orig_line:
                    lines[line_idx] = orig_line.replace("eval(", "ast.literal_eval(")
                    new_content = "\n".join(lines) + "\n"
                    if "import ast" not in new_content:
                        new_content = "import ast\n" + new_content
                    state.add_file(file_path, new_content, executable=artifact.executable)
                    patches += 1
                elif "os.system(" in orig_line:
                    # Replace with subprocess.run
                    lines[line_idx] = orig_line.replace("os.system(", "subprocess.run([") + "], check=True)"
                    new_content = "\n".join(lines) + "\n"
                    if "import subprocess" not in new_content:
                        new_content = "import subprocess\n" + new_content
                    state.add_file(file_path, new_content, executable=artifact.executable)
                    patches += 1

            # SEC-004: Missing Row-Level Security
            elif finding.rule_id == "SEC-004":
                # Find all table names in CREATE TABLE
                table_names = re.findall(r"CREATE\s+TABLE\s+([a-zA-Z0-9_]+)", content, re.IGNORECASE)
                rls_statements = [f"\nALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;" for tbl in table_names]
                if rls_statements:
                    new_content = content.rstrip() + "\n" + "\n".join(rls_statements) + "\n"
                    state.add_file(file_path, new_content, executable=artifact.executable)
                    patches += 1

        return patches

    def _remediate_test_failures(self, state: SwarmWorkspaceState, failed_tests: list[Any]) -> int:
        """Parse test failure tracebacks and apply targeted source edits."""
        patches = 0
        for test_res in failed_tests:
            stderr = test_res.stderr or test_res.stdout
            if not stderr:
                continue

            # Look for AssertionError, ValueError, NameError, ZeroDivisionError
            # Parse line information: File "...", line X
            matches = re.findall(r'File\s+["\']([^"\']+)["\'],\s+line\s+(\d+)', stderr)
            for file_str, line_num_str in matches:
                # Normalize relative path to workspace
                norm_file = file_str.replace("\\", "/")
                # Find matching file in workspace
                matching_key = None
                for k in state.files:
                    if k in norm_file or norm_file.endswith(k):
                        matching_key = k
                        break

                if not matching_key:
                    continue

                artifact = state.files[matching_key]
                line_idx = int(line_num_str) - 1
                lines = artifact.content.splitlines()

                if 0 <= line_idx < len(lines):
                    # Zero division protection
                    if "ZeroDivisionError" in stderr and "/" in lines[line_idx]:
                        # Wrap division with max check
                        lines[line_idx] = re.sub(
                            r"/\s*([a-zA-Z0-9_\.]+)",
                            r"/ max(1e-9, \1)",
                            lines[line_idx],
                        )
                        state.add_file(matching_key, "\n".join(lines) + "\n", executable=artifact.executable)
                        patches += 1

        return patches
