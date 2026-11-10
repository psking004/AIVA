"""Autonomous systems models: multi-robot intersection coordination and dynamic spectrum sharing."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class IntersectionCoordinationGame:
    """Decentralized autonomous vehicle intersection conflict resolution."""

    def __init__(self, vehicles: Sequence[str] = ("AV_North", "AV_East")) -> None:
        self.vehicles = list(vehicles)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Yield_Right_of_Way", "Cross_Intersection", "Emergency_Brake"]
        # Collision penalty -100
        payoffs = [
            [-2.0, -2.0],   # Both Yield (delay)
            [-5.0, 10.0],   # AV1 yields, AV2 crosses
            [-2.0, -10.0],  # AV1 yields, AV2 brakes
            [10.0, -5.0],   # AV1 crosses, AV2 yields
            [-100.0, -100.0], # Both Cross -> COLLISION
            [10.0, -10.0],  # AV1 crosses, AV2 brakes
            [-10.0, -2.0],  # AV1 brakes, AV2 yields
            [-10.0, 10.0],  # AV1 brakes, AV2 crosses
            [-15.0, -15.0], # Both brake
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "autonomous-intersection-coordination",
            "name": "Autonomous Vehicle Intersection Coordination",
            "players": self.vehicles,
            "actions": {
                self.vehicles[0]: actions,
                self.vehicles[1]: actions,
            },
            "payoffs": payoffs,
        })


class SpectrumSharingGame:
    """Dynamic cognitive radio spectrum access game between autonomous wireless nodes."""

    def __init__(self, radios: Sequence[str] = ("Radio_1", "Radio_2")) -> None:
        self.radios = list(radios)

    def to_game(self) -> FiniteNormalFormGame:
        channels = ["Channel_Alpha", "Channel_Beta"]
        payoffs = [
            [-5.0, -5.0], # Both on Alpha -> Interference
            [15.0, 15.0], # Radio 1 on Alpha, Radio 2 on Beta
            [15.0, 15.0], # Radio 1 on Beta, Radio 2 on Alpha
            [-5.0, -5.0], # Both on Beta -> Interference
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "dynamic-spectrum-sharing-cognitive-radio",
            "name": "Dynamic Spectrum Sharing Coordination",
            "players": self.radios,
            "actions": {
                self.radios[0]: channels,
                self.radios[1]: channels,
            },
            "payoffs": payoffs,
        })


class MultiRobotPatrolGame:
    """Perimeter defense and coordinated patrolling between autonomous robots."""

    def __init__(self, robots: Sequence[str] = ("Robot_A", "Robot_B")) -> None:
        self.robots = list(robots)

    def to_game(self) -> FiniteNormalFormGame:
        sectors = ["Sector_North", "Sector_South"]
        payoffs = [
            [2.0, 2.0],   # Both North (redundant)
            [10.0, 10.0], # Complementary coverage
            [10.0, 10.0], # Complementary coverage
            [2.0, 2.0],   # Both South (redundant)
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "multi-robot-perimeter-patrol",
            "name": "Multi-Robot Perimeter Patrol Game",
            "players": self.robots,
            "actions": {
                self.robots[0]: sectors,
                self.robots[1]: sectors,
            },
            "payoffs": payoffs,
        })
