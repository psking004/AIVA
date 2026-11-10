"""Strategic Systems Engine - World Model Entities.

Manages entity registration, state updates, attribute queries, and entity lifecycle.
"""

from __future__ import annotations

import copy
import threading

from sse.contracts.world_state import EntityState, EntityType


class EntityRegistry:
    """Thread-safe registry for maintaining all active entities in the strategic environment."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entities: dict[str, EntityState] = {}

    def register_entity(self, entity: EntityState) -> EntityState:
        """Registers a new entity or replaces an existing one."""
        with self._lock:
            self._entities[entity.entity_id] = copy.deepcopy(entity)
            return self._entities[entity.entity_id]

    def get_entity(self, entity_id: str) -> EntityState | None:
        """Retrieves a deep copy of an entity by its ID."""
        with self._lock:
            entity = self._entities.get(entity_id)
            return copy.deepcopy(entity) if entity else None

    def update_attributes(self, entity_id: str, attributes: dict[str, any]) -> EntityState | None:
        """Updates specific state attributes for an entity."""
        with self._lock:
            entity = self._entities.get(entity_id)
            if not entity:
                return None
            entity.attributes.update(attributes)
            return copy.deepcopy(entity)

    def update_beliefs(self, entity_id: str, beliefs: dict[str, any]) -> EntityState | None:
        """Updates belief states of an entity."""
        with self._lock:
            entity = self._entities.get(entity_id)
            if not entity:
                return None
            entity.beliefs.update(beliefs)
            return copy.deepcopy(entity)

    def list_entities(self, entity_type: EntityType | None = None) -> list[EntityState]:
        """Returns all entities, optionally filtered by type."""
        with self._lock:
            if entity_type is None:
                return [copy.deepcopy(e) for e in self._entities.values()]
            return [copy.deepcopy(e) for e in self._entities.values() if e.entity_type == entity_type]

    def remove_entity(self, entity_id: str) -> bool:
        """Removes an entity from the registry."""
        with self._lock:
            return self._entities.pop(entity_id, None) is not None

    def snapshot(self) -> dict[str, EntityState]:
        """Returns an immutable dictionary copy of all entities."""
        with self._lock:
            return {k: copy.deepcopy(v) for k, v in self._entities.items()}
