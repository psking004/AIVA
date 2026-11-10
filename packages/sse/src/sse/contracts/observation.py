"""Strategic Systems Engine - Observation Contracts.

Defines schemas for sensory and environment observations received from AIVA.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any


class ConfidenceGrade(str, Enum):
    """Categorical reliability assessment of observation sources."""

    VERIFIED_FACT = "verified_fact"
    HIGH_CONFIDENCE = "high_confidence"
    MEDIUM_CONFIDENCE = "medium_confidence"
    LOW_CONFIDENCE = "low_confidence"
    UNVERIFIED_HEARSAY = "unverified_hearsay"


@dataclass
class Observation:
    """An individual observation of an entity, parameter, or event."""

    source: str
    entity_id: str
    attribute_name: str
    value: Any
    confidence: float  # [0.0, 1.0]
    observation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    observed_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    validity_period_seconds: float = 3600.0  # Default 1 hour freshness
    provenance: dict[str, Any] = field(default_factory=dict)
    confidence_grade: ConfidenceGrade = ConfidenceGrade.MEDIUM_CONFIDENCE
    verified: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def is_stale(self, current_time: datetime | None = None) -> bool:
        """Determines whether the observation has expired past its validity period."""
        now = current_time or datetime.now(UTC)
        elapsed = (now - self.observed_at).total_seconds()
        return elapsed > self.validity_period_seconds

    def effective_confidence(self, current_time: datetime | None = None, half_life_seconds: float = 7200.0) -> float:
        """Calculates decayed confidence over time."""
        now = current_time or datetime.now(UTC)
        elapsed = max(0.0, (now - self.observed_at).total_seconds())
        decay_factor = 0.5 ** (elapsed / half_life_seconds)
        return float(self.confidence * decay_factor)


@dataclass
class ObservationBatch:
    """A collection of simultaneous or correlated observations."""

    observations: list[Observation]
    batch_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    correlation_id: str | None = None
    ingested_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    source_system: str = "aiva_perceptor"
    metadata: dict[str, Any] = field(default_factory=dict)
