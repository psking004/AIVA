"""Unit tests for the Memory and Continuous Learning Package."""


from sse.contracts import (
    AlternativeStrategy,
    AuthorizationStatus,
    DecisionRequest,
    DecisionResponse,
    DecisionState,
    ProblemType,
    Recommendation,
    UncertaintyAssessment,
    VerificationStatus,
)
from sse.memory import (
    EpisodicMemory,
    ModelRegistry,
    ModelStage,
    StrategicMemory,
)
from sse.world_model import WorldStateManager


def _sample_decision(action_id: str, expected_payoff: float) -> DecisionResponse:
    rec = Recommendation(
        selected_action_id=action_id,
        action_name=f"Action {action_id}",
        justification="Test",
    )
    alt = AlternativeStrategy(
        action_id=action_id,
        name=f"Action {action_id}",
        expected_payoff=expected_payoff,
        risk_score=0.1,
        solver_method="nash_solver",
    )
    uncertainty = UncertaintyAssessment(
        confidence_score=0.9,
        epistemic_uncertainty=0.05,
        aleatoric_uncertainty=0.05,
        value_at_risk_95=5.0,
        confidence_interval_low=expected_payoff - 5.0,
        confidence_interval_high=expected_payoff + 5.0,
    )
    return DecisionResponse(
        decision_id="dec_001",
        request_id="req_001",
        problem_type=ProblemType.TWO_PLAYER_GENERAL_SUM,
        state=DecisionState.COMPLETED,
        recommendation=rec,
        rationale="Optimal",
        assumptions=[],
        risks=[],
        uncertainty=uncertainty,
        alternatives=[alt],
        verification=VerificationStatus(is_valid=True),
        authorization=AuthorizationStatus(is_authorized=True),
    )


def test_episodic_memory_lifecycle():
    mem = EpisodicMemory()
    state_mgr = WorldStateManager()
    snap = state_mgr.capture_snapshot()

    req = DecisionRequest(context_description="Market entry", goal="Maximize share")
    resp = _sample_decision("act_enter", expected_payoff=100.0)

    ep_id = mem.record_decision(req, resp, snap)
    assert ep_id is not None

    ep = mem.get_episode(ep_id)
    assert ep.executed_action_id == "act_enter"
    assert ep.resolved_at is None

    # Resolve with real outcome
    resolved = mem.record_outcome(ep_id, realized_payoff=95.0, realized_outcome={"revenue": 95.0})
    assert resolved.resolved_at is not None
    assert resolved.realized_payoff == 95.0
    # Prediction variance = 95 - 100 = -5.0
    assert resolved.prediction_variance == -5.0


def test_strategic_memory_solver_calibration():
    episodic = EpisodicMemory()
    state_mgr = WorldStateManager()
    snap = state_mgr.capture_snapshot()

    # Episode 1: expected 100, realized 90 (error -10)
    req1 = DecisionRequest(context_description="Case 1", goal="Goal 1")
    resp1 = _sample_decision("act_1", expected_payoff=100.0)
    ep1 = episodic.record_decision(req1, resp1, snap)
    episodic.record_outcome(ep1, realized_payoff=90.0)

    # Episode 2: expected 50, realized 60 (error +10)
    req2 = DecisionRequest(context_description="Case 2", goal="Goal 2")
    resp2 = _sample_decision("act_2", expected_payoff=50.0)
    ep2 = episodic.record_decision(req2, resp2, snap)
    episodic.record_outcome(ep2, realized_payoff=60.0)

    strategic = StrategicMemory(episodic_memory=episodic)
    calib = strategic.calculate_solver_calibration()

    assert "nash_solver" in calib
    nash_calib = calib["nash_solver"]
    assert nash_calib["samples"] == 2.0
    # Bias = (-10 + 10)/2 = 0.0
    assert abs(nash_calib["bias"]) < 1e-4
    # MAE = (10 + 10)/2 = 10.0
    assert abs(nash_calib["mae"] - 10.0) < 1e-4


def test_model_registry_offline_evaluation_gate():
    registry = ModelRegistry()
    registry.register_model_version(
        model_name="strategic_classifier_v1",
        version="1.0.0",
        description="Classifier baseline",
    )

    # Attempt to promote before offline evaluation -> Fails
    assert not registry.promote_to_production("strategic_classifier_v1", "1.0.0")

    # Record passing offline evaluation
    rec = registry.record_offline_evaluation(
        model_name="strategic_classifier_v1",
        version="1.0.0",
        score=0.92,
        metrics={"f1": 0.92, "accuracy": 0.94},
    )
    assert rec.passed_offline_eval

    # Promote to production -> Succeeds
    promoted = registry.promote_to_production("strategic_classifier_v1", "1.0.0")
    assert promoted

    prod_version = registry.get_production_version("strategic_classifier_v1")
    assert prod_version is not None
    assert prod_version.version == "1.0.0"
    assert prod_version.stage == ModelStage.PRODUCTION
