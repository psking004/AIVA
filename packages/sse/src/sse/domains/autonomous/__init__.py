"""Autonomous systems domain extension package."""

from sse.domains.autonomous.adapters import AutonomousCoordinationAdapter
from sse.domains.autonomous.coordination import (
    SharedPriorityArbitration,
    SpatialAgentState,
    SpatialCorridorVelocityGame,
)
from sse.domains.autonomous.models import (
    IntersectionCoordinationGame,
    MultiRobotPatrolGame,
    SpectrumSharingGame,
)
from sse.domains.autonomous.scenarios import (
    autonomous_intersection,
    cooperative_perimeter_patrol,
    dynamic_spectrum_access,
)
from sse.models import FiniteNormalFormGame


class AutonomousSystemsDomain:
    name = "autonomous"
    description = "Autonomous vehicle coordination, velocity-obstacles, and dynamic resource sharing."

    def list_scenarios(self) -> list[str]:
        return [
            "autonomous_intersection",
            "dynamic_spectrum_access",
            "cooperative_perimeter_patrol",
        ]

    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        factories = {
            "autonomous_intersection": autonomous_intersection,
            "dynamic_spectrum_access": dynamic_spectrum_access,
            "cooperative_perimeter_patrol": cooperative_perimeter_patrol,
        }
        if name not in factories:
            raise KeyError(f"Scenario '{name}' not found in autonomous domain.")
        return factories[name]()


__all__ = [
    "AutonomousCoordinationAdapter",
    "AutonomousSystemsDomain",
    "IntersectionCoordinationGame",
    "MultiRobotPatrolGame",
    "SharedPriorityArbitration",
    "SpatialAgentState",
    "SpatialCorridorVelocityGame",
    "SpectrumSharingGame",
    "autonomous_intersection",
    "cooperative_perimeter_patrol",
    "dynamic_spectrum_access",
]
