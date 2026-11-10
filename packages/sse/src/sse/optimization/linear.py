"""Linear programming solver and zero-sum game minimax optimization."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    np = None  # type: ignore[assignment]
    _HAS_NUMPY = False

try:
    from scipy.optimize import linprog as _scipy_linprog
    _HAS_SCIPY = True
except ImportError:
    _scipy_linprog = None  # type: ignore[assignment]
    _HAS_SCIPY = False


@dataclass(frozen=True, slots=True)
class LPResult:
    """Result of a linear program optimization.

    Attributes:
        status: Optimization termination status ("optimal", "infeasible", "unbounded", "failed").
        optimal_value: Objective function value at optimal solution.
        solution: Optimal primal decision variable values.
        dual_values: Marginal shadow prices / dual variables if available.
        iterations: Number of simplex/interior-point iterations executed.
        success: Whether the solver successfully converged to an optimal solution.
        message: Description string from the underlying solver.
    """

    status: str
    optimal_value: float | None
    solution: tuple[float, ...] | None
    dual_values: tuple[float, ...] | None
    iterations: int = 0
    success: bool = True
    message: str = ""


class LinearProgramSolver:
    """Solve linear programs and compute minimax equilibria for zero-sum games."""

    def __init__(self, method: str = "highs") -> None:
        self.method = method

    def solve(
        self,
        c: Sequence[float],
        A_ub: Sequence[Sequence[float]] | None = None,
        b_ub: Sequence[float] | None = None,
        A_eq: Sequence[Sequence[float]] | None = None,
        b_eq: Sequence[float] | None = None,
        bounds: Sequence[tuple[float | None, float | None]] | None = None,
    ) -> LPResult:
        """Solve a linear program:

            minimize   c^T x
            subject to A_ub x <= b_ub
                       A_eq x == b_eq
                       bounds_i[0] <= x_i <= bounds_i[1]

        Args:
            c: Objective coefficients vector of length n.
            A_ub: Inequality constraint matrix (m_ub x n).
            b_ub: Inequality upper-bounds vector of length m_ub.
            A_eq: Equality constraint matrix (m_eq x n).
            b_eq: Equality target vector of length m_eq.
            bounds: Per-variable (lower, upper) bound pairs.
        """
        if not c:
            raise ValueError("Objective vector c must not be empty.")

        n_vars = len(c)
        if any(not math.isfinite(val) for val in c):
            raise ValueError("All objective coefficients in c must be finite real numbers.")

        # Validate A_ub and b_ub
        if A_ub is not None or b_ub is not None:
            if A_ub is None or b_ub is None:
                raise ValueError("Both A_ub and b_ub must be provided together.")
            if len(A_ub) != len(b_ub):
                raise ValueError(
                    f"Row count of A_ub ({len(A_ub)}) does not match len(b_ub) ({len(b_ub)})."
                )
            for row_idx, row in enumerate(A_ub):
                if len(row) != n_vars:
                    raise ValueError(
                        f"Row {row_idx} of A_ub has length {len(row)}; expected {n_vars}."
                    )

        # Validate A_eq and b_eq
        if A_eq is not None or b_eq is not None:
            if A_eq is None or b_eq is None:
                raise ValueError("Both A_eq and b_eq must be provided together.")
            if len(A_eq) != len(b_eq):
                raise ValueError(
                    f"Row count of A_eq ({len(A_eq)}) does not match len(b_eq) ({len(b_eq)})."
                )
            for row_idx, row in enumerate(A_eq):
                if len(row) != n_vars:
                    raise ValueError(
                        f"Row {row_idx} of A_eq has length {len(row)}; expected {n_vars}."
                    )

        # Validate bounds
        if bounds is not None and len(bounds) != n_vars:
            raise ValueError(
                f"Bounds length ({len(bounds)}) must equal variable count ({n_vars})."
            )

        if _HAS_SCIPY:
            return self._solve_scipy(c, A_ub, b_ub, A_eq, b_eq, bounds)
        return self._solve_pure_python(c, A_ub, b_ub, A_eq, b_eq, bounds)

    def _solve_scipy(
        self,
        c: Sequence[float],
        A_ub: Sequence[Sequence[float]] | None,
        b_ub: Sequence[float] | None,
        A_eq: Sequence[Sequence[float]] | None,
        b_eq: Sequence[float] | None,
        bounds: Sequence[tuple[float | None, float | None]] | None,
    ) -> LPResult:
        """Execute linear program via scipy.optimize.linprog."""
        assert _scipy_linprog is not None
        c_list = list(c)
        A_ub_list = [list(r) for r in A_ub] if A_ub is not None else None
        b_ub_list = list(b_ub) if b_ub is not None else None
        A_eq_list = [list(r) for r in A_eq] if A_eq is not None else None
        b_eq_list = list(b_eq) if b_eq is not None else None

        res = _scipy_linprog(
            c=c_list,
            A_ub=A_ub_list,
            b_ub=b_ub_list,
            A_eq=A_eq_list,
            b_eq=b_eq_list,
            bounds=bounds,
            method=self.method,
        )

        status_map = {
            0: "optimal",
            1: "iteration_limit",
            2: "infeasible",
            3: "unbounded",
            4: "numerical_difficulties",
        }
        status_str = status_map.get(res.status, "failed")

        opt_val = (
            float(res.fun)
            if res.fun is not None and math.isfinite(res.fun)
            else None
        )
        sol = (
            tuple(float(x) for x in res.x)
            if res.x is not None
            else None
        )

        dual_list: list[float] = []
        if hasattr(res, "ineqlin") and res.ineqlin is not None and hasattr(res.ineqlin, "marginals"):
            if res.ineqlin.marginals is not None:
                dual_list.extend(float(m) for m in res.ineqlin.marginals)
        if hasattr(res, "eqlin") and res.eqlin is not None and hasattr(res.eqlin, "marginals"):
            if res.eqlin.marginals is not None:
                dual_list.extend(float(m) for m in res.eqlin.marginals)

        dual_tuple = tuple(dual_list) if dual_list else None
        nit = int(getattr(res, "nit", 0))

        return LPResult(
            status=status_str,
            optimal_value=opt_val,
            solution=sol,
            dual_values=dual_tuple,
            iterations=nit,
            success=bool(res.success),
            message=str(res.message),
        )

    def _solve_pure_python(
        self,
        c: Sequence[float],
        A_ub: Sequence[Sequence[float]] | None,
        b_ub: Sequence[float] | None,
        A_eq: Sequence[Sequence[float]] | None,
        b_eq: Sequence[float] | None,
        bounds: Sequence[tuple[float | None, float | None]] | None,
    ) -> LPResult:
        """Pure-Python fallback implementation using a two-phase simplex algorithm."""
        # Convert LP to standard form: min c^T x s.t. A x = b, x >= 0
        # If variables are bounded or free, handle coordinate shifts.
        n = len(c)
        ub_rows = len(b_ub) if b_ub is not None else 0
        eq_rows = len(b_eq) if b_eq is not None else 0
        m = ub_rows + eq_rows

        if m == 0:
            # Unconstrained linear objective
            if all(abs(val) < 1e-12 for val in c):
                return LPResult(
                    status="optimal",
                    optimal_value=0.0,
                    solution=tuple(0.0 for _ in range(n)),
                    dual_values=None,
                    iterations=0,
                    success=True,
                    message="Zero objective unconstrained problem",
                )
            return LPResult(
                status="unbounded",
                optimal_value=None,
                solution=None,
                dual_values=None,
                iterations=0,
                success=False,
                message="Unconstrained non-zero objective",
            )

        # Standard bounds check: default is (0, None) if not specified
        bounds if bounds is not None else [(0.0, None) for _ in range(n)]

        # Construct standard tableau rows
        tableau: list[list[float]] = []
        rhs: list[float] = []

        # Add inequality rows with slack variables
        slack_count = ub_rows
        current_slack = 0

        if A_ub is not None and b_ub is not None:
            for i, row in enumerate(A_ub):
                b_val = b_ub[i]
                r = list(row)
                # Slack columns
                slack_col = [0.0] * slack_count
                if b_val < 0:
                    # Invert row so b >= 0
                    r = [-val for val in r]
                    slack_col[current_slack] = -1.0
                    b_val = -b_val
                else:
                    slack_col[current_slack] = 1.0
                current_slack += 1
                tableau.append(r + slack_col)
                rhs.append(b_val)

        if A_eq is not None and b_eq is not None:
            for i, row in enumerate(A_eq):
                b_val = b_eq[i]
                r = list(row)
                slack_col = [0.0] * slack_count
                if b_val < 0:
                    r = [-val for val in r]
                    b_val = -b_val
                tableau.append(r + slack_col)
                rhs.append(b_val)

        total_cols = n + slack_count
        # Phase 1: Add artificial variables for all rows without a positive basis
        art_vars = m
        phase1_obj = [0.0] * total_cols + [1.0] * art_vars + [0.0]  # RHS in last col

        full_tableau: list[list[float]] = []
        for i in range(m):
            art_row = [0.0] * art_vars
            art_row[i] = 1.0
            full_tableau.append(tableau[i] + art_row + [rhs[i]])

        # Eliminate artificial variables from Phase 1 objective row
        for i in range(m):
            for j in range(len(phase1_obj)):
                phase1_obj[j] -= full_tableau[i][j]

        full_tableau.append(phase1_obj)
        basis = [total_cols + i for i in range(m)]

        # Simplex loop for Phase 1
        nit = 0
        max_nit = 1000
        while nit < max_nit:
            nit += 1
            # Find entering column (most negative in obj row)
            obj_row = full_tableau[-1]
            entering_col = -1
            min_c = -1e-9
            for j in range(len(obj_row) - 1):
                if obj_row[j] < min_c:
                    min_c = obj_row[j]
                    entering_col = j

            if entering_col == -1:
                # Optimal for Phase 1
                break

            # Minimum ratio test
            leaving_row = -1
            min_ratio = float("inf")
            for i in range(m):
                coeff = full_tableau[i][entering_col]
                if coeff > 1e-9:
                    ratio = full_tableau[i][-1] / coeff
                    if ratio < min_ratio:
                        min_ratio = ratio
                        leaving_row = i

            if leaving_row == -1:
                return LPResult(
                    status="unbounded",
                    optimal_value=None,
                    solution=None,
                    dual_values=None,
                    iterations=nit,
                    success=False,
                    message="Phase 1 unbounded",
                )

            # Pivot on (leaving_row, entering_col)
            pivot_val = full_tableau[leaving_row][entering_col]
            for j in range(len(full_tableau[0])):
                full_tableau[leaving_row][j] /= pivot_val
            for i in range(len(full_tableau)):
                if i != leaving_row:
                    factor = full_tableau[i][entering_col]
                    for j in range(len(full_tableau[0])):
                        full_tableau[i][j] -= factor * full_tableau[leaving_row][j]

            basis[leaving_row] = entering_col

        # Check Phase 1 feasibility
        phase1_val = -full_tableau[-1][-1]
        if abs(phase1_val) > 1e-6:
            return LPResult(
                status="infeasible",
                optimal_value=None,
                solution=None,
                dual_values=None,
                iterations=nit,
                success=False,
                message="Problem is infeasible (Phase 1 objective > 0)",
            )

        # Phase 2: Construct original objective row
        phase2_obj = list(c) + [0.0] * slack_count + [0.0]
        phase2_tableau: list[list[float]] = []
        for i in range(m):
            phase2_tableau.append(full_tableau[i][:total_cols] + [full_tableau[i][-1]])

        # Eliminate basic variables from objective
        for i in range(m):
            b_var = basis[i]
            if b_var < total_cols:
                cost = phase2_obj[b_var]
                for j in range(total_cols):
                    phase2_obj[j] -= cost * phase2_tableau[i][j]
                phase2_obj[-1] -= cost * phase2_tableau[i][-1]

        phase2_tableau.append(phase2_obj)

        # Simplex loop for Phase 2
        while nit < max_nit:
            nit += 1
            obj_row = phase2_tableau[-1]
            entering_col = -1
            min_c = -1e-9
            for j in range(total_cols):
                if obj_row[j] < min_c:
                    min_c = obj_row[j]
                    entering_col = j

            if entering_col == -1:
                # Optimal solution found
                break

            leaving_row = -1
            min_ratio = float("inf")
            for i in range(m):
                coeff = phase2_tableau[i][entering_col]
                if coeff > 1e-9:
                    ratio = phase2_tableau[i][-1] / coeff
                    if ratio < min_ratio:
                        min_ratio = ratio
                        leaving_row = i

            if leaving_row == -1:
                return LPResult(
                    status="unbounded",
                    optimal_value=None,
                    solution=None,
                    dual_values=None,
                    iterations=nit,
                    success=False,
                    message="Problem is unbounded",
                )

            pivot_val = phase2_tableau[leaving_row][entering_col]
            for j in range(len(phase2_tableau[0])):
                phase2_tableau[leaving_row][j] /= pivot_val
            for i in range(len(phase2_tableau)):
                if i != leaving_row:
                    factor = phase2_tableau[i][entering_col]
                    for j in range(len(phase2_tableau[0])):
                        phase2_tableau[i][j] -= factor * phase2_tableau[leaving_row][j]

            basis[leaving_row] = entering_col

        sol_full = [0.0] * total_cols
        for i in range(m):
            if basis[i] < total_cols:
                sol_full[basis[i]] = phase2_tableau[i][-1]

        primal_sol = tuple(float(sol_full[j]) for j in range(n))
        opt_val = float(sum(c[j] * primal_sol[j] for j in range(n)))

        return LPResult(
            status="optimal",
            optimal_value=opt_val,
            solution=primal_sol,
            dual_values=None,
            iterations=nit,
            success=True,
            message="Optimal solution found via pure Python simplex",
        )

    def solve_zero_sum_game(
        self, payoff_matrix: Sequence[Sequence[float]] | Any
    ) -> tuple[LPResult, list[float], list[float]]:
        """Solve a two-player zero-sum game via the linear programming dual pair.

        Computes the minimax value and optimal mixed strategies for both players.
        Payoff matrix entries M[i][j] represent the payoff to the Row player
        when Row plays action i and Column plays action j. The Column player receives -M[i][j].

        Returns:
            A tuple of (lp_result, row_strategy, col_strategy).
        """
        # Validate payoff matrix
        if not payoff_matrix:
            raise ValueError("payoff_matrix must not be empty.")

        rows = [list(r) for r in payoff_matrix]
        m = len(rows)
        n = len(rows[0])
        if m == 0 or n == 0:
            raise ValueError("payoff_matrix must have dimensions m >= 1 and n >= 1.")
        for r_idx, row in enumerate(rows):
            if len(row) != n:
                raise ValueError(
                    f"Row {r_idx} has length {len(row)}; all rows must have length {n}."
                )
            if any(not math.isfinite(val) for val in row):
                raise ValueError("All payoff entries must be finite numbers.")

        # --- Row Player LP Formulation ---
        # Variables: x = [p_0, p_1, ..., p_{m-1}, v] (length m + 1)
        # Minimize: -v (equivalent to maximizing game value v)
        c_row = [0.0] * m + [-1.0]

        # Inequality constraints:
        # For each column j in {0, ..., n-1}:
        # v - sum_{i=0}^{m-1} p_i * M[i][j] <= 0
        # => sum_{i=0}^{m-1} (-M[i][j]) * p_i + 1 * v <= 0
        A_ub_row: list[list[float]] = []
        b_ub_row: list[float] = []
        for j in range(n):
            constraint_row = [-rows[i][j] for i in range(m)] + [1.0]
            A_ub_row.append(constraint_row)
            b_ub_row.append(0.0)

        # Equality constraint: sum_{i=0}^{m-1} p_i = 1 (v coefficient is 0)
        A_eq_row = [[1.0] * m + [0.0]]
        b_eq_row = [1.0]

        # Bounds: p_i in [0.0, 1.0], v in (-inf, inf)
        bounds_row: list[tuple[float | None, float | None]] = [(0.0, 1.0)] * m + [(None, None)]

        res_row = self.solve(
            c=c_row,
            A_ub=A_ub_row,
            b_ub=b_ub_row,
            A_eq=A_eq_row,
            b_eq=b_eq_row,
            bounds=bounds_row,
        )

        if not res_row.success or res_row.solution is None:
            # Fallback uniform strategies
            row_strat = [1.0 / m] * m
            col_strat = [1.0 / n] * n
            return res_row, row_strat, col_strat

        # Extract Row strategy p*
        p_raw = [max(0.0, float(res_row.solution[i])) for i in range(m)]
        p_sum = sum(p_raw)
        row_strat = [val / p_sum for val in p_raw] if p_sum > 0 else [1.0 / m] * m

        # --- Column Player LP Formulation ---
        # Variables: y = [q_0, q_1, ..., q_{n-1}, u] (length n + 1)
        # Minimize: u (minimum upper bound on Row player's payoff)
        c_col = [0.0] * n + [1.0]

        # Inequality constraints:
        # For each row i in {0, ..., m-1}:
        # sum_{j=0}^{n-1} M[i][j] * q_j - u <= 0
        A_ub_col: list[list[float]] = []
        b_ub_col: list[float] = []
        for i in range(m):
            constraint_col = [rows[i][j] for j in range(n)] + [-1.0]
            A_ub_col.append(constraint_col)
            b_ub_col.append(0.0)

        # Equality constraint: sum_{j=0}^{n-1} q_j = 1 (u coefficient is 0)
        A_eq_col = [[1.0] * n + [0.0]]
        b_eq_col = [1.0]

        # Bounds: q_j in [0.0, 1.0], u in (-inf, inf)
        bounds_col: list[tuple[float | None, float | None]] = [(0.0, 1.0)] * n + [(None, None)]

        res_col = self.solve(
            c=c_col,
            A_ub=A_ub_col,
            b_ub=b_ub_col,
            A_eq=A_eq_col,
            b_eq=b_eq_col,
            bounds=bounds_col,
        )

        if res_col.success and res_col.solution is not None:
            q_raw = [max(0.0, float(res_col.solution[j])) for j in range(n)]
            q_sum = sum(q_raw)
            col_strat = [val / q_sum for val in q_raw] if q_sum > 0 else [1.0 / n] * n
        else:
            col_strat = [1.0 / n] * n

        return res_row, row_strat, col_strat
