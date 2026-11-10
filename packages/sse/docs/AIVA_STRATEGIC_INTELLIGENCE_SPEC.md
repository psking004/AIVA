# AIVA Strategic Intelligence Specification

This document details the architectural contracts, decision lifecycle, bounded autonomy model, and integration protocols for the Strategic Systems Engine (SSE) as the strategic decision intelligence core of AIVA.

---

## 1. Executive Mission & Autonomy Philosophy

AIVA operates as the parent multi-modal intelligence platform. SSE provides the formal analytical reasoning, forward outcome projection, mathematical verification, and policy-governed execution boundaries.

SSE operates under the principle of **bounded, policy-governed autonomy**:
1. **Decision $\neq$ Execution:** A strategic decision is an analytical and predictive synthesis. Execution requires formal verification and an independent authorization grant.
2. **Explainability by Design:** Every recommendation must state its underlying assumptions, projected downside risks (including 95% Value-at-Risk), and trade-offs against rejected alternatives.
3. **Abstention when Uncertain:** If environmental signals have low confidence or high epistemic uncertainty, SSE explicitly abstains from deciding, identifying the precise missing facts needed to act safely.
4. **Idempotence and Reversibility:** Candidate actions are classified by reversibility (`reversible`, `compensable`, `irreversible`). Autonomous execution is restricted to reversible or compensable actions within strict financial and operational quotas.

---

## 2. The 12-Step Strategic Decision Lifecycle

Every strategic request processed by the engine traverses twelve deterministic stages:

```text
[1. Request Ingestion]
         |
         v
[2. World State Snapshot]
         |
         v
[3. Problem Classification] (Single-agent, Zero-sum, General-sum, Multi-agent, Cooperative, Sequential)
         |
         v
[4. Candidate Action Generation & Formatting]
         |
         v
[5. Analytical Method Selection] (Solvers, LP/NLP, Monte Carlo, Probabilistic Projections)
         |
         v
[6. Scenario Projection Suite] (Base-case, Optimistic, Pessimistic, Adversarial, Black Swan)
         |
         v
[7. Multi-Criteria Strategy Evaluation] (Expected Payoff, Regret, Downside VaR-95)
         |
         v
[8. Abstention Check] (Confidence < Threshold OR Critical Invariants Violated? -> ABSTAIN)
         |
         v
[9. Recommendation Synthesis] (Action, Justification, Execution Steps, Contingencies)
         |
         v
[10. Formal Verification] (Invariants, Constraints, World State Drift Detection)
         |
         v
[11. Episodic Memory Archival] (Decision Request, State Checksum, Predicted Outcomes)
         |
         v
[12. Delivery to AIVA] (Complete DecisionResponse Contract)
```

---

## 3. Autonomy Levels & The Authorization Gate

Execution permissions are strictly stratified into five autonomy levels:

| Level | Name | Capabilities & Limitations |
|---|---|---|
| `0` | `READ_ONLY` | Ingestion, world modeling, and classification only. No action proposal or execution. |
| `1` | `ADVISORY` | Analyzes situations, projects scenarios, and formulates recommendations. Execution is strictly blocked. |
| `2` | `HUMAN_CONFIRMED` | Recommends actions; requires explicit human/operator authorization grant token before execution. |
| `3` | `BOUNDED_AUTONOMOUS` | Autonomous execution permitted **only** if action is verified, fully reversible, within rate limits, and cost is below policy ceiling. |
| `4` | `FULL_AUTONOMOUS` | High-autonomy execution within hard system boundary invariants. |

### The 8 Mandatory Authorization Gates
Before issuing an `AuthorizationGrant`, the `AuthorizationGate` verifies:
1. **Global Emergency Stop Clear:** Global kill-switch is disengaged.
2. **Authenticated Requester:** Identity and signature of the requesting agent are valid.
3. **Formal Verification Passed:** Mathematical invariants and constraint checks are satisfied.
4. **State Stability (No Drift):** The world model has not drifted significantly beyond tolerance between decision formulation and authorization.
5. **Autonomy Level Match:** The requested autonomy level permits execution.
6. **Safety Policies Compliance:** Action does not violate blacklist or policy restrictions.
7. **Resource Budget Availability:** Sufficient capacity exists in target resource pools.
8. **Reversibility Compliance:** Irreversible moves require human confirmation.

---

## 4. Subsystem Layout

```text
src/sse/
├── contracts/             # Universal dataclass schemas
│   ├── action.py          # ActionDefinition, ActionResult, Reversibility
│   ├── authorization.py   # AutonomyLevel, AuthorizationGrant, PermissionScope
│   ├── decision.py        # DecisionRequest, DecisionResponse, Recommendation, DecisionState
│   ├── observation.py     # Observation, ObservationBatch, ConfidenceGrade
│   └── world_state.py     # WorldStateSnapshot, EntityState, ResourceState, RelationshipState
├── world_model/           # Environment representation
│   ├── entities.py        # EntityRegistry
│   ├── agents.py          # StrategicAgentModel, StrategicProfile
│   ├── resources.py       # ResourceManager
│   ├── relationships.py   # RelationshipGraph
│   ├── constraints.py     # ConstraintManager
│   └── state_manager.py   # WorldStateManager (snapshots, drift detection)
├── ingestion/             # Sensory data intake
│   ├── validator.py       # ObservationValidator, staleness & confidence decay
│   └── reconciler.py      # ObservationReconciler, conflict resolution
├── strategic/             # Forward projections and decision analysis
│   ├── prediction/        # ScenarioGenerator, ProbabilisticForecaster, UncertaintyQuantifier
│   └── decision_analysis/ # UtilityAnalyzer (CARA/risk aversion), RegretAnalyzer (minimax regret)
├── verification/          # Formal mathematical & drift verifier
│   └── verifier.py        # DecisionVerifier
├── governance/            # Bounded autonomy & policy gate
│   ├── policies.py        # PolicyEngine, PolicyRule
│   └── authorization.py   # AuthorizationGate, emergency stop, cryptographically signed tokens
├── execution/             # Safe action dispatchers & rollback
│   ├── adapters.py        # MockActionAdapter, ToolCallAdapter, BaseActionAdapter
│   ├── rate_limiter.py    # ExecutionQuotaLimiter
│   ├── rollback.py        # CompensationCoordinator
│   └── dispatcher.py      # ActionDispatcher
├── memory/                # Closed-loop learning
│   ├── episodic.py        # EpisodicMemory (episodes, realized outcomes, prediction variance)
│   ├── strategic.py       # StrategicMemory (solver calibration, bias & MAE tracking)
│   └── registry.py        # ModelRegistry (offline evaluation gates)
├── orchestrator/          # Strategic reasoning coordination
│   ├── classifier.py      # ProblemClassifier
│   ├── solver_selector.py # MethodSelector
│   ├── evaluator.py       # DecisionEvaluator
│   └── decision_engine.py # StrategicDecisionEngine (12-step lifecycle)
└── gateway/               # High-level AIVA integration SDK
    └── client.py          # StrategicIntelligenceClient
```

---

## 5. REST API Reference (AIVA Endpoints)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/decisions` | Submit a `DecisionApiRequest` and receive a full `DecisionResponse` |
| `GET` | `/api/v1/decisions/{id}` | Retrieve decision state, confidence, and status |
| `GET` | `/api/v1/decisions/{id}/explain` | Generate human/agent readable markdown explanation of decision |
| `POST` | `/api/v1/decisions/{id}/authorize` | Submit authorization request to obtain cryptographic grant token |
| `POST` | `/api/v1/decisions/{id}/execute` | Dispatch authorized action through execution dispatcher |
| `POST` | `/api/v1/world-model/snapshots` | Capture immutable state snapshot with checksum digest |
| `POST` | `/api/v1/governance/emergency-stop` | Trigger global kill-switch, revoking all active grant tokens |

---

## 6. Verification and Test Proof

All subsystems are covered by an automated test suite verifying:
- Ingestion validation, staleness detection, and confidence decay.
- Thread-safe world model operations, capacity limits, and relationship graph traversal.
- Scenario generation and 5-scenario coverage (base, optimistic, pessimistic, adversarial, black swan).
- Downside risk quantification: 95% Value-at-Risk (VaR), CVaR, confidence intervals.
- Savage minimax regret and CARA expected utility analysis under risk aversion.
- Formal verification of invariants and state drift detection.
- Governance authorization gates, token issuance, token validation, and emergency stop.
- Sandboxed execution, rate limiting, and automated compensation rollback in reverse order.
- Episodic decision memory, solver forecast bias tracking, and model registry offline evaluation gates.
- High-level `StrategicIntelligenceClient` SDK and REST API endpoints.

