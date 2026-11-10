"""Strategic Systems Engine - Compensation & Rollback Coordinator.

Coordinates automated compensation actions for failed or aborted strategic workflows.
"""

from __future__ import annotations

import copy
import threading
from datetime import UTC, datetime
from typing import Any

from sse.contracts.action import (
    ActionDefinition,
    ActionExecutionStatus,
    ActionResult,
    Reversibility,
)
from sse.execution.adapters import BaseActionAdapter


class CompensationCoordinator:
    """Coordinates compensation transactions when rollback is triggered."""

    def __init__(self, action_adapter: BaseActionAdapter) -> None:
        self._lock = threading.RLock()
        self.adapter = action_adapter
        self._action_definitions: dict[str, ActionDefinition] = {}
        self._executed_actions: list[ActionResult] = []
        self._compensation_log: list[dict[str, Any]] = []

    def register_action_definition(self, action: ActionDefinition) -> None:
        with self._lock:
            self._action_definitions[action.action_id] = copy.deepcopy(action)

    def record_execution(self, result: ActionResult) -> None:
        with self._lock:
            self._executed_actions.append(copy.deepcopy(result))

    def trigger_rollback(self, reason: str = "Rollback requested") -> dict[str, Any]:
        """Rolls back executed actions in reverse order of execution."""
        with self._lock:
            results: list[dict[str, Any]] = []
            successful_reversals = 0
            failed_reversals = 0

            # Iterate backwards through successfully executed actions
            for exec_res in reversed(self._executed_actions):
                if exec_res.status != ActionExecutionStatus.SUCCESS:
                    continue

                action_def = self._action_definitions.get(exec_res.action_id)
                if not action_def:
                    results.append({
                        "action_id": exec_res.action_id,
                        "status": "unresolvable",
                        "error": "No action definition registered",
                    })
                    failed_reversals += 1
                    continue

                if action_def.reversibility == Reversibility.IRREVERSIBLE:
                    results.append({
                        "action_id": exec_res.action_id,
                        "status": "cannot_rollback",
                        "error": "Action is strictly irreversible",
                    })
                    failed_reversals += 1
                    continue

                comp_id = action_def.compensation_action_id or f"undo_{action_def.action_id}"
                comp_action = ActionDefinition(
                    action_id=comp_id,
                    name=f"Compensate {action_def.name}",
                    description=f"Compensation action for {action_def.action_id}",
                    target_entity=action_def.target_entity,
                    parameters={"compensating_for": exec_res.action_id},
                    reversibility=Reversibility.REVERSIBLE,
                )

                comp_res = self.adapter.execute(comp_action)
                if comp_res.status == ActionExecutionStatus.SUCCESS:
                    successful_reversals += 1
                    results.append({
                        "action_id": exec_res.action_id,
                        "compensation_action_id": comp_id,
                        "status": "compensated",
                    })
                else:
                    failed_reversals += 1
                    results.append({
                        "action_id": exec_res.action_id,
                        "compensation_action_id": comp_id,
                        "status": "compensation_failed",
                        "error": comp_res.error_message,
                    })

            record = {
                "timestamp": datetime.now(UTC),
                "reason": reason,
                "successful_reversals": successful_reversals,
                "failed_reversals": failed_reversals,
                "details": results,
            }
            self._compensation_log.append(record)
            return record
