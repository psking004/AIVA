"""Strategic Systems Engine - Probabilistic Forecaster.

Computes expected values, scenario variance, Value-at-Risk (VaR 95%),
Conditional VaR (CVaR), and confidence intervals for candidate actions.
"""

from __future__ import annotations

import math

from sse.contracts.action import ActionDefinition
from sse.strategic.prediction.scenario_generator import Scenario


class ProbabilisticForecaster:
    """Projects outcome distributions and downside risk metrics across scenarios."""

    def evaluate_action(
        self,
        action: ActionDefinition,
        base_payoff: float,
        scenarios: list[Scenario],
    ) -> dict[str, float]:
        """Evaluates an action across scenario distributions.

        Returns:
        - expected_payoff: Probability-weighted mean
        - variance: Payoff variance
        - std_dev: Standard deviation
        - var_95: 95% Value-at-Risk (maximum loss at 5th percentile)
        - cvar_95: Conditional VaR (expected loss in the worst 5% tail)
        - ci_low: 95% Confidence Interval lower bound
        - ci_high: 95% Confidence Interval upper bound
        """
        if not scenarios:
            return {
                "expected_payoff": base_payoff,
                "variance": 0.0,
                "std_dev": 0.0,
                "var_95": max(0.0, -base_payoff),
                "cvar_95": max(0.0, -base_payoff),
                "ci_low": base_payoff,
                "ci_high": base_payoff,
            }

        # Calculate outcome for each scenario
        outcomes: list[tuple[float, float]] = []  # (payoff, probability)
        for s in scenarios:
            # Payoff adjusted by scenario modifier and action cost
            p_val = (base_payoff * s.payoff_modifier) - action.estimated_cost
            outcomes.append((p_val, s.probability))

        expected = sum(p * prob for p, prob in outcomes)
        variance = sum(prob * ((p - expected) ** 2) for p, prob in outcomes)
        std_dev = math.sqrt(max(0.0, variance))

        # Sort outcomes ascending by payoff for VaR calculation
        sorted_outcomes = sorted(outcomes, key=lambda x: x[0])

        # Compute 5th percentile (95% VaR)
        cumulative = 0.0
        var_threshold = sorted_outcomes[0][0]
        tail_losses: list[float] = []

        for p_val, prob in sorted_outcomes:
            cumulative += prob
            if cumulative <= 0.05:
                tail_losses.append(p_val)
            if cumulative >= 0.05 and not tail_losses:
                var_threshold = p_val
                tail_losses.append(p_val)

        # 95% VaR is expressed as downside loss (or negative payoff relative to 0)
        var_95 = max(0.0, -var_threshold)
        cvar_95 = max(0.0, - (sum(tail_losses) / len(tail_losses) if tail_losses else var_threshold))

        # 95% Confidence interval (approx 1.96 standard errors)
        ci_low = expected - 1.96 * std_dev
        ci_high = expected + 1.96 * std_dev

        return {
            "expected_payoff": expected,
            "variance": variance,
            "std_dev": std_dev,
            "var_95": var_95,
            "cvar_95": cvar_95,
            "ci_low": ci_low,
            "ci_high": ci_high,
        }
