"""Strategic Systems Engine public package."""

from sse.models import FiniteNormalFormGame, GameValidationError, Player
from sse.solvers.pure_nash import PureNashResult, PureNashSolver

__all__ = [
    "FiniteNormalFormGame",
    "GameValidationError",
    "Player",
    "PureNashResult",
    "PureNashSolver",
]

__version__ = "0.1.0"
