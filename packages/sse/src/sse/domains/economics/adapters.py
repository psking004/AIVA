"""Economics Domain Adapter — Ingests economic market feeds, elasticities, and auctions into game tensors."""

from __future__ import annotations

from collections.abc import Sequence

from sse.domains.economics.auctions import MultiUnitAuction
from sse.domains.economics.markets import (
    DifferentiatedBertrandCompetition,
    DynamicCournotOligopoly,
)
from sse.models import FiniteNormalFormGame


class EconomicsDomainAdapter:
    """Translates market parameters, elasticities, and auction specifications into formal games."""

    @staticmethod
    def create_cournot_market_game(
        firms: Sequence[str],
        demand_intercept: float,
        demand_slope: float,
        marginal_costs: Sequence[float],
        grid_points: int = 15,
        scheme: str = "chebyshev",
    ) -> FiniteNormalFormGame:
        """Constructs a Cournot oligopoly game discretized onto a bounded Chebyshev grid."""
        oligopoly = DynamicCournotOligopoly(
            firms=firms,
            demand_a=demand_intercept,
            demand_b=demand_slope,
            marginal_costs=marginal_costs,
        )
        return oligopoly.discretize(n_points=grid_points, scheme=scheme)

    @staticmethod
    def create_bertrand_price_war_game(
        firms: Sequence[str],
        alpha: float,
        beta: float,
        gamma: float,
        marginal_costs: Sequence[float],
        price_grid: Sequence[float],
    ) -> FiniteNormalFormGame:
        """Constructs a differentiated Bertrand price competition game."""
        bertrand = DifferentiatedBertrandCompetition(
            firms=firms,
            alpha=alpha,
            beta=beta,
            gamma=gamma,
            marginal_costs=marginal_costs,
        )
        return bertrand.to_game(price_grid=price_grid)

    @staticmethod
    def create_vickrey_auction_game(
        bidders: Sequence[str],
        valuations: Sequence[float],
        bid_levels: Sequence[float],
        reserve_price: float = 0.0,
    ) -> FiniteNormalFormGame:
        """Constructs a Second-Price (Vickrey) auction game."""
        auction = MultiUnitAuction(
            bidders=bidders,
            reserve_price=reserve_price,
        )
        return auction.to_game(valuations=valuations, bid_levels=bid_levels, auction_type="vickrey")

