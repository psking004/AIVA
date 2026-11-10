"""Strategic Systems Engine - Exact Mathematical Equilibrium Solvers.

Implements research-grade exact solvers for simultaneous and sequential games:
1. Support Enumeration for all pure and mixed-strategy Nash equilibria (2-player m x n).
2. Lemke-Howson Linear Complementarity Pivot (LCP) algorithm for sample mixed Nash equilibria.
3. Bilevel Stackelberg Solvers for Strong (SSE) and Weak (WSE) Stackelberg equilibria under pure
   and mixed leader commitment.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

import numpy as np

from sse.models import FiniteNormalFormGame


@dataclass(frozen=True, slots=True)
class EquilibriumResult:
    """Represents a computed Nash equilibrium in a 2-player bimatrix game."""

    strategy_1: np.ndarray
    strategy_2: np.ndarray
    payoff_1: float
    payoff_2: float
    is_pure: bool
    support_1: tuple[int, ...]
    support_2: tuple[int, ...]
    max_incentive_to_deviate_1: float = 0.0
    max_incentive_to_deviate_2: float = 0.0

    @property
    def is_epsilon_equilibrium(self) -> bool:
        return self.max_incentive_to_deviate_1 <= 1e-6 and self.max_incentive_to_deviate_2 <= 1e-6


@dataclass(frozen=True, slots=True)
class SupportEnumerationResult:
    """Result returned by the Support Enumeration solver containing all identified equilibria."""

    equilibria: tuple[EquilibriumResult, ...]
    supports_evaluated: int
    solver_name: str = "support_enumeration"


@dataclass(frozen=True, slots=True)
class LemkeHowsonResult:
    """Result returned by the Lemke-Howson algorithm."""

    equilibrium: EquilibriumResult
    pivots_count: int
    dropped_label: int
    solver_name: str = "lemke_howson"


@dataclass(frozen=True, slots=True)
class StackelbergEquilibriumResult:
    """Result of a Bilevel Stackelberg game under leader commitment."""

    leader_strategy: np.ndarray
    follower_response: np.ndarray
    follower_action_idx: int
    leader_payoff: float
    follower_payoff: float
    mode: str  # "SSE" (Strong) or "WSE" (Weak)
    is_mixed_leader: bool
    follower_best_responses: tuple[int, ...]


# ---------------------------------------------------------------------------
# Utility: Extract Payoff Matrices
# ---------------------------------------------------------------------------

def extract_bimatrix(game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Extracts (A, B) payoff matrices of shape (m, n) for Player 1 and Player 2."""
    if isinstance(game, tuple) and len(game) == 2:
        A = np.asarray(game[0], dtype=np.float64)
        B = np.asarray(game[1], dtype=np.float64)
        if A.shape != B.shape or A.ndim != 2:
            raise ValueError(f"Payoff matrices must be 2D of identical shape, got {A.shape} and {B.shape}")
        return A, B

    if not isinstance(game, FiniteNormalFormGame):
        raise TypeError(f"Expected FiniteNormalFormGame or tuple of matrices, got {type(game)}")

    if len(game.players) != 2:
        raise ValueError(f"Bimatrix solver requires exactly 2 players, got {len(game.players)}")

    m = len(game.actions[0])
    n = len(game.actions[1])
    A = np.zeros((m, n), dtype=np.float64)
    B = np.zeros((m, n), dtype=np.float64)

    for i in range(m):
        for j in range(n):
            payoff_tuple = game.payoff((i, j))
            A[i, j] = payoff_tuple[0]
            B[i, j] = payoff_tuple[1]

    return A, B


# ---------------------------------------------------------------------------
# 1. Exact Support Enumeration Solver
# ---------------------------------------------------------------------------

class ExactSupportEnumerationSolver:
    """Exhaustive support enumeration solver for finding all Nash equilibria in 2-player bimatrix games."""

    def __init__(self, tolerance: float = 1e-8) -> None:
        self.tolerance = tolerance

    def solve(
        self,
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
    ) -> SupportEnumerationResult:
        """Solves for all pure and mixed-strategy Nash equilibria."""
        A, B = extract_bimatrix(game)
        m, n = A.shape
        equilibria: list[EquilibriumResult] = []
        supports_evaluated = 0

        max_k = min(m, n)
        seen_eqs: list[tuple[tuple[float, ...], tuple[float, ...]]] = []

        for k in range(1, max_k + 1):
            for supp_1 in combinations(range(m), k):
                for supp_2 in combinations(range(n), k):
                    supports_evaluated += 1

                    # 1. Solve for Player 2's mixed strategy y supported on supp_2
                    # such that Player 1 is indifferent between all actions in supp_1
                    y_sub = self._solve_indifference(A, supp_1, supp_2, is_col_player=True)
                    if y_sub is None:
                        continue

                    # 2. Solve for Player 1's mixed strategy x supported on supp_1
                    # such that Player 2 is indifferent between all actions in supp_2
                    x_sub = self._solve_indifference(B, supp_1, supp_2, is_col_player=False)
                    if x_sub is None:
                        continue

                    # Construct full probability vectors
                    x = np.zeros(m, dtype=np.float64)
                    for idx, val in zip(supp_1, x_sub, strict=False):
                        x[idx] = max(0.0, float(val))
                    y = np.zeros(n, dtype=np.float64)
                    for idx, val in zip(supp_2, y_sub, strict=False):
                        y[idx] = max(0.0, float(val))

                    # Normalize
                    x_sum = np.sum(x)
                    y_sum = np.sum(y)
                    if abs(x_sum - 1.0) > 1e-5 or abs(y_sum - 1.0) > 1e-5:
                        continue
                    x /= x_sum
                    y /= y_sum

                    # Expected payoffs
                    u1_actions = A @ y  # Payoff to P1 for each pure action
                    u2_actions = x @ B  # Payoff to P2 for each pure action

                    v1 = np.sum(x * u1_actions)
                    v2 = np.sum(y * u2_actions)

                    # 3. Verify strict best-response condition outside support
                    # For all i not in supp_1: u1_actions[i] <= v1 + tolerance
                    dev1 = float(np.max(u1_actions) - v1)
                    if dev1 > self.tolerance:
                        continue

                    # For all j not in supp_2: u2_actions[j] <= v2 + tolerance
                    dev2 = float(np.max(u2_actions) - v2)
                    if dev2 > self.tolerance:
                        continue

                    # Check duplicate
                    if any(np.allclose(x, eq[0], atol=1e-5) and np.allclose(y, eq[1], atol=1e-5) for eq in seen_eqs):
                        continue

                    seen_eqs.append((x, y))
                    is_pure = (k == 1)

                    equilibria.append(
                        EquilibriumResult(
                            strategy_1=x,
                            strategy_2=y,
                            payoff_1=float(v1),
                            payoff_2=float(v2),
                            is_pure=is_pure,
                            support_1=supp_1,
                            support_2=supp_2,
                            max_incentive_to_deviate_1=max(0.0, dev1),
                            max_incentive_to_deviate_2=max(0.0, dev2),
                        )
                    )

        # Sort pure equilibria first, then by payoff
        equilibria.sort(key=lambda eq: (not eq.is_pure, -(eq.payoff_1 + eq.payoff_2)))
        return SupportEnumerationResult(
            equilibria=tuple(equilibria),
            supports_evaluated=supports_evaluated,
        )

    def _solve_indifference(
        self,
        M: np.ndarray,
        supp_1: tuple[int, ...],
        supp_2: tuple[int, ...],
        is_col_player: bool,
    ) -> np.ndarray | None:
        """Solves linear equations for indifference over candidate support."""
        k = len(supp_1)
        if k == 1:
            return np.array([1.0], dtype=np.float64)

        if is_col_player:
            # P2 plays y on supp_2 to make P1 indifferent across rows in supp_1
            # Submatrix of M[supp_1, supp_2]:
            sub = M[np.ix_(supp_1, supp_2)]
            # Indifference equations: sub[i, :] @ y - sub[0, :] @ y = 0 for i in 1..k-1
            # Sum y = 1
            eq_mat = np.zeros((k, k), dtype=np.float64)
            rhs = np.zeros(k, dtype=np.float64)
            for i in range(1, k):
                eq_mat[i - 1, :] = sub[i, :] - sub[0, :]
            eq_mat[k - 1, :] = 1.0
            rhs[k - 1] = 1.0

            try:
                cond = np.linalg.cond(eq_mat)
                if cond > 1e12:
                    return None
                y = np.linalg.solve(eq_mat, rhs)
            except np.linalg.LinAlgError:
                return None

            if np.any(y < -self.tolerance):
                return None
            return np.maximum(0.0, y)
        else:
            # P1 plays x on supp_1 to make P2 indifferent across cols in supp_2
            # Submatrix of M[supp_1, supp_2]:
            sub = M[np.ix_(supp_1, supp_2)]
            # Indifference: x @ sub[:, j] - x @ sub[:, 0] = 0 for j in 1..k-1
            # Sum x = 1
            eq_mat = np.zeros((k, k), dtype=np.float64)
            rhs = np.zeros(k, dtype=np.float64)
            for j in range(1, k):
                eq_mat[j - 1, :] = sub[:, j] - sub[:, 0]
            eq_mat[k - 1, :] = 1.0
            rhs[k - 1] = 1.0

            try:
                cond = np.linalg.cond(eq_mat)
                if cond > 1e12:
                    return None
                x = np.linalg.solve(eq_mat, rhs)
            except np.linalg.LinAlgError:
                return None

            if np.any(x < -self.tolerance):
                return None
            return np.maximum(0.0, x)


# ---------------------------------------------------------------------------
# 2. Lemke-Howson Linear Complementarity Pivot (LCP) Solver
# ---------------------------------------------------------------------------

class LemkeHowsonSolver:
    """Exact Lemke-Howson complementarity pivot algorithm for bimatrix games."""

    def __init__(self, max_pivots: int = 10000, tolerance: float = 1e-10) -> None:
        self.max_pivots = max_pivots
        self.tolerance = tolerance

    def solve(
        self,
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
        initial_dropped_label: int = 0,
    ) -> LemkeHowsonResult:
        """Runs the Lemke-Howson complementary pivoting algorithm starting with initial_dropped_label."""
        A, B = extract_bimatrix(game)
        m, n = A.shape

        if not (0 <= initial_dropped_label < m + n):
            initial_dropped_label = 0

        # Positive affine transformation to ensure strictly positive payoffs
        min_val = min(float(np.min(A)), float(np.min(B)))
        shift = max(0.0, -min_val) + 1.0
        A_pos = A + shift
        B_pos = B + shift

        # Tableau 1: [B^T, I_n | 1]. Shape: (n, m + n + 1)
        # Variables: x_0..x_{m-1} (indices 0..m-1), s_0..s_{n-1} (indices m..m+n-1)
        # Initial basis: s_0..s_{n-1}
        T1 = np.zeros((n, m + n + 1), dtype=np.float64)
        T1[:, :m] = B_pos.T
        T1[:, m:m + n] = np.eye(n, dtype=np.float64)
        T1[:, -1] = 1.0
        basis1 = list(range(m, m + n))

        # Tableau 2: [A, I_m | 1]. Shape: (m, n + m + 1)
        # Variables: y_0..y_{n-1} (indices 0..n-1), r_0..r_{m-1} (indices n..n+m-1)
        # Initial basis: r_0..r_{m-1}
        T2 = np.zeros((m, n + m + 1), dtype=np.float64)
        T2[:, :n] = A_pos
        T2[:, n:n + m] = np.eye(m, dtype=np.float64)
        T2[:, -1] = 1.0
        basis2 = list(range(n, n + m))

        k_init = initial_dropped_label
        curr_tab = 1 if k_init < m else 2
        enter_var = k_init if k_init < m else (k_init - m)

        pivots_count = 0

        for _ in range(self.max_pivots):
            pivots_count += 1
            if curr_tab == 1:
                # Pivot in Tableau 1
                col = T1[:, enter_var]
                pos_mask = col > self.tolerance
                if not np.any(pos_mask):
                    raise RuntimeError("Unbounded ray encountered in Tableau 1.")

                ratios = np.full(n, np.inf, dtype=np.float64)
                ratios[pos_mask] = T1[pos_mask, -1] / col[pos_mask]
                leave_row = int(np.argmin(ratios))
                leave_var = basis1[leave_row]

                # Row operations
                pivot_val = T1[leave_row, enter_var]
                T1[leave_row, :] /= pivot_val
                for r in range(n):
                    if r != leave_row:
                        T1[r, :] -= T1[r, enter_var] * T1[leave_row, :]

                basis1[leave_row] = enter_var
                leave_label = leave_var

                if leave_label == k_init:
                    break

                # Switch to Tableau 2
                curr_tab = 2
                if leave_label < m:
                    enter_var = n + leave_label
                else:
                    enter_var = leave_label - m

            else:
                # Pivot in Tableau 2
                col = T2[:, enter_var]
                pos_mask = col > self.tolerance
                if not np.any(pos_mask):
                    raise RuntimeError("Unbounded ray encountered in Tableau 2.")

                ratios = np.full(m, np.inf, dtype=np.float64)
                ratios[pos_mask] = T2[pos_mask, -1] / col[pos_mask]
                leave_row = int(np.argmin(ratios))
                leave_var = basis2[leave_row]

                # Row operations
                pivot_val = T2[leave_row, enter_var]
                T2[leave_row, :] /= pivot_val
                for r in range(m):
                    if r != leave_row:
                        T2[r, :] -= T2[r, enter_var] * T2[leave_row, :]

                basis2[leave_row] = enter_var

                if leave_var < n:
                    leave_label = m + leave_var
                else:
                    leave_label = leave_var - n

                if leave_label == k_init:
                    break

                # Switch to Tableau 1
                curr_tab = 1
                if leave_label < m:
                    enter_var = leave_label
                else:
                    enter_var = leave_label

        # Reconstruct unnormalized points
        x = np.zeros(m, dtype=np.float64)
        for r in range(n):
            if basis1[r] < m:
                x[basis1[r]] = max(0.0, T1[r, -1])

        y = np.zeros(n, dtype=np.float64)
        for r in range(m):
            if basis2[r] < n:
                y[basis2[r]] = max(0.0, T2[r, -1])

        x_sum = np.sum(x)
        y_sum = np.sum(y)

        if x_sum > 0:
            x /= x_sum
        else:
            x[0] = 1.0

        if y_sum > 0:
            y /= y_sum
        else:
            y[0] = 1.0

        v1 = float(x @ A @ y)
        v2 = float(x @ B @ y)

        supp1 = tuple(int(i) for i in np.where(x > self.tolerance)[0])
        supp2 = tuple(int(j) for j in np.where(y > self.tolerance)[0])

        dev1 = float(max(0.0, np.max(A @ y) - v1))
        dev2 = float(max(0.0, np.max(x @ B) - v2))

        eq = EquilibriumResult(
            strategy_1=x,
            strategy_2=y,
            payoff_1=v1,
            payoff_2=v2,
            is_pure=(len(supp1) == 1 and len(supp2) == 1),
            support_1=supp1,
            support_2=supp2,
            max_incentive_to_deviate_1=dev1,
            max_incentive_to_deviate_2=dev2,
        )

        return LemkeHowsonResult(
            equilibrium=eq,
            pivots_count=pivots_count,
            dropped_label=k_init,
        )


# ---------------------------------------------------------------------------
# 3. Bilevel Stackelberg Solver (SSE & WSE)
# ---------------------------------------------------------------------------

class BilevelStackelbergSolver:
    """Exact Bilevel Stackelberg equilibrium solver under Strong (SSE) and Weak (WSE) rules.

    Supports both pure-strategy leader commitment and mixed-strategy leader commitment
    via the Conitzer-Sandholm multiple linear programming formulation.
    """

    def __init__(self, tolerance: float = 1e-8) -> None:
        self.tolerance = tolerance

    def solve_pure(
        self,
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
        mode: str = "SSE",
    ) -> StackelbergEquilibriumResult:
        """Solves finite Stackelberg game with pure leader commitment."""
        A, B = extract_bimatrix(game)
        m, n = A.shape
        mode_upper = mode.upper()
        if mode_upper not in ("SSE", "WSE"):
            mode_upper = "SSE"

        best_leader_action = 0
        best_follower_action = 0
        best_leader_payoff = float("-inf")
        best_follower_payoff = float("-inf")
        optimal_br_set: tuple[int, ...] = ()

        for a1 in range(m):
            f_payoffs = B[a1, :]
            max_f = np.max(f_payoffs)
            best_responses = np.where(f_payoffs >= max_f - self.tolerance)[0]

            if mode_upper == "SSE":
                # Follower breaks ties in favor of Leader (Strong Stackelberg)
                chosen_a2 = best_responses[np.argmax(A[a1, best_responses])]
            else:
                # Follower breaks ties adversarially against Leader (Weak Stackelberg)
                chosen_a2 = best_responses[np.argmin(A[a1, best_responses])]

            l_payoff = float(A[a1, chosen_a2])
            f_payoff = float(B[a1, chosen_a2])

            if l_payoff > best_leader_payoff:
                best_leader_payoff = l_payoff
                best_follower_payoff = f_payoff
                best_leader_action = a1
                best_follower_action = int(chosen_a2)
                optimal_br_set = tuple(int(x) for x in best_responses)

        x = np.zeros(m, dtype=np.float64)
        x[best_leader_action] = 1.0
        y = np.zeros(n, dtype=np.float64)
        y[best_follower_action] = 1.0

        return StackelbergEquilibriumResult(
            leader_strategy=x,
            follower_response=y,
            follower_action_idx=best_follower_action,
            leader_payoff=best_leader_payoff,
            follower_payoff=best_follower_payoff,
            mode=mode_upper,
            is_mixed_leader=False,
            follower_best_responses=optimal_br_set,
        )

    def solve_mixed(
        self,
        game: FiniteNormalFormGame | tuple[np.ndarray, np.ndarray],
    ) -> StackelbergEquilibriumResult:
        """Computes optimal mixed-strategy commitment for Leader (Strong Stackelberg Equilibrium)

        Solves n linear programs (one for each follower target pure response) and picks the maximum.
        """
        import scipy.optimize as opt

        A, B = extract_bimatrix(game)
        m, n = A.shape

        best_leader_val = float("-inf")
        best_p: np.ndarray | None = None
        best_target_j = 0
        best_follower_val = 0.0

        for j in range(n):
            # Formulate LP to incentivize follower to play action j
            # Maximize: sum_i p_i * A[i, j]
            # Subject to:
            #   sum_i p_i * (B[i, j] - B[i, k]) >= 0 for all k != j
            #   sum p_i = 1
            #   p_i >= 0
            c = -A[:, j]  # scipy minimizes c^T p

            # Constraints: (B[:, k] - B[:, j])^T p <= 0
            G_rows = []
            for k in range(n):
                if k != j:
                    G_rows.append(B[:, k] - B[:, j])

            if G_rows:
                A_ub = np.array(G_rows, dtype=np.float64)
                b_ub = np.zeros(len(G_rows), dtype=np.float64)
            else:
                A_ub = None
                b_ub = None

            A_eq = np.ones((1, m), dtype=np.float64)
            b_eq = np.array([1.0], dtype=np.float64)
            bounds = [(0.0, 1.0) for _ in range(m)]

            res = opt.linprog(
                c=c,
                A_ub=A_ub,
                b_ub=b_ub,
                A_eq=A_eq,
                b_eq=b_eq,
                bounds=bounds,
                method="highs",
            )

            if res.success:
                l_payoff = float(-res.fun)
                p_sol = res.x
                f_payoff = float(np.sum(p_sol * B[:, j]))

                if l_payoff > best_leader_val:
                    best_leader_val = l_payoff
                    best_p = p_sol
                    best_target_j = j
                    best_follower_val = f_payoff

        if best_p is None:
            # Fallback to pure
            return self.solve_pure(game, mode="SSE")

        y = np.zeros(n, dtype=np.float64)
        y[best_target_j] = 1.0

        return StackelbergEquilibriumResult(
            leader_strategy=best_p,
            follower_response=y,
            follower_action_idx=best_target_j,
            leader_payoff=best_leader_val,
            follower_payoff=best_follower_val,
            mode="SSE",
            is_mixed_leader=True,
            follower_best_responses=(best_target_j,),
        )
