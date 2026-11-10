"""Strategic Systems Engine - Strategy Evaluator.

Performs multi-criteria evaluation of candidate strategies across scenario projections,
risk distributions, and utility frameworks.
"""

from __future__ import annotations

from sse.contracts.action import ActionDefinition
from sse.contracts.decision import AlternativeStrategy
from sse.contracts.world_state import WorldStateSnapshot
from sse.strategic.decision_analysis.expected_utility import UtilityAnalyzer
from sse.strategic.decision_analysis.regret import RegretAnalyzer
from sse.strategic.prediction.probabilistic import ProbabilisticForecaster
from sse.strategic.prediction.scenario_generator import Scenario


class DecisionEvaluator:
    """Evaluates and compares candidate strategies across multiple analytical dimensions."""

    def __init__(self) -> None:
        self.forecaster = ProbabilisticForecaster()
        self.regret_analyzer = RegretAnalyzer()
        self.utility_analyzer = UtilityAnalyzer()

    def evaluate_candidates(
        self,
        candidate_actions: list[ActionDefinition],
        scenarios: list[Scenario],
        snapshot: WorldStateSnapshot,
        risk_tolerance: float = 0.5,
    ) -> list[AlternativeStrategy]:
        """Evaluates each candidate action against scenarios and returns AlternativeStrategy rankings."""
        if not candidate_actions:
            return []

        # Construct payoff matrix: action_id -> scenario_name -> simulated payoff
        payoff_matrix: dict[str, dict[str, float]] = {}
        forecast_results: dict[str, dict[str, float]] = {}

        for act in candidate_actions:
            payoff_matrix[act.action_id] = {}
            # Base payoff estimation from action metadata or parameters
            base_p = float(act.parameters.get("expected_return", 100.0))

            f_metrics = self.forecaster.evaluate_action(act, base_p, scenarios)
            forecast_results[act.action_id] = f_metrics

            for s in scenarios:
                p_val = (base_p * s.payoff_modifier) - act.estimated_cost
                payoff_matrix[act.action_id][s.name] = p_val

        # Regret analysis
        best_regret_act, min_regret, _ = self.regret_analyzer.find_minimax_regret_action(payoff_matrix)

        alternatives: list[AlternativeStrategy] = []
        for act in candidate_actions:
            metrics = forecast_results[act.action_id]
            exp_payoff = metrics["expected_payoff"]
            var_95 = metrics["var_95"]

            # Normalized risk score in [0.0, 1.0]
            # Higher VaR and variance increases risk score
            std_dev = metrics["std_dev"]
            risk_score = min(1.0, max(0.0, (var_95 * 0.4 + std_dev * 0.6) / (abs(exp_payoff) + 50.0)))

            pros: list[str] = []
            cons: list[str] = []
            trade_offs: list[str] = []

            if act.action_id == best_regret_act:
                pros.append(f"Minimizes maximum regret across all scenarios (max regret: {min_regret:.2f})")
            if act.reversibility.value == "reversible":
                pros.append("Action is fully reversible")
            else:
                cons.append(f"Action is {act.reversibility.value}")

            if exp_payoff > 0:
                pros.append(f"Positive expected yield: +{exp_payoff:.2f}")
            else:
                cons.append(f"Negative expected yield: {exp_payoff:.2f}")

            trade_offs.append(f"Expected payoff {exp_payoff:.2f} vs Downside VaR-95 {var_95:.2f}")

            # Check dominance: if another action strictly dominates in every scenario
            is_dominated = False
            for other_act in candidate_actions:
                if other_act.action_id != act.action_id:
                    dominates = all(
                        payoff_matrix[other_act.action_id][s.name] >= payoff_matrix[act.action_id][s.name]
                        for s in scenarios
                    ) and any(
                        payoff_matrix[other_act.action_id][s.name] > payoff_matrix[act.action_id][s.name]
                        for s in scenarios
                    )
                    if dominates:
                        is_dominated = True
                        cons.append(f"Strictly dominated by {other_act.name}")
                        break

            alt = AlternativeStrategy(
                action_id=act.action_id,
                name=act.name,
                expected_payoff=round(exp_payoff, 2),
                risk_score=round(risk_score, 3),
                trade_offs=trade_offs,
                pros=pros,
                cons=cons,
                solver_method="probabilistic_scenario_eval",
                is_dominated=is_dominated,
            )
            alternatives.append(alt)

        # Sort alternatives by expected payoff descending (non-dominated first)
        alternatives.sort(key=lambda a: (not a.is_dominated, a.expected_payoff - (a.risk_score * 50.0)), reverse=True)
        return alternatives
