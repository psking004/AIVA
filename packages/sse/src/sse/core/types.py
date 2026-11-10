"""Foundational type system, enums, aliases, and numerical precision contracts for SSE."""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum
from typing import TypeAlias


class GameFamily(StrEnum):
    """Classification of strategic game representations."""

    NORMAL_FORM = "NORMAL_FORM"
    EXTENSIVE_FORM = "EXTENSIVE_FORM"
    BAYESIAN = "BAYESIAN"
    COOPERATIVE = "COOPERATIVE"
    EVOLUTIONARY = "EVOLUTIONARY"
    STOCHASTIC = "STOCHASTIC"
    REPEATED = "REPEATED"
    CONGESTION = "CONGESTION"
    POTENTIAL = "POTENTIAL"
    MEAN_FIELD = "MEAN_FIELD"
    STACKELBERG = "STACKELBERG"


class SolverStatus(StrEnum):
    """Termination status of an equilibrium solver or optimization routine."""

    SOLVED = "solved"
    NO_SOLUTION = "no_solution"
    TIMEOUT = "timeout"
    ERROR = "error"
    APPROXIMATE = "approximate"


class PlayerType(StrEnum):
    """Role and nature of a participant in a game."""

    STRATEGIC = "STRATEGIC"
    NATURE = "NATURE"
    OBSERVER = "OBSERVER"


# Foundational type aliases
PlayerId: TypeAlias = str
ActionId: TypeAlias = str | int
Probability: TypeAlias = float
Payoff: TypeAlias = float
Seed: TypeAlias = int | None


@dataclass(frozen=True, slots=True)
class NumericPrecision:
    """Numerical tolerances and algorithmic bounds for game-theoretic solvers."""

    tolerance: float = 1e-9
    max_iterations: int = 1000
    convergence_threshold: float = 1e-7

    def __post_init__(self) -> None:
        if not math.isfinite(self.tolerance) or self.tolerance < 0.0:
            raise ValueError(
                f"tolerance must be a non-negative finite float, got {self.tolerance}"
            )
        if not isinstance(self.max_iterations, int) or isinstance(self.max_iterations, bool) or self.max_iterations <= 0:
            raise ValueError(
                f"max_iterations must be a positive integer, got {self.max_iterations}"
            )
        if not math.isfinite(self.convergence_threshold) or self.convergence_threshold < 0.0:
            raise ValueError(
                f"convergence_threshold must be a non-negative finite float, got {self.convergence_threshold}"
            )
