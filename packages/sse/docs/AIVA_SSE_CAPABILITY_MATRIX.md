# AIVA ↔ SSE Capability & Architecture Alignment Matrix

This document provides a comprehensive mapping of existing Strategic Systems Engine (SSE v1.0.0) capabilities against the target AIVA Strategic Intelligence Platform requirements, identifying architectural overlaps, extensions, and newly implemented subsystems.

---

## 1. Executive Summary

| Layer | Target Capability | SSE v1.0.0 Base Status | Target SSE-AIVA Status |
|---|---|---|---|
| **Layer 1: Context & Ingestion** | Ingestion of real-world observations, confidence, validity periods, staleness detection | Partial (scenarios in domain plugins) | **Full Engine**: `sse.ingestion` with observation provenance, conflict resolution, confidence decay |
| **Layer 2: World Model** | Entities, agents, resources, relational graph, state snapshots, versioning, drift detection | Partial (Game models, Agent models) | **Full Engine**: `sse.world_model` with EntityRegistry, StateManager, Graph relations, Snapshot diffing |
| **Layer 3: Strategic Decision Core** | Multi-paradigm solver core (Game theory, Optimization, Simulation) | Complete (10 solvers, LP/NLP, Monte Carlo) | **Enhanced**: Retained and integrated as core solver backend with uniform solver result adapter |
| **Layer 4: Prediction & Uncertainty** | Scenario generation, probabilistic outcomes, sensitivity, risk distributions | Partial (Monte Carlo, Sensitivity analyzer) | **Full Engine**: `sse.strategic.prediction` with adversarial/black-swan scenarios, VaR, confidence intervals |
| **Layer 5: Decision Orchestrator** | Problem classification, method selection, multi-method consensus/disagreement, explanation | Not present in v1.0.0 | **Full Engine**: `sse.orchestrator` with Classifier, MultiMethodSelector, Evaluator, Abstention logic |
| **Layer 6: Decision Verification** | Invariant checking, mathematical proofs, constraint satisfiability, drift invalidation | Minimal (validation in core games) | **Full Engine**: `sse.verification` with formal invariant checkers and pre-execution safety gates |
| **Layer 7: Policy & Governance** | Autonomy levels (0–4), independent authorization gates, 8 policy rules, emergency stop | Not present in v1.0.0 | **Full Engine**: `sse.governance` with strict autonomy boundary, authorization tokens, token revocation |
| **Layer 8: Execution & Compensation** | Safe execution dispatcher, action reversibility, rollback procedures, rate limiting | Not present in v1.0.0 | **Full Engine**: `sse.execution` with compensation actions, sandbox dispatcher, execution quotas |
| **Layer 9: Memory & Learning Loop** | Episodic decision logs, strategic patterns, model registry, offline evaluation pipeline | Partial (Repository, tournament logs) | **Full Engine**: `sse.memory` with EpisodicMemory, StrategicMemory, ModelRegistry |
| **Layer 10: AIVA Integration Gateway** | Client SDK (`analyse`, `predict`, `recommend`, `execute`, `explain`), REST API | Partial (SSEClient, generic REST API) | **Full Gateway**: `sse.gateway` and dedicated `/api/v1/decisions` endpoints |

---

## 2. Detailed Capability Traceability

### 2.1 Layer 1: Context & Observation Ingestion
- **v1.0.0 Base**: Scenarios provided static dictionaries of payoffs and game definitions.
- **AIVA Target**: Real-time contextual streams with varying confidence, timestamps, and conflicting signals.
- **Implementation**:
  - `sse.contracts.observation.Observation`: Structured schema with `provenance`, `confidence`, `validity_period`, and `source_reliability`.
  - `sse.ingestion.validator.ObservationValidator`: Detects schema mismatches, staleness, and conflicting assertions.

### 2.2 Layer 2: World Model Engine
- **v1.0.0 Base**: Game classes (`FiniteNormalFormGame`, `ExtensiveFormGame`, `CooperativeGame`) represent static mathematical games.
- **AIVA Target**: Dynamic environment representation containing entities, assets, competitor agents, relationships, and hard/soft constraints.
- **Implementation**:
  - `sse.world_model.entities.Entity`: Identity, state attributes, beliefs, intent.
  - `sse.world_model.agents.StrategicAgentModel`: Risk tolerance, rationality bound, historical policy.
  - `sse.world_model.resources.ResourcePool`: Capacity, fungibility, allocation locks.
  - `sse.world_model.relationships.RelationshipGraph`: Directional relations (allied, competitor, dependent).
  - `sse.world_model.state_manager.WorldStateManager`: Immutable snapshots, diff calculations, drift detection against decision baseline.

### 2.3 Layer 3: Strategic Decision Core (Solvers & Optimization)
- **v1.0.0 Base**: 10 game-theoretic solvers (`pure_nash`, `support_enumeration`, `dominant_strategy`, `minimax`, `backward_induction`, `cooperative`, `correlated_equilibrium`, `evolutionary`, `stackelberg`, `regret_matching`), plus `LinearProgramSolver`, `NonlinearOptimizer`, `MultiObjectiveOptimizer`.
- **AIVA Target**: The core solvers serve as analytical backends for the orchestrator.
- **Implementation**: Preserved 100% backward compatibility; wrapped by `sse.orchestrator.solver_selector` to allow automatic routing based on problem taxonomy.

### 2.4 Layer 4: Prediction & Uncertainty Engine
- **v1.0.0 Base**: `SimulationEngine` and `SensitivityAnalyzer`.
- **AIVA Target**: Forward scenario modeling (optimistic, pessimistic, adversarial, black-swan), probability distributions, epistemic vs aleatoric uncertainty quantification.
- **Implementation**:
  - `sse.strategic.prediction.scenario_generator.ScenarioGenerator`
  - `sse.strategic.prediction.probabilistic.ProbabilisticForecaster`
  - `sse.strategic.prediction.uncertainty.UncertaintyQuantifier`

### 2.5 Layer 5: Strategic Decision Orchestrator
- **v1.0.0 Base**: Manual solver selection via CLI or API.
- **AIVA Target**: Autonomous 12-step decision lifecycle:
  1. Parse problem.
  2. Classify problem structure.
  3. Select analytical methods.
  4. Run cross-paradigm evaluation.
  5. Check consensus vs disagreement.
  6. Synthesize recommendation with explicit reasoning, assumptions, and risks.
  7. Handle abstention when data is insufficient.
- **Implementation**:
  - `sse.orchestrator.classifier.ProblemClassifier`
  - `sse.orchestrator.solver_selector.MethodSelector`
  - `sse.orchestrator.evaluator.DecisionEvaluator`
  - `sse.orchestrator.decision_engine.StrategicDecisionEngine`

### 2.6 Layer 6 & 7: Verification, Governance & Bounded Autonomy
- **v1.0.0 Base**: Basic input validation (`validate_probability_distribution`, `validate_action_vector`).
- **AIVA Target**: Strict governance separation: a decision is *not* an authorized action. Autonomy levels (0 to 4), independent authorization gate, emergency kill-switch.
- **Implementation**:
  - `sse.verification.verifier.DecisionVerifier`: Verifies mathematical invariants and constraint satisfaction.
  - `sse.governance.authorization.AuthorizationGate`: Enforces the 8 mandatory policy rules before issuing execution grants.
  - `sse.governance.policies.PolicyEngine`: Configurable organizational safety policies.

### 2.7 Layer 8: Execution & Compensation
- **v1.0.0 Base**: None (pure computation).
- **AIVA Target**: Controlled execution through sandboxed adapters, action reversibility tracking, compensation/rollback triggers.
- **Implementation**:
  - `sse.execution.dispatcher.ActionDispatcher`
  - `sse.execution.adapters.BaseActionAdapter`, `MockActionAdapter`, `ToolCallAdapter`
  - `sse.execution.rollback.CompensationCoordinator`

### 2.8 Layer 9: Memory & Continuous Learning
- **v1.0.0 Base**: `GameRepository` and file serialization.
- **AIVA Target**: Episodic decision tracking, calibration of solver accuracy against observed real-world outcomes, offline policy evaluation.
- **Implementation**:
  - `sse.memory.episodic.EpisodicMemory`
  - `sse.memory.strategic.StrategicMemory`
  - `sse.memory.registry.ModelRegistry`

### 2.9 Layer 10: AIVA Gateway & Client SDK
- **v1.0.0 Base**: Standard `SSEClient` targeting game solver endpoints.
- **AIVA Target**: High-level interface tailored for AIVA agent orchestration.
- **Implementation**:
  - `sse.gateway.client.StrategicIntelligenceClient`: Exposes `analyse`, `predict`, `recommend`, `execute`, `explain`.
  - REST endpoints at `/api/v1/decisions` and `/api/v1/world-model`.

