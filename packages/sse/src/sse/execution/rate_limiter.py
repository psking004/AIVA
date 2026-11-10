"""Strategic Systems Engine - Execution Quota and Rate Limiter.

Prevents runaway autonomous execution by enforcing operation rate limits and cumulative
cost ceilings per time window.
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from typing import Any


class ExecutionQuotaLimiter:
    """Tracks and bounds action execution frequencies and cumulative budgets."""

    def __init__(
        self,
        max_actions_per_minute: int = 30,
        max_cost_per_hour: float = 5000.0,
    ) -> None:
        self._lock = threading.RLock()
        self.max_actions_per_minute = max_actions_per_minute
        self.max_cost_per_hour = max_cost_per_hour
        self._action_timestamps: list[datetime] = []
        self._cost_log: list[tuple[datetime, float]] = []

    def check_and_record(self, action_cost: float = 0.0) -> dict[str, Any]:
        """Checks if executing an action violates rate or cost limits, recording it if permitted."""
        with self._lock:
            now = datetime.now(UTC)

            # Purge timestamps older than 60 seconds
            cutoff_min = now.timestamp() - 60.0
            self._action_timestamps = [t for t in self._action_timestamps if t.timestamp() > cutoff_min]

            # Purge costs older than 3600 seconds
            cutoff_hr = now.timestamp() - 3600.0
            self._cost_log = [c for c in self._cost_log if c[0].timestamp() > cutoff_hr]

            current_rate = len(self._action_timestamps)
            current_cost = sum(c[1] for c in self._cost_log)

            if current_rate >= self.max_actions_per_minute:
                return {
                    "allowed": False,
                    "reason": f"Rate limit reached: {current_rate}/{self.max_actions_per_minute} actions in last 60s",
                }

            if current_cost + action_cost > self.max_cost_per_hour:
                return {
                    "allowed": False,
                    "reason": f"Cost budget reached: {current_cost + action_cost:.2f} exceeds {self.max_cost_per_hour:.2f}/hr ceiling",
                }

            # Record
            self._action_timestamps.append(now)
            self._cost_log.append((now, action_cost))

            return {
                "allowed": True,
                "current_rate": current_rate + 1,
                "current_cost": current_cost + action_cost,
            }
