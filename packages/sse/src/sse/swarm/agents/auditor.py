"""Strategic Systems Engine - Swarm Security Auditor Agent.

Implements static security analysis targeting OWASP Top 10 vulnerabilities,
secret exposure, SQL/command injection, and dangerous execution sinks.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

from sse.swarm.contracts import VulnerabilityFinding, VulnerabilitySeverity

if TYPE_CHECKING:
    from sse.swarm.contracts import SwarmWorkspaceState


class SecurityAuditorAgent:
    """Sub-agent performing static application security testing (SAST)."""

    def __init__(self, agent_id: str = "Auditor_01") -> None:
        self.agent_id = agent_id

        # Compile security audit rule patterns
        self.secret_patterns = [
            (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS Access Key ID detected."),
            (
                re.compile(
                    r"(?:api_key|apikey|secret_key|access_token|auth_token|token|secret)\s*=\s*['\"][a-zA-Z0-9_\-\.]{16,}['\"]",
                    re.IGNORECASE,
                ),
                "Hardcoded API token or credential literal detected.",
            ),
            (
                re.compile(r"(?:password|passwd|db_password)\s*=\s*['\"][^'\"]{4,}['\"]", re.IGNORECASE),
                "Hardcoded password literal detected.",
            ),
            (
                re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
                "Hardcoded private key certificate detected.",
            ),
            (
                re.compile(r"postgres(?:ql)?://[a-zA-Z0-9_]+:[^@\s]+@[a-zA-Z0-9_\-\.:]+/[a-zA-Z0-9_]+"),
                "Database connection URI containing hardcoded credentials detected.",
            ),
        ]

        self.sqli_patterns = [
            (
                re.compile(r"f['\"].*(?:SELECT|INSERT|UPDATE|DELETE).*", re.IGNORECASE),
                "Unsafe f-string interpolation in SQL query statement (SQL injection vector).",
            ),
            (
                re.compile(r"(?:SELECT|INSERT|UPDATE|DELETE).*(?:f['\"].*\{|\.format\(|%\s*[\(\w])", re.IGNORECASE),
                "Unsafe string interpolation in SQL query statement (SQL injection vector).",
            ),
            (
                re.compile(r"execute\(\s*f['\"].*", re.IGNORECASE),
                "Dynamic f-string formatting in SQL execute call.",
            ),
        ]

        self.sink_patterns = [
            (re.compile(r"\beval\s*\("), "Dangerous execution sink: eval() invocation."),
            (re.compile(r"\bexec\s*\("), "Dangerous execution sink: exec() invocation."),
            (re.compile(r"os\.system\s*\("), "Dangerous process execution sink: os.system() invocation."),
            (
                re.compile(r"subprocess\.(?:Popen|run|call)\s*\(.*shell\s*=\s*True", re.IGNORECASE),
                "Unsafe subprocess execution with shell=True enabled.",
            ),
        ]

    def audit_content(self, file_path: str, content: str) -> list[VulnerabilityFinding]:
        """Audit raw file content against security rules line by line."""
        findings: list[VulnerabilityFinding] = []
        lines = content.splitlines()

        is_sql = file_path.endswith(".sql")
        has_create_table = False
        has_enable_rls = False

        for idx, line in enumerate(lines, start=1):
            stripped = line.strip()

            # Ignore comment lines
            if stripped.startswith(("#", "//", "--", "/*")):
                continue

            # Rule SEC-001: Hardcoded Secrets & Credentials
            for pat, desc in self.secret_patterns:
                if pat.search(line):
                    findings.append(
                        VulnerabilityFinding(
                            rule_id="SEC-001",
                            severity=VulnerabilitySeverity.CRITICAL,
                            file_path=file_path,
                            line_number=idx,
                            description=desc,
                            remediation_suggestion="Extract credential to environment variable using os.getenv() or a secret manager.",
                        )
                    )

            # Rule SEC-002: SQL Injection Vectors
            for pat, desc in self.sqli_patterns:
                if pat.search(line):
                    findings.append(
                        VulnerabilityFinding(
                            rule_id="SEC-002",
                            severity=VulnerabilitySeverity.HIGH,
                            file_path=file_path,
                            line_number=idx,
                            description=desc,
                            remediation_suggestion="Use parameterized query with parameter tuple (e.g., execute('SELECT ... WHERE id = ?', (id,))).",
                        )
                    )

            # Rule SEC-003: Dangerous Execution Sinks
            for pat, desc in self.sink_patterns:
                if pat.search(line):
                    findings.append(
                        VulnerabilityFinding(
                            rule_id="SEC-003",
                            severity=VulnerabilitySeverity.HIGH,
                            file_path=file_path,
                            line_number=idx,
                            description=desc,
                            remediation_suggestion="Replace eval/exec with ast.literal_eval or safe structured parser. Avoid shell=True.",
                        )
                    )

            # Track SQL table creation and RLS
            if is_sql:
                if re.search(r"CREATE\s+TABLE", line, re.IGNORECASE):
                    has_create_table = True
                if re.search(r"ENABLE\s+ROW\s+LEVEL\s+SECURITY", line, re.IGNORECASE):
                    has_enable_rls = True

        # Rule SEC-004: Missing Row-Level Security (RLS) in database schema
        if is_sql and has_create_table and not has_enable_rls:
            findings.append(
                VulnerabilityFinding(
                    rule_id="SEC-004",
                    severity=VulnerabilitySeverity.MEDIUM,
                    file_path=file_path,
                    line_number=1,
                    description="Database table created without Row-Level Security (RLS) enabled.",
                    remediation_suggestion="Add 'ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;' to enforce data isolation.",
                )
            )

        return findings

    def audit(self, state: SwarmWorkspaceState) -> list[VulnerabilityFinding]:
        """Audit all active artifacts in the workspace state (alias for audit_workspace)."""
        return self.audit_workspace(state)

    def audit_workspace(self, state: SwarmWorkspaceState) -> list[VulnerabilityFinding]:
        """Audit all active artifacts in the workspace state."""
        findings: list[VulnerabilityFinding] = []
        for file_path, artifact in state.files.items():
            file_findings = self.audit_content(file_path, artifact.content)
            findings.extend(file_findings)

        state.vulnerabilities = findings
        state.log(f"[{self.agent_id}] Security audit complete. Found {len(findings)} vulnerability findings.")
        return findings

    def audit_directory(self, directory: Path | str) -> list[VulnerabilityFinding]:
        """Audit files on disk inside a directory."""
        dir_path = Path(directory).resolve()
        findings: list[VulnerabilityFinding] = []

        for p in dir_path.rglob("*"):
            if p.is_file() and p.suffix in (".py", ".sql", ".sh", ".env", ".json", ".js", ".ts"):
                try:
                    content = p.read_text(encoding="utf-8")
                except OSError:
                    continue
                rel_path = str(p.relative_to(dir_path)).replace("\\", "/")
                findings.extend(self.audit_content(rel_path, content))

        return findings
