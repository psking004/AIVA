"""Strategic Systems Engine - Expected Utility Evaluator.

Applies decision-theoretic utility functions (risk-neutral, risk-averse CARA)
to evaluate candidate actions under risk preferences.
"""

from __future__ import annotations

import math


class UtilityAnalyzer:
    """Evaluates expected utility under risk-aversion parameters."""

    @staticmethod
    def cara_utility(x: float, alpha: float) -> float:
        """Constant Absolute Risk Aversion (CARA) utility function.

        u(x) = (1 - exp(-alpha * x)) / alpha for alpha != 0, else x.
        """
        if abs(alpha) < 1e-6:
            return x
        # Bound extreme values to prevent numerical overflow
        val = max(-50.0, min(50.0, -alpha * x))
        return (1.0 - math.exp(val)) / alpha

    def compute_expected_utility(
        self,
        payoff_distribution: list[tuple[float, float]],  # List of (payoff, probability)
        risk_tolerance: float = 0.5,  # [0.0 = extreme risk averse, 1.0 = risk neutral]
    ) -> float:
        """Computes expected utility across probability-weighted outcomes."""
        if not payoff_distribution:
            return 0.0

        # Map risk_tolerance to CARA alpha:
        # risk_tolerance 1.0 -> alpha = 0.0 (risk neutral)
        # risk_tolerance 0.0 -> alpha = 1.0 (strongly risk averse)
        alpha = max(0.0, (1.0 - risk_tolerance))

        utilities = [
            prob * self.cara_utility(payoff, alpha)
            for payoff, prob in payoff_distribution
        ]
        return float(sum(utilities))
