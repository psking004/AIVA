"""Game-theoretic mathematical solver implementations and discovery."""

from sse.solvers.backward_induction import (
    BackwardInductionResult,
    BackwardInductionSolver,
)
from sse.solvers.base import SolverMetadata, SolverResult
from sse.solvers.cooperative import (
    CooperativeSolvers,
    CoreResult,
    ShapleyValueResult,
)
from sse.solvers.correlated import (
    CorrelatedEquilibriumResult,
    CorrelatedEquilibriumSolver,
)
from sse.solvers.dominant import (
    DominanceResult,
    DominantStrategySolver,
)
from sse.solvers.evolutionary import (
    ESSResult,
    EvolutionarySolver,
    ReplicatorResult,
)
from sse.solvers.minimax import (
    MinimaxResult,
    MinimaxSolver,
)
from sse.solvers.mixed_nash import (
    MixedNashEquilibrium,
    MixedNashResult,
    SupportEnumerationSolver,
)
from sse.solvers.pure_nash import (
    PureNashEquilibrium,
    PureNashResult,
    PureNashSolver,
)
from sse.solvers.registry import (
    Solver,
    SolverRegistry,
    registry,
)
from sse.solvers.regret import (
    RegretMatchingResult,
    RegretMatchingSolver,
)
from sse.solvers.stackelberg import (
    StackelbergResult,
    StackelbergSolver,
)

# Auto-register all built-in solvers
registry.register(PureNashSolver())
registry.register(SupportEnumerationSolver())
registry.register(DominantStrategySolver())
registry.register(MinimaxSolver())
registry.register(BackwardInductionSolver())
registry.register(CooperativeSolvers())
registry.register(CorrelatedEquilibriumSolver())
registry.register(EvolutionarySolver())
registry.register(StackelbergSolver())
registry.register(RegretMatchingSolver())

__all__ = [
    "BackwardInductionResult",
    "BackwardInductionSolver",
    "CooperativeSolvers",
    "CoreResult",
    "CorrelatedEquilibriumResult",
    "CorrelatedEquilibriumSolver",
    "DominanceResult",
    "DominantStrategySolver",
    "ESSResult",
    "EvolutionarySolver",
    "MinimaxResult",
    "MinimaxSolver",
    "MixedNashEquilibrium",
    "MixedNashResult",
    "PureNashEquilibrium",
    "PureNashResult",
    "PureNashSolver",
    "RegretMatchingResult",
    "RegretMatchingSolver",
    "ReplicatorResult",
    "ShapleyValueResult",
    "Solver",
    "SolverMetadata",
    "SolverRegistry",
    "SolverResult",
    "StackelbergResult",
    "StackelbergSolver",
    "SupportEnumerationSolver",
    "registry",
]
