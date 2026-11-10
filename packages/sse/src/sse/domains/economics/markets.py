"""Economics domain — Market competition models: Cournot Oligopoly and Differentiated Bertrand."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from sse.ingestion.payoff_formulator import DiscretizationScheme
from sse.models import FiniteNormalFormGame


class DynamicCournotOligopoly:
    """Multi-firm continuous quantity competition over linear inverse demand.

    Inverse demand: P(Q) = max(0, a - b * sum_i q_i).
    Firms have asymmetric constant marginal costs c_i and capacities K_i.
    Analytical Nash equilibrium for n firms:
        q_i^* = [a - n * c_i + sum_{j != i} c_j] / [b * (n + 1)].
    """

    def __init__(
        self,
        firms: Sequence[str] = ("Firm_1", "Firm_2"),
        demand_a: float = 120.0,
        demand_b: float = 1.0,
        marginal_costs: Sequence[float] = (20.0, 20.0),
        capacities: Sequence[float] | None = None,
    ) -> None:
        self.firms = list(firms)
        n = len(self.firms)
        self.demand_a = demand_a
        self.demand_b = demand_b

        if len(marginal_costs) != n:
            raise ValueError(f"Marginal costs count ({len(marginal_costs)}) must match firm count ({n}).")
        self.marginal_costs = np.array(marginal_costs, dtype=np.float64)

        if capacities is not None:
            if len(capacities) != n:
                raise ValueError(f"Capacities count ({len(capacities)}) must match firm count ({n}).")
            self.capacities = np.array(capacities, dtype=np.float64)
        else:
            self.capacities = np.full(n, 1e6, dtype=np.float64)

    def analytical_nash_equilibrium(self) -> np.ndarray:
        """Computes the unconstrained or capacity-bounded analytical Cournot-Nash quantities."""
        n = len(self.firms)
        a = self.demand_a
        b = self.demand_b
        costs = self.marginal_costs
        total_costs = float(np.sum(costs))

        # q_i^* = (a - (n+1)*c_i + sum_j c_j) / (b * (n + 1))
        # Note: a - n*c_i + sum_{j != i} c_j = a - (n + 1)*c_i + total_costs
        quantities = (a - (n + 1) * costs + total_costs) / (b * (n + 1))
        # Clamp to [0, capacity]
        return np.clip(quantities, 0.0, self.capacities)

    def discretize(
        self,
        n_points: int = 15,
        scheme: str = "chebyshev",
        min_q: float = 0.0,
        max_q: float | None = None,
    ) -> FiniteNormalFormGame:
        """Discretizes the continuous strategy space onto a Chebyshev or uniform grid."""
        analytical_q = self.analytical_nash_equilibrium()
        upper_q = max_q if max_q is not None else float(np.max(analytical_q) * 2.0)

        disc = DiscretizationScheme.chebyshev if scheme == "chebyshev" else DiscretizationScheme.uniform
        grid = disc(min_q, upper_q, n_points)

        actions = [f"q_{q_val:.2f}" for q_val in grid]
        payoffs: list[list[float]] = []

        if len(self.firms) != 2:
            raise NotImplementedError("Direct discrete bimatrix generator currently supports 2 firms.")

        for q1 in grid:
            for q2 in grid:
                total_Q = q1 + q2
                price = max(0.0, self.demand_a - self.demand_b * total_Q)
                pi1 = q1 * (price - self.marginal_costs[0])
                pi2 = q2 * (price - self.marginal_costs[1])
                payoffs.append([round(float(pi1), 3), round(float(pi2), 3)])

        return FiniteNormalFormGame.from_dict({
            "id": f"cournot-oligopoly-{scheme}-{n_points}",
            "name": f"Cournot Oligopoly ({scheme.capitalize()} Discretization)",
            "players": self.firms,
            "actions": {
                self.firms[0]: actions,
                self.firms[1]: actions,
            },
            "payoffs": payoffs,
        })


class DifferentiatedBertrandCompetition:
    """Differentiated products price competition.

    Demand for firm i: q_i(p_i, p_{-i}) = max(0, alpha - beta * p_i + gamma * sum_{j != i} p_j).
    Profit: pi_i = (p_i - c_i) * q_i.
    """

    def __init__(
        self,
        firms: Sequence[str] = ("Firm_1", "Firm_2"),
        alpha: float = 40.0,
        beta: float = 2.0,
        gamma: float = 1.0,
        marginal_costs: Sequence[float] = (10.0, 10.0),
    ) -> None:
        if beta <= gamma:
            raise ValueError("Beta must exceed gamma for demand stability (own price effect > cross price effect).")
        self.firms = list(firms)
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.marginal_costs = np.array(marginal_costs, dtype=np.float64)

    def analytical_equilibrium_prices(self) -> np.ndarray:
        """Solves the system of first-order conditions for differentiated Bertrand pricing."""
        # For 2 symmetric firms:
        # pi_1 = (p_1 - c_1) * (alpha - beta * p_1 + gamma * p_2)
        # d(pi_1)/dp_1 = alpha - 2*beta*p_1 + gamma*p_2 + beta*c_1 = 0
        # 2*beta*p_1 - gamma*p_2 = alpha + beta*c_1
        c1, c2 = self.marginal_costs[0], self.marginal_costs[1]
        A = np.array([[2.0 * self.beta, -self.gamma], [-self.gamma, 2.0 * self.beta]])
        b = np.array([self.alpha + self.beta * c1, self.alpha + self.beta * c2])
        p_star = np.linalg.solve(A, b)
        return np.maximum(p_star, self.marginal_costs)

    def to_game(self, price_grid: Sequence[float]) -> FiniteNormalFormGame:
        """Generates normal form game over candidate prices."""
        actions = [f"p_{p:.1f}" for p in price_grid]
        payoffs: list[list[float]] = []

        for p1 in price_grid:
            for p2 in price_grid:
                q1 = max(0.0, self.alpha - self.beta * p1 + self.gamma * p2)
                q2 = max(0.0, self.alpha - self.beta * p2 + self.gamma * p1)

                pi1 = (p1 - self.marginal_costs[0]) * q1
                pi2 = (p2 - self.marginal_costs[1]) * q2
                payoffs.append([round(float(pi1), 2), round(float(pi2), 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "differentiated-bertrand-pricing",
            "name": "Differentiated Bertrand Price Competition",
            "players": self.firms,
            "actions": {
                self.firms[0]: actions,
                self.firms[1]: actions,
            },
            "payoffs": payoffs,
        })
