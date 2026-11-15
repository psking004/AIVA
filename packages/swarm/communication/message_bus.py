"""AIVA Swarm Engine - Inter-Agent Communication Bus.

Provides structured message dispatch, correlation tracking, loop prevention,
message ceilings, and message audit ledgers.
"""

from __future__ import annotations

import collections
import threading
import time
from typing import Callable, Dict, List, Optional

from packages.swarm.core.contracts import MessageType, SwarmMessage


class SwarmMessageBus:
    """Thread-safe event and message distribution system for Swarm specialist agents."""

    def __init__(self, max_message_depth: int = 20, max_history: int = 10_000):
        self.max_message_depth = max_message_depth
        self.max_history = max_history
        self._lock = threading.RLock()
        self._subscribers: Dict[str, List[Callable[[SwarmMessage], None]]] = collections.defaultdict(list)
        self._message_history: List[SwarmMessage] = []
        self._task_message_counts: Dict[str, int] = collections.defaultdict(int)

    def subscribe(self, agent_id: str, callback: Callable[[SwarmMessage], None]) -> None:
        """Register a callback for messages targeted to a specific agent."""
        with self._lock:
            self._subscribers[agent_id].append(callback)

    def publish(self, message: SwarmMessage) -> bool:
        """Publishes a structured message to its target recipient with loop guard."""
        with self._lock:
            # 1. Loop prevention check
            task_id = message.task_id or "global"
            self._task_message_counts[task_id] += 1
            if self._task_message_counts[task_id] > self.max_message_depth:
                # Loop ceiling tripped
                escalation_msg = SwarmMessage(
                    task_id=task_id,
                    sender_agent="system_message_bus",
                    recipient_agent="agent_strategic_planner",
                    message_type=MessageType.ESCALATION,
                    payload={
                        "error": "MAX_MESSAGE_DEPTH_EXCEEDED",
                        "depth": self._task_message_counts[task_id],
                        "original_message": message.to_dict(),
                    },
                )
                self._message_history.append(escalation_msg)
                return False

            # 2. Append to history with bounded capacity
            self._message_history.append(message)
            if len(self._message_history) > self.max_history:
                self._message_history.pop(0)

            # 3. Deliver to target agent subscribers
            recipients = [message.recipient_agent] if message.recipient_agent else list(self._subscribers.keys())
            if message.recipient_agent == "*":
                recipients = list(self._subscribers.keys())

            delivered = False
            for r in recipients:
                for handler in self._subscribers.get(r, []):
                    try:
                        handler(message)
                        delivered = True
                    except Exception as handler_err:
                        pass

            return delivered

    def get_history(self, task_id: Optional[str] = None) -> List[SwarmMessage]:
        """Returns message history, optionally filtered by task ID."""
        with self._lock:
            if not task_id:
                return list(self._message_history)
            return [m for m in self._message_history if m.task_id == task_id]

    def reset_task(self, task_id: str) -> None:
        """Resets the message counter for a task."""
        with self._lock:
            self._task_message_counts.pop(task_id, None)

