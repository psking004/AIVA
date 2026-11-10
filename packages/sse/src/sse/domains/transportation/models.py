"""Transportation domain models: Braess's paradox, traffic route choice, and commute congestion."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class BraessParadoxGame:
    """Canonical 2-player discrete representation of Braess's Paradox in network routing."""

    def __init__(self, drivers: Sequence[str] = ("Driver_1", "Driver_2")) -> None:
        self.drivers = list(drivers)

    def to_game(self) -> FiniteNormalFormGame:
        routes = ["Route_Top", "Route_Bottom", "Route_Cross_Teleport"]
        # Travel time in minutes
        payoffs: list[list[float]] = [
            [-50.0, -50.0], [-45.0, -45.0], [-40.0, -60.0],
            [-45.0, -45.0], [-50.0, -50.0], [-40.0, -60.0],
            [-60.0, -40.0], [-60.0, -40.0], [-70.0, -70.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "transportation-braess-paradox",
            "name": "Braess's Paradox Traffic Network",
            "players": self.drivers,
            "actions": {
                self.drivers[0]: routes,
                self.drivers[1]: routes,
            },
            "payoffs": payoffs,
        })


class TrafficRouteChoiceGame:
    """Commuter route choice between Expressway vs Arterial Blvd."""

    def __init__(self, commuters: Sequence[str] = ("Commuter_1", "Commuter_2")) -> None:
        self.commuters = list(commuters)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Expressway", "Arterial_Boulevard"]
        # Payoffs in terms of negative commute delay
        payoffs = [
            [-35.0, -35.0],  # Both expressway -> traffic jam
            [-18.0, -25.0],  # 1 on expressway (fast), 2 on arterial
            [-25.0, -18.0],  # 2 on expressway, 1 on arterial
            [-22.0, -22.0],  # Both on arterial
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "traffic-route-choice-commute",
            "name": "Traffic Route Choice Game",
            "players": self.commuters,
            "actions": {
                self.commuters[0]: actions,
                self.commuters[1]: actions,
            },
            "payoffs": payoffs,
        })


class CommuteCongestionGame:
    """Peak-hour spreading departure time selection game."""

    def __init__(self, drivers: Sequence[str] = ("Driver_A", "Driver_B")) -> None:
        self.drivers = list(drivers)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Depart_Early", "Depart_Peak", "Depart_Late"]
        payoffs = [
            [-20.0, -20.0], [-15.0, -35.0], [-15.0, -15.0],
            [-35.0, -15.0], [-45.0, -45.0], [-35.0, -15.0],
            [-15.0, -15.0], [-15.0, -35.0], [-20.0, -20.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "commute-departure-time-peak-spreading",
            "name": "Commute Departure Time Peak Spreading",
            "players": self.drivers,
            "actions": {
                self.drivers[0]: actions,
                self.drivers[1]: actions,
            },
            "payoffs": payoffs,
        })
