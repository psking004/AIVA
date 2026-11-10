# User Guide
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-USER-001  
**Release:** 1.0.0  

---

### 1. Overview

The Strategic Systems Engine (SSE) allows researchers, economists, data scientists, and systems engineers to analyze multi-agent decision conflicts, identify equilibria, run repeated simulations, and train adaptive agents.

---

### 2. Using the Command-Line Interface (CLI)

#### 2.1 Inspecting Available Capabilities
```bash
# Display version
sse --version

# List all registered mathematical solvers
sse list-solvers

# List all available application domains and scenario factories
sse list-domains
```

#### 2.2 Validating Game Definitions
```bash
sse validate examples/prisoners_dilemma.json
```
Output:
```json
{
  "status": "valid",
  "game_id": "prisoners-dilemma",
  "players": 2,
  "profiles": 4
}
```

#### 2.3 Solving Games
Execute any registered solver against a game file:
```bash
# Pure-strategy Nash equilibrium
sse solve examples/prisoners_dilemma.json --solver pure_nash_enumeration

# Strictly and weakly dominant strategy elimination (IEDS)
sse solve examples/prisoners_dilemma.json --solver dominant_strategy

# Mixed-strategy Nash equilibrium via support enumeration
sse solve examples/matching_pennies.json --solver support_enumeration

# Von Neumann minimax value (zero-sum)
sse solve examples/matching_pennies.json --solver minimax

# Correlated equilibrium maximizing social welfare
sse solve examples/prisoners_dilemma.json --solver correlated_equilibrium
```

#### 2.4 Running Strategic Simulations
```bash
sse simulate examples/prisoners_dilemma.json --rounds 1000 --seed 42
```

#### 2.5 Exporting Domain Scenarios
```bash
# Export the classic Hawk-Dove resource conflict scenario
sse scenario social hawk_dove --output my_hawk_dove.json

# Solve the exported scenario
sse solve my_hawk_dove.json --solver evolutionary
```

---

### 3. Using the Python SDK

```python
from sse.sdk.client import SSEClient

client = SSEClient()

# 1. Create a game
game = client.create_game(
    id="cournot_duopoly",
    name="Cournot Duopoly Competition",
    players=["Alpha", "Beta"],
    actions={
        "Alpha": ["q_10", "q_20", "q_30"],
        "Beta": ["q_10", "q_20", "q_30"],
    },
    payoffs=[
        [80.0, 80.0], [60.0, 100.0], [40.0, 90.0],
        [100.0, 60.0], [70.0, 70.0], [40.0, 60.0],
        [90.0, 40.0], [60.0, 40.0], [30.0, 30.0],
    ],
)

# 2. Compute Pure Nash Equilibrium
result = client.solve(game, solver="pure_nash_enumeration")
for eq in result.equilibria:
    print(f"Equilibrium Actions: {eq.actions}, Payoffs: {eq.payoffs}")

# 3. Simulate repeated interactions
sim_result = client.simulate(game, strategies={}, rounds=500, seed=123)
print(f"Total simulated payoffs: {sim_result.total_payoffs}")
```

