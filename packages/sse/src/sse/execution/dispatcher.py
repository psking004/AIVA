"""Strategic Systems Engine - Action Dispatcher.

Central execution coordinator that verifies authorization tokens, checks rate limits,
dispatches to sandboxed adapters, and coordinates rollback upon failure.
"""

from __future__ import annotations

import threading
from typing import Any

from sse.contracts.action import ActionDefinition, ActionExecutionStatus, ActionResult
from sse.execution.adapters import BaseActionAdapter, MockActionAdapter
from sse.execution.rate_limiter import ExecutionQuotaLimiter
from sse.execution.rollback import CompensationCoordinator
from sse.governance.authorization import AuthorizationGate


class ActionDispatcher:
    """Dispatches authorized strategic actions with safety verification and rollback guarantees."""

    def __init__(
        self,
        authorization_gate: AuthorizationGate,
        action_adapter: BaseActionAdapter | None = None,
        quota_limiter: ExecutionQuotaLimiter | None = None,
    ) -> None:
        self._lock = threading.RLock()
        self.authorization_gate = authorization_gate
        self.adapter = action_adapter or MockActionAdapter()
        self.quota_limiter = quota_limiter or ExecutionQuotaLimiter()
        self.rollback_coordinator = CompensationCoordinator(self.adapter)

    def dispatch_action(
        self,
        action: ActionDefinition,
        grant_token: str,
        parameters: dict[str, Any] | None = None,
        auto_rollback_on_failure: bool = True,
    ) -> ActionResult:
        """Dispatches an action after validating authorization, quotas, and registering compensation."""
        with self._lock:
            # Step 1: Validate authorization grant token
            val = self.authorization_gate.validate_grant(grant_token)
            if not val["valid"]:
                return ActionResult(
                    action_id=action.action_id,
                    status=ActionExecutionStatus.FAILURE,
                    error_message=f"Unauthorized: {val['reason']}",
                )

            # Step 2: Check execution quotas
            quota_res = self.quota_limiter.check_and_record(action.estimated_cost)
            if not quota_res["allowed"]:
                return ActionResult(
                    action_id=action.action_id,
                    status=ActionExecutionStatus.FAILURE,
                    error_message=f"Quota exceeded: {quota_res['reason']}",
                )

            # Step 3: Register action definition with rollback coordinator
            self.rollback_coordinator.register_action_definition(action)

            # Step 4: Execute through adapter
            result = self.adapter.execute(action, parameters)

            # Step 5: Record execution outcome
            self.rollback_coordinator.record_execution(result)

            # Step 6: If failed and auto rollback enabled, trigger rollback
            if result.status == ActionExecutionStatus.FAILURE and auto_rollback_on_failure:
                comp_summary = self.rollback_coordinator.trigger_rollback(
                    reason=f"Execution of action {action.action_id} failed"
                )
                result.compensation_attempted = True
                result.metadata["compensation_summary"] = comp_summary

            return result
