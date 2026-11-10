"""Strategic Systems Engine - Decision Contracts.

Defines schemas and state machines for strategic decision requests, responses,
recommendations, risk assessments, and decision lifecycle states.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any


class DecisionState(str, Enum):
    """Lifecycle states of a strategic decision in SSE/AIVA."""

    DRAFT = "draft"
    PROPOSED = "proposed"
    ANALYZING = "analyzing"
    EVALUATED = "evaluated"
    VERIFIED = "verified"
    AUTHORIZATION_PENDING = "authorization_pending"
    AUTHORIZED = "authorized"
    REJECTED = "rejected"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    ABSTAINED = "abstained"


class ProblemType(str, Enum):
    """Classification of strategic problem structures."""

    SINGLE_AGENT_OPTIMIZATION = "single_agent_optimization"
    TWO_PLAYER_ZERO_SUM = "two_player_zero_sum"
    TWO_PLAYER_GENERAL_SUM = "two_player_general_sum"
    MULTI_AGENT_COMPETITIVE = "multi_agent_competitive"
    COOPERATIVE_COALITION = "cooperative_coalition"
    SEQUENTIAL_EXTENSIVE = "sequential_extensive"
    INCOMPLETE_INFORMATION = "incomplete_information"
    RESOURCE_ALLOCATION = "resource_allocation"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class UncertaintyAssessment:
    """Quantitative and qualitative assessment of uncertainty surrounding a decision."""

    confidence_score: float  # [0.0, 1.0]
    epistemic_uncertainty: float  # Knowledge-gap uncertainty [0.0, 1.0]
    aleatoric_uncertainty: float  # Inherent stochasticity [0.0, 1.0]
    value_at_risk_95: float  # 95% worst-case loss metric
    confidence_interval_low: float
    confidence_interval_high: float
    known_unknowns: list[str] = field(default_factory=list)
    sensitivity_factors: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class AlternativeStrategy:
    """Evaluation of an alternative candidate strategy."""

    action_id: str
    name: str
    expected_payoff: float
    risk_score: float  # [0.0, 1.0]
    trade_offs: list[str] = field(default_factory=list)
    pros: list[str] = field(default_factory=list)
    cons: list[str] = field(default_factory=list)
    solver_method: str = "heuristic"
    is_dominated: bool = False


@dataclass(frozen=True)
class Recommendation:
    """The chosen strategic recommendation with concrete execution instructions."""

    selected_action_id: str
    action_name: str
    justification: str
    required_preconditions: list[str] = field(default_factory=list)
    execution_steps: list[str] = field(default_factory=list)
    expected_impact: dict[str, Any] = field(default_factory=dict)
    reversibility: str = "reversible"  # reversible, irreversible, compensable
    contingency_plans: list[str] = field(default_factory=list)


@dataclass
class VerificationStatus:
    """Result of formal mathematical and policy verification."""

    is_valid: bool = False
    verified_by: str = "unverified"
    verified_at: datetime | None = None
    invariants_passed: list[str] = field(default_factory=list)
    constraint_violations: list[str] = field(default_factory=list)
    state_drift_detected: bool = False
    notes: str | None = None


@dataclass
class AuthorizationStatus:
    """Status of execution authorization for a decision."""

    is_authorized: bool = False
    autonomy_level: int = 1  # 0 to 4
    granted_by: str | None = None
    granted_at: datetime | None = None
    grant_token: str | None = None
    expiration_time: datetime | None = None
    restrictions: list[str] = field(default_factory=list)
    reason: str | None = None


@dataclass
class DecisionRequest:
    """Request from AIVA or external orchestrator to analyze and decide a strategic situation."""

    context_description: str
    goal: str
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    world_state_id: str | None = None
    candidate_actions: list[dict[str, Any]] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    urgency_level: str = "normal"  # low, normal, high, critical
    required_confidence: float = 0.70
    max_risk_tolerance: float = 0.35
    preferred_solvers: list[str] = field(default_factory=list)
    requested_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class DecisionResponse:
    """Comprehensive decision package delivered by SSE to AIVA."""

    decision_id: str
    request_id: str
    problem_type: ProblemType
    state: DecisionState
    recommendation: Recommendation | None
    rationale: str
    assumptions: list[str]
    risks: list[str]
    uncertainty: UncertaintyAssessment
    alternatives: list[AlternativeStrategy]
    verification: VerificationStatus
    authorization: AuthorizationStatus
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    execution_history: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_executable(self) -> bool:
        """Determines if the decision is strictly authorized and verified for execution."""
        return (
            self.state == DecisionState.AUTHORIZED
            and self.verification.is_valid
            and self.authorization.is_authorized
            and not self.verification.state_drift_detected
        )
