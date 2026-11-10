"""Multi-objective optimization and Pareto efficiency analysis for strategic outcomes."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ParetoFront:
    """Represents a discrete set of decision alternatives and their Pareto status."""

    solutions: tuple[tuple[float, ...], ...]
    objective_vectors: tuple[tuple[float, ...], ...]  # Maximization assumed
    pareto_indices: tuple[int, ...]

    def __post_init__(self) -> None:
        if len(self.solutions) != len(self.objective_vectors):
            raise ValueError("Solutions and objective vectors must have equal length.")

    @classmethod
    def compute(
        cls,
        solutions: Sequence[Sequence[float]],
        objective_vectors: Sequence[Sequence[float]],
        maximize: bool = True,
    ) -> ParetoFront:
        """Identify non-dominated solutions in a discrete set.

        A vector u dominates v if u_i >= v_i for all i and u_j > v_j for some j (for maximization).
        """
        sol_tuples = tuple(tuple(float(x) for x in s) for s in solutions)
        obj_tuples = tuple(tuple(float(y) for y in obj) for obj in objective_vectors)

        n = len(sol_tuples)
        if n == 0:
            return cls(solutions=(), objective_vectors=(), pareto_indices=())

        dim = len(obj_tuples[0])
        for obj in obj_tuples:
            if len(obj) != dim:
                raise ValueError("All objective vectors must have the same dimension.")

        pareto_indices: list[int] = []

        for i in range(n):
            dominated = False
            for j in range(n):
                if i == j:
                    continue
                # Check if j dominates i
                if maximize:
                    all_ge = all(obj_tuples[j][k] >= obj_tuples[i][k] for k in range(dim))
                    any_gt = any(obj_tuples[j][k] > obj_tuples[i][k] for k in range(dim))
                else:
                    all_ge = all(obj_tuples[j][k] <= obj_tuples[i][k] for k in range(dim))
                    any_gt = any(obj_tuples[j][k] < obj_tuples[i][k] for k in range(dim))

                if all_ge and any_gt:
                    dominated = True
                    break
            if not dominated:
                pareto_indices.append(i)

        return cls(
            solutions=sol_tuples,
            objective_vectors=obj_tuples,
            pareto_indices=tuple(pareto_indices),
        )

    def is_pareto_optimal(self, index: int) -> bool:
        """Check whether candidate with index is Pareto optimal."""
        return index in self.pareto_indices

    @property
    def pareto_solutions(self) -> tuple[tuple[float, ...], ...]:
        """Return only the Pareto-optimal solutions."""
        return tuple(self.solutions[i] for i in self.pareto_indices)

    @property
    def pareto_objectives(self) -> tuple[tuple[float, ...], ...]:
        """Return the objective values on the Pareto front."""
        return tuple(self.objective_vectors[i] for i in self.pareto_indices)
