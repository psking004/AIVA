"""Strategic Systems Engine - World Model State Manager.

Coordinates entities, resources, relationships, and constraints into immutable,
versioned WorldStateSnapshots and provides drift detection and diffing.
"""

from __future__ import annotations

import copy
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from sse.contracts.world_state import WorldStateSnapshot
from sse.world_model.constraints import ConstraintManager
from sse.world_model.entities import EntityRegistry
from sse.world_model.relationships import RelationshipGraph
from sse.world_model.resources import ResourceManager


class WorldStateManager:
    """Central manager for world state, snapshots, and drift tracking."""

    def __init__(
        self,
        entity_registry: EntityRegistry | None = None,
        resource_manager: ResourceManager | None = None,
        relationship_graph: RelationshipGraph | None = None,
        constraint_manager: ConstraintManager | None = None,
    ) -> None:
        self._lock = threading.RLock()
        self.entities = entity_registry or EntityRegistry()
        self.resources = resource_manager or ResourceManager()
        self.relationships = relationship_graph or RelationshipGraph()
        self.constraints = constraint_manager or ConstraintManager()
        self._current_version: int = 1
        self._snapshots: dict[str, WorldStateSnapshot] = {}

    def capture_snapshot(self, metadata: dict[str, Any] | None = None) -> WorldStateSnapshot:
        """Captures an immutable snapshot of the current state of the world."""
        with self._lock:
            snapshot = WorldStateSnapshot(
                snapshot_id=str(uuid.uuid4()),
                version=self._current_version,
                timestamp=datetime.now(UTC),
                entities=self.entities.snapshot(),
                resources=self.resources.snapshot(),
                relationships=self.relationships.snapshot(),
                constraints=self.constraints.snapshot(),
                metadata=copy.deepcopy(metadata or {}),
            )
            self._snapshots[snapshot.snapshot_id] = snapshot
            self._current_version += 1
            return copy.deepcopy(snapshot)

    def get_snapshot(self, snapshot_id: str) -> WorldStateSnapshot | None:
        """Retrieves a previously captured snapshot."""
        with self._lock:
            snap = self._snapshots.get(snapshot_id)
            return copy.deepcopy(snap) if snap else None

    def detect_drift(
        self,
        baseline_snapshot: WorldStateSnapshot,
        current_snapshot: WorldStateSnapshot | None = None,
        tolerance_ratio: float = 0.10,
    ) -> dict[str, Any]:
        """Compares baseline snapshot to current state to detect significant environmental drift.

        Returns drift metrics and boolean drift_detected flag.
        """
        curr = current_snapshot or self.capture_snapshot()
        drift_items: list[str] = []

        # Check entity membership
        base_entities = set(baseline_snapshot.entities.keys())
        curr_entities = set(curr.entities.keys())
        added_entities = curr_entities - base_entities
        removed_entities = base_entities - curr_entities

        if added_entities:
            drift_items.append(f"New entities introduced: {list(added_entities)}")
        if removed_entities:
            drift_items.append(f"Entities removed: {list(removed_entities)}")

        # Check resource variations
        for res_id, base_res in baseline_snapshot.resources.items():
            curr_res = curr.resources.get(res_id)
            if not curr_res:
                drift_items.append(f"Resource {res_id} no longer exists")
                continue
            delta = abs(curr_res.available_capacity - base_res.available_capacity)
            if base_res.total_capacity > 0:
                fraction_changed = delta / base_res.total_capacity
                if fraction_changed > tolerance_ratio:
                    drift_items.append(
                        f"Resource {res_id} capacity changed by {fraction_changed:.1%} (tolerance: {tolerance_ratio:.1%})"
                    )

        # Check relationship modifications
        base_rels = {(r.source_id, r.target_id, r.relation_type) for r in baseline_snapshot.relationships}
        curr_rels = {(r.source_id, r.target_id, r.relation_type) for r in curr.relationships}
        if base_rels != curr_rels:
            diff_rel = (base_rels ^ curr_rels)
            drift_items.append(f"Relationship graph modified: {len(diff_rel)} edge difference(s)")

        # Check checksum equality
        base_checksum = baseline_snapshot.calculate_checksum()
        curr_checksum = curr.calculate_checksum()
        checksum_changed = base_checksum != curr_checksum

        drift_detected = len(drift_items) > 0

        return {
            "drift_detected": drift_detected,
            "checksum_changed": checksum_changed,
            "baseline_checksum": base_checksum,
            "current_checksum": curr_checksum,
            "drift_items": drift_items,
        }
