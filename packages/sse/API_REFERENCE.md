# API Reference Manual
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-REF-001  
**Release:** 1.0.0  

---

### 1. `sse.models`

#### `FiniteNormalFormGame`
Canonical data structure for finite normal-form games.
- **`players: tuple[Player, ...]`**: List of strategic agents ($N \ge 2$).
- **`actions: tuple[tuple[str, ...], ...]`**: Action sets per player.
- **`payoffs: tuple[tuple[float, ...], ...]`**: Flattened lexicographical payoff table.
- **`payoff(profile: Sequence[int]) -> tuple[float, ...]`**: Look up payoff vector for action profile.
- **`from_dict(data: dict) -> FiniteNormalFormGame`**: Construct from JSON dictionary.
- **`to_dict() -> dict`**: Serialize to JSON dictionary.

---

### 2. `sse.solvers`

| Solver Name | Algorithm Class | Key Capabilities |
|---|---|---|
| `pure_nash_enumeration` | Exact enumeration | Complete unilateral deviation testing |
| `support_enumeration` | Linear equations | 2-player exact mixed Nash equilibria |
| `dominant_strategy` | IEDS | Strictly & weakly dominant action elimination |
| `minimax` | Primal-dual LP | Zero-sum game value & optimal mixed strategies |
| `backward_induction` | Tree recursion | Extensive-form Subgame-Perfect Nash Equilibrium |
| `cooperative_solvers` | Marginal summation / LP | Axiomatic Shapley values and Core non-emptiness |
| `correlated_equilibrium` | Linear programming | Utilitarian social welfare maximizing CE |
| `evolutionary` | Numerical ODE integration | Continuous replicator dynamics & ESS verification |
| `stackelberg` | Bilevel optimization | Leader commitment under follower best response |
| `regret_matching` | No-regret learning | Hart-Mas-Colell correlated equilibrium convergence |

---

### 3. `sse.simulation`

#### `SimulationEngine`
- **`run_single(game, strategies, config)`**: Run one strategic interaction step.
- **`run_repeated(game, strategies, num_rounds, config)`**: Run multi-step repeated game.
- **`run_monte_carlo(game, strategies, num_samples, config)`**: Run stochastic sample sweeps.
- **`parameter_sweep(game_factory, param_name, param_values, strategies, config)`**: Grid parameter evaluation.

---

### 4. `sse.agents`

- **`Agent`**: Base abstract class for agents.
- **`RandomAgent`**: Uniform random action choice.
- **`FixedStrategyAgent`**: Plays a single action persistently.
- **`MixedStrategyAgent`**: Draws actions from fixed probability distribution.
- **`TitForTatAgent`**: Classical Axelrod reciprocity strategy.
- **`GrimTriggerAgent`**: Cooperative until betrayed, then defects forever.
- **`QLearningAgent`**: Tabular Q-learning with TD updates.
- **`FictitiousPlayAgent`**: Empirical frequency best-response learning.
- **`RegretMatchingAgent`**: Regret minimization strategy adjustments.
- **`Tournament`**: Round-robin competition runner.

