"""Business domain extension package."""

from sse.domains.business.adapters import BusinessStrategyAdapter
from sse.domains.business.models import (
    MarketEntryGame,
    PricingCompetitionGame,
    StrategicInvestmentGame,
)
from sse.domains.business.scenarios import (
    market_entry_deterrence,
    price_war,
    rd_investment_race,
)
from sse.domains.business.strategy import (
    DixitEntryPreemption,
    TwoSidedPlatformPricing,
)
from sse.models import FiniteNormalFormGame


class BusinessDomain:
    name = "business"
    description = "Competitive pricing, market entry deterrence, and R&D investment games."

    def list_scenarios(self) -> list[str]:
        return [
            "price_war",
            "market_entry_deterrence",
            "rd_investment_race",
        ]

    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        factories = {
            "price_war": price_war,
            "market_entry_deterrence": market_entry_deterrence,
            "rd_investment_race": rd_investment_race,
        }
        if name not in factories:
            raise KeyError(f"Scenario '{name}' not found in business domain.")
        return factories[name]()


__all__ = [
    "BusinessDomain",
    "BusinessStrategyAdapter",
    "DixitEntryPreemption",
    "MarketEntryGame",
    "PricingCompetitionGame",
    "StrategicInvestmentGame",
    "TwoSidedPlatformPricing",
    "market_entry_deterrence",
    "price_war",
    "rd_investment_race",
]
