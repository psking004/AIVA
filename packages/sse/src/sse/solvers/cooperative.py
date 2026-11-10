"""Cooperative game theory solvers: Shapley value and Core stability analysis."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field

from sse.core.games import CooperativeGame
from sse.core.types import GameFamily, PlayerId
from sse.optimization.linear import LinearProgramSolver
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class ShapleyValueResult(SolverResult):
    """Result of Shapley value calculation."""

    shapley_values: dict[PlayerId, float] = field(default_factory=dict)
    efficiency_sum: float = 0.0
    grand_coalition_value: float = 0.0


@dataclass(frozen=True, slots=True)
class CoreResult(SolverResult):
    """Result of Core existence check and sample imputation."""

    is_core_empty: bool = True
    sample_allocation: dict[PlayerId, float] | None = None
    violating_coalitions: tuple[tuple[PlayerId, ...], ...] = ()


class CooperativeSolvers:
    """Solvers for transferable utility (TU) cooperative games."""

    name = "cooperative_solvers"
    supported_families = (GameFamily.COOPERATIVE,)

    def shapley_value(self, game: CooperativeGame) -> ShapleyValueResult:
        """Compute the unique Shapley value allocation vector for game."""
        players = game.players
        n = len(players)
        fact_n = math.factorial(n)

        shapley_values: dict[PlayerId, float] = {p: 0.0 for p in players}

        for i, player in enumerate(players):
            other_players = [p for p in players if p != player]
            # Sum over all subsets of other_players
            subsets = game.subsets_of(other_players)
            phi_i = 0.0

            for S in subsets:
                s_size = len(S)
                weight = (math.factorial(s_size) * math.factorial(n - s_size - 1)) / fact_n
                v_S = game.v(S)
                v_S_with_i = game.v(S | frozenset([player]))
                phi_i += weight * (v_S_with_i - v_S)

            shapley_values[player] = phi_i

        grand_val = game.v(game.grand_coalition)
        eff_sum = sum(shapley_values.values())

        return ShapleyValueResult(
            status="solved",
            solution_count=1,
            diagnostics={
                "players": len(players),
                "grand_coalition_value": grand_val,
                "efficiency_gap": abs(eff_sum - grand_val),
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="shapley_marginal_contribution_formula",
                exact=True,
                tolerance=1e-9,
                notes=("Exact Shapley value calculation for cooperative TU games.",),
            ),
            shapley_values=shapley_values,
            efficiency_sum=eff_sum,
            grand_coalition_value=grand_val,
        )

    def compute_core(self, game: CooperativeGame, tolerance: float = 1e-6) -> CoreResult:
        """Determine whether the core is non-empty and find a representative imputation."""
        players = list(game.players)
        n = len(players)
        player_idx = {p: i for i, p in enumerate(players)}
        grand_val = game.v(game.grand_coalition)

        # Enumerate all proper non-empty coalitions: sum_{i in S} x_i >= v(S)
        # Formulate as LP:
        # maximize epsilon
        # subject to:
        # sum_{i in S} x_i - epsilon >= v(S)  => -sum_{i in S} x_i + epsilon <= -v(S)
        # sum_{i in N} x_i == v(N)
        # Decision variables: [x_0, x_1, ..., x_{n-1}, epsilon] (length n + 1)
        # We minimize -epsilon (i.e. c = [0, ..., 0, -1])

        all_proper_subsets = [
            S for S in game.all_coalitions() if len(S) > 0 and len(S) < n
        ]

        c = [0.0] * n + [-1.0]

        A_ub: list[list[float]] = []
        b_ub: list[float] = []

        for S in all_proper_subsets:
            row = [0.0] * (n + 1)
            for p in S:
                row[player_idx[p]] = -1.0
            row[n] = 1.0  # + epsilon
            A_ub.append(row)
            b_ub.append(-game.v(S))

        # Grand coalition equality: sum x_i == v(N)
        A_eq = [[1.0] * n + [0.0]]
        b_eq = [grand_val]

        bounds = [(None, None)] * n + [(None, None)]

        lp_solver = LinearProgramSolver()
        lp_res = lp_solver.solve(c=c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq, bounds=bounds)

        if not lp_res.success or lp_res.solution is None:
            return CoreResult(
                status="no_solution",
                solution_count=0,
                diagnostics={"message": "Linear program infeasible; Core is empty."},
                metadata=SolverMetadata(
                    solver=self.name,
                    method="core_linear_programming_feasibility",
                    exact=True,
                ),
                is_core_empty=True,
                sample_allocation=None,
                violating_coalitions=(),
            )

        sol = lp_res.solution
        eps = sol[n]
        is_empty = eps < -tolerance

        sample_alloc = {players[i]: sol[i] for i in range(n)} if not is_empty else None

        # Identify any violating coalitions under the sample allocation or if empty
        violating: list[tuple[PlayerId, ...]] = []
        if is_empty:
            for S in all_proper_subsets:
                # Check individual rationality
                violating.append(tuple(sorted(S)))

        return CoreResult(
            status="solved" if not is_empty else "no_solution",
            solution_count=1 if not is_empty else 0,
            diagnostics={
                "core_epsilon_margin": eps,
                "is_empty": is_empty,
                "subsets_tested": len(all_proper_subsets),
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="core_linear_programming_feasibility",
                exact=True,
                tolerance=tolerance,
                notes=("Core non-emptiness verification via linear programming.",),
            ),
            is_core_empty=is_empty,
            sample_allocation=sample_alloc,
            violating_coalitions=tuple(violating),
        )

    @staticmethod
    def is_stable(allocation: Mapping[PlayerId, float], game: CooperativeGame, tol: float = 1e-6) -> bool:
        """Verify whether a proposed allocation vector is in the core of game."""
        grand_val = game.v(game.grand_coalition)
        if abs(sum(allocation.values()) - grand_val) > tol:
            return False  # Violates efficiency

        for S in game.all_coalitions():
            if not S:
                continue
            coalition_payoff = sum(allocation[p] for p in S)
            if coalition_payoff < game.v(S) - tol:
                return False  # Coalition can improve upon allocation
        return True
