"""AIVA 2.0 - Persistent Task Lifecycle Engine.

Provides durable, verifiable multi-stage task lifecycle tracking across:
RECEIVED -> UNDERSTANDING -> PLANNING -> AWAITING_APPROVAL ->
EXECUTING -> VERIFYING -> COMPLETED
(with auxiliary states: BLOCKED, FAILED, RECOVERING)

Maintains an atomic append-only JSONL task ledger and step checkpoint store
for full crash recovery and operational transparency.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("TaskLifecycleEngine")


class TaskState(str, Enum):
    RECEIVED = "RECEIVED"
    UNDERSTANDING = "UNDERSTANDING"
    PLANNING = "PLANNING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    RECOVERING = "RECOVERING"


VALID_TRANSITIONS = {
    TaskState.RECEIVED: [TaskState.UNDERSTANDING, TaskState.FAILED],
    TaskState.UNDERSTANDING: [TaskState.PLANNING, TaskState.BLOCKED, TaskState.FAILED],
    TaskState.PLANNING: [TaskState.AWAITING_APPROVAL, TaskState.EXECUTING, TaskState.BLOCKED, TaskState.FAILED],
    TaskState.AWAITING_APPROVAL: [TaskState.EXECUTING, TaskState.BLOCKED, TaskState.FAILED],
    TaskState.EXECUTING: [TaskState.VERIFYING, TaskState.RECOVERING, TaskState.BLOCKED, TaskState.FAILED],
    TaskState.VERIFYING: [TaskState.COMPLETED, TaskState.RECOVERING, TaskState.FAILED],
    TaskState.RECOVERING: [TaskState.PLANNING, TaskState.EXECUTING, TaskState.FAILED],
    TaskState.BLOCKED: [TaskState.RECEIVED, TaskState.PLANNING, TaskState.EXECUTING, TaskState.FAILED],
    TaskState.FAILED: [TaskState.RECOVERING, TaskState.RECEIVED],
    TaskState.COMPLETED: [],
}


@dataclass
class TaskRecord:
    task_id: str
    user_intent: str
    current_status: TaskState = TaskState.RECEIVED
    decomposed_subtasks: List[Dict[str, Any]] = field(default_factory=list)
    assigned_agents: List[str] = field(default_factory=list)
    execution_plan: Dict[str, Any] = field(default_factory=dict)
    required_permissions: List[str] = field(default_factory=list)
    execution_history: List[Dict[str, Any]] = field(default_factory=list)
    verification_criteria: List[str] = field(default_factory=list)
    artifacts_produced: List[Dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    retry_count: int = 0
    max_retries: int = 3
    cancellation_requested: bool = False
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["current_status"] = self.current_status.value if isinstance(self.current_status, TaskState) else self.current_status
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TaskRecord:
        data = dict(data)
        if "current_status" in data:
            data["current_status"] = TaskState(data["current_status"])
        return cls(**data)


class TaskLifecycleEngine:
    """Manages persistent lifecycle states, atomic ledgers, checkpoints, and crash recovery."""

    def __init__(self, ledger_path: Optional[str] = None):
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        self.ledger_path = Path(ledger_path) if ledger_path else base_dir / "backend" / "data" / "tasks" / "task_ledger.jsonl"
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._tasks: Dict[str, TaskRecord] = {}
        self._load_ledger()

    def _load_ledger(self) -> None:
        """Loads historical tasks from the JSONL ledger file."""
        if not self.ledger_path.exists():
            return

        with self._lock:
            try:
                with open(self.ledger_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            record_dict = json.loads(line)
                            record = TaskRecord.from_dict(record_dict)
                            self._tasks[record.task_id] = record
                        except Exception as e:
                            logger.warning(f"Malformed ledger line: {e}")
            except Exception as e:
                logger.error(f"Failed to read task ledger: {e}")

    def _append_ledger(self, record: TaskRecord) -> None:
        """Appends an updated task record snapshot to the JSONL ledger."""
        try:
            line = json.dumps(record.to_dict()) + "\n"
            with open(self.ledger_path, "a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
                os.fsync(f.fileno())
        except Exception as e:
            logger.error(f"Failed to append to task ledger: {e}")

    def create_task(
        self,
        user_intent: str,
        required_permissions: Optional[List[str]] = None,
        verification_criteria: Optional[List[str]] = None,
    ) -> TaskRecord:
        """Creates and persists a new task in the RECEIVED state."""
        task_id = f"task_{uuid.uuid4().hex[:12]}"
        now = time.time()
        record = TaskRecord(
            task_id=task_id,
            user_intent=user_intent,
            current_status=TaskState.RECEIVED,
            required_permissions=required_permissions or ["read", "execute"],
            verification_criteria=verification_criteria or ["completion_verified"],
            created_at=now,
            updated_at=now,
            execution_history=[{
                "timestamp": now,
                "from_state": None,
                "to_state": TaskState.RECEIVED.value,
                "note": "Task created from user intent",
            }],
        )
        with self._lock:
            self._tasks[task_id] = record
            self._append_ledger(record)
        logger.info(f"Task {task_id} created: {user_intent[:60]}")
        return record

    def transition_state(
        self,
        task_id: str,
        target_state: TaskState,
        note: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TaskRecord:
        """Transitions a task to a target state, enforcing state transition validity."""
        with self._lock:
            record = self._tasks.get(task_id)
            if not record:
                raise ValueError(f"Task {task_id} not found in lifecycle engine")

            current = record.current_status
            allowed = VALID_TRANSITIONS.get(current, [])

            # Check if transition is valid
            if target_state not in allowed and target_state != current:
                # Allow force recovery or failure from any non-terminal state
                if target_state not in (TaskState.FAILED, TaskState.RECOVERING, TaskState.BLOCKED):
                    raise ValueError(f"Invalid state transition from {current.value} to {target_state.value}")

            now = time.time()
            record.current_status = target_state
            record.updated_at = now
            history_entry = {
                "timestamp": now,
                "from_state": current.value,
                "to_state": target_state.value,
                "note": note,
            }
            if metadata:
                history_entry["metadata"] = metadata
            record.execution_history.append(history_entry)

            self._append_ledger(record)
            logger.info(f"Task {task_id} transitioned: {current.value} -> {target_state.value} ({note})")
            return record

    def update_task_plan(
        self,
        task_id: str,
        plan: Dict[str, Any],
        subtasks: List[Dict[str, Any]],
        assigned_agents: List[str],
    ) -> TaskRecord:
        """Records task decomposition, subtask DAG, and assigned specialist agents."""
        with self._lock:
            record = self._tasks.get(task_id)
            if not record:
                raise ValueError(f"Task {task_id} not found")
            record.execution_plan = plan
            record.decomposed_subtasks = subtasks
            record.assigned_agents = assigned_agents
            record.updated_at = time.time()
            self._append_ledger(record)
            return record

    def record_artifact(self, task_id: str, name: str, artifact_type: str, path: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Records a verified artifact produced by the task."""
        with self._lock:
            record = self._tasks.get(task_id)
            if not record:
                return
            artifact_entry = {
                "name": name,
                "type": artifact_type,
                "path": path,
                "created_at": time.time(),
                "metadata": metadata or {},
            }
            record.artifacts_produced.append(artifact_entry)
            record.updated_at = time.time()
            self._append_ledger(record)

    def request_cancellation(self, task_id: str, reason: str = "User requested cancellation") -> None:
        """Sets the cancellation token on an active task."""
        with self._lock:
            record = self._tasks.get(task_id)
            if not record:
                return
            record.cancellation_requested = True
            record.updated_at = time.time()
            record.execution_history.append({
                "timestamp": time.time(),
                "from_state": record.current_status.value,
                "to_state": record.current_status.value,
                "note": f"Cancellation requested: {reason}",
            })
            self._append_ledger(record)

    def get_task(self, task_id: str) -> Optional[TaskRecord]:
        """Retrieves a task by ID."""
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns recent tasks."""
        with self._lock:
            sorted_tasks = sorted(self._tasks.values(), key=lambda t: t.created_at, reverse=True)
            return [t.to_dict() for t in sorted_tasks[:limit]]

    def recover_interrupted_tasks(self) -> List[str]:
        """Detects in-flight tasks that were interrupted by a system restart and moves them to RECOVERING."""
        recovered = []
        with self._lock:
            for task_id, record in self._tasks.items():
                if record.current_status in (TaskState.EXECUTING, TaskState.PLANNING, TaskState.UNDERSTANDING):
                    record.current_status = TaskState.RECOVERING
                    record.retry_count += 1
                    record.updated_at = time.time()
                    record.execution_history.append({
                        "timestamp": time.time(),
                        "from_state": "INTERRUPTED",
                        "to_state": TaskState.RECOVERING.value,
                        "note": "System crash / restart recovery triggered",
                    })
                    self._append_ledger(record)
                    recovered.append(task_id)
        if recovered:
            logger.info(f"Recovered {len(recovered)} interrupted tasks: {recovered}")
        return recovered
