"""Exact enumeration and verification of pure-strategy Nash equilibria."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sse.models import FiniteNormalFormGame
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class PureNashEquilibrium:
    action_indices: tuple[int, ...]
    actions: tuple[str, ...]
    payoffs: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class PureNashResult(SolverResult):
    equilibria: tuple[PureNashEquilibrium, ...] = ()


class PureNashSolver:
    """Enumerate every pure profile and test all unilateral deviations.

    This is an exact algorithm for finite normal-form games. Its worst-case
    work is proportional to the number of profiles times unilateral actions.
    """

    name = "pure_nash_enumeration"

    def solve(self, game: FiniteNormalFormGame, tolerance: float = 0.0) -> PureNashResult:
        if tolerance < 0:
            raise ValueError("tolerance must be non-negative.")
        equilibria: list[PureNashEquilibrium] = []
        deviations_checked = 0

        for profile in game.profiles():
            current_payoffs = game.payoff(profile)
            is_equilibrium = True

            for player_index, action_count in enumerate(game.action_counts):
                for alternative_action in range(action_count):
                    if alternative_action == profile[player_index]:
                        continue
                    deviation = list(profile)
                    deviation[player_index] = alternative_action
                    deviated_payoff = game.payoff(deviation)[player_index]
                    deviations_checked += 1
                    if deviated_payoff > current_payoffs[player_index] + tolerance:
                        is_equilibrium = False
                        break
                if not is_equilibrium:
                    break

            if is_equilibrium:
                equilibria.append(
                    PureNashEquilibrium(
                        action_indices=tuple(profile),
                        actions=game.action_names(profile),
                        payoffs=current_payoffs,
                    )
                )

        return PureNashResult(
            status="solved",
            solution_count=len(equilibria),
            diagnostics={
                "profiles_examined": game.profile_count,
                "unilateral_deviations_checked": deviations_checked,
                "tolerance": tolerance,
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="complete_profile_enumeration_and_unilateral_deviation_check",
                exact=(tolerance == 0.0),
                tolerance=tolerance,
                notes=(
                    ("Exact pure Nash enumeration for finite normal-form games.",)
                    if tolerance == 0.0
                    else ("Complete enumeration of tolerance-based approximate pure equilibria.",)
                ),
            ),
            equilibria=tuple(equilibria),
        )

    @staticmethod
    def verify(
        game: FiniteNormalFormGame,
        profile: Sequence[int],
        tolerance: float = 0.0,
    ) -> bool:
        """Independently verify whether a supplied profile is a pure Nash equilibrium."""
        if tolerance < 0:
            raise ValueError("tolerance must be non-negative.")
        payoffs = game.payoff(profile)
        for player_index, action_count in enumerate(game.action_counts):
            for action_index in range(action_count):
                if action_index == profile[player_index]:
                    continue
                deviation = list(profile)
                deviation[player_index] = action_index
                if game.payoff(deviation)[player_index] > payoffs[player_index] + tolerance:
                    return False
        return True
