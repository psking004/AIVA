"""Evolutionary game theory solvers: replicator dynamics and ESS verification."""

from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass

from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame
from sse.solvers.base import SolverMetadata, SolverResult


@dataclass(frozen=True, slots=True)
class ReplicatorResult(SolverResult):
    """Result of replicator dynamics trajectory integration."""

    initial_state: tuple[float, ...] = ()
    final_state: tuple[float, ...] = ()
    trajectory: tuple[tuple[float, ...], ...] = ()
    converged: bool = False
    iterations: int = 0


@dataclass(frozen=True, slots=True)
class ESSResult(SolverResult):
    """Result of Evolutionarily Stable Strategy (ESS) verification."""

    pure_ess_strategies: tuple[str, ...] = ()
    all_tested_strategies: tuple[str, ...] = ()


class EvolutionarySolver:
    """Simulate evolutionary dynamics and analyze population stability."""

    name = "evolutionary"
    supported_families = (GameFamily.EVOLUTIONARY, GameFamily.NORMAL_FORM)

    def replicator_dynamics(
        self,
        payoff_matrix: Sequence[Sequence[float]],
        initial_pop: Sequence[float] | None = None,
        dt: float = 0.01,
        max_steps: int = 5000,
        tol: float = 1e-6,
        record_interval: int = 10,
    ) -> ReplicatorResult:
        """Numerically integrate continuous replicator dynamics dx_i/dt = x_i (f_i(x) - f_avg(x))."""
        n = len(payoff_matrix)
        for row in payoff_matrix:
            if len(row) != n:
                raise ValueError("Payoff matrix must be square (symmetric 2-player game).")

        # Initialize population vector x
        if initial_pop is None:
            # Slightly perturbed uniform
            x = [1.0 / n] * n
        else:
            if len(initial_pop) != n:
                raise ValueError(f"initial_pop length ({len(initial_pop)}) must equal n ({n}).")
            sum_init = sum(initial_pop)
            if sum_init <= 0:
                raise ValueError("initial_pop must have positive sum.")
            x = [val / sum_init for val in initial_pop]

        trajectory: list[tuple[float, ...]] = [tuple(x)]
        converged = False
        step = 0

        for step in range(1, max_steps + 1):
            # Fitness: f_i = sum_j A_ij x_j
            fitnesses = [sum(payoff_matrix[i][j] * x[j] for j in range(n)) for i in range(n)]
            avg_fitness = sum(x[i] * fitnesses[i] for i in range(n))

            # Replicator derivative dx_i/dt = x_i * (f_i - avg_fitness)
            dx = [x[i] * (fitnesses[i] - avg_fitness) for i in range(n)]

            # Euler step
            x_next = [max(0.0, x[i] + dt * dx[i]) for i in range(n)]
            sum_next = sum(x_next)
            if sum_next > 0:
                x_next = [val / sum_next for val in x_next]

            # Check convergence
            delta = max(abs(x_next[i] - x[i]) for i in range(n))
            x = x_next

            if step % record_interval == 0:
                trajectory.append(tuple(x))

            if delta < tol:
                converged = True
                break

        if trajectory[-1] != tuple(x):
            trajectory.append(tuple(x))

        return ReplicatorResult(
            status="solved" if converged else "approximate",
            solution_count=1,
            diagnostics={
                "converged": converged,
                "iterations": step,
                "dt": dt,
                "final_delta": delta,
            },
            metadata=SolverMetadata(
                solver=self.name,
                method="continuous_replicator_ode_euler",
                exact=False,
                tolerance=tol,
                notes=("Replicator dynamics simulation for symmetric population games.",),
            ),
            initial_state=trajectory[0],
            final_state=tuple(x),
            trajectory=tuple(trajectory),
            converged=converged,
            iterations=step,
        )

    def find_pure_ess(
        self,
        strategy_names: Sequence[str],
        payoff_matrix: Sequence[Sequence[float]],
        tolerance: float = 1e-7,
    ) -> ESSResult:
        """Identify pure strategies that satisfy Evolutionarily Stable Strategy (ESS) conditions."""
        n = len(strategy_names)
        A = payoff_matrix
        pure_ess: list[str] = []

        for i in range(n):
            is_ess = True
            for j in range(n):
                if i == j:
                    continue
                # Condition 1: u(s_i, s_i) > u(s_j, s_i) (strict Nash)
                u_ii = A[i][i]
                u_ji = A[j][i]

                if u_ii > u_ji + tolerance:
                    continue  # Condition 1 satisfied against mutant j
                elif abs(u_ii - u_ji) <= tolerance:
                    # Condition 2: u(s_i, s_j) > u(s_j, s_j) (mutant stability)
                    u_ij = A[i][j]
                    u_jj = A[j][j]
                    if u_ij > u_jj + tolerance:
                        continue
                    else:
                        is_ess = False
                        break
                else:
                    is_ess = False
                    break

            if is_ess:
                pure_ess.append(strategy_names[i])

        return ESSResult(
            status="solved",
            solution_count=len(pure_ess),
            diagnostics={"strategies_count": n},
            metadata=SolverMetadata(
                solver=self.name,
                method="maynard_smith_ess_conditions",
                exact=True,
                tolerance=tolerance,
                notes=("Maynard Smith & Price (1973) ESS criteria verification.",),
            ),
            pure_ess_strategies=tuple(pure_ess),
            all_tested_strategies=tuple(strategy_names),
        )

    def fictitious_play(
        self,
        game: FiniteNormalFormGame,
        rounds: int = 1000,
        seed: int | None = None,
    ) -> dict[str, list[float]]:
        """Simulate classical Brown's Fictitious Play on a 2-player game."""
        if len(game.players) != 2:
            raise ValueError("Fictitious play solver currently supports 2-player games.")

        rng = random.Random(seed)
        m, n = game.action_counts[0], game.action_counts[1]

        # Action counts
        counts1 = [0] * m
        counts2 = [0] * n

        # Initial random choices
        init1 = rng.randrange(m)
        init2 = rng.randrange(n)
        counts1[init1] += 1
        counts2[init2] += 1

        for r in range(1, rounds):
            # Player 1 best responds to empirical distribution of Player 2 (counts2)
            # E_1[i] = sum_j A_ij * (counts2[j] / r)
            best_a1 = max(
                range(m),
                key=lambda i: sum(game.payoff((i, j))[0] * counts2[j] for j in range(n)),
            )

            # Player 2 best responds to empirical distribution of Player 1 (counts1)
            best_a2 = max(
                range(n),
                key=lambda j: sum(game.payoff((i, j))[1] * counts1[i] for i in range(m)),
            )

            counts1[best_a1] += 1
            counts2[best_a2] += 1

        freq1 = [c / rounds for c in counts1]
        freq2 = [c / rounds for c in counts2]

        return {game.players[0].id: freq1, game.players[1].id: freq2}
