# Mathematical Foundations of Game Theory
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-MATH-001  
**Version:** 1.0.0  

---

### 1. Finite Normal-Form Games

A finite game in strategic (normal) form is a tuple:
$$\Gamma = \left( N, \{S_i\}_{i \in N}, \{u_i\}_{i \in N} \right)$$
where:
- $N = \{1, 2, \dots, n\}$ is the finite set of players ($n \ge 2$).
- $S_i = \{s_{i1}, s_{i2}, \dots, s_{im_i}\}$ is the non-empty finite pure action set of player $i$.
- $S = \prod_{i=1}^n S_i$ is the set of pure strategy profiles $s = (s_1, \dots, s_n)$.
- $u_i: S \to \mathbb{R}$ is the von Neumann-Morgenstern utility function for player $i$.

#### 1.1 Mixed Strategies and Expected Utility
A mixed strategy $\sigma_i \in \Delta(S_i)$ is a probability distribution over $S_i$:
$$\sigma_i(s_i) \ge 0 \quad \forall s_i \in S_i, \qquad \sum_{s_i \in S_i} \sigma_i(s_i) = 1$$
Under independent strategy choices, the expected payoff of profile $\sigma = (\sigma_1, \dots, \sigma_n)$ is:
$$u_i(\sigma) = \sum_{s \in S} \left( \prod_{j=1}^n \sigma_j(s_j) \right) u_i(s)$$

#### 1.2 Pure and Mixed Nash Equilibrium
A strategy profile $\sigma^* = (\sigma_1^*, \dots, \sigma_n^*)$ is a **Nash Equilibrium** if:
$$\forall i \in N, \quad \forall \sigma_i \in \Delta(S_i), \qquad u_i(\sigma_i^*, \sigma_{-i}^*) \ge u_i(\sigma_i, \sigma_{-i}^*)$$
By Nash's Theorem (1950), every finite normal-form game possesses at least one mixed-strategy Nash equilibrium.

---

### 2. Solution Algorithms

#### 2.1 Pure Nash Equilibrium Enumeration
For a finite game with profile set $S$, test each profile $s \in S$:
$$\forall i \in N, \quad \forall a_i \in S_i \setminus \{s_i\}, \qquad u_i(s_i, s_{-i}) \ge u_i(a_i, s_{-i}) - \epsilon$$
Complexity: $\mathcal{O}\left( |S| \sum_{i=1}^n |S_i| \right)$. This exact enumeration avoids floating-point divergence.

#### 2.2 Support Enumeration for 2-Player Games
Let players 1 and 2 have action sets $S_1, S_2$. For chosen supports $K_1 \subseteq S_1$ and $K_2 \subseteq S_2$ with $|K_1| = |K_2| = k$:
1. **Player 2 Indifference:** Every pure action $s_1 \in K_1$ must yield equal expected payoff against $\sigma_2$:
   $$\sum_{s_2 \in K_2} u_1(s_1, s_2) \sigma_2(s_2) = v_1 \quad \forall s_1 \in K_1, \qquad \sum_{s_2 \in K_2} \sigma_2(s_2) = 1$$
2. **Player 1 Indifference:** Every pure action $s_2 \in K_2$ must yield equal expected payoff against $\sigma_1$:
   $$\sum_{s_1 \in K_1} u_2(s_1, s_2) \sigma_1(s_1) = v_2 \quad \forall s_2 \in K_2, \qquad \sum_{s_1 \in K_1} \sigma_1(s_1) = 1$$
3. **Feasibility:** $\sigma_1(s_1) \ge 0, \; \sigma_2(s_2) \ge 0$.
4. **No External Deviation:** For actions outside the supports:
   $$\forall s_1' \notin K_1, \; u_1(s_1', \sigma_2) \le v_1 + \epsilon \quad \text{and} \quad \forall s_2' \notin K_2, \; u_2(\sigma_1, s_2') \le v_2 + \epsilon$$

#### 2.3 Minimax Theorem (Zero-Sum Games)
For any 2-player zero-sum game ($u_1(s) + u_2(s) = 0$):
$$\max_{\sigma_1 \in \Delta(S_1)} \min_{s_2 \in S_2} u_1(\sigma_1, s_2) = \min_{\sigma_2 \in \Delta(S_2)} \max_{s_1 \in S_1} u_1(s_1, \sigma_2) = v^*$$
This is formulated as the primal linear program:
$$\begin{aligned}
\text{maximize} \quad & v \\
\text{subject to} \quad & \sum_{i=1}^{m} p_i A_{ij} \ge v \quad \forall j \in \{1, \dots, n\} \\
& \sum_{i=1}^m p_i = 1, \quad p_i \ge 0
\end{aligned}$$

---

### 3. Extensive-Form Games and Backward Induction

An extensive-form game tree $\mathcal{T} = (V, E, x_0)$ consists of:
- Decision nodes $V_D$ partitioned by player identities $V_i$.
- Chance nodes $V_C$ with transition probabilities $p(c \mid v)$.
- Terminal nodes $V_T$ with payoff vector payoffs $u(v) \in \mathbb{R}^n$.

**Backward Induction (Zermelo / Kuhn):**
For finite games of perfect information, define the node value function $V: V \to \mathbb{R}^n$ recursively from leaves to root:
$$V(t) = u(t) \quad \text{for } t \in V_T$$
$$V(v) = \arg\max_{c \in \text{children}(v)} V_{P(v)}(c) \quad \text{for } v \in V_D \text{ where } P(v) \text{ is the active player}$$
$$V(v) = \sum_{c \in \text{children}(v)} p(c \mid v) V(c) \quad \text{for } v \in V_C$$
This construction guarantees a Subgame-Perfect Nash Equilibrium (SPNE).

---

### 4. Cooperative Games and Imputations

A cooperative game with transferable utility (TU) is a pair $(N, v)$ where $N = \{1, \dots, n\}$ and $v: 2^N \to \mathbb{R}$ with $v(\emptyset) = 0$.

#### 4.1 The Shapley Value
The unique allocation satisfying Efficiency, Symmetry, Linearity, and Null-Player axioms is given by:
$$\phi_i(v) = \sum_{S \subseteq N \setminus \{i\}} \frac{|S|! (|N| - |S| - 1)!}{|N|!} \left[ v(S \cup \{i\}) - v(S) \right]$$

#### 4.2 The Core
The Core $\mathcal{C}(v)$ is the set of all payoff allocations $x = (x_1, \dots, x_n) \in \mathbb{R}^n$ such that:
$$\sum_{i \in N} x_i = v(N) \quad (\text{Efficiency})$$
$$\sum_{i \in S} x_i \ge v(S) \quad \forall S \subset N \quad (\text{Coalitional Rationality})$$

---

### 5. Evolutionary Dynamics and Replicator Equations

Let a population be divided into $k$ strategy types with proportion vector $x = (x_1, \dots, x_k) \in \Delta^k$. The continuous replicator dynamics equation is:
$$\dot{x}_i = x_i \left[ f_i(x) - \bar{f}(x) \right]$$
where $f_i(x) = (A x)_i$ is the expected fitness of strategy $i$ against population $x$, and $\bar{f}(x) = x^T A x$ is the mean population fitness.

A strategy $x^*$ is an **Evolutionarily Stable Strategy (ESS)** if $\forall y \neq x^*$, there exists $\bar{\epsilon} > 0$ such that for all $\epsilon \in (0, \bar{\epsilon})$:
$$u(x^*, (1-\epsilon)x^* + \epsilon y) > u(y, (1-\epsilon)x^* + \epsilon y)$$
Equivalently:
1. $u(x^*, x^*) \ge u(y, x^*)$ (Nash condition)
2. If $u(x^*, x^*) = u(y, x^*)$, then $u(x^*, y) > u(y, y)$ (Stability condition)

