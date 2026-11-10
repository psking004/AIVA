"""Unit tests for Strategic Prediction, Forecasting, and Decision Analysis."""

from sse.contracts import ActionDefinition, Reversibility
from sse.strategic import (
    ProbabilisticForecaster,
    RegretAnalyzer,
    ScenarioGenerator,
    UncertaintyQuantifier,
    UtilityAnalyzer,
)
from sse.world_model import WorldStateManager


def test_scenario_generator_distribution():
    state_mgr = WorldStateManager()
    snapshot = state_mgr.capture_snapshot()
    gen = ScenarioGenerator()
    scenarios = gen.generate_scenarios(snapshot)

    assert len(scenarios) == 5
    total_prob = sum(s.probability for s in scenarios)
    assert abs(total_prob - 1.0) < 1e-4

    types = {s.scenario_type for s in scenarios}
    assert "base_case" in types
    assert "adversarial" in types
    assert "black_swan" in types


def test_probabilistic_forecaster():
    forecaster = ProbabilisticForecaster()
    gen = ScenarioGenerator()
    state_mgr = WorldStateManager()
    scenarios = gen.generate_scenarios(state_mgr.capture_snapshot())

    action = ActionDefinition(
        action_id="act_expand",
        name="Market Expansion",
        description="Expand into secondary market",
        target_entity="market",
        estimated_cost=10.0,
        reversibility=Reversibility.REVERSIBLE,
    )

    metrics = forecaster.evaluate_action(action, base_payoff=100.0, scenarios=scenarios)
    assert "expected_payoff" in metrics
    assert "var_95" in metrics
    assert "cvar_95" in metrics
    assert metrics["expected_payoff"] > 0
    assert metrics["ci_low"] < metrics["expected_payoff"] < metrics["ci_high"]


def test_uncertainty_quantification():
    state_mgr = WorldStateManager()
    snapshot = state_mgr.capture_snapshot()
    gen = ScenarioGenerator()
    scenarios = gen.generate_scenarios(snapshot)
    forecaster = ProbabilisticForecaster()
    action = ActionDefinition(
        action_id="act_1",
        name="Action",
        description="Desc",
        target_entity="target",
        estimated_cost=0.0,
    )
    metrics = forecaster.evaluate_action(action, base_payoff=50.0, scenarios=scenarios)

    quantifier = UncertaintyQuantifier()
    assessment = quantifier.assess_uncertainty(
        snapshot=snapshot,
        scenarios=scenarios,
        forecast_metrics=metrics,
        known_unknowns=["Competitor capacity unverified"],
    )

    assert 0.0 <= assessment.confidence_score <= 1.0
    assert 0.0 <= assessment.epistemic_uncertainty <= 1.0
    assert 0.0 <= assessment.aleatoric_uncertainty <= 1.0
    assert len(assessment.known_unknowns) >= 1


def test_utility_analyzer():
    analyzer = UtilityAnalyzer()
    # 50/50 lottery: 100 or 0
    lottery = [(100.0, 0.5), (0.0, 0.5)]

    # Risk-neutral: expected utility equals expected value (50.0)
    u_neutral = analyzer.compute_expected_utility(lottery, risk_tolerance=1.0)
    assert abs(u_neutral - 50.0) < 1e-4

    # Risk-averse: expected utility is lower than expected value
    u_averse = analyzer.compute_expected_utility(lottery, risk_tolerance=0.2)
    assert u_averse < u_neutral


def test_minimax_regret_analyzer():
    analyzer = RegretAnalyzer()
    # 2 actions, 2 scenarios
    # Action A: 10 in S1, 2 in S2
    # Action B: 6 in S1, 7 in S2
    # In S1: max is 10. Regret(A)=0, Regret(B)=4
    # In S2: max is 7. Regret(A)=5, Regret(B)=0
    # Max regret(A) = 5
    # Max regret(B) = 4
    # Minimax regret action is B (max regret 4 < 5)
    payoffs = {
        "action_A": {"S1": 10.0, "S2": 2.0},
        "action_B": {"S1": 6.0, "S2": 7.0},
    }

    best_act, min_max_regret, all_regrets = analyzer.find_minimax_regret_action(payoffs)
    assert best_act == "action_B"
    assert min_max_regret == 4.0
    assert all_regrets["action_A"] == 5.0

