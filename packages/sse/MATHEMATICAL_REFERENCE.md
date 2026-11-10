# Mathematical Reference Manual
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-MATHREF-001  
**Release:** 1.0.0  

---

### 1. Classical Game Formulations

#### 1.1 Finite Normal-Form Game
A normal-form game $\Gamma = (N, \{S_i\}_{i \in N}, \{u_i\}_{i \in N})$ defines:
- Players $N = \{1, \dots, n\}$.
- Action sets $S_i$. Profile space $S = \prod_i S_i$.
- Utility function $u_i(s_1, \dots, s_n) \in \mathbb{R}$.

#### 1.2 Pure Nash Equilibrium
A profile $s^* = (s_1^*, \dots, s_n^*) \in S$ is a Nash Equilibrium if:
$$u_i(s_i^*, s_{-i}^*) \ge u_i(s_i, s_{-i}^*) \quad \forall i \in N, \; \forall s_i \in S_i$$

#### 1.3 Mixed Nash Equilibrium
A mixed strategy profile $\sigma^* = (\sigma_1^*, \dots, \sigma_n^*)$ where $\sigma_i^* \in \Delta(S_i)$ is an equilibrium if:
$$u_i(\sigma_i^*, \sigma_{-i}^*) \ge u_i(\sigma_i, \sigma_{-i}^*) \quad \forall i \in N, \; \forall \sigma_i \in \Delta(S_i)$$

---

### 2. Zero-Sum Minimax Theorem

For any 2-player zero-sum game ($u_1(s) + u_2(s) = 0$):
$$\max_{p \in \Delta(S_1)} \min_{j \in S_2} \sum_{i} p_i A_{ij} = \min_{q \in \Delta(S_2)} \max_{i \in S_1} \sum_{j} A_{ij} q_j = v^*$$
Computed via the linear program:
$$\min_{p, v} -v \quad \text{s.t.} \quad \sum_{i} p_i A_{ij} \ge v \; \forall j, \quad \sum_i p_i = 1, \; p_i \ge 0$$

---

### 3. Cooperative TU-Games

#### 3.1 Shapley Value
$$\phi_i(v) = \sum_{S \subseteq N \setminus \{i\}} \frac{|S|!(|N| - |S| - 1)!}{|N|!} \left[ v(S \cup \{i\}) - v(S) \right]$$
Satisfies:
1. **Efficiency:** $\sum_{i \in N} \phi_i(v) = v(N)$
2. **Symmetry:** If $v(S \cup \{i\}) = v(S \cup \{j\})$ for all $S$, then $\phi_i(v) = \phi_j(v)$
3. **Null Player:** If $v(S \cup \{i\}) = v(S)$ for all $S$, then $\phi_i(v) = 0$
4. **Additivity:** $\phi(v + w) = \phi(v) + \phi(w)$

#### 3.2 The Core
$$\mathcal{C}(v) = \left\{ x \in \mathbb{R}^n : \sum_{i \in N} x_i = v(N) \quad \text{and} \quad \sum_{i \in S} x_i \ge v(S) \; \forall S \subset N \right\}$$

---

### 4. Evolutionary Replicator Dynamics

Continuous-time ODE for strategy frequencies $x_i(t)$:
$$\frac{dx_i}{dt} = x_i \left[ (A x)_i - x^T A x \right]$$
A strategy $x^*$ is an Evolutionarily Stable Strategy (ESS) if:
1. $x^{*T} A x^* \ge y^T A x^*$ for all $y \in \Delta$.
2. If $x^{*T} A x^* = y^T A x^*$, then $x^{*T} A y > y^T A y$.

