"""Strategic Systems Engine - Execution Adapters.

Defines the adapter interface and concrete execution targets (Mock sandbox,
Tool calls, external API dispatchers).
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

from sse.contracts.action import ActionDefinition, ActionExecutionStatus, ActionResult


class BaseActionAdapter(ABC):
    """Abstract interface for executing strategic actions on external systems."""

    @abstractmethod
    def execute(self, action: ActionDefinition, parameters: dict[str, Any] | None = None) -> ActionResult:
        """Executes the action and returns an ActionResult."""


class MockActionAdapter(BaseActionAdapter):
    """Safe, in-memory sandboxed adapter for simulation, staging, and testing."""

    def __init__(self, simulate_latency_sec: float = 0.0, force_failure: bool = False) -> None:
        self.simulate_latency_sec = simulate_latency_sec
        self.force_failure = force_failure
        self.execution_log: list[ActionResult] = []

    def execute(self, action: ActionDefinition, parameters: dict[str, Any] | None = None) -> ActionResult:
        start_time = datetime.now(UTC)
        if self.simulate_latency_sec > 0:
            time.sleep(self.simulate_latency_sec)

        params = parameters or action.parameters

        if self.force_failure:
            result = ActionResult(
                action_id=action.action_id,
                status=ActionExecutionStatus.FAILURE,
                error_message="Simulated forced failure by MockActionAdapter",
                dispatched_at=start_time,
                completed_at=datetime.now(UTC),
                duration_seconds=self.simulate_latency_sec,
                output_payload={},
            )
        else:
            result = ActionResult(
                action_id=action.action_id,
                status=ActionExecutionStatus.SUCCESS,
                dispatched_at=start_time,
                completed_at=datetime.now(UTC),
                duration_seconds=self.simulate_latency_sec,
                output_payload={
                    "target": action.target_entity,
                    "applied_parameters": params,
                    "acknowledged": True,
                },
            )

        self.execution_log.append(result)
        return result


class ToolCallAdapter(BaseActionAdapter):
    """Adapter for executing actions by invoking registered tool endpoints."""

    def __init__(self, tool_registry: dict[str, Any] | None = None) -> None:
        self.tool_registry = tool_registry or {}
        self.executed_calls: list[dict[str, Any]] = []

    def register_tool(self, tool_name: str, handler: Any) -> None:
        self.tool_registry[tool_name] = handler

    def execute(self, action: ActionDefinition, parameters: dict[str, Any] | None = None) -> ActionResult:
        start_time = datetime.now(UTC)
        handler = self.tool_registry.get(action.name)
        params = parameters or action.parameters

        if not handler:
            return ActionResult(
                action_id=action.action_id,
                status=ActionExecutionStatus.FAILURE,
                error_message=f"No tool registered for action name '{action.name}'",
                dispatched_at=start_time,
                completed_at=datetime.now(UTC),
            )

        try:
            output = handler(params) if callable(handler) else handler
            return ActionResult(
                action_id=action.action_id,
                status=ActionExecutionStatus.SUCCESS,
                output_payload=output if isinstance(output, dict) else {"output": output},
                dispatched_at=start_time,
                completed_at=datetime.now(UTC),
            )
        except Exception as e:
            return ActionResult(
                action_id=action.action_id,
                status=ActionExecutionStatus.FAILURE,
                error_message=f"Tool invocation exception: {e!s}",
                dispatched_at=start_time,
                completed_at=datetime.now(UTC),
            )
