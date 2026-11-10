"""Pre-configured autonomous systems scenarios."""

from __future__ import annotations

from sse.domains.autonomous.models import (
    IntersectionCoordinationGame,
    MultiRobotPatrolGame,
    SpectrumSharingGame,
)
from sse.models import FiniteNormalFormGame


def autonomous_intersection() -> FiniteNormalFormGame:
    return IntersectionCoordinationGame().to_game()


def dynamic_spectrum_access() -> FiniteNormalFormGame:
    return SpectrumSharingGame().to_game()


def cooperative_perimeter_patrol() -> FiniteNormalFormGame:
    return MultiRobotPatrolGame().to_game()

