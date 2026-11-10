# ADR 001: Modular Monolith Architecture Pattern

**Status:** Accepted  
**Date:** 2026-11-09  
**Deciders:** Principal Architect, Core Engineering Team  

---

### Context
Strategic game computation involves tightly coupled interactions: model definitions, strategy matrices, linear programming solvers, simulation loops, and domain scenario wrappers. Early microservice decomposition introduces severe serialization overhead, network latency, distributed state synchronization issues, and developer friction.

### Decision
SSE is implemented as an in-process, strongly typed **modular monolith** in Python 3.11+. Internal subsystems are cleanly partitioned into isolated packages (`sse.core`, `sse.solvers`, `sse.simulation`, `sse.optimization`, `sse.agents`, `sse.domains`, `sse.storage`, `sse.api`). Communication occurs via standard in-memory function calls with typed dataclasses and validation interfaces.

### Consequences
- **Positive:** Maximum execution speed, zero network serialization penalty, simple local testing and debugging, atomic transactions.
- **Negative:** Scale-out requires multi-process worker pools or task runners (supported via CLI and REST API).

