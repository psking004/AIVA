"""Strategic Systems Engine - Continuous Utility and Risk Payoff Formulator.

Constructs continuous and risk-sensitive payoff functions and produces discrete
approximations over continuous action intervals using Chebyshev or uniform grids.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from sse.models import FiniteNormalFormGame, Player


class DiscretizationScheme:
    """Strategy space discretization algorithms."""

    @staticmethod
    def uniform(min_val: float, max_val: float, n_points: int) -> np.ndarray:
        """Generates n equidistant points over [min_val, max_val]."""
        if n_points < 1:
            raise ValueError("n_points must be >= 1")
        if n_points == 1:
            return np.array([(min_val + max_val) / 2.0], dtype=np.float64)
        return np.linspace(min_val, max_val, n_points, dtype=np.float64)

    @staticmethod
    def chebyshev(min_val: float, max_val: float, n_points: int) -> np.ndarray:
        """Generates n Chebyshev extremal/node points on [min_val, max_val] to minimize Runge phenomenon."""
        if n_points < 1:
            raise ValueError("n_points must be >= 1")
        if n_points == 1:
            return np.array([(min_val + max_val) / 2.0], dtype=np.float64)

        # Roots of Chebyshev polynomial of degree n:
        # x_k = cos((2k - 1)/(2n) * pi) for k = 1..n
        k = np.arange(1, n_points + 1, dtype=np.float64)
        cheb_zeros = np.cos((2.0 * k - 1.0) / (2.0 * n_points) * np.pi)

        # Map from [-1, 1] to [min_val, max_val]
        mid = (min_val + max_val) / 2.0
        half_width = (max_val - min_val) / 2.0
        nodes = mid + half_width * cheb_zeros
        return np.sort(nodes)


@dataclass
class RiskPreferences:
    """Mathematical risk evaluation models: Mean-Variance, CARA, and CRRA."""

    risk_model: str = "mean_variance"  # "mean_variance", "cara", "crra", "risk_neutral"
    lambda_risk: float = 0.0  # Mean-variance risk aversion parameter
    alpha_cara: float = 0.01  # CARA coefficient: U(w) = -exp(-alpha * w)
    gamma_crra: float = 0.5   # CRRA relative risk coefficient: U(w) = w^(1-gamma)/(1-gamma)

    def evaluate(self, expected_wealth: float, variance: float = 0.0) -> float:
        """Evaluates utility according to configured risk preference model."""
        if self.risk_model == "risk_neutral":
            return expected_wealth

        if self.risk_model == "mean_variance":
            return expected_wealth - self.lambda_risk * variance

        if self.risk_model == "cara":
            # U(w) = -exp(-alpha * w)
            val = max(-50.0, min(50.0, -self.alpha_cara * expected_wealth))
            return -math.exp(val)

        if self.risk_model == "crra":
            # Wealth must be positive
            w = max(1e-4, expected_wealth)
            if abs(self.gamma_crra - 1.0) < 1e-6:
                return math.log(w)
            return (w ** (1.0 - self.gamma_crra)) / (1.0 - self.gamma_crra)

        return expected_wealth


@dataclass
class ContinuousPayoffFormulator:
    """Formulates continuous strategic payoffs and discretizes continuous strategy spaces into normal-form games."""

    revenue_fn: Callable[[float, float], float]  # (a1, a2) -> gross revenue for player
    cost_fn: Callable[[float], float]             # a_i -> operational cost
    risk_preferences: RiskPreferences = field(default_factory=RiskPreferences)
    variance_fn: Callable[[float, float], float] | None = None

    def compute_utility(self, a_self: float, a_other: float) -> float:
        """Computes net risk-adjusted utility U_i(a_i, a_{-i}) = GrossRevenue - Cost - RiskPenalty."""
        gross_rev = self.revenue_fn(a_self, a_other)
        cost = self.cost_fn(a_self)
        net_wealth = gross_rev - cost
        var = self.variance_fn(a_self, a_other) if self.variance_fn else 0.0
        return self.risk_preferences.evaluate(net_wealth, var)

    @classmethod
    def discretize_bimatrix_game(
        cls,
        game_id: str,
        name: str,
        player_1_formulator: ContinuousPayoffFormulator,
        player_2_formulator: ContinuousPayoffFormulator,
        interval_p1: tuple[float, float],
        interval_p2: tuple[float, float],
        grid_points_p1: int = 10,
        grid_points_p2: int = 10,
        scheme: str = "chebyshev",
    ) -> FiniteNormalFormGame:
        """Constructs a FiniteNormalFormGame by discretizing continuous action intervals."""
        disc = DiscretizationScheme.chebyshev if scheme == "chebyshev" else DiscretizationScheme.uniform
        actions_p1 = disc(interval_p1[0], interval_p1[1], grid_points_p1)
        actions_p2 = disc(interval_p2[0], interval_p2[1], grid_points_p2)

        p1_action_names = tuple(f"a1_{val:.3f}" for val in actions_p1)
        p2_action_names = tuple(f"a2_{val:.3f}" for val in actions_p2)

        players = (Player("P1", "Player 1"), Player("P2", "Player 2"))
        actions = (p1_action_names, p2_action_names)

        payoffs_list: list[tuple[float, float]] = []
        for a1 in actions_p1:
            for a2 in actions_p2:
                u1 = player_1_formulator.compute_utility(a1, a2)
                u2 = player_2_formulator.compute_utility(a2, a1)
                payoffs_list.append((float(u1), float(u2)))

        return FiniteNormalFormGame(
            id=game_id,
            name=name,
            players=players,
            actions=actions,
            payoffs=tuple(payoffs_list),
        )
