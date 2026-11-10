"""Strategic Systems Engine - Execution Package.

Exports execution adapters, rollback coordinators, rate limiters, and action dispatchers.
"""

from sse.execution.adapters import (
    BaseActionAdapter,
    MockActionAdapter,
    ToolCallAdapter,
)
from sse.execution.dispatcher import ActionDispatcher
from sse.execution.rate_limiter import ExecutionQuotaLimiter
from sse.execution.rollback import CompensationCoordinator

__all__ = [
    "ActionDispatcher",
    "BaseActionAdapter",
    "CompensationCoordinator",
    "ExecutionQuotaLimiter",
    "MockActionAdapter",
    "ToolCallAdapter",
]

