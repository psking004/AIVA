# Testing & Mathematical Verification Strategy
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-TEST-001  
**Version:** 1.0.0  

---

### 1. Verification Principles

1. **Analytical Ground Truth:** Every solver algorithm is verified against canonical analytical solutions documented in the peer-reviewed game theory literature.
2. **Invariant Testing:** Property-based testing via `hypothesis` exercises mathematical invariants (e.g., probabilities sum to 1.0, minimax duality gap is zero, Shapley value efficiency axiom holds).
3. **No Silent Fallbacks:** Solvers report explicit convergence diagnostics. Tests strictly assert on solver metadata to ensure algorithms did not silently exit or fail.
4. **Boundary Condition Stress:** Game tensors are tested against single-action degenerate cases, negative payoffs, extreme payoff scaling, and floating-point edge cases.
5. **Zero Failing Tests:** All tests in the test suite must pass cleanly without skipping or suppression.

---

### 2. Test Architecture

| Suite | Scope | Target Coverage | Tooling |
|---|---|---|---|
| `tests/test_models.py` | FiniteNormalFormGame contract & validation | 100% | `pytest` |
| `tests/test_core/` | Universal abstractions (actions, strategies, games, serialization) | $\ge 90\%$ | `pytest`, `hypothesis` |
| `tests/test_solvers/` | Mathematical solver accuracy & benchmarks | $\ge 90\%$ | `pytest`, analytical benchmarks |
| `tests/test_simulation/` | Simulation engine, experiments, sensitivity | $\ge 85\%$ | `pytest` |
| `tests/test_agents/` | Heuristic, learning agents, and tournaments | $\ge 85\%$ | `pytest` |
| `tests/test_domains/` | Domain scenarios across all 7 domains | $\ge 85\%$ | `pytest` |
| `tests/test_api/` | REST API endpoints and error codes | $\ge 90\%$ | `pytest`, `httpx` / `fastapi.testclient` |
| `tests/test_integration/` | End-to-end workflows (create $\to$ solve $\to$ store $\to$ inspect) | $\ge 85\%$ | `pytest` |

---

### 3. Canonical Benchmark Test Cases

- **Prisoner's Dilemma:** Unique pure Nash equilibrium at $(\text{Defect}, \text{Defect})$ with payoff $(1, 1)$.
- **Matching Pennies:** Zero pure equilibria; unique mixed Nash equilibrium with $\sigma_1 = (0.5, 0.5)$, $\sigma_2 = (0.5, 0.5)$ and expected game value $v = 0$.
- **Battle of the Sexes:** Two pure Nash equilibria $(O, O)$ and $(F, F)$, plus one mixed equilibrium $(2/3, 1/3)$ and $(1/3, 2/3)$.
- **Rock-Paper-Scissors:** Zero-sum symmetric game; unique mixed Nash equilibrium at $(1/3, 1/3, 1/3)$ with value 0.
- **Airport Landing Game:** Cooperative TU game verifying Shapley values match the classical Littlechild & Owen (1973) formula.

