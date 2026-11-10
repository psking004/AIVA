# ADR 002: Optional Scientific Dependencies with Pure-Python Fallbacks

**Status:** Accepted  
**Date:** 2026-11-09  
**Deciders:** Senior Systems Programmer, Math Engine Team  

---

### Context
Scientific libraries like NumPy and SciPy require binary compilation, which can create platform incompatibilities on constrained systems or serverless runtimes. At the same time, matrix and linear programming performance benefits dramatically from compiled BLAS/LAPACK and HiGHS backends.

### Decision
Core data structures, game validation, pure Nash enumeration, discrete simulation, and basic optimization are implemented using **pure Python standard libraries** with zero required third-party dependencies. When `numpy` and `scipy` are present in the environment, solvers and matrix operations automatically leverage vectorized linear algebra and HiGHS simplex solvers.

### Consequences
- **Positive:** SSE core can be installed and executed anywhere Python 3.11+ runs without binary dependencies.
- **Positive:** High performance is unlocked seamlessly when scientific dependencies are installed.
- **Negative:** Dual-path testing is required to verify both pure-Python and accelerated routines.

