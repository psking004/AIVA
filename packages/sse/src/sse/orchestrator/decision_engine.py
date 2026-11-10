"""Strategic Systems Engine - Strategic Decision Engine.

Coordinates the end-to-end 12-step strategic decision lifecycle, combining world model
snapshots, problem classification, scenario projection, multi-criteria evaluation,
verification, and abstention handling.
"""

from __future__ import annotations

import uuid

from sse.contracts.action import ActionDefinition, Reversibility
from sse.contracts.decision import (
    AuthorizationStatus,
    DecisionRequest,
    DecisionResponse,
    DecisionState,
    Recommendation,
    VerificationStatus,
)
from sse.memory.episodic import EpisodicMemory
from sse.orchestrator.classifier import ProblemClassifier
from sse.orchestrator.evaluator import DecisionEvaluator
from sse.orchestrator.solver_selector import MethodSelector
from sse.strategic.prediction.scenario_generator import ScenarioGenerator
from sse.strategic.prediction.uncertainty import UncertaintyQuantifier
from sse.verification.verifier import DecisionVerifier
from sse.world_model.state_manager import WorldStateManager


class StrategicDecisionEngine:
    """Master orchestrator executing the 12-step strategic decision lifecycle."""

    def __init__(
        self,
        state_manager: WorldStateManager | None = None,
        episodic_memory: EpisodicMemory | None = None,
        verifier: DecisionVerifier | None = None,
    ) -> None:
        self.state_manager = state_manager or WorldStateManager()
        self.episodic_memory = episodic_memory or EpisodicMemory()
        self.classifier = ProblemClassifier()
        self.method_selector = MethodSelector()
        self.scenario_generator = ScenarioGenerator()
        self.evaluator = DecisionEvaluator()
        self.uncertainty_quantifier = UncertaintyQuantifier()
        self.verifier = verifier or DecisionVerifier(state_manager=self.state_manager)

    def formulate_decision(self, request: DecisionRequest) -> DecisionResponse:
        """Executes the full 12-step decision lifecycle."""
        decision_id = str(uuid.uuid4())

        # Step 1: Capture or fetch World State Snapshot
        if request.world_state_id:
            snapshot = self.state_manager.get_snapshot(request.world_state_id) or self.state_manager.capture_snapshot()
        else:
            snapshot = self.state_manager.capture_snapshot()

        # Step 2: Classify Problem Type
        problem_type = self.classifier.classify_problem(request, snapshot)

        # Step 3: Select Analytical Methods
        methods = self.method_selector.select_methods(problem_type, request)

        # Step 4: Parse / Construct Candidate Actions
        candidates: list[ActionDefinition] = []
        if request.candidate_actions:
            for item in request.candidate_actions:
                rev_val = item.get("reversibility", "reversible")
                try:
                    reversibility = Reversibility(rev_val)
                except ValueError:
                    reversibility = Reversibility.REVERSIBLE

                act = ActionDefinition(
                    action_id=item.get("action_id", str(uuid.uuid4())),
                    name=item.get("name", "Unnamed Action"),
                    description=item.get("description", ""),
                    target_entity=item.get("target_entity", "environment"),
                    parameters=item.get("parameters", {}),
                    preconditions=item.get("preconditions", []),
                    postconditions=item.get("postconditions", []),
                    reversibility=reversibility,
                    estimated_cost=float(item.get("estimated_cost", 0.0)),
                    timeout_seconds=float(item.get("timeout_seconds", 30.0)),
                )
                candidates.append(act)
        else:
            # Generate default fallback candidate actions (Do Nothing, Expand, Consolidate)
            candidates = [
                ActionDefinition(
                    action_id="act_status_quo",
                    name="Maintain Status Quo",
                    description="Preserve current posture without commitment of new capital",
                    target_entity="system",
                    parameters={"expected_return": 10.0},
                    reversibility=Reversibility.REVERSIBLE,
                ),
                ActionDefinition(
                    action_id="act_proactive_expansion",
                    name="Proactive Strategic Initiative",
                    description="Commit resources to capture emerging strategic advantages",
                    target_entity="system",
                    parameters={"expected_return": 80.0},
                    estimated_cost=25.0,
                    reversibility=Reversibility.REVERSIBLE,
                ),
            ]

        # Step 5: Generate Scenarios
        scenarios = self.scenario_generator.generate_scenarios(snapshot)

        # Step 6: Evaluate Candidate Strategies
        alternatives = self.evaluator.evaluate_candidates(
            candidate_actions=candidates,
            scenarios=scenarios,
            snapshot=snapshot,
            risk_tolerance=request.max_risk_tolerance,
        )

        # Step 7: Assess Uncertainty
        # Pick top alternative metrics for uncertainty baseline
        top_act_def = candidates[0]
        top_metrics = self.evaluator.forecaster.evaluate_action(
            top_act_def,
            base_payoff=float(top_act_def.parameters.get("expected_return", 50.0)),
            scenarios=scenarios,
        )
        uncertainty = self.uncertainty_quantifier.assess_uncertainty(
            snapshot=snapshot,
            scenarios=scenarios,
            forecast_metrics=top_metrics,
        )

        # Step 8: Abstention Check (insufficient confidence or extreme unmanaged risk)
        if uncertainty.confidence_score < request.required_confidence:
            return DecisionResponse(
                decision_id=decision_id,
                request_id=request.request_id,
                problem_type=problem_type,
                state=DecisionState.ABSTAINED,
                recommendation=None,
                rationale=(
                    f"Abstained: Confidence score ({uncertainty.confidence_score:.2f}) is below "
                    f"required threshold ({request.required_confidence:.2f}). "
                    f"Identified information gaps: {uncertainty.known_unknowns}"
                ),
                assumptions=["Safe decision requires higher epistemic certainty"],
                risks=["High epistemic uncertainty risks catastrophic misallocation"],
                uncertainty=uncertainty,
                alternatives=alternatives,
                verification=VerificationStatus(
                    is_valid=False,
                    notes="Abstained due to insufficient confidence",
                ),
                authorization=AuthorizationStatus(
                    is_authorized=False,
                    reason="Abstained",
                ),
            )

        # Step 9: Formulate Strategic Recommendation
        chosen_alt = alternatives[0] if alternatives else None
        chosen_def = next((c for c in candidates if c.action_id == chosen_alt.action_id), candidates[0])

        recommendation = Recommendation(
            selected_action_id=chosen_def.action_id,
            action_name=chosen_def.name,
            justification=(
                f"Selected '{chosen_def.name}' yielding expected payoff of {chosen_alt.expected_payoff:.2f} "
                f"with controlled downside risk score of {chosen_alt.risk_score:.3f}. "
                f"Validated across {len(scenarios)} strategic scenarios."
            ),
            required_preconditions=chosen_def.preconditions,
            execution_steps=[
                f"Confirm target entity '{chosen_def.target_entity}' is responsive",
                f"Allocate required estimated budget of {chosen_def.estimated_cost:.2f}",
                f"Dispatch action parameters: {chosen_def.parameters}",
                "Monitor post-execution state drift",
            ],
            expected_impact={
                "expected_payoff": chosen_alt.expected_payoff,
                "risk_score": chosen_alt.risk_score,
                "reversibility": chosen_def.reversibility.value,
            },
            reversibility=chosen_def.reversibility.value,
            contingency_plans=[
                "If adverse scenario occurs, trigger rollback coordinator",
                "If market volatility exceeds 95% VaR, revert to Maintain Status Quo",
            ],
        )

        # Step 10: Formal Verification
        verification = self.verifier.verify_action_decision(
            action=chosen_def,
            baseline_snapshot=snapshot,
            expected_payoff=chosen_alt.expected_payoff,
            risk_score=chosen_alt.risk_score,
        )

        # Step 11: Construct Initial Authorization Status
        auth_status = AuthorizationStatus(
            is_authorized=False,
            autonomy_level=1,  # Advisory by default until AuthorizationGate issues grant
            reason="Pending authorization gate review",
        )

        response = DecisionResponse(
            decision_id=decision_id,
            request_id=request.request_id,
            problem_type=problem_type,
            state=DecisionState.VERIFIED if verification.is_valid else DecisionState.EVALUATED,
            recommendation=recommendation,
            rationale=(
                f"Strategic analysis under {problem_type.value} model. "
                f"Evaluated {len(alternatives)} candidate alternatives using {', '.join(methods)}. "
                f"Recommendation '{chosen_def.name}' provides the highest risk-adjusted yield."
            ),
            assumptions=[
                "World state snapshot reflects valid operational conditions",
                "Competitor agents adhere to bounded rationality bounds",
                "Scenario distribution probabilities remain stationary within decision horizon",
            ],
            risks=[
                f"Tail risk: 95% VaR is {uncertainty.value_at_risk_95:.2f}",
                "Potential competitor retaliatory reaction in adversarial scenario",
            ],
            uncertainty=uncertainty,
            alternatives=alternatives,
            verification=verification,
            authorization=auth_status,
            metadata={
                "snapshot_checksum": snapshot.calculate_checksum(),
                "analytical_methods_used": methods,
            },
        )

        # Step 12: Record in Episodic Memory
        self.episodic_memory.record_decision(request, response, snapshot)

        return response
