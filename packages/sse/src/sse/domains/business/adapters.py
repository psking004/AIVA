"""Business Strategy Domain Adapter — Ingests competitive feeds, entry costs, and platform models."""

from __future__ import annotations

from collections.abc import Sequence

from sse.domains.business.strategy import (
    DixitEntryPreemption,
    TwoSidedPlatformPricing,
)
from sse.models import FiniteNormalFormGame


class BusinessStrategyAdapter:
    """Translates competitive market dynamics, capacity investments, and platform pricing into games."""

    @staticmethod
    def create_dixit_preemption_game(
        demand_intercept: float = 120.0,
        demand_slope: float = 1.0,
        variable_cost: float = 20.0,
        capacity_cost: float = 10.0,
        fixed_entry_cost: float = 225.0,
        capacity_levels: Sequence[float] = (30.0, 45.0, 60.0),
    ) -> FiniteNormalFormGame:
        """Constructs a Dixit entry preemption game over specified capacity choices."""
        model = DixitEntryPreemption(
            demand_a=demand_intercept,
            demand_b=demand_slope,
            variable_cost_w=variable_cost,
            capacity_cost_r=capacity_cost,
            fixed_entry_cost_f=fixed_entry_cost,
        )
        return model.to_game(capacity_levels=capacity_levels)

    @staticmethod
    def create_platform_pricing_game(
        alpha_cross: float = 0.8,
        beta_cross: float = 1.2,
        user_prices: Sequence[float] = (0.0, 5.0, 10.0),
        dev_prices: Sequence[float] = (-5.0, 0.0, 10.0),
    ) -> FiniteNormalFormGame:
        """Constructs a two-sided platform pricing and subsidy coordination game."""
        model = TwoSidedPlatformPricing(
            alpha_cross=alpha_cross,
            beta_cross=beta_cross,
        )
        return model.to_game(user_prices=user_prices, dev_prices=dev_prices)

