"""AIVA Swarm Engine - Telemetry and Observability Tracker.

Tracks agent lifecycle events, timestamps, resource consumption,
and outputs structured JSON records for real-time dashboard visualization.
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class SwarmEvent:
    """Standardized event emitted during agent task execution."""
    event_id: str
    timestamp: float
    task_id: str
    agent_id: str
    event_type: str  # CREATED, ASSIGNED, STARTED, DELEGATION, TOOL_EXEC, CHECKPOINT, VERIFICATION, FAILURE, RETRY, COMPLETION
    details: Dict[str, Any] = field(default_factory=dict)
    node: str = "PC-B"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp,
            "task_id": self.task_id,
            "agent_id": self.agent_id,
            "event_type": self.event_type,
            "details": self.details,
            "node": self.node,
        }


class SwarmTelemetry:
    """Thread-safe telemetry collector recording swarm observability data."""

    def __init__(self, export_path: Optional[str] = None):
        self._lock = threading.RLock()
        self._events: List[SwarmEvent] = []
        self._agent_heartbeats: Dict[str, float] = {}
        self.export_path = Path(export_path) if export_path else None

    def record_event(
        self,
        task_id: str,
        agent_id: str,
        event_type: str,
        details: Optional[Dict[str, Any]] = None,
        node: str = "PC-B",
    ) -> SwarmEvent:
        """Records an event and updates agent heartbeat."""
        now = time.time()
        ev = SwarmEvent(
            event_id=f"ev_{int(now*1000)}_{len(self._events)}",
            timestamp=now,
            task_id=task_id,
            agent_id=agent_id,
            event_type=event_type,
            details=details or {},
            node=node,
        )

        with self._lock:
            self._events.append(ev)
            self._agent_heartbeats[agent_id] = now
            if len(self._events) > 5000:
                self._events.pop(0)

            # Auto-export if path is configured
            if self.export_path:
                try:
                    self.export_to_json(self.export_path)
                except Exception:
                    pass

        return ev

    def export_to_json(self, path: Path | str) -> None:
        """Exports all recorded telemetry events to a JSON file."""
        with self._lock:
            data = [ev.to_dict() for ev in self._events]
            p = Path(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)

    def get_events(self, task_id: Optional[str] = None) -> List[SwarmEvent]:
        with self._lock:
            if not task_id:
                return list(self._events)
            return [e for e in self._events if e.task_id == task_id]
