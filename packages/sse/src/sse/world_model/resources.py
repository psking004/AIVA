"""Strategic Systems Engine - World Model Resources.

Manages resource allocations, capacity tracking, reservations, and resource constraints.
"""

from __future__ import annotations

import copy
import threading

from sse.contracts.world_state import ResourceState


class ResourceManager:
    """Thread-safe manager for tracking system and operational resource pools."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._resources: dict[str, ResourceState] = {}

    def register_resource(self, resource: ResourceState) -> ResourceState:
        with self._lock:
            self._resources[resource.resource_id] = copy.deepcopy(resource)
            return self._resources[resource.resource_id]

    def get_resource(self, resource_id: str) -> ResourceState | None:
        with self._lock:
            r = self._resources.get(resource_id)
            return copy.deepcopy(r) if r else None

    def allocate(self, resource_id: str, amount: float) -> bool:
        """Attempts to allocate an amount of resource capacity."""
        if amount <= 0:
            return True
        with self._lock:
            res = self._resources.get(resource_id)
            if not res:
                return False
            if res.available_capacity - amount < res.min_reserve:
                return False
            res.allocated_capacity += amount
            return True

    def release(self, resource_id: str, amount: float) -> bool:
        """Releases previously allocated capacity back to the resource pool."""
        if amount <= 0:
            return True
        with self._lock:
            res = self._resources.get(resource_id)
            if not res:
                return False
            res.allocated_capacity = max(0.0, res.allocated_capacity - amount)
            return True

    def list_resources(self) -> list[ResourceState]:
        with self._lock:
            return [copy.deepcopy(r) for r in self._resources.values()]

    def snapshot(self) -> dict[str, ResourceState]:
        with self._lock:
            return {k: copy.deepcopy(v) for k, v in self._resources.items()}
