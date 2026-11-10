"""Business Strategy domain — Dixit Market Entry Preemption and Two-Sided Platform Pricing."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from sse.models import FiniteNormalFormGame


class DixitEntryPreemption:
    """Dixit (1979, 1980) Capital Capacity Preemption and Market Entry Deterrence.

    Stage 1: Incumbent commits to capital capacity k_1 at investment cost r * k_1.
             Marginal production cost is w for q_1 <= k_1, and w + r for q_1 > k_1.
    Stage 2: Entrant decides to Enter (e = 1) with sunk fixed entry cost F, or Stay Out (e = 0).
             If entrant enters, post-entry competition ensues.
    If k_1 >= k_preempt, entrant's maximized post-entry profit is strictly non-positive (pi_2* <= 0),
    deterring entry and securing monopoly payoff for the incumbent.
    """

    def __init__(
        self,
        demand_a: float = 120.0,
        demand_b: float = 1.0,
        variable_cost_w: float = 20.0,
        capacity_cost_r: float = 10.0,
        fixed_entry_cost_f: float = 225.0,
    ) -> None:
        self.a = demand_a
        self.b = demand_b
        self.w = variable_cost_w
        self.r = capacity_cost_r
        self.f = fixed_entry_cost_f

    def compute_preemption_thresholds(self) -> dict[str, float]:
        """Calculates analytical preemption capacity threshold and monopoly/duopoly benchmarks."""
        # Unconstrained monopoly with marginal cost w + r:
        # P(Q) = a - b*Q => MR = a - 2*b*Q = w + r => Q_M = (a - w - r) / (2*b)
        q_monopoly = (self.a - self.w - self.r) / (2.0 * self.b)
        pi_monopoly = (q_monopoly ** 2) * self.b

        # Entrant's best response function: q_2(q_1) = (a - w - r - b*q_1) / (2*b)
        # Entrant's gross operating profit: pi_2(q_1) = b * [q_2(q_1)]^2
        # Net profit = pi_2(q_1) - F.
        # Zero profit condition: b * [ (a - w - r - b*k_1) / (2*b) ]^2 = F
        # (a - w - r - b*k_1) / (2*b) = sqrt(F / b)
        # b*k_1 = (a - w - r) - 2 * sqrt(b * F)
        k_preempt = ((self.a - self.w - self.r) - 2.0 * np.sqrt(self.b * self.f)) / self.b
        k_preempt = max(0.0, float(k_preempt))

        return {
            "q_monopoly": float(q_monopoly),
            "pi_monopoly": float(pi_monopoly),
            "k_preempt": float(k_preempt),
            "fixed_entry_cost": float(self.f),
        }

    def to_game(self, capacity_levels: Sequence[float]) -> FiniteNormalFormGame:
        """Constructs normal form representation: Incumbent chooses capacity k_1; Entrant chooses Enter vs Stay_Out."""
        incumbent_actions = [f"Cap_{k:.1f}" for k in capacity_levels]
        entrant_actions = ["Enter", "Stay_Out"]

        payoffs: list[list[float]] = []
        benchmarks = self.compute_preemption_thresholds()

        for k1 in capacity_levels:
            # Post-entry outcome if entrant Enters
            # Entrant optimal response:
            q2_opt = max(0.0, (self.a - self.w - self.r - self.b * k1) / (2.0 * self.b))
            price_post = max(0.0, self.a - self.b * (k1 + q2_opt))

            pi1_enter = (price_post - self.w) * k1 - self.r * k1
            pi2_enter = (price_post - self.w - self.r) * q2_opt - self.f

            # Outcome if entrant Stays Out (incumbent produces min(k1, q_monopoly))
            q1_stay = min(k1, benchmarks["q_monopoly"])
            price_stay = max(0.0, self.a - self.b * q1_stay)
            pi1_stay = (price_stay - self.w) * q1_stay - self.r * k1
            pi2_stay = 0.0

            # Action 1: Enter
            payoffs.append([round(float(pi1_enter), 2), round(float(pi2_enter), 2)])
            # Action 2: Stay Out
            payoffs.append([round(float(pi1_stay), 2), round(float(pi2_stay), 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "dixit-entry-capacity-preemption",
            "name": "Dixit Market Entry Preemption Game",
            "players": ["Incumbent", "Entrant"],
            "actions": {
                "Incumbent": incumbent_actions,
                "Entrant": entrant_actions,
            },
            "payoffs": payoffs,
        })


class TwoSidedPlatformPricing:
    """Two-Sided Platform Pricing under Cross-Side Network Externalities (Armstrong 2006).

    Users and Developers join platform:
        U_user = alpha_cross * N_dev - p_user
        U_dev = beta_cross * N_user - p_dev
    Platform optimizes (p_user, p_dev) balancing developer subsidies (p_dev < 0 or low)
    against consumer monetization.
    """

    def __init__(
        self,
        alpha_cross: float = 0.8,
        beta_cross: float = 1.2,
        cost_per_user: float = 1.0,
        cost_per_dev: float = 2.0,
    ) -> None:
        self.alpha = alpha_cross
        self.beta = beta_cross
        self.c_user = cost_per_user
        self.c_dev = cost_per_dev

    def to_game(
        self,
        user_prices: Sequence[float] = (0.0, 5.0, 10.0),
        dev_prices: Sequence[float] = (-5.0, 0.0, 10.0),
    ) -> FiniteNormalFormGame:
        """Constructs a normal form game between Platform Strategy vs Competitor/Ecosystem response."""
        p_user_actions = [f"UserFee_{p:.1f}" for p in user_prices]
        p_dev_actions = [f"DevFee_{p:.1f}" for p in dev_prices]

        payoffs: list[list[float]] = []

        for p_u in user_prices:
            for p_d in dev_prices:
                # Equilibrium platform participation sizes
                # N_user = 100 - 5 * p_u + 10 * self.alpha * max(0.0, 10 - p_d)
                # N_dev = 50 - 2 * p_d + 5 * self.beta * max(0.0, 20 - p_u)
                n_user = max(10.0, 100.0 - 5.0 * p_u + 10.0 * self.alpha * max(0.0, 10.0 - p_d))
                n_dev = max(5.0, 50.0 - 2.0 * p_d + 5.0 * self.beta * max(0.0, 20.0 - p_u))

                platform_profit = (p_u - self.c_user) * n_user + (p_d - self.c_dev) * n_dev
                ecosystem_surplus = self.alpha * n_dev * n_user + self.beta * n_user * n_dev - p_u * n_user - p_d * n_dev

                payoffs.append([round(float(platform_profit), 2), round(float(ecosystem_surplus), 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "two-sided-platform-pricing",
            "name": "Two-Sided Platform Pricing Game",
            "players": ["Platform_Operator", "Ecosystem_Market"],
            "actions": {
                "Platform_Operator": p_user_actions,
                "Ecosystem_Market": p_dev_actions,
            },
            "payoffs": payoffs,
        })
