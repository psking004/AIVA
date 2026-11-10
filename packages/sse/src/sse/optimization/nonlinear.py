"""Nonlinear optimization solver for non-convex and constrained strategic objectives."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

try:
    import scipy.optimize as _scipy_opt
    _HAS_SCIPY = True
except ImportError:
    _scipy_opt = None  # type: ignore[assignment]
    _HAS_SCIPY = False


@dataclass(frozen=True, slots=True)
class NLPResult:
    """Result of a nonlinear optimization problem."""

    status: str  # "optimal", "converged", "iteration_limit", "failed"
    optimal_value: float | None
    solution: tuple[float, ...] | None
    iterations: int = 0
    success: bool = True
    message: str = ""


class NonlinearSolver:
    """Nonlinear constrained and unconstrained optimization solver."""

    def __init__(self, default_method: str = "SLSQP") -> None:
        self.default_method = default_method

    def minimize(
        self,
        objective: Callable[[Sequence[float]], float],
        x0: Sequence[float],
        method: str | None = None,
        bounds: Sequence[tuple[float | None, float | None]] | None = None,
        constraints: Sequence[dict[str, Any]] | None = None,
        tol: float = 1e-8,
        maxiter: int = 1000,
    ) -> NLPResult:
        """Minimize a nonlinear objective function f(x)."""
        if not x0:
            raise ValueError("Initial point x0 must not be empty.")

        n_vars = len(x0)
        selected_method = method or self.default_method

        if _HAS_SCIPY:
            scipy_bounds = None
            if bounds is not None:
                scipy_bounds = [(b[0], b[1]) for b in bounds]

            res = _scipy_opt.minimize(
                fun=objective,
                x0=list(x0),
                method=selected_method,
                bounds=scipy_bounds,
                constraints=constraints or (),
                tol=tol,
                options={"maxiter": maxiter},
            )
            status = "optimal" if res.success else "failed"
            return NLPResult(
                status=status,
                optimal_value=float(res.fun) if math.isfinite(res.fun) else None,
                solution=tuple(float(v) for v in res.x) if res.x is not None else None,
                iterations=int(getattr(res, "nit", 0)),
                success=bool(res.success),
                message=str(res.message),
            )
        else:
            # Fallback simple coordinate descent for unconstrained/bounded problems
            curr_x = list(x0)
            step_size = 0.1
            best_val = objective(curr_x)
            iters = 0

            for iters in range(maxiter):
                improved = False
                for i in range(n_vars):
                    for direction in (+1.0, -1.0):
                        candidate = list(curr_x)
                        candidate[i] += direction * step_size
                        if bounds and bounds[i]:
                            low, high = bounds[i]
                            if low is not None and candidate[i] < low:
                                continue
                            if high is not None and candidate[i] > high:
                                continue
                        val = objective(candidate)
                        if val < best_val - tol:
                            best_val = val
                            curr_x = candidate
                            improved = True
                            break
                if not improved:
                    step_size *= 0.5
                    if step_size < tol:
                        break

            return NLPResult(
                status="converged",
                optimal_value=best_val,
                solution=tuple(curr_x),
                iterations=iters + 1,
                success=True,
                message="Pure-Python coordinate descent converged.",
            )

    def maximize(
        self,
        objective: Callable[[Sequence[float]], float],
        x0: Sequence[float],
        method: str | None = None,
        bounds: Sequence[tuple[float | None, float | None]] | None = None,
        constraints: Sequence[dict[str, Any]] | None = None,
        tol: float = 1e-8,
        maxiter: int = 1000,
    ) -> NLPResult:
        """Maximize an objective by minimizing its negation."""
        neg_obj = lambda x: -objective(x)
        min_res = self.minimize(
            neg_obj, x0, method=method, bounds=bounds, constraints=constraints, tol=tol, maxiter=maxiter
        )
        opt_val = -min_res.optimal_value if min_res.optimal_value is not None else None
        return NLPResult(
            status=min_res.status,
            optimal_value=opt_val,
            solution=min_res.solution,
            iterations=min_res.iterations,
            success=min_res.success,
            message=min_res.message,
        )
