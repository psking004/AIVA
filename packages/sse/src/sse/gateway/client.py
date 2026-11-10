"""Strategic Systems Engine - AIVA Strategic Intelligence Client.

Unified SDK interface for AIVA, exposing strategic reasoning, scenario prediction,
decision formulation, bounded authorization, and controlled execution.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from sse.contracts.action import ActionDefinition, ActionResult
from sse.contracts.authorization import (
    AuthorizationRequest,
    AutonomyLevel,
    PermissionScope,
)
from sse.contracts.decision import DecisionRequest, DecisionResponse
from sse.contracts.world_state import WorldStateSnapshot
from sse.execution.dispatcher import ActionDispatcher
from sse.governance.authorization import AuthorizationGate
from sse.ingestion.telemetry_bridge import NodeTelemetry, TelemetryBridge
from sse.orchestrator.decision_engine import StrategicDecisionEngine
from sse.security.hardening import ThresholdQuorumPolicy
from sse.storage.hardened_ledger import HardenedLedger
from sse.strategic.prediction.scenario_generator import ScenarioGenerator
from sse.swarm.orchestrator import SwarmOrchestrationEngine
from sse.world_model.state_manager import WorldStateManager


class StrategicIntelligenceClient:
    """Primary AIVA interface to the Strategic Systems Engine."""

    def __init__(
        self,
        decision_engine: StrategicDecisionEngine | None = None,
        authorization_gate: AuthorizationGate | None = None,
        action_dispatcher: ActionDispatcher | None = None,
        state_manager: WorldStateManager | None = None,
    ) -> None:
        self.state_manager = state_manager or WorldStateManager()
        self.decision_engine = decision_engine or StrategicDecisionEngine(state_manager=self.state_manager)
        self.authorization_gate = authorization_gate or AuthorizationGate(state_manager=self.state_manager)
        self.dispatcher = action_dispatcher or ActionDispatcher(authorization_gate=self.authorization_gate)
        self.scenario_generator = ScenarioGenerator()
        self._decisions_cache: dict[str, DecisionResponse] = {}

    def analyse(
        self,
        context: str,
        goal: str,
        candidate_actions: list[dict[str, Any]] | None = None,
        required_confidence: float = 0.60,
        max_risk_tolerance: float = 0.40,
    ) -> DecisionResponse:
        """Analyzes a strategic situation and formulates a complete DecisionResponse."""
        request = DecisionRequest(
            context_description=context,
            goal=goal,
            candidate_actions=candidate_actions or [],
            required_confidence=required_confidence,
            max_risk_tolerance=max_risk_tolerance,
        )
        response = self.decision_engine.formulate_decision(request)
        self._decisions_cache[response.decision_id] = response
        return response

    def predict(
        self,
        action: ActionDefinition,
        snapshot: WorldStateSnapshot | None = None,
    ) -> dict[str, float]:
        """Projects outcome distributions and downside risk metrics across scenarios."""
        snap = snapshot or self.state_manager.capture_snapshot()
        scenarios = self.scenario_generator.generate_scenarios(snap)
        base_payoff = float(action.parameters.get("expected_return", 100.0))
        return self.decision_engine.evaluator.forecaster.evaluate_action(
            action=action,
            base_payoff=base_payoff,
            scenarios=scenarios,
        )

    def request_authorization(
        self,
        decision_id: str,
        action: ActionDefinition,
        requester_id: str = "aiva_orchestrator",
        autonomy_level: AutonomyLevel = AutonomyLevel.BOUNDED_AUTONOMOUS,
        scope: PermissionScope = PermissionScope.EXECUTION_LOW_RISK,
        timeout_seconds: float = 300.0,
    ) -> dict[str, Any]:
        """Requests an execution authorization grant from the AuthorizationGate."""
        decision = self._decisions_cache.get(decision_id)
        if not decision:
            return {"approved": False, "reason": "Decision ID not found"}

        snapshot = self.state_manager.capture_snapshot()
        auth_req = AuthorizationRequest(
            decision_id=decision_id,
            action_id=action.action_id,
            requester_id=requester_id,
            requested_autonomy=autonomy_level,
            requested_scope=scope,
            estimated_cost=action.estimated_cost,
            is_reversible=action.reversibility.value == "reversible",
            timeout_seconds=timeout_seconds,
        )

        auth_eval = self.authorization_gate.evaluate_authorization(
            request=auth_req,
            action=action,
            verification=decision.verification,
            baseline_snapshot=snapshot,
        )

        if auth_eval["approved"] and auth_eval["grant"]:
            decision.authorization.is_authorized = True
            decision.authorization.grant_token = auth_eval["grant"].grant_token
            decision.authorization.autonomy_level = int(autonomy_level)
            decision.state = decision.state.AUTHORIZED

        return auth_eval

    def execute(
        self,
        action: ActionDefinition,
        grant_token: str,
        parameters: dict[str, Any] | None = None,
    ) -> ActionResult:
        """Executes an authorized action through the ActionDispatcher."""
        return self.dispatcher.dispatch_action(
            action=action,
            grant_token=grant_token,
            parameters=parameters,
        )

    def rollback(self, reason: str = "Manual operator rollback") -> dict[str, Any]:
        """Triggers compensation rollback for dispatched actions."""
        return self.dispatcher.rollback_coordinator.trigger_rollback(reason=reason)

    def explain(self, decision_id: str) -> str:
        """Generates a human- and agent-readable markdown explanation of a decision."""
        decision = self._decisions_cache.get(decision_id)
        if not decision:
            return f"Decision '{decision_id}' not found."

        rec = decision.recommendation
        lines = [
            f"# Strategic Decision Explanation: {decision.decision_id}",
            f"**Problem Classification:** `{decision.problem_type.value}`",
            f"**State:** `{decision.state.value}`",
            f"**Rationale:** {decision.rationale}",
            "",
            "## Recommendation",
        ]
        if rec:
            lines.extend([
                f"- **Action:** {rec.action_name} (`{rec.selected_action_id}`)",
                f"- **Justification:** {rec.justification}",
                f"- **Reversibility:** {rec.reversibility}",
                "- **Execution Steps:**",
            ])
            for step in rec.execution_steps:
                lines.append(f"  1. {step}")
        else:
            lines.append("*(No action recommended — Engine abstained)*")

        lines.extend([
            "",
            "## Uncertainty & Risk Profile",
            f"- **Confidence Score:** {decision.uncertainty.confidence_score:.1%}",
            f"- **Value-at-Risk (95% VaR):** {decision.uncertainty.value_at_risk_95:.2f}",
            f"- **Epistemic Uncertainty:** {decision.uncertainty.epistemic_uncertainty:.2f}",
            f"- **Aleatoric Uncertainty:** {decision.uncertainty.aleatoric_uncertainty:.2f}",
            "",
            "## Evaluated Alternatives",
        ])
        for alt in decision.alternatives:
            lines.append(
                f"- **{alt.name}**: Expected Payoff = {alt.expected_payoff:.2f}, Risk = {alt.risk_score:.3f}"
            )
            for p in alt.pros:
                lines.append(f"  - [Pro] {p}")
            for c in alt.cons:
                lines.append(f"  - [Con] {c}")

        lines.extend([
            "",
            "## Governance & Verification",
            f"- **Formally Verified:** {decision.verification.is_valid}",
            f"- **Authorized for Execution:** {decision.authorization.is_authorized}",
        ])

        return "\n".join(lines)


class AivaStrategicIntelligenceClient(StrategicIntelligenceClient):
    """Authoritative AIVA interface integrating Decision Core, Swarm Engine, and Telemetry."""

    def __init__(
        self,
        decision_engine: StrategicDecisionEngine | None = None,
        authorization_gate: AuthorizationGate | None = None,
        action_dispatcher: ActionDispatcher | None = None,
        state_manager: WorldStateManager | None = None,
        telemetry_bridge: TelemetryBridge | None = None,
        quorum_policy: ThresholdQuorumPolicy | None = None,
        ledger: HardenedLedger | None = None,
        swarm_engine: SwarmOrchestrationEngine | None = None,
        node_id: str = "PC_A",
        trusted_keys: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            decision_engine=decision_engine,
            authorization_gate=authorization_gate,
            action_dispatcher=action_dispatcher,
            state_manager=state_manager,
        )
        self.node_id = node_id
        self.telemetry_bridge = telemetry_bridge or TelemetryBridge(node_id=node_id)
        if quorum_policy is not None:
            self.quorum_policy = quorum_policy
        elif trusted_keys is not None:
            self.quorum_policy = ThresholdQuorumPolicy(node_keys=trusted_keys)
        else:
            self.quorum_policy = ThresholdQuorumPolicy()
        self.ledger = ledger or HardenedLedger(node_id=node_id)
        self.swarm_engine = swarm_engine or SwarmOrchestrationEngine()

    def resolve_compute_deadlock(
        self,
        task_vram_gb: float,
        task_cpu_sec_a: float,
        task_cpu_sec_b: float,
        network_latency_sec: float = 0.12,
        telemetry_override: NodeTelemetry | None = None,
    ) -> dict[str, Any]:
        """Resolves compute allocation deadlock under live telemetry and applies Tier-1 IESDS.

        Prunes OOM configurations where task VRAM > available VRAM.
        Logs decision to hardened ledger and returns compact verdict.
        """
        alloc = self.telemetry_bridge.evaluate_live_allocation(
            task_vram_gb=task_vram_gb,
            task_cpu_sec_a=task_cpu_sec_a,
            task_cpu_sec_b=task_cpu_sec_b,
            network_latency_sec=network_latency_sec,
            telemetry_override=telemetry_override,
        )

        oom_risk = float(alloc["oom_risk"])
        target = str(alloc["target"])

        # Tier-1 IESDS: strictly prune local execution if OOM risk is present
        if oom_risk > 0.0 and target == "LOCAL_PC_A":
            u_dist = alloc["utilities"]["DISTRIBUTED"]
            u_rem = alloc["utilities"]["REMOTE_PC_B"]
            target = "DISTRIBUTED" if u_dist >= u_rem else "REMOTE_PC_B"
            alloc["target"] = target
            alloc["expected_utility"] = max(u_dist, u_rem)

        # Budgeted compact payload (< 350 chars)
        compact = (
            f"DEADLOCK_RESOLVED|target={target}|util={alloc['expected_utility']:.2f}|"
            f"vram_avail={alloc['available_vram_gb']:.2f}GB|oom_risk={int(oom_risk)}"
        )

        # Record into atomic hardened ledger
        now = time.time()
        record_data = {
            "decision_id": f"deadlock_{int(now * 1000)}",
            "timestamp": now,
            "payload": {
                "type": "COMPUTE_ALLOCATION",
                "target": target,
                "expected_utility": alloc["expected_utility"],
                "oom_risk": oom_risk,
                "task_vram_gb": task_vram_gb,
            },
        }
        self.ledger.atomic_append_record(record_data)

        return {
            "target": target,
            "expected_utility": alloc["expected_utility"],
            "available_vram_gb": alloc["available_vram_gb"],
            "oom_risk": oom_risk,
            "compact_payload": compact,
            "utilities": alloc["utilities"],
        }

    def evaluate_intent_disambiguation(
        self,
        hypotheses_probs: dict[str, float],
        misclassification_penalties: dict[str, float],
        clarification_cost: float = 8.0,
    ) -> tuple[str, str | None]:
        """Bayesian intent disambiguation via Expected Value of Perfect Information (EVPI).

        Returns:
            ("CLARIFY", prompt_string) if EVPI > clarification_cost
            ("EXECUTE", best_action) if risk is low enough to proceed frictionlessly
        """
        if not hypotheses_probs:
            return "EXECUTE", None

        total_p = sum(hypotheses_probs.values())
        if total_p <= 0.0:
            return "EXECUTE", next(iter(hypotheses_probs.keys()))

        norm_p = {h: p / total_p for h, p in hypotheses_probs.items()}

        # Compute Bayes Risk for each candidate action:
        # Taking action a when user intent is not a (probability 1 - P(a)) incurs misclassification penalty(a)
        risk_per_action: dict[str, float] = {}
        for a, p_val in norm_p.items():
            p_wrong = 1.0 - p_val
            penalty = float(misclassification_penalties.get(a, 50.0))
            risk_per_action[a] = p_wrong * penalty

        # Prior optimal action minimizing risk
        best_action, best_risk = min(risk_per_action.items(), key=lambda item: item[1])

        # Under perfect information, risk is 0, so EVPI = best_risk - 0 = best_risk
        evpi = best_risk

        if evpi > float(clarification_cost):
            sorted_h = sorted(norm_p.items(), key=lambda item: item[1], reverse=True)
            h1, p1 = sorted_h[0]
            h2, p2 = sorted_h[1] if len(sorted_h) > 1 else (h1, p1)
            prompt = (
                f"Ambiguous intent detected between '{h1}' ({p1:.1%}) and '{h2}' ({p2:.1%}) "
                f"(EVPI {evpi:.1f} > cost {clarification_cost:.1f}). Please clarify intended action."
            )
            return "CLARIFY", prompt

        return "EXECUTE", best_action

    def verify_action_clearance(
        self,
        action_name: str,
        target_entity: str,
        signatures: dict[str, str],
        timestamp: float | None = None,
    ) -> tuple[bool, str]:
        """Verify governance clearance for destructive action via 2-of-3 threshold quorum."""
        now = float(timestamp) if timestamp is not None else time.time()
        action_payload = f"{action_name}:{target_entity}"

        is_approved, msg = self.quorum_policy.verify_quorum(
            action_payload=action_payload,
            timestamp=now,
            signatures=signatures,
        )

        record_data = {
            "decision_id": f"gov_{int(now * 1000)}",
            "timestamp": now,
            "payload": {
                "type": "GOVERNANCE_CLEARANCE",
                "action": action_name,
                "target": target_entity,
                "approved": is_approved,
                "signatures_provided": list(signatures.keys()),
                "status": msg,
            },
        }
        self.ledger.atomic_append_record(record_data)
        return is_approved, msg

    def dispatch_autonomous_swarm_build(
        self,
        task_specification: str,
        export_directory: Path | str,
        project_name: str = "aiva_deliverable",
    ) -> dict[str, Any]:
        """Dispatch complex software construction to the 6-agent autonomous swarm.

        Executes Architect -> Builder -> Runtime -> Auditor -> Red Team -> Healer loop
        until all tests pass and static security analysis reports zero high/crit vulnerabilities.
        """
        export_dir = Path(export_directory).resolve()
        state = self.swarm_engine.develop_and_verify(
            specification=task_specification,
            project_name=project_name,
        )

        self.swarm_engine.export_workspace(state, export_dir)

        now = time.time()
        record_data = {
            "decision_id": f"swarm_{int(now * 1000)}",
            "timestamp": now,
            "payload": {
                "type": "SWARM_BUILD_COMPLETION",
                "project_name": project_name,
                "status": state.status.value,
                "iterations": state.iteration,
                "file_count": len(state.files),
                "export_directory": str(export_dir),
            },
        }
        self.ledger.atomic_append_record(record_data)

        compact = (
            f"SWARM_BUILD_COMPLETE|status={state.status.value}|iterations={state.iteration}|"
            f"files={len(state.files)}|dir={export_dir.name}"
        )

        return {
            "status": state.status.value,
            "iterations": state.iteration,
            "export_directory": str(export_dir),
            "file_count": len(state.files),
            "files": list(state.files.keys()),
            "vulnerabilities_remaining": len(state.vulnerabilities),
            "compact_payload": compact,
        }
