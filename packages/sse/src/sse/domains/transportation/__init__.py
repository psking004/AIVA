"""Transportation domain extension package."""

from sse.domains.transportation.adapters import TransportationDomainAdapter
from sse.domains.transportation.congestion import (
    BraessParadoxDetector,
    NetworkEdge,
    NetworkRoute,
    PriceOfAnarchy,
    WardropUserEquilibrium,
)
from sse.domains.transportation.models import (
    BraessParadoxGame,
    CommuteCongestionGame,
    TrafficRouteChoiceGame,
)
from sse.domains.transportation.scenarios import (
    braess_paradox,
    corridor_peak_spreading,
    two_route_commute,
)
from sse.models import FiniteNormalFormGame


class TransportationDomain:
    name = "transportation"
    description = "Traffic congestion, Braess's paradox, and commute departure time games."

    def list_scenarios(self) -> list[str]:
        return [
            "braess_paradox",
            "two_route_commute",
            "corridor_peak_spreading",
        ]

    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        factories = {
            "braess_paradox": braess_paradox,
            "two_route_commute": two_route_commute,
            "corridor_peak_spreading": corridor_peak_spreading,
        }
        if name not in factories:
            raise KeyError(f"Scenario '{name}' not found in transportation domain.")
        return factories[name]()


__all__ = [
    "BraessParadoxDetector",
    "BraessParadoxGame",
    "CommuteCongestionGame",
    "NetworkEdge",
    "NetworkRoute",
    "PriceOfAnarchy",
    "TrafficRouteChoiceGame",
    "TransportationDomain",
    "TransportationDomainAdapter",
    "WardropUserEquilibrium",
    "braess_paradox",
    "corridor_peak_spreading",
    "two_route_commute",
]
