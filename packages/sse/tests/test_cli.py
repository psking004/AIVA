"""Regression and verification tests for the SSE Unified Typer CLI."""

from __future__ import annotations

import json

from typer.testing import CliRunner

from sse.cli import app

runner = CliRunner()


def test_cli_version() -> None:
    """Verifies `sse version` outputs engine version."""
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "Strategic Systems Engine" in result.output


def test_cli_doctor_self_test() -> None:
    """Verifies `sse doctor` runs complete system sanity check and returns 0."""
    result = runner.invoke(app, ["doctor"])
    assert result.exit_code == 0
    assert "PASS" in result.output
    assert "Prisoner's Dilemma" in result.output
    assert "Matching Pennies" in result.output
    assert "Peak Heap RAM Ceiling" in result.output


def test_cli_domain_list() -> None:
    """Verifies `sse domain list` displays all seven application domain packs."""
    result = runner.invoke(app, ["domain", "list"])
    assert result.exit_code == 0
    domains = [
        "Cybersecurity",
        "Economics",
        "Business Strategy",
        "Logistics",
        "Transportation",
        "Social Systems",
        "Autonomous Systems",
    ]
    for d in domains:
        assert d in result.output


def test_cli_domain_inspect_table_and_json() -> None:
    """Verifies `sse domain inspect` produces structured table and valid JSON."""
    res_table = runner.invoke(app, ["domain", "inspect", "cybersecurity"])
    assert res_table.exit_code == 0
    assert "StackelbergSecurityGame" in res_table.output

    res_json = runner.invoke(app, ["domain", "inspect", "economics", "--format", "json"])
    assert res_json.exit_code == 0
    data = json.loads(res_json.output)
    assert data["name"] == "Economics"
    assert "DynamicCournotOligopoly" in data["models"]


def test_cli_domain_run_scenarios() -> None:
    """Verifies `sse domain run` executes canonical scenarios and outputs strategic verdicts."""
    # Test cybersecurity honeypot alias
    res_cyber = runner.invoke(app, ["domain", "run", "cybersecurity", "honeypot"])
    assert res_cyber.exit_code == 0
    assert "Recommended Action" in res_cyber.output
    assert "Compact Verdict Payload" in res_cyber.output

    # Test transportation braess paradox alias
    res_trans = runner.invoke(app, ["domain", "run", "transportation", "braess"])
    assert res_trans.exit_code == 0
    assert "Route_Top" in res_trans.output


def test_cli_solve_optimized_and_exact() -> None:
    """Verifies `sse solve` on canonical benchmarks."""
    res_opt = runner.invoke(app, ["solve", "prisoners_dilemma", "--method", "optimized"])
    assert res_opt.exit_code == 0
    assert "Defect" in res_opt.output
    assert "T1_IESDS" in res_opt.output

    res_exact = runner.invoke(app, ["solve", "prisoners_dilemma", "--method", "exact"])
    assert res_exact.exit_code == 0
    assert "Pure Nash" in res_exact.output

    res_stackelberg = runner.invoke(app, ["solve", "stackelberg_market", "--method", "stackelberg"])
    assert res_stackelberg.exit_code == 0
    assert "Leader Chosen Action" in res_stackelberg.output


def test_cli_simulate_streamed_monte_carlo() -> None:
    """Verifies `sse simulate` executes streamed Monte Carlo repeated game interaction."""
    result = runner.invoke(
        app,
        [
            "simulate",
            "prisoners_dilemma",
            "--rounds",
            "200",
            "--noise",
            "0.02",
            "--policy",
            "tft",
            "--adversary",
            "greedy",
        ],
    )
    assert result.exit_code == 0
    assert "Monte Carlo Interaction Summary" in result.output
    assert "Mean Stage Payoff" in result.output
    assert "Value-at-Risk" in result.output


def test_cli_telemetry() -> None:
    """Verifies `sse telemetry` outputs both table and JSON metrics."""
    res_table = runner.invoke(app, ["telemetry"])
    assert res_table.exit_code == 0
    assert "Live Node Telemetry" in res_table.output
    assert "CPU Utilization" in res_table.output

    res_json = runner.invoke(app, ["telemetry", "--format", "json"])
    assert res_json.exit_code == 0
    data = json.loads(res_json.output.strip())
    assert data["node_id"] == "PC-A"
    assert "ram_used_gb" in data
    assert "vram_available_gb" in data


def test_cli_node_solve() -> None:
    """Verifies `sse node solve` executes sovereign solve and outputs compact payload."""
    res = runner.invoke(app, ["node", "solve", "--node-id", "PC_A", "--solo"])
    assert res.exit_code == 0
    assert "Sovereign Solve (PC_A)" in res.output
    assert "Defect" in res.output
    assert "T1_IESDS" in res.output
    assert "Compact Payload" in res.output
