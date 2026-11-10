"""Strategic Systems Engine - Authorization Contracts.

Defines schemas for autonomy levels, permission scopes, authorization grants,
and policy evaluation results.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum, IntEnum
from typing import Any


class AutonomyLevel(IntEnum):
    """Levels of strategic autonomy granted to SSE by AIVA."""

    READ_ONLY = 0  # Observation and classification only
    ADVISORY = 1  # Recommends actions, cannot authorize or execute
    HUMAN_CONFIRMED = 2  # Recommends actions; requires explicit human/AIVA grant token to execute
    BOUNDED_AUTONOMOUS = 3  # Autonomous execution within verified safe policy & budget bounds
    FULL_AUTONOMOUS = 4  # Unbounded execution within system boundaries


class PermissionScope(str, Enum):
    """Permission scopes governing allowed operational capabilities."""

    ANALYSIS = "analysis"
    SIMULATION = "simulation"
    PROPOSAL = "proposal"
    EXECUTION_LOW_RISK = "execution_low_risk"
    EXECUTION_HIGH_RISK = "execution_high_risk"
    SYSTEM_CONFIG = "system_config"
    EMERGENCY_OVERRIDE = "emergency_override"


class RevocationReason(str, Enum):
    """Reason for revoking an authorization grant."""

    EXPIRED = "expired"
    STATE_DRIFT = "state_drift"
    SAFETY_POLICY_VIOLATION = "safety_policy_violation"
    OPERATOR_CANCELLED = "operator_cancelled"
    EMERGENCY_STOP = "emergency_stop"


@dataclass
class AuthorizationRequest:
    """Request submitted to the Authorization Gate to permit action execution."""

    decision_id: str
    action_id: str
    requester_id: str
    requested_autonomy: AutonomyLevel
    requested_scope: PermissionScope
    estimated_cost: float = 0.0
    is_reversible: bool = True
    context_checksum: str | None = None
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    requested_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    timeout_seconds: float = 300.0


@dataclass
class AuthorizationGrant:
    """Formal, cryptographically identifiable token permitting execution."""

    grant_id: str
    decision_id: str
    action_id: str
    authorized_by: str
    autonomy_level: AutonomyLevel
    granted_scope: PermissionScope
    grant_token: str
    issued_at: datetime
    valid_until: datetime
    baseline_state_checksum: str
    is_revoked: bool = False
    revocation_reason: RevocationReason | None = None
    restrictions: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def is_valid(self, current_time: datetime | None = None) -> bool:
        """Checks if the grant is active and unexpired."""
        if self.is_revoked:
            return False
        now = current_time or datetime.now(UTC)
        return now <= self.valid_until


@dataclass
class PolicyEvaluationResult:
    """Result of evaluating authorization rules against a request."""

    is_allowed: bool
    evaluated_rules: list[str] = field(default_factory=list)
    violations: list[str] = field(default_factory=list)
    required_autonomy_level: AutonomyLevel = AutonomyLevel.HUMAN_CONFIRMED
    notes: str | None = None
