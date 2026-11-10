"""Dominant strategy detection and Iterated Elimination of Dominated Strategies (IEDS)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import product

from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class DominanceResult(SolverResult):
    """Result of dominant strategy analysis or IEDS."""

    strictly_dominant: dict[str, str | None] = field(default_factory=dict)
    eliminated_actions: tuple[tuple[str, str], ...] = ()
    remaining_actions: dict[str, tuple[str, ...]] = field(default_factory=dict)
    is_solvable_by_ieds: bool = False


class DominantStrategySolver:
    """Identify dominant strategies and perform IEDS for finite games."""

    name = "dominant_strategy"
    supported_families = (GameFamily.NORMAL_FORM,)

    def solve(
        self,
        game: FiniteNormalFormGame,
        strict: bool = True,
        tolerance: float = 0.0,
    ) -> DominanceResult:
        """Find strictly or weakly dominant strategies and perform IEDS."""
        strictly_dominant: dict[str, str | None] = {}
        for player_idx, player in enumerate(game.players):
            dom_action = self._find_dominant_action(game, player_idx, strict=True, tolerance=tolerance)
            strictly_dominant[player.id] = (
                game.actions[player_idx][dom_action] if dom_action is not None else None
            )

        # Perform IEDS
        eliminated_order, remaining_map = self._perform_ieds(
            game, strict=strict, tolerance=tolerance
        )

        is_solvable = all(len(acts) == 1 for acts in remaining_map.values())

        return DominanceResult(
            status="solved",
            solution_count=1 if is_solvable else 0,
            diagnostics={
                "strict": strict,
                "tolerance": tolerance,
                "eliminated_count": len(eliminated_order),
                "remaining_profile_count": math_prod(len(acts) for acts in remaining_map.values()),
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="iterated_elimination_of_dominated_strategies",
                exact=(tolerance == 0.0),
                tolerance=tolerance,
                notes=(
                    f"IEDS ({'strict' if strict else 'weak'}) elimination.",
                ),
            ),
            strictly_dominant=strictly_dominant,
            eliminated_actions=tuple(eliminated_order),
            remaining_actions={k: tuple(v) for k, v in remaining_map.items()},
            is_solvable_by_ieds=is_solvable,
        )

    def _find_dominant_action(
        self,
        game: FiniteNormalFormGame,
        player_idx: int,
        strict: bool = True,
        tolerance: float = 0.0,
    ) -> int | None:
        """Return the action index for player_idx that dominates all others, or None."""
        n_actions = game.action_counts[player_idx]
        other_counts = [
            count for idx, count in enumerate(game.action_counts) if idx != player_idx
        ]

        for cand_a in range(n_actions):
            is_dominant = True
            for other_a in range(n_actions):
                if cand_a == other_a:
                    continue
                # cand_a must dominate other_a across ALL opponent profiles
                strictly_better_somewhere = False
                for opp_profile in product(*(range(c) for c in other_counts)):
                    # Construct full profiles
                    cand_full = self._insert_action(opp_profile, player_idx, cand_a)
                    other_full = self._insert_action(opp_profile, player_idx, other_a)

                    payoff_cand = game.payoff(cand_full)[player_idx]
                    payoff_other = game.payoff(other_full)[player_idx]

                    if strict:
                        if payoff_cand <= payoff_other + tolerance:
                            is_dominant = False
                            break
                    else:
                        if payoff_cand < payoff_other - tolerance:
                            is_dominant = False
                            break
                        if payoff_cand > payoff_other + tolerance:
                            strictly_better_somewhere = True

                if not is_dominant:
                    break
                if not strict and not strictly_better_somewhere:
                    is_dominant = False
                    break

            if is_dominant:
                return cand_a
        return None

    def _perform_ieds(
        self,
        game: FiniteNormalFormGame,
        strict: bool,
        tolerance: float,
    ) -> tuple[list[tuple[str, str]], dict[str, list[str]]]:
        """Iteratively remove dominated pure strategies until no more can be removed."""
        active_actions: list[list[int]] = [
            list(range(count)) for count in game.action_counts
        ]
        eliminated_order: list[tuple[str, str]] = []

        changed = True
        while changed:
            changed = False
            for player_idx, player in enumerate(game.players):
                player_acts = active_actions[player_idx]
                if len(player_acts) <= 1:
                    continue

                other_active = [
                    active_actions[idx]
                    for idx in range(len(game.players))
                    if idx != player_idx
                ]

                # Find any action dominated by some other active action
                dominated_action_to_remove: int | None = None
                for a_cand in player_acts:
                    # Check if there exists another action a_dom that dominates a_cand
                    for a_dom in player_acts:
                        if a_cand == a_dom:
                            continue
                        strictly_better_somewhere = False
                        dominates = True
                        for opp_profile in product(*other_active):
                            p_cand = self._insert_action(opp_profile, player_idx, a_cand)
                            p_dom = self._insert_action(opp_profile, player_idx, a_dom)
                            u_cand = game.payoff(p_cand)[player_idx]
                            u_dom = game.payoff(p_dom)[player_idx]

                            if strict:
                                if u_dom <= u_cand + tolerance:
                                    dominates = False
                                    break
                            else:
                                if u_dom < u_cand - tolerance:
                                    dominates = False
                                    break
                                if u_dom > u_cand + tolerance:
                                    strictly_better_somewhere = True

                        if dominates and (strict or strictly_better_somewhere):
                            dominated_action_to_remove = a_cand
                            break
                    if dominated_action_to_remove is not None:
                        break

                if dominated_action_to_remove is not None:
                    player_acts.remove(dominated_action_to_remove)
                    action_name = game.actions[player_idx][dominated_action_to_remove]
                    eliminated_order.append((player.id, action_name))
                    changed = True
                    break

        remaining_map: dict[str, list[str]] = {}
        for player_idx, player in enumerate(game.players):
            remaining_map[player.id] = [
                game.actions[player_idx][a_idx] for a_idx in active_actions[player_idx]
            ]

        return eliminated_order, remaining_map

    @staticmethod
    def _insert_action(opp_profile: Sequence[int], player_idx: int, action: int) -> list[int]:
        res = list(opp_profile)
        res.insert(player_idx, action)
        return res


def math_prod(iterable: Sequence[int]) -> int:
    val = 1
    for x in iterable:
        val *= x
    return val
