"""Mixed-strategy Nash equilibrium solver via support enumeration for 2-player games."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations

from sse.core.actions import DiscreteActionSpace
from sse.core.strategies import MixedStrategy
from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.solvers.base import SolverMetadata, SolverResult

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    np = None  # type: ignore[assignment]
    _HAS_NUMPY = False


@dataclass(frozen=True, slots=True)
class MixedNashEquilibrium:
    """A pair of mixed strategies and expected equilibrium payoffs."""

    strategies: tuple[MixedStrategy, MixedStrategy]
    expected_payoffs: tuple[float, float]
    supports: tuple[tuple[int, ...], tuple[int, ...]]


@dataclass(frozen=True, slots=True)
class MixedNashResult(SolverResult):
    """Complete results from mixed Nash support enumeration."""

    equilibria: tuple[MixedNashEquilibrium, ...] = ()


def _solve_linear_system_pure(A: list[list[float]], b: list[float]) -> list[float] | None:
    """Solve A x = b using Gauss-Jordan elimination with partial pivoting in pure Python."""
    n = len(A)
    # Augment matrix
    M = [row[:] + [b[i]] for i, row in enumerate(A)]

    for i in range(n):
        # Pivot
        max_row = i
        max_val = abs(M[i][i])
        for r in range(i + 1, n):
            if abs(M[r][i]) > max_val:
                max_val = abs(M[r][i])
                max_row = r
        if max_val < 1e-12:
            return None  # Singular

        M[i], M[max_row] = M[max_row], M[i]

        pivot = M[i][i]
        for c in range(i, n + 1):
            M[i][c] /= pivot

        for r in range(n):
            if r != i and abs(M[r][i]) > 1e-12:
                factor = M[r][i]
                for c in range(i, n + 1):
                    M[r][c] -= factor * M[i][c]

    return [M[i][n] for i in range(n)]


class SupportEnumerationSolver:
    """Compute mixed Nash equilibria for finite 2-player normal-form games.

    Enumerates all possible equal-sized supports for player 1 and player 2,
    solves the resulting indifference equations, verifies probability constraints,
    and checks that no player has a beneficial unilateral deviation.
    """

    name = "support_enumeration"
    supported_families = (GameFamily.NORMAL_FORM,)

    def solve(
        self,
        game: FiniteNormalFormGame,
        tolerance: float = 1e-7,
        max_support_size: int | None = None,
    ) -> MixedNashResult:
        if len(game.players) != 2:
            raise ValueError("Support enumeration currently supports 2-player games.")
        if tolerance < 0:
            raise ValueError("tolerance must be non-negative.")

        m, n = game.action_counts[0], game.action_counts[1]
        A = [[game.payoff((i, j))[0] for j in range(n)] for i in range(m)]
        B = [[game.payoff((i, j))[1] for j in range(n)] for i in range(m)]

        found_equilibria: list[MixedNashEquilibrium] = []
        seen_profiles: set[tuple[tuple[float, ...], tuple[float, ...]]] = set()

        max_k = min(m, n)
        if max_support_size is not None:
            max_k = min(max_k, max_support_size)

        for k in range(1, max_k + 1):
            for supp1 in combinations(range(m), k):
                for supp2 in combinations(range(n), k):
                    eq = self._check_support_pair(
                        game, A, B, m, n, supp1, supp2, tolerance
                    )
                    if eq is not None:
                        # Deduplicate by rounded probabilities
                        key = (
                            tuple(round(p, 6) for p in eq.strategies[0].probabilities),
                            tuple(round(q, 6) for q in eq.strategies[1].probabilities),
                        )
                        if key not in seen_profiles:
                            seen_profiles.add(key)
                            found_equilibria.append(eq)

        return MixedNashResult(
            status="solved",
            solution_count=len(found_equilibria),
            diagnostics={
                "action_counts": (m, n),
                "tolerance": tolerance,
                "supports_examined_up_to": max_k,
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="support_enumeration_indifference_system",
                exact=(tolerance == 0.0),
                tolerance=tolerance,
                notes=("Exact mixed Nash solver via support enumeration for 2-player games.",),
            ),
            equilibria=tuple(found_equilibria),
        )

    def _check_support_pair(
        self,
        game: FiniteNormalFormGame,
        A: list[list[float]],
        B: list[list[float]],
        m: int,
        n: int,
        supp1: tuple[int, ...],
        supp2: tuple[int, ...],
        tolerance: float,
    ) -> MixedNashEquilibrium | None:
        k = len(supp1)

        # 1. Solve for Player 2's strategy q over supp2 to make Player 1 indifferent on supp1
        # Equations:
        # For i = 1..k-1: sum_j (A[supp1[i], j] - A[supp1[0], j]) * q_j = 0
        # sum_j q_j = 1
        M1: list[list[float]] = []
        b1: list[float] = []
        first_row = supp1[0]
        for r in supp1[1:]:
            row = [A[r][j] - A[first_row][j] for j in supp2]
            M1.append(row)
            b1.append(0.0)
        M1.append([1.0] * k)
        b1.append(1.0)

        sol_q = _solve_linear_system_pure(M1, b1)
        if sol_q is None:
            return None

        # Check q >= 0
        if any(q_val < -tolerance for q_val in sol_q):
            return None
        q_full = [0.0] * n
        for idx, col in enumerate(supp2):
            q_full[col] = max(0.0, sol_q[idx])
        sum_q = sum(q_full)
        if sum_q <= 0:
            return None
        q_full = [v / sum_q for v in q_full]

        # 2. Solve for Player 1's strategy p over supp1 to make Player 2 indifferent on supp2
        # Equations:
        # For j = 1..k-1: sum_i (B[i, supp2[j]] - B[i, supp2[0]]) * p_i = 0
        # sum_i p_i = 1
        M2: list[list[float]] = []
        b2: list[float] = []
        first_col = supp2[0]
        for c in supp2[1:]:
            col_eq = [B[i][c] - B[i][first_col] for i in supp1]
            M2.append(col_eq)
            b2.append(0.0)
        M2.append([1.0] * k)
        b2.append(1.0)

        sol_p = _solve_linear_system_pure(M2, b2)
        if sol_p is None:
            return None

        # Check p >= 0
        if any(p_val < -tolerance for p_val in sol_p):
            return None
        p_full = [0.0] * m
        for idx, row_idx in enumerate(supp1):
            p_full[row_idx] = max(0.0, sol_p[idx])
        sum_p = sum(p_full)
        if sum_p <= 0:
            return None
        p_full = [v / sum_p for v in p_full]

        # 3. Check expected payoffs and verify no profitable unilateral deviations
        # Player 1's expected payoff for each pure action i: E_1[i] = sum_j A[i][j] * q[j]
        exp_u1 = [sum(A[i][j] * q_full[j] for j in range(n)) for i in range(m)]
        v1 = exp_u1[supp1[0]]
        # In-support must be within tolerance of v1
        for i in supp1:
            if abs(exp_u1[i] - v1) > tolerance:
                return None
        # Out-of-support must NOT yield strictly higher payoff
        for i in range(m):
            if i not in supp1 and exp_u1[i] > v1 + tolerance:
                return None

        # Player 2's expected payoff for each pure action j: E_2[j] = sum_i B[i][j] * p[i]
        exp_u2 = [sum(B[i][j] * p_full[i] for i in range(m)) for j in range(n)]
        v2 = exp_u2[supp2[0]]
        for j in supp2:
            if abs(exp_u2[j] - v2) > tolerance:
                return None
        for j in range(n):
            if j not in supp2 and exp_u2[j] > v2 + tolerance:
                return None

        strat1 = MixedStrategy(
            player_id=game.players[0].id,
            action_space=DiscreteActionSpace(game.actions[0]),
            probabilities=tuple(p_full),
        )
        strat2 = MixedStrategy(
            player_id=game.players[1].id,
            action_space=DiscreteActionSpace(game.actions[1]),
            probabilities=tuple(q_full),
        )

        return MixedNashEquilibrium(
            strategies=(strat1, strat2),
            expected_payoffs=(v1, v2),
            supports=(supp1, supp2),
        )

    @staticmethod
    def verify(
        game: FiniteNormalFormGame,
        strat1_probs: Sequence[float],
        strat2_probs: Sequence[float],
        tolerance: float = 1e-6,
    ) -> bool:
        """Independently verify whether a pair of probability vectors forms a Nash equilibrium."""
        m, n = game.action_counts[0], game.action_counts[1]
        if len(strat1_probs) != m or len(strat2_probs) != n:
            return False
        if abs(sum(strat1_probs) - 1.0) > tolerance or abs(sum(strat2_probs) - 1.0) > tolerance:
            return False
        if any(p < -tolerance for p in strat1_probs) or any(q < -tolerance for q in strat2_probs):
            return False

        A = [[game.payoff((i, j))[0] for j in range(n)] for i in range(m)]
        B = [[game.payoff((i, j))[1] for j in range(n)] for i in range(m)]

        exp_u1 = [sum(A[i][j] * strat2_probs[j] for j in range(n)) for i in range(m)]
        curr_v1 = sum(strat1_probs[i] * exp_u1[i] for i in range(m))
        if any(e > curr_v1 + tolerance for e in exp_u1):
            return False

        exp_u2 = [sum(B[i][j] * strat1_probs[i] for i in range(m)) for j in range(n)]
        curr_v2 = sum(strat2_probs[j] * exp_u2[j] for j in range(n))
        return not any(e > curr_v2 + tolerance for e in exp_u2)
