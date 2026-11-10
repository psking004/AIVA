"""Regret matching and external regret minimization algorithm."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class RegretMatchingResult(SolverResult):
    """Result of regret matching simulation."""

    average_strategies: dict[str, tuple[float, ...]] = field(default_factory=dict)
    cumulative_regrets: dict[str, tuple[float, ...]] = field(default_factory=dict)
    total_rounds: int = 0


class RegretMatchingSolver:
    """External regret minimization converging to correlated equilibrium."""

    name = "regret_matching"
    supported_families = (GameFamily.NORMAL_FORM,)

    def solve(
        self,
        game: FiniteNormalFormGame,
        rounds: int = 5000,
        seed: int | None = None,
    ) -> RegretMatchingResult:
        """Run Hart & Mas-Colell regret matching over repeated rounds."""
        rng = random.Random(seed)
        num_players = len(game.players)

        # Regrets per player per action
        regrets: list[list[float]] = [
            [0.0] * game.action_counts[p] for p in range(num_players)
        ]
        # Action execution counts
        action_counts: list[list[int]] = [
            [0] * game.action_counts[p] for p in range(num_players)
        ]

        for _ in range(rounds):
            # 1. Choose action for each player based on positive regret
            current_profile: list[int] = []
            for p in range(num_players):
                n_acts = game.action_counts[p]
                pos_regrets = [max(0.0, r) for r in regrets[p]]
                sum_pos = sum(pos_regrets)

                if sum_pos > 0:
                    probs = [r / sum_pos for r in pos_regrets]
                    chosen_action = rng.choices(range(n_acts), weights=probs, k=1)[0]
                else:
                    chosen_action = rng.randrange(n_acts)

                current_profile.append(chosen_action)
                action_counts[p][chosen_action] += 1

            # 2. Update regrets for each player
            realized_payoffs = game.payoff(current_profile)
            for p in range(num_players):
                n_acts = game.action_counts[p]
                u_realized = realized_payoffs[p]
                for a in range(n_acts):
                    dev_profile = list(current_profile)
                    dev_profile[p] = a
                    u_counterfactual = game.payoff(dev_profile)[p]
                    # Instantaneous regret
                    regrets[p][a] += u_counterfactual - u_realized

        # Calculate empirical average strategies
        avg_strats: dict[str, tuple[float, ...]] = {}
        cum_regrets_map: dict[str, tuple[float, ...]] = {}

        for p, player in enumerate(game.players):
            tot = sum(action_counts[p])
            avg_strats[player.id] = tuple(c / tot for c in action_counts[p])
            cum_regrets_map[player.id] = tuple(regrets[p])

        return RegretMatchingResult(
            status="solved",
            solution_count=1,
            diagnostics={
                "rounds": rounds,
                "players": num_players,
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="hart_mas_colell_regret_matching",
                exact=False,
                notes=("No-regret learning converging to correlated equilibrium.",),
            ),
            average_strategies=avg_strats,
            cumulative_regrets=cum_regrets_map,
            total_rounds=rounds,
        )
