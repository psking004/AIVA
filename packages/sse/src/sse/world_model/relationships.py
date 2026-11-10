"""Strategic Systems Engine - World Model Relational Graph.

Represents networks of strategic relationships, dependencies, alliances,
and adversarial ties between entities.
"""

from __future__ import annotations

import copy
import threading

from sse.contracts.world_state import RelationshipState


class RelationshipGraph:
    """In-memory directed relational graph connecting entities in the strategic environment."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._edges: list[RelationshipState] = []
        # Adjacency lookup: source_id -> list of relationships
        self._adj: dict[str, list[RelationshipState]] = {}

    def add_relationship(self, rel: RelationshipState) -> None:
        with self._lock:
            # Remove any duplicate directed edge with same relation_type
            self._edges = [
                e
                for e in self._edges
                if not (
                    e.source_id == rel.source_id
                    and e.target_id == rel.target_id
                    and e.relation_type == rel.relation_type
                )
            ]
            self._edges.append(copy.deepcopy(rel))
            if rel.is_symmetric:
                sym_rel = RelationshipState(
                    source_id=rel.target_id,
                    target_id=rel.source_id,
                    relation_type=rel.relation_type,
                    strength=rel.strength,
                    is_symmetric=True,
                    metadata=copy.deepcopy(rel.metadata),
                )
                self._edges = [
                    e
                    for e in self._edges
                    if not (
                        e.source_id == sym_rel.source_id
                        and e.target_id == sym_rel.target_id
                        and e.relation_type == sym_rel.relation_type
                    )
                ]
                self._edges.append(sym_rel)
            self._rebuild_adjacency()

    def _rebuild_adjacency(self) -> None:
        self._adj.clear()
        for edge in self._edges:
            self._adj.setdefault(edge.source_id, []).append(edge)

    def get_relationships_from(self, source_id: str, relation_type: str | None = None) -> list[RelationshipState]:
        with self._lock:
            edges = self._adj.get(source_id, [])
            if relation_type:
                return [copy.deepcopy(e) for e in edges if e.relation_type == relation_type]
            return [copy.deepcopy(e) for e in edges]

    def get_competitors(self, entity_id: str) -> list[str]:
        """Finds all entity IDs that have an adversarial/competitor relationship."""
        with self._lock:
            edges = self.get_relationships_from(entity_id)
            return [
                e.target_id
                for e in edges
                if e.relation_type in ("competes_with", "adversary", "rival") or e.strength < 0.0
            ]

    def get_allies(self, entity_id: str) -> list[str]:
        """Finds all entity IDs that have an allied or cooperative relationship."""
        with self._lock:
            edges = self.get_relationships_from(entity_id)
            return [
                e.target_id
                for e in edges
                if e.relation_type in ("allied_with", "partner", "cooperative") or e.strength > 0.5
            ]

    def find_path(self, start_id: str, end_id: str, max_depth: int = 4) -> list[str] | None:
        """Finds a relationship path between two entities using BFS."""
        with self._lock:
            if start_id == end_id:
                return [start_id]
            visited: set[str] = {start_id}
            queue: list[list[str]] = [[start_id]]

            while queue:
                path = queue.pop(0)
                if len(path) > max_depth:
                    break
                curr = path[-1]
                for edge in self._adj.get(curr, []):
                    next_node = edge.target_id
                    if next_node == end_id:
                        return path + [next_node]
                    if next_node not in visited:
                        visited.add(next_node)
                        queue.append(path + [next_node])
            return None

    def snapshot(self) -> list[RelationshipState]:
        with self._lock:
            return [copy.deepcopy(e) for e in self._edges]
