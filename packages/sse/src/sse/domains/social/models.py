"""Social systems models: strategic voting, legislative coalitions, Hawk-Dove, and Stag Hunt."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class HawkDoveConflictGame:
    """Evolutionary Hawk-Dove resource contest game."""

    def __init__(
        self,
        players: Sequence[str] = ("Animal_1", "Animal_2"),
        resource_v: float = 50.0,
        injury_c: float = 100.0,
    ) -> None:
        self.players = list(players)
        self.v = resource_v
        self.c = injury_c

    def to_game(self) -> FiniteNormalFormGame:
        # Hawk vs Hawk: (V - C)/2
        # Hawk vs Dove: V to Hawk, 0 to Dove
        # Dove vs Hawk: 0 to Dove, V to Hawk
        # Dove vs Dove: V/2 to each
        hh = (self.v - self.c) / 2.0
        hd = self.v
        dh = 0.0
        dd = self.v / 2.0

        payoffs = [
            [hh, hh], [hd, dh],
            [dh, hd], [dd, dd],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "hawk-dove-conflict-contest",
            "name": "Hawk-Dove Resource Contest",
            "players": self.players,
            "actions": {
                self.players[0]: ["Hawk", "Dove"],
                self.players[1]: ["Hawk", "Dove"],
            },
            "payoffs": payoffs,
        })


class StrategicVotingGame:
    """Three-voter strategic voting game with plurality and tactical ballot choices."""

    def __init__(self, voters: Sequence[str] = ("Voter_1", "Voter_2")) -> None:
        self.voters = list(voters)

    def to_game(self) -> FiniteNormalFormGame:
        candidates = ["Candidate_Left", "Candidate_Center", "Candidate_Right"]
        payoffs = [
            [10.0, 10.0], [5.0, 6.0],  [0.0, 0.0],
            [6.0, 5.0],   [8.0, 8.0],  [2.0, 3.0],
            [0.0, 0.0],   [3.0, 2.0],  [10.0, 10.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "strategic-plurality-voting",
            "name": "Strategic Plurality Voting Game",
            "players": self.voters,
            "actions": {
                self.voters[0]: candidates,
                self.voters[1]: candidates,
            },
            "payoffs": payoffs,
        })


class StagHuntGame:
    """Rousseau's Stag Hunt coordination dilemma."""

    def __init__(self, hunters: Sequence[str] = ("Hunter_1", "Hunter_2")) -> None:
        self.hunters = list(hunters)

    def to_game(self) -> FiniteNormalFormGame:
        return FiniteNormalFormGame.from_dict({
            "id": "stag-hunt-coordination",
            "name": "Stag Hunt Social Coordination",
            "players": self.hunters,
            "actions": {
                self.hunters[0]: ["Stag", "Hare"],
                self.hunters[1]: ["Stag", "Hare"],
            },
            "payoffs": [
                [5.0, 5.0], [0.0, 3.0],
                [3.0, 0.0], [3.0, 3.0],
            ],
        })
