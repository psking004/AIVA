"""Correlated equilibrium solver via linear programming for finite normal-form games."""

from __future__ import annotations

from dataclasses import dataclass, field

from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.optimization.linear import LinearProgramSolver
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class CorrelatedEquilibriumResult(SolverResult):
    """Result of correlated equilibrium linear programming optimization."""

    joint_distribution: dict[tuple[str, ...], float] = field(default_factory=dict)
    expected_payoffs: tuple[float, ...] = ()
    social_welfare: float = 0.0


class CorrelatedEquilibriumSolver:
    """Compute an optimal correlated equilibrium (CE) maximizing social welfare."""

    name = "correlated_equilibrium"
    supported_families = (GameFamily.NORMAL_FORM,)

    def solve(
        self,
        game: FiniteNormalFormGame,
        objective_mode: str = "social_welfare",
        tolerance: float = 1e-7,
    ) -> CorrelatedEquilibriumResult:
        """Formulate and solve correlated equilibrium incentive constraints via LP."""
        profiles = list(game.profiles())
        num_profiles = len(profiles)

        # Map each profile index to its social welfare: sum_i u_i(s)
        social_welfares = [sum(game.payoff(p)) for p in profiles]

        # Objective: minimize -sum_{s} p(s) * welfare(s)
        c = [-w for w in social_welfares]

        A_ub: list[list[float]] = []
        b_ub: list[float] = []

        # Incentive constraints:
        # For each player i, for each pair of distinct actions a_i, a_i':
        # sum_{s_{-i}} p(a_i, s_{-i}) [u_i(a_i', s_{-i}) - u_i(a_i, s_{-i})] <= 0
        for p_idx, player in enumerate(game.players):
            n_acts = game.action_counts[p_idx]
            for a_i in range(n_acts):
                for a_prime in range(n_acts):
                    if a_i == a_prime:
                        continue
                    row = [0.0] * num_profiles
                    for prof_idx, prof in enumerate(profiles):
                        if prof[p_idx] == a_i:
                            # Deviation profile where player p_idx switches to a_prime
                            dev_prof = list(prof)
                            dev_prof[p_idx] = a_prime
                            u_orig = game.payoff(prof)[p_idx]
                            u_dev = game.payoff(dev_prof)[p_idx]
                            row[prof_idx] = u_dev - u_orig
                    A_ub.append(row)
                    b_ub.append(0.0)

        # Sum of probabilities == 1
        A_eq = [[1.0] * num_profiles]
        b_eq = [1.0]

        # Bounds: p(s) >= 0
        bounds = [(0.0, 1.0)] * num_profiles

        lp_solver = LinearProgramSolver()
        lp_res = lp_solver.solve(c=c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq, bounds=bounds)

        if not lp_res.success or lp_res.solution is None:
            return CorrelatedEquilibriumResult(
                status="no_solution",
                solution_count=0,
                diagnostics={"message": "Infeasible correlated equilibrium LP."},
                metadata=SolverMetadata(
                    solver=self.name,
                    method="correlated_equilibrium_linear_program",
                    exact=True,
                ),
                joint_distribution={},
                expected_payoffs=tuple(0.0 for _ in game.players),
                social_welfare=0.0,
            )

        sol = lp_res.solution
        joint_dist: dict[tuple[str, ...], float] = {}
        for prof_idx, prof in enumerate(profiles):
            prob = max(0.0, sol[prof_idx])
            if prob > tolerance:
                act_names = game.action_names(prof)
                joint_dist[act_names] = prob

        # Normalize in case of tiny precision inaccuracies
        total_p = sum(joint_dist.values())
        if total_p > 0:
            joint_dist = {k: v / total_p for k, v in joint_dist.items()}

        # Compute expected payoffs
        exp_payoffs = [0.0] * len(game.players)
        for prof_idx, prof in enumerate(profiles):
            prob = max(0.0, sol[prof_idx])
            p_vec = game.payoff(prof)
            for i in range(len(game.players)):
                exp_payoffs[i] += prob * p_vec[i]

        return CorrelatedEquilibriumResult(
            status="solved",
            solution_count=1,
            diagnostics={
                "profiles": num_profiles,
                "incentive_constraints": len(A_ub),
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="correlated_equilibrium_linear_program",
                exact=True,
                tolerance=tolerance,
                notes=("Correlated equilibrium maximizing utilitarian social welfare.",),
            ),
            joint_distribution=joint_dist,
            expected_payoffs=tuple(exp_payoffs),
            social_welfare=sum(exp_payoffs),
        )
