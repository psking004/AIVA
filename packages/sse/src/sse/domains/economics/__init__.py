"""Economics domain extension package."""

from sse.domains.economics.adapters import EconomicsDomainAdapter
from sse.domains.economics.auctions import MultiUnitAuction
from sse.domains.economics.markets import (
    DifferentiatedBertrandCompetition,
    DynamicCournotOligopoly,
)
from sse.domains.economics.models import (
    BertrandCompetition,
    CournotCompetition,
    PublicGoodsGame,
)
from sse.domains.economics.scenarios import (
    bertrand_duopoly,
    cournot_duopoly,
    public_goods_3player,
)
from sse.models import FiniteNormalFormGame


class EconomicsDomain:
    name = "economics"
    description = "Cournot/Bertrand market competition, auction design, and public goods games."

    def list_scenarios(self) -> list[str]:
        return [
            "cournot_duopoly",
            "bertrand_duopoly",
            "public_goods_3player",
        ]

    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        factories = {
            "cournot_duopoly": cournot_duopoly,
            "bertrand_duopoly": bertrand_duopoly,
            "public_goods_3player": public_goods_3player,
        }
        if name not in factories:
            raise KeyError(f"Scenario '{name}' not found in economics domain.")
        return factories[name]()


__all__ = [
    "BertrandCompetition",
    "CournotCompetition",
    "DifferentiatedBertrandCompetition",
    "DynamicCournotOligopoly",
    "EconomicsDomain",
    "EconomicsDomainAdapter",
    "MultiUnitAuction",
    "PublicGoodsGame",
    "bertrand_duopoly",
    "cournot_duopoly",
    "public_goods_3player",
]
