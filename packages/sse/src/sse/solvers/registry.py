"""Central solver discovery, typing protocol, and registry for SSE."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from sse.core.types import GameFamily


@runtime_checkable
class Solver(Protocol):
    """Protocol satisfied by all game theory solver implementations."""

    name: str
    supported_families: tuple[GameFamily, ...]

    def solve(self, game: Any, **kwargs: Any) -> Any:
        """Execute the solution algorithm and return a typed SolverResult."""
        ...


class SolverRegistry:
    """Thread-safe catalog of registered mathematical solvers."""

    def __init__(self) -> None:
        self._solvers: dict[str, Solver] = {}

    def register(self, solver: Solver) -> None:
        """Register a solver instance."""
        if not hasattr(solver, "name") or not solver.name:
            raise ValueError("Solver must have a non-empty 'name' attribute.")
        self._solvers[solver.name] = solver

    def get(self, name: str) -> Solver:
        """Retrieve solver by name."""
        if name not in self._solvers:
            raise KeyError(
                f"Solver '{name}' is not registered. Available solvers: {list(self._solvers.keys())}"
            )
        return self._solvers[name]

    def list_solvers(self, family: GameFamily | None = None) -> list[str]:
        """List solver names, optionally filtered by supported game family."""
        if family is None:
            return sorted(self._solvers.keys())
        return sorted(
            name
            for name, solver in self._solvers.items()
            if hasattr(solver, "supported_families") and family in solver.supported_families
        )

    def solve(self, solver_name: str, game: Any, **kwargs: Any) -> Any:
        """Convenience method to retrieve and invoke a solver."""
        return self.get(solver_name).solve(game, **kwargs)


# Global singleton registry
registry = SolverRegistry()

