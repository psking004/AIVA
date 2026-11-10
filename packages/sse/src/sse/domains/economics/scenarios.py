"""Pre-configured economics scenarios."""

from __future__ import annotations

from sse.domains.economics.models import (
    BertrandCompetition,
    CournotCompetition,
    PublicGoodsGame,
)
from sse.models import FiniteNormalFormGame


def cournot_duopoly() -> FiniteNormalFormGame:
    """Canonical Cournot duopoly with discrete quantity choices."""
    return CournotCompetition(
        quantities=[20.0, 30.0, 40.0],
        demand_a=120.0,
        demand_b=1.0,
        marginal_cost=20.0,
    ).to_game()


def bertrand_duopoly() -> FiniteNormalFormGame:
    """Bertrand price competition showing Bertrand paradox pricing."""
    return BertrandCompetition(
        prices=[20.0, 30.0, 40.0],
        marginal_cost=20.0,
        total_market_demand=100.0,
    ).to_game()


def public_goods_3player() -> FiniteNormalFormGame:
    """3-player public goods provision dilemma."""
    return PublicGoodsGame().to_game()

