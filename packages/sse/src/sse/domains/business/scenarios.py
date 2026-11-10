"""Pre-configured business strategy scenarios."""

from __future__ import annotations

from sse.domains.business.models import (
    MarketEntryGame,
    PricingCompetitionGame,
    StrategicInvestmentGame,
)
from sse.models import FiniteNormalFormGame


def price_war() -> FiniteNormalFormGame:
    return PricingCompetitionGame().to_game()


def market_entry_deterrence() -> FiniteNormalFormGame:
    return MarketEntryGame().to_game()


def rd_investment_race() -> FiniteNormalFormGame:
    return StrategicInvestmentGame().to_game()

