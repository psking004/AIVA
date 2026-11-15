"""AIVA Swarm Engine - Typed Task and Message Contracts.

Defines schemas and protocols for inter-agent communication, lifecycle states,
task definitions, execution evidence, and least-privilege permissions.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    CHECKPOINTED = "checkpointed"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class ExecutionStrategy(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    HIERARCHICAL = "hierarchical"
    COMPETITIVE = "competitive"
    COLLABORATIVE = "collaborative"
    RECOVERY = "recovery"


class MessageType(str, Enum):
    TASK_ASSIGNMENT = "task_assignment"
    TASK_ACCEPTANCE = "task_acceptance"
    PROGRESS_REPORT = "progress_report"
    RESULT_SUBMISSION = "result_submission"
    AGENT_REQUEST = "agent_to_agent_request"
    DELEGATION = "delegation"
    CANCELLATION = "cancellation"
    FAILURE_NOTIFICATION = "failure_notification"
    ESCALATION = "escalation"
    CHECKPOINT_NOTIFICATION = "checkpoint_notification"


@dataclass
class SwarmMessage:
    """Standardized, immutable inter-agent message structure."""
    message_id: str = field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    task_id: str = ""
    sender_agent: str = ""
    recipient_agent: str = ""
    message_type: MessageType = MessageType.PROGRESS_REPORT
    timestamp: float = field(default_factory=time.time)
    payload: Dict[str, Any] = field(default_factory=dict)
    correlation_id: str = field(default_factory=lambda: f"corr_{uuid.uuid4().hex[:8]}")
    status: str = "active"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message_id": self.message_id,
            "task_id": self.task_id,
            "sender_agent": self.sender_agent,
            "recipient_agent": self.recipient_agent,
            "message_type": self.message_type.value,
            "timestamp": self.timestamp,
            "payload": self.payload,
            "correlation_id": self.correlation_id,
            "status": self.status,
        }


@dataclass
class SwarmTask:
    """Formal validated contract for swarm task execution."""
    task_id: str = field(default_factory=lambda: f"task_{uuid.uuid4().hex[:12]}")
    objective: str = ""
    strategy: ExecutionStrategy = ExecutionStrategy.SEQUENTIAL
    priority: TaskPriority = TaskPriority.MEDIUM
    assigned_agents: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    risk_level: str = "medium"  # low, medium, high, extreme
    deadline: Optional[float] = None
    checkpoint_interval_seconds: int = 45
    verification_required: bool = True
    status: TaskStatus = TaskStatus.PENDING
    parent_task_id: Optional[str] = None
    subtasks: List[str] = field(default_factory=list)
    evidence: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    retry_count: int = 0
    max_retries: int = 3
    node_affinity: str = "AUTO"  # PC-B, PC-A, MOBILE, AUTO

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "objective": self.objective,
            "strategy": self.strategy.value,
            "priority": self.priority.value,
            "assigned_agents": self.assigned_agents,
            "constraints": self.constraints,
            "risk_level": self.risk_level,
            "deadline": self.deadline,
            "checkpoint_interval_seconds": self.checkpoint_interval_seconds,
            "verification_required": self.verification_required,
            "status": self.status.value,
            "parent_task_id": self.parent_task_id,
            "subtasks": self.subtasks,
            "evidence": self.evidence,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "node_affinity": self.node_affinity,
        }


@dataclass
class ExecutionResult:
    """Structured result returned by an agent upon task execution."""
    task_id: str
    agent_id: str
    success: bool
    output: Any
    evidence: Dict[str, Any] = field(default_factory=dict)
    execution_time_seconds: float = 0.0
    model_used: str = "unknown"
    node_executed: str = "PC-B"
    tokens_consumed: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "agent_id": self.agent_id,
            "success": self.success,
            "output": self.output,
            "evidence": self.evidence,
            "execution_time_seconds": self.execution_time_seconds,
            "model_used": self.model_used,
            "node_executed": self.node_executed,
            "tokens_consumed": self.tokens_consumed,
            "error": self.error,
        }

