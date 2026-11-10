"""Minimax solver for 2-player zero-sum games via linear programming duality."""

from __future__ import annotations

from dataclasses import dataclass

from sse.core.actions import DiscreteActionSpace
from sse.core.strategies import MixedStrategy
from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.optimization.linear import LinearProgramSolver
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class MinimaxResult(SolverResult):
    """Result of 2-player zero-sum minimax optimization."""

    game_value: float = 0.0
    row_strategy: MixedStrategy | None = None
    col_strategy: MixedStrategy | None = None
    is_pure_saddle_point: bool = False
    duality_gap: float = 0.0


class MinimaxSolver:
    """Compute minimax / maximin values and optimal strategies for zero-sum games."""

    name = "minimax"
    supported_families = (GameFamily.NORMAL_FORM,)

    def solve(
        self,
        game: FiniteNormalFormGame,
        tolerance: float = 1e-7,
    ) -> MinimaxResult:
        """Solve a 2-player zero-sum game via linear programming."""
        if len(game.players) != 2:
            raise ValueError("Minimax solver requires exactly 2 players.")

        m, n = game.action_counts[0], game.action_counts[1]
        A = [[game.payoff((i, j))[0] for j in range(n)] for i in range(m)]

        # Check zero-sum validity
        for i in range(m):
            for j in range(n):
                u1, u2 = game.payoff((i, j))
                if abs(u1 + u2) > 1e-5:
                    raise ValueError(
                        f"Game is not zero-sum at profile ({i}, {j}): {u1} + {u2} = {u1 + u2} != 0."
                    )

        # 1. Check for pure saddle points
        pure_saddle = self._check_pure_saddle_point(A, m, n, tolerance)

        # Linear programming formulation
        lp_solver = LinearProgramSolver()
        _lp_res, p_strat, q_strat = lp_solver.solve_zero_sum_game(A)

        # Build strategy dataclasses
        strat1 = MixedStrategy(
            player_id=game.players[0].id,
            action_space=DiscreteActionSpace(game.actions[0]),
            probabilities=tuple(p_strat),
        )
        strat2 = MixedStrategy(
            player_id=game.players[1].id,
            action_space=DiscreteActionSpace(game.actions[1]),
            probabilities=tuple(q_strat),
        )

        # Verify duality / minimax value:
        # min_j (p^T A)_j should equal max_i (A q)_i
        row_security = min(sum(p_strat[i] * A[i][j] for i in range(m)) for j in range(n))
        col_security = max(sum(A[i][j] * q_strat[j] for j in range(n)) for i in range(m))
        duality_gap = abs(col_security - row_security)
        val = row_security


        return MinimaxResult(
            status="solved",
            solution_count=1,
            diagnostics={
                "row_actions": m,
                "col_actions": n,
                "row_security_value": row_security,
                "col_security_value": col_security,
                "duality_gap": duality_gap,
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="linear_programming_primal_dual_minimax",
                exact=True,
                tolerance=tolerance,
                notes=("Von Neumann minimax theorem via linear programming.",),
            ),
            game_value=val,
            row_strategy=strat1,
            col_strategy=strat2,
            is_pure_saddle_point=pure_saddle is not None,
            duality_gap=duality_gap,
        )

    @staticmethod
    def _check_pure_saddle_point(
        A: list[list[float]], m: int, n: int, tol: float
    ) -> tuple[int, int] | None:
        """Find pure minimax saddle point where max_i min_j A_ij == min_j max_i A_ij."""
        row_mins = [min(A[i]) for i in range(m)]
        col_maxs = [max(A[i][j] for i in range(m)) for j in range(n)]

        max_row_min = max(row_mins)
        min_col_max = min(col_maxs)

        if abs(max_row_min - min_col_max) <= tol:
            for i in range(m):
                for j in range(n):
                    if abs(A[i][j] - max_row_min) <= tol and row_mins[i] == max_row_min and col_maxs[j] == min_col_max:
                        return (i, j)
        return None
