"""Tournament execution and head-to-head benchmarking for strategic agents."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations
from typing import Any

from sse.agents.base import Agent
from sse.models import FiniteNormalFormGame


@dataclass(frozen=True, slots=True)
class MatchResult:
    """Outcome of a multi-round repeated match between two agents."""

    agent1_id: str
    agent2_id: str
    agent1_total_payoff: float
    agent2_total_payoff: float
    rounds_played: int

    @property
    def agent1_average_payoff(self) -> float:
        return self.agent1_total_payoff / self.rounds_played if self.rounds_played > 0 else 0.0

    @property
    def agent2_average_payoff(self) -> float:
        return self.agent2_total_payoff / self.rounds_played if self.rounds_played > 0 else 0.0


@dataclass(frozen=True, slots=True)
class TournamentResult:
    """Summary rankings and complete match outcomes across a tournament."""

    matches: tuple[MatchResult, ...]
    rankings: tuple[tuple[str, float], ...]  # (agent_id, total_payoff) sorted descending
    match_matrix: dict[tuple[str, str], float]  # (agent_i, agent_j) -> agent_i payoff

    def summary(self) -> dict[str, Any]:
        return {
            "rankings": [{"agent_id": aid, "score": score} for aid, score in self.rankings],
            "total_matches": len(self.matches),
        }


class Tournament:
    """Execute a round-robin tournament between competing agents in a symmetric or 2-player game."""

    def __init__(
        self,
        game: FiniteNormalFormGame,
        agents: Sequence[Agent],
        rounds_per_match: int = 100,
    ) -> None:
        if len(game.players) != 2:
            raise ValueError("Tournament currently requires a 2-player normal-form game.")
        if len(agents) < 2:
            raise ValueError("Tournament requires at least 2 agents.")
        self.game = game
        self.agents = list(agents)
        self.rounds_per_match = rounds_per_match

    def run(self) -> TournamentResult:
        """Run all pairs of agents and compile aggregate scores and ranking."""
        matches: list[MatchResult] = []
        scores: dict[str, float] = {a.agent_id: 0.0 for a in self.agents}
        matrix: dict[tuple[str, str], float] = {}

        # Round-robin pairings
        for a1, a2 in combinations(self.agents, 2):
            res = self._play_match(a1, a2)
            matches.append(res)
            scores[a1.agent_id] += res.agent1_total_payoff
            scores[a2.agent_id] += res.agent2_total_payoff
            matrix[(a1.agent_id, a2.agent_id)] = res.agent1_total_payoff
            matrix[(a2.agent_id, a1.agent_id)] = res.agent2_total_payoff

        # Also let each agent play against a clone/itself if supported
        for a in self.agents:
            matrix[(a.agent_id, a.agent_id)] = 0.0

        rankings = tuple(
            sorted(scores.items(), key=lambda item: item[1], reverse=True)
        )

        return TournamentResult(
            matches=tuple(matches),
            rankings=rankings,
            match_matrix=matrix,
        )

    def _play_match(self, agent1: Agent, agent2: Agent) -> MatchResult:
        agent1.reset()
        agent2.reset()

        total1 = 0.0
        total2 = 0.0

        act_map1 = {name: i for i, name in enumerate(self.game.actions[0])}
        act_map2 = {name: i for i, name in enumerate(self.game.actions[1])}

        last_act1: str | None = None
        last_act2: str | None = None

        for _ in range(self.rounds_per_match):
            act1 = agent1.select_action(last_act2)
            act2 = agent2.select_action(last_act1)

            i1 = act_map1[str(act1)]
            i2 = act_map2[str(act2)]

            u1, u2 = self.game.payoff((i1, i2))
            total1 += u1
            total2 += u2

            agent1.update(act1, u1, next_observation=act2)
            agent2.update(act2, u2, next_observation=act1)

            last_act1 = str(act1)
            last_act2 = str(act2)

        return MatchResult(
            agent1_id=agent1.agent_id,
            agent2_id=agent2.agent_id,
            agent1_total_payoff=total1,
            agent2_total_payoff=total2,
            rounds_played=self.rounds_per_match,
        )
