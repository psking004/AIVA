"""Strategic Systems Engine - Action Contracts.

Defines schemas for strategic actions, reversibility classifications, execution
constraints, compensation plans, and execution outcomes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any


class Reversibility(str, Enum):
    """Classification of an action's reversibility."""

    REVERSIBLE = "reversible"  # Direct undo exists
    COMPENSABLE = "compensable"  # Cannot be undone, but financial/operational compensation exists
    IRREVERSIBLE = "irreversible"  # Permanent physical, legal, or terminal state transition


class ActionExecutionStatus(str, Enum):
    """Status of an executed strategic action."""

    PENDING = "pending"
    DISPATCHED = "dispatched"
    SUCCESS = "success"
    FAILURE = "failure"
    ROLLED_BACK = "rolled_back"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"


@dataclass
class ActionDefinition:
    """Formal definition of a candidate or executable strategic action."""

    action_id: str
    name: str
    description: str
    target_entity: str
    parameters: dict[str, Any] = field(default_factory=dict)
    preconditions: list[str] = field(default_factory=list)
    postconditions: list[str] = field(default_factory=list)
    reversibility: Reversibility = Reversibility.REVERSIBLE
    compensation_action_id: str | None = None
    estimated_cost: float = 0.0
    timeout_seconds: float = 30.0
    risk_level: str = "low"  # low, medium, high, critical
    required_permission: str = "EXECUTION_LOW_RISK"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ActionResult:
    """Outcome record of an executed action."""

    action_id: str
    execution_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: ActionExecutionStatus = ActionExecutionStatus.PENDING
    output_payload: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    dispatched_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    duration_seconds: float = 0.0
    compensation_attempted: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)
