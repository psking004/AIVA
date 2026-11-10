"""Bilevel Stackelberg leader-follower equilibrium solver."""

from __future__ import annotations

from dataclasses import dataclass

from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class StackelbergResult(SolverResult):
    """Result of Stackelberg leader-follower commitment optimization."""

    leader_action: str = ""
    follower_action: str = ""
    leader_payoff: float = 0.0
    follower_payoff: float = 0.0
    optimistic: bool = True


class StackelbergSolver:
    """Compute pure Stackelberg equilibrium in 2-player leader-follower games."""

    name = "stackelberg"
    supported_families = (GameFamily.NORMAL_FORM, GameFamily.STACKELBERG)

    def solve(
        self,
        game: FiniteNormalFormGame,
        leader_player_idx: int = 0,
        optimistic: bool = True,
        tolerance: float = 0.0,
    ) -> StackelbergResult:
        """Compute pure-strategy Stackelberg equilibrium."""
        if len(game.players) != 2:
            raise ValueError("Stackelberg solver requires a 2-player game (Leader, Follower).")

        follower_player_idx = 1 - leader_player_idx
        n_leader_acts = game.action_counts[leader_player_idx]
        n_follower_acts = game.action_counts[follower_player_idx]

        best_leader_action: int | None = None
        best_follower_response: int | None = None
        max_leader_payoff = float("-inf")
        selected_follower_payoff = 0.0

        for a_L in range(n_leader_acts):
            # Compute follower's best responses to a_L
            follower_payoffs = []
            for a_F in range(n_follower_acts):
                prof = [0, 0]
                prof[leader_player_idx] = a_L
                prof[follower_player_idx] = a_F
                follower_payoffs.append(game.payoff(prof)[follower_player_idx])

            max_f_payoff = max(follower_payoffs)
            # Find all follower actions within tolerance of max_f_payoff
            best_f_acts = [
                idx
                for idx, val in enumerate(follower_payoffs)
                if val >= max_f_payoff - tolerance
            ]

            # Break ties in follower best response according to optimistic or pessimistic rule
            if optimistic:
                # Follower chooses action that maximizes leader's payoff
                chosen_f_act = max(
                    best_f_acts,
                    key=lambda a_F: self._eval_profile(game, leader_player_idx, a_L, follower_player_idx, a_F)[leader_player_idx],
                )
            else:
                # Follower chooses action that minimizes leader's payoff
                chosen_f_act = min(
                    best_f_acts,
                    key=lambda a_F: self._eval_profile(game, leader_player_idx, a_L, follower_player_idx, a_F)[leader_player_idx],
                )

            payoffs = self._eval_profile(game, leader_player_idx, a_L, follower_player_idx, chosen_f_act)
            curr_leader_payoff = payoffs[leader_player_idx]

            if curr_leader_payoff > max_leader_payoff:
                max_leader_payoff = curr_leader_payoff
                best_leader_action = a_L
                best_follower_response = chosen_f_act
                selected_follower_payoff = payoffs[follower_player_idx]

        if best_leader_action is None or best_follower_response is None:
            raise RuntimeError("Failed to compute Stackelberg equilibrium.")

        leader_act_name = game.actions[leader_player_idx][best_leader_action]
        follower_act_name = game.actions[follower_player_idx][best_follower_response]

        return StackelbergResult(
            status="solved",
            solution_count=1,
            diagnostics={
                "leader": game.players[leader_player_idx].id,
                "follower": game.players[follower_player_idx].id,
                "optimistic": optimistic,
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="bilevel_leader_commitment_maximization",
                exact=True,
                tolerance=tolerance,
                notes=("Pure-strategy Stackelberg equilibrium.",),
            ),
            leader_action=leader_act_name,
            follower_action=follower_act_name,
            leader_payoff=max_leader_payoff,
            follower_payoff=selected_follower_payoff,
            optimistic=optimistic,
        )

    @staticmethod
    def _eval_profile(
        game: FiniteNormalFormGame,
        l_idx: int,
        a_L: int,
        f_idx: int,
        a_F: int,
    ) -> tuple[float, ...]:
        prof = [0, 0]
        prof[l_idx] = a_L
        prof[f_idx] = a_F
        return game.payoff(prof)
