# Developer & Extensibility Guide
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-DEV-001  
**Release:** 1.0.0  

---

### 1. Codebase Architecture

The codebase lives under `src/sse/`:
```
src/sse/
├── __init__.py           # Top-level exports and version
├── cli.py                # Command-line interface
├── io.py                 # File I/O helpers
├── models.py             # Canonical FiniteNormalFormGame contract
├── core/                 # Universal game models, types, actions, strategies
├── optimization/         # LP, NLP, and Pareto optimization
├── solvers/              # 10 mathematical equilibrium solvers & registry
├── simulation/           # Execution engine, experiments, sensitivity sweeps
├── agents/               # Multi-agent systems, RL, learning, tournaments
├── domains/              # 7 domain extension modules and scenarios
├── storage/              # JSON filesystem persistence and CRUD repositories
├── plugins/              # Dynamic plugin discovery and validation framework
├── sdk/                  # Public Python SDK client
└── api/                  # FastAPI REST endpoints
```

---

### 2. Creating a Custom Mathematical Solver

To implement a new solver, subclass `Solver` from `sse.solvers.registry` and register it:

```python
from sse.core.types import GameFamily
from sse.solvers.base import SolverMetadata, SolverResult
from sse.solvers.registry import registry

class MyCustomSolver:
    name = "my_custom_solver"
    supported_families = (GameFamily.NORMAL_FORM,)

    def solve(self, game, tolerance: float = 0.0) -> SolverResult:
        # Implement algorithm
        return SolverResult(
            status="solved",
            solution_count=1,
            diagnostics={"custom_stat": 42},
            metadata=SolverMetadata(
                solver=self.name,
                method="custom_heuristic",
                exact=False,
                tolerance=tolerance,
            ),
        )

# Register into the global catalog
registry.register(MyCustomSolver())
```

---

### 3. Creating a Domain Extension

To create a new application domain:

1. Create a directory `src/sse/domains/my_domain/` with:
   - `models.py`: Domain-specific parameters translating to game instances.
   - `scenarios.py`: Functions returning pre-configured `FiniteNormalFormGame` instances.
   - `__init__.py`: Implements `DomainExtension` interface.
2. Register the domain in `sse.domains.DomainRegistry.register(MyDomain())`.
3. Add unit tests in `tests/test_domains/`.

---

### 4. Running Quality Gates

```bash
# Run all tests
pytest

# Code style checking
ruff check src/ tests/

# Type checking
mypy src/
```

