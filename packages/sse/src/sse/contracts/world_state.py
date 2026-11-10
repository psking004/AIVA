"""Strategic Systems Engine - World State Contracts.

Defines schemas for entities, resources, relational graphs, constraints,
and immutable world state snapshots.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any


class EntityType(str, Enum):
    """Categorical types of entities within the strategic world model."""

    SELF = "self"
    COMPETITOR = "competitor"
    ALLY = "ally"
    NEUTRAL_ACTOR = "neutral_actor"
    ENVIRONMENT = "environment"
    RESOURCE_POOL = "resource_pool"
    REGULATOR = "regulator"


class ConstraintType(str, Enum):
    """Strictness category of strategic constraints."""

    HARD = "hard"  # Invariant violation: action is invalid
    SOFT = "soft"  # Objective penalty: incurs negative cost/utility


@dataclass
class EntityState:
    """State of an individual agent or entity in the world model."""

    entity_id: str
    name: str
    entity_type: EntityType
    attributes: dict[str, Any] = field(default_factory=dict)
    beliefs: dict[str, Any] = field(default_factory=dict)
    known_goals: list[str] = field(default_factory=list)
    risk_tolerance: float = 0.5  # [0.0 (risk averse) to 1.0 (risk seeking)]
    rationality_bound: float = 1.0  # [0.0 (random) to 1.0 (perfect hyper-rational)]
    is_active: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResourceState:
    """State and capacity allocation of a critical system resource."""

    resource_id: str
    name: str
    total_capacity: float
    allocated_capacity: float = 0.0
    unit: str = "units"
    is_fungible: bool = True
    min_reserve: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def available_capacity(self) -> float:
        """Remaining unallocated resource capacity."""
        return max(0.0, self.total_capacity - self.allocated_capacity)

    @property
    def is_exhausted(self) -> bool:
        """Checks if available capacity violates minimum reserve bounds."""
        return self.available_capacity <= self.min_reserve


@dataclass
class RelationshipState:
    """Directed edge representing a strategic relationship between two entities."""

    source_id: str
    target_id: str
    relation_type: str  # e.g., 'competes_with', 'supplies', 'allied_with', 'regulates'
    strength: float = 1.0  # [-1.0 adversarial to +1.0 full alliance]
    is_symmetric: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConstraintDefinition:
    """Rule or boundary that governs candidate strategies."""

    constraint_id: str
    name: str
    constraint_type: ConstraintType
    description: str
    expression: str  # Formal evaluation expression or rule identifier
    penalty_weight: float = 1.0  # Applicable if soft constraint
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorldStateSnapshot:
    """Immutable versioned snapshot of the strategic world state."""

    snapshot_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    version: int = 1
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    entities: dict[str, EntityState] = field(default_factory=dict)
    resources: dict[str, ResourceState] = field(default_factory=dict)
    relationships: list[RelationshipState] = field(default_factory=list)
    constraints: list[ConstraintDefinition] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def calculate_checksum(self) -> str:
        """Computes a deterministic SHA-256 hash digest of the snapshot state."""
        state_dict = {
            "version": self.version,
            "entities": sorted(self.entities.keys()),
            "resources": {k: (r.total_capacity, r.allocated_capacity) for k, r in sorted(self.resources.items())},
            "relationships": [(r.source_id, r.target_id, r.relation_type, r.strength) for r in self.relationships],
            "constraints": [c.constraint_id for c in self.constraints],
        }
        serialized = json.dumps(state_dict, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
