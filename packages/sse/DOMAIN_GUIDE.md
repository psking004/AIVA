# Multi-Domain Application Guide
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-DOMGUIDE-001  
**Release:** 1.0.0  

---

### 1. Overview of Application Domains

SSE includes 7 production-grade application domains designed as reusable extensions:

| Domain | Focus Area | Scenarios Included |
|---|---|---|
| **Cybersecurity** | Network defense & intrusion response | `simple_network_defense`, `apt_defense_scenario`, `security_investment_2firm` |
| **Economics** | Market competition & public goods | `cournot_duopoly`, `bertrand_duopoly`, `public_goods_3player` |
| **Business Strategy** | Competitive pricing & entry deterrence | `price_war`, `market_entry_deterrence`, `rd_investment_race` |
| **Logistics** | Freight routing & resource sharing | `simple_freight_routing`, `shared_warehouse_allocation`, `dock_scheduling` |
| **Transportation** | Network congestion & Braess's paradox | `braess_paradox`, `two_route_commute`, `corridor_peak_spreading` |
| **Social Systems** | Voting, conflict, & social dilemmas | `hawk_dove`, `stag_hunt`, `condorcet_voting` |
| **Autonomous Systems**| Multi-robot & spectrum coordination | `autonomous_intersection`, `dynamic_spectrum_access`, `cooperative_perimeter_patrol` |

---

### 2. Domain Scenario Exploration Examples

#### Cybersecurity: Network Defense Allocation
```python
from sse.domains.cybersecurity.scenarios import apt_defense_scenario
from sse.solvers.mixed_nash import SupportEnumerationSolver

game = apt_defense_scenario()
result = SupportEnumerationSolver().solve(game)
print("APT Defense Mixed Equilibria:", result.equilibria)
```

#### Transportation: Braess's Paradox
In the classic Braess's Paradox network scenario, adding an additional high-capacity link to a congested network increases total equilibrium travel latency because selfish routing drives vehicles into an inefficient Nash equilibrium.
```python
from sse.domains.transportation.scenarios import braess_paradox
from sse.solvers.pure_nash import PureNashSolver

game = braess_paradox()
result = PureNashSolver().solve(game)
print("Braess Paradox Nash Equilibria:", [eq.actions for eq in result.equilibria])
```

