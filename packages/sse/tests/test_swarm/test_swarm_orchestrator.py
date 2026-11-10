"""Unit and Integration Tests for Autonomous Sub-Agent Swarm Orchestration Engine."""

from __future__ import annotations

from pathlib import Path

from typer.testing import CliRunner

from sse.cli import app
from sse.swarm.agents.architect import ArchitectAgent
from sse.swarm.agents.auditor import SecurityAuditorAgent
from sse.swarm.agents.healer import HealerAgent
from sse.swarm.contracts import (
    SwarmWorkspaceState,
    TaskStatus,
    VulnerabilitySeverity,
)
from sse.swarm.orchestrator import SwarmOrchestrationEngine

runner = CliRunner()


def test_architect_agent_decomposition() -> None:
    """Verify ArchitectAgent deconstructs specifications into structured blueprints."""
    architect = ArchitectAgent()

    # Rate Limiting Blueprint
    bp_rate = architect.design("Implement a thread-safe token bucket rate limiter with burst control")
    assert bp_rate.domain == "rate_limiting"
    assert len(bp_rate.components) >= 2
    assert "src/limiter/token_bucket.py" in bp_rate.files_to_generate
    assert len(bp_rate.test_requirements) >= 3

    # Cryptography Blueprint
    bp_crypto = architect.design("Implement PBKDF2 key derivation and HMAC signing service")
    assert bp_crypto.domain == "cryptography"
    assert "src/crypto/kdf.py" in bp_crypto.files_to_generate
    assert "src/crypto/signer.py" in bp_crypto.files_to_generate


def test_security_auditor_detection() -> None:
    """Verify SecurityAuditorAgent accurately detects OWASP/CWE security vulnerabilities."""
    auditor = SecurityAuditorAgent()

    vulnerable_py = """import os
# Hardcoded AWS key
aws_key = "AKIA1234567890ABCDEF"
db_password = "super_secret_password_123"

def run_query(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    return query

def dangerous_eval(expr):
    return eval(expr)
"""
    findings = auditor.audit_content("vulnerable.py", vulnerable_py)

    rule_ids = {f.rule_id for f in findings}
    assert "SEC-001" in rule_ids  # Hardcoded secret
    assert "SEC-002" in rule_ids  # SQL injection
    assert "SEC-003" in rule_ids  # eval sink

    # Check severities
    crit_count = sum(1 for f in findings if f.severity == VulnerabilitySeverity.CRITICAL)
    high_count = sum(1 for f in findings if f.severity == VulnerabilitySeverity.HIGH)
    assert crit_count >= 2  # AWS key and password
    assert high_count >= 2  # SQLi and eval


def test_healer_vulnerability_remediation(tmp_path: Path) -> None:
    """Verify HealerAgent applies targeted patches to eliminate vulnerabilities."""
    auditor = SecurityAuditorAgent()
    healer = HealerAgent()

    state = SwarmWorkspaceState(project_name="healing_test", root_path=tmp_path)

    vulnerable_code = """
api_key = "prod_api_token_1234567890"

def calculate(user_expr):
    return eval(user_expr)
"""
    state.add_file("app.py", vulnerable_code)

    # Initial audit should detect secrets and eval
    initial_findings = auditor.audit_workspace(state)
    assert len(initial_findings) >= 2
    assert state.has_critical_or_high_vulnerabilities()

    # Apply healing
    patches = healer.heal(state)
    assert patches >= 2

    # Post-healing audit must be clean of CRITICAL/HIGH findings
    clean_findings = auditor.audit_workspace(state)
    assert not state.has_critical_or_high_vulnerabilities()
    assert len(clean_findings) == 0

    healed_content = state.files["app.py"].content
    assert 'os.getenv("API_KEY"' in healed_content
    assert "ast.literal_eval" in healed_content


def test_swarm_e2e_rate_limiter_lifecycle(tmp_path: Path) -> None:
    """Verify autonomous swarm builds, tests, audits, and completes rate limiter package."""
    engine = SwarmOrchestrationEngine(workspace_base_dir=tmp_path, max_iterations=3)

    state = engine.execute_lifecycle(
        task_specification="Construct a thread-safe token bucket rate limiter with burst control and middleware",
    )

    # Assert lifecycle reached completion
    assert state.status == TaskStatus.COMPLETED
    assert state.iteration_count >= 1
    assert not state.has_critical_or_high_vulnerabilities()

    # Assert files exist
    assert "src/limiter/token_bucket.py" in state.files
    assert "tests/test_token_bucket.py" in state.files
    assert "tests/test_adversarial.py" in state.files

    # Assert tests executed and passed
    assert len(state.test_results) >= 1
    assert state.test_results[0].exit_code == 0
    assert not state.test_results[0].timed_out

    # Verify export capability
    export_dir = tmp_path / "exported_limiter"
    engine.export_workspace(state, export_dir)
    assert (export_dir / "src/limiter/token_bucket.py").exists()
    assert (export_dir / "run_tests.py").exists()


def test_swarm_e2e_crypto_lifecycle(tmp_path: Path) -> None:
    """Verify autonomous swarm builds, tests, audits, and completes cryptographic service."""
    engine = SwarmOrchestrationEngine(workspace_base_dir=tmp_path, max_iterations=3)

    state = engine.execute_lifecycle(
        task_specification="Construct a cryptographic PBKDF2 key derivation and HMAC signing service with adversarial tests",
    )

    assert state.status == TaskStatus.COMPLETED
    assert state.test_results[0].exit_code == 0
    assert not state.has_critical_or_high_vulnerabilities()
    assert "src/crypto/kdf.py" in state.files
    assert "src/crypto/signer.py" in state.files


def test_cli_swarm_audit(tmp_path: Path) -> None:
    """Verify CLI `sse swarm audit` inspects directory and emits audit table."""
    test_file = tmp_path / "test_script.py"
    test_file.write_text('token = "secret_token_1234567890"\n', encoding="utf-8")

    res = runner.invoke(app, ["swarm", "audit", "--target-dir", str(tmp_path)])
    assert res.exit_code == 0
    assert "Security Audit Report" in res.output
    assert "SEC-001" in res.output


def test_cli_swarm_run(tmp_path: Path) -> None:
    """Verify CLI `sse swarm run` initiates autonomous multi-agent pipeline and exports files."""
    out_dir = tmp_path / "exported_crypto"
    res = runner.invoke(
        app,
        [
            "swarm",
            "run",
            "--task",
            "Build cryptographic PBKDF2 key derivation and signing service",
            "--output-dir",
            str(out_dir),
            "--max-iterations",
            "3",
        ],
    )
    assert res.exit_code == 0
    assert "Swarm convergence achieved!" in res.output
    assert (out_dir / "src/crypto/kdf.py").exists()
    assert (out_dir / "run_tests.py").exists()
