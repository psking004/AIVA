"""Pre-configured transportation scenarios."""

from __future__ import annotations

from sse.domains.transportation.models import (
    BraessParadoxGame,
    CommuteCongestionGame,
    TrafficRouteChoiceGame,
)
from sse.models import FiniteNormalFormGame


def braess_paradox() -> FiniteNormalFormGame:
    return BraessParadoxGame().to_game()


def two_route_commute() -> FiniteNormalFormGame:
    return TrafficRouteChoiceGame().to_game()


def corridor_peak_spreading() -> FiniteNormalFormGame:
    return CommuteCongestionGame().to_game()

