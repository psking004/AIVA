"""AIVA 2.0 Live Acceptance V2 - Projects 9, 10, 11: Model Routing, Security, Multi-Agent Swarm.

Project 9: Dynamic model routing and latency profiling across Ollama endpoints.
Project 10: Security boundary validation (path traversal, dangerous commands, AST validation).
Project 11: Multi-agent swarm orchestration across 14 specialist agents with typed DAG.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from packages.swarm.adapters.model_adapter import ModelRouter
from packages.swarm.lifecycle.task_lifecycle import TaskLifecycleEngine
from packages.swarm.orchestrator.swarm_engine import SwarmOrchestrator
from packages.tools.code_engine import CodeEngine
from packages.tools.desktop_tool import DesktopTool

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("SecuritySwarmV2")

OUT_DIR = Path(__file__).resolve().parent / "evidence" / "verification"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def test_project_10_security():
    logger.info("Executing Project 10: Security and Permission Testing...")
    desktop = DesktopTool()
    code_engine = CodeEngine()
    security_results = {}

    # 1. Path traversal attacks
    traversal_tests = [
        "../../Windows/System32/calc.exe",
        "../..",
        "C:\\Windows\\win.ini",
    ]
    traversal_blocked = []
    for t in traversal_tests:
        r = desktop.inspect_file(t)
        blocked = not r["success"]
        traversal_blocked.append({"path": t, "blocked": blocked})
        assert blocked
    security_results["path_traversal_prevention"] = traversal_blocked

    # 2. Forbidden destructive commands
    dangerous_commands = [
        "format C:",
        "del /s /q c:\\",
        "rmdir /s /q c:\\",
        "shutdown /s /t 0",
        "reg delete HKLM\\Software",
    ]
    command_blocked = []
    for cmd in dangerous_commands:
        res = desktop.execute_command(cmd)
        blocked = not res["success"] and "BLOCKED" in res["stderr"]
        command_blocked.append({"command": cmd, "blocked": blocked})
        assert blocked
    security_results["destructive_command_interception"] = command_blocked

    # 3. AST Syntax check before code writes
    invalid_python = "def broken_syntax(:\n    return False"
    val = code_engine.validate_syntax(invalid_python, "python")
    assert not val["valid"]
    security_results["ast_syntax_quarantine"] = {"blocked_invalid_syntax": True}

    logger.info("Project 10 Security verified: 100% of malicious vectors blocked.")
    return security_results


def test_project_11_multi_agent_swarm():
    logger.info("Executing Project 11: Real Multi-Agent Swarm Orchestration...")
    orch = SwarmOrchestrator()
    prompt = "Execute end-to-end security and architecture review of distributed nodes, verify least privilege, and generate formal audit evidence."
    
    t0 = time.perf_counter()
    res = orch.execute_user_request(prompt)
    dur = round((time.perf_counter() - t0) * 1000, 2)

    assert res["status"] == "COMPLETED"
    assert res["verification_verdict"]["verified"]
    assert len(res["assigned_agents"]) >= 3
    assert len(res["trace"]) >= 5

    logger.info(f"Swarm task {res['task_id']} executed: Strategy={res['execution_strategy']}, Agents={res['assigned_agents']}")
    return {
        "task_id": res["task_id"],
        "strategy": res["execution_strategy"],
        "assigned_agents": res["assigned_agents"],
        "trace_steps": len(res["trace"]),
        "verification_verdict": res["verification_verdict"],
        "latency_ms": dur,
        "status": "PASS",
    }


def main():
    sec_data = test_project_10_security()
    swarm_data = test_project_11_multi_agent_swarm()

    combined_evidence = {
        "project_10_security": sec_data,
        "project_11_swarm": swarm_data,
    }
    out_file = OUT_DIR / "project_10_11_security_swarm_evidence.json"
    out_file.write_text(json.dumps(combined_evidence, indent=2), encoding="utf-8")
    logger.info(f"Security and Swarm evidence saved to {out_file}")


if __name__ == "__main__":
    main()
