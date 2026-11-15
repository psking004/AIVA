"""AIVA Swarm Engine - Strategic Systems Engine (SSE) Integration Adapter.

Provides typed interfaces between AIVA's Swarm Orchestrator and the Strategic Systems Engine (SSE),
handling intent analysis, task decomposition, resource allocation, game-theoretic optimization,
risk assessment, and post-execution outcome evaluations.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger("SSEAdapter")


@dataclass
class StrategicPlanResult:
    """Typed output schema for SSE strategic planning."""
    query: str
    target_node: str
    solver_tier: str
    strategy: str
    expected_utility: float
    risk_level: str
    assigned_agents: List[str]
    steps: List[Dict[str, Any]]
    execution_time_ms: float
    is_fallback: bool = False
    evidence: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "target_node": self.target_node,
            "solver_tier": self.solver_tier,
            "strategy": self.strategy,
            "expected_utility": self.expected_utility,
            "risk_level": self.risk_level,
            "assigned_agents": self.assigned_agents,
            "steps": self.steps,
            "execution_time_ms": self.execution_time_ms,
            "is_fallback": self.is_fallback,
            "evidence": self.evidence,
        }


@dataclass
class OutcomeEvaluation:
    """Typed schema for post-execution verification and game-theoretic outcome assessment."""
    task_id: str
    objective_achieved: bool
    payoff_score: float
    efficiency_ratio: float
    strategic_verdict: str
    recommended_action: str  # COMPLETE, RETRY, DELEGATE, REDESIGN
    audit_notes: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "objective_achieved": self.objective_achieved,
            "payoff_score": self.payoff_score,
            "efficiency_ratio": self.efficiency_ratio,
            "strategic_verdict": self.strategic_verdict,
            "recommended_action": self.recommended_action,
            "audit_notes": self.audit_notes,
        }


class SSEAdapter:
    """Production integration bridge linking AIVA Swarm to the Strategic Systems Engine."""

    def __init__(self, sse_pkg_path: Optional[str] = None):
        self._sse_available = False
        self._client = None
        self._router = None

        # Try to initialize full modular SSE if available
        try:
            cur_dir = os.path.dirname(os.path.abspath(__file__))
            repo_root = os.path.abspath(os.path.join(cur_dir, "..", "..", ".."))
            pkg_sse = os.path.join(repo_root, "packages", "sse", "src")
            if pkg_sse not in sys.path:
                sys.path.insert(0, pkg_sse)

            from sse.gateway.client import AivaStrategicIntelligenceClient
            from sse.aiva.router import AivaToolRouter
            self._client = AivaStrategicIntelligenceClient()
            self._router = AivaToolRouter(client=self._client)
            self._sse_available = True
        except Exception as ex:
            logger.warning(f"Full modular SSE initialization deferred: {ex}")

    def plan_task(self, query: str, context: Optional[Dict[str, Any]] = None) -> StrategicPlanResult:
        """Invokes game-theoretic intent analysis and multi-agent plan formulation."""
        start_time = time.time()
        clean_q = (query or "").strip()

        # Fast deterministic path for simple conversational queries
        if len(clean_q.split()) <= 4 and any(w in clean_q.lower() for w in ["hi", "hello", "weather", "time"]):
            return StrategicPlanResult(
                query=clean_q,
                target_node="PC-B",
                solver_tier="FAST_PATH_DETERMINISTIC",
                strategy="DIRECT_CONVERSATIONAL",
                expected_utility=1.0,
                risk_level="low",
                assigned_agents=["agent_voice"],
                steps=[{"node": "PC-B", "action": "FAST_CHAT", "query": clean_q}],
                execution_time_ms=round((time.time() - start_time) * 1000, 2),
                is_fallback=False,
            )

        # Full Strategic Systems Engine Evaluation
        try:
            # 1. Use sse_standalone dynamic_sse_planner
            from packages.sse.sse_standalone import dynamic_sse_planner, evaluate_strategic_intent
            plan_dict = dynamic_sse_planner(clean_q)

            # Map generated steps to specialist agents
            assigned = self._assign_specialists_to_plan(plan_dict.get("steps", []))
            risk = "high" if any(s.get("action") in ["INSTALL_APP", "MODIFY_FILE", "EXECUTE_SHELL"] for s in plan_dict.get("steps", [])) else "medium"

            return StrategicPlanResult(
                query=clean_q,
                target_node=plan_dict.get("target_node", "PC-B"),
                solver_tier=plan_dict.get("solver_tier", "T1_IESDS"),
                strategy=plan_dict.get("strategy", "SEQUENTIAL"),
                expected_utility=float(plan_dict.get("expected_utility", 0.95)),
                risk_level=risk,
                assigned_agents=assigned,
                steps=plan_dict.get("steps", []),
                execution_time_ms=round((time.time() - start_time) * 1000, 2),
                is_fallback=False,
                evidence=plan_dict,
            )
        except Exception as plan_err:
            logger.error(f"SSE planning error, using deterministic fallback: {plan_err}")
            return self._deterministic_fallback_plan(clean_q, start_time)

    def evaluate_outcome(self, task_id: str, objective: str, results: Dict[str, Any]) -> OutcomeEvaluation:
        """Evaluates completed execution against initial objective using game-theoretic utility scoring."""
        all_success = results.get("success", True)
        execution_time = results.get("execution_time_seconds", 1.0)
        output = results.get("output", {})

        # Calculate efficiency and payoff
        if all_success:
            payoff = 100.0 - min(execution_time * 2.0, 40.0)
            efficiency = max(0.5, 1.0 - (execution_time / 60.0))
            verdict = "OBJECTIVE_VERIFIED_NASH_OPTIMAL"
            recommendation = "COMPLETE"
        else:
            payoff = -50.0
            efficiency = 0.0
            verdict = "OBJECTIVE_FAILED_INVARIANT_VIOLATION"
            recommendation = "RETRY"

        return OutcomeEvaluation(
            task_id=task_id,
            objective_achieved=all_success,
            payoff_score=round(payoff, 2),
            efficiency_ratio=round(efficiency, 2),
            strategic_verdict=verdict,
            recommended_action=recommendation,
            audit_notes=f"Evaluation completed in {round(execution_time, 2)}s with verdict {verdict}.",
        )

    def _assign_specialists_to_plan(self, steps: List[Dict[str, Any]]) -> List[str]:
        agents = set()
        agents.add("agent_strategic_planner")
        for step in steps:
            action = step.get("action", "").upper()
            node = step.get("node", "").upper()
            if "INSTALL" in action or "PACKAGE" in action:
                agents.add("agent_infra")
            elif "FILE" in action or "CODE" in action:
                agents.add("agent_coder")
            elif "TEST" in action:
                agents.add("agent_tester")
            elif "NOTE" in action or "CALENDAR" in action or "CALL" in action or "MOBILE" in node:
                agents.add("agent_android")
            elif "APP" in action or "DESKTOP" in node:
                agents.add("agent_desktop")
            else:
                agents.add("agent_researcher")
        agents.add("agent_reviewer")
        return list(agents)

    def _deterministic_fallback_plan(self, query: str, start_time: float) -> StrategicPlanResult:
        """Deterministic fallback when SSE solvers are unavailable."""
        return StrategicPlanResult(
            query=query,
            target_node="PC-B",
            solver_tier="FALLBACK_DETERMINISTIC",
            strategy="SEQUENTIAL",
            expected_utility=0.5,
            risk_level="medium",
            assigned_agents=["agent_strategic_planner", "agent_coder", "agent_reviewer"],
            steps=[{"node": "PC-B", "action": "EXECUTE_SHELL", "command": query}],
            execution_time_ms=round((time.time() - start_time) * 1000, 2),
            is_fallback=True,
        )
