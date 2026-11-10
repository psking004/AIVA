"""Strategic Systems Engine - Ingestion Observation Validator.

Validates observation schemas, detects stale observations, verifies provenance,
and computes decaying effective confidence scores.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sse.contracts.observation import ConfidenceGrade, Observation, ObservationBatch


class ObservationValidator:
    """Validates sensory and environmental observations received from AIVA."""

    def __init__(self, default_validity_seconds: float = 3600.0) -> None:
        self.default_validity_seconds = default_validity_seconds

    def validate_observation(
        self,
        observation: Observation,
        current_time: datetime | None = None,
    ) -> dict[str, Any]:
        """Validates a single observation against freshness and confidence rules.

        Returns validation status, errors, warnings, and effective confidence.
        """
        now = current_time or datetime.now(UTC)
        errors: list[str] = []
        warnings: list[str] = []

        # Validate mandatory fields
        if not observation.entity_id or not observation.attribute_name:
            errors.append("Observation missing entity_id or attribute_name")
        if not observation.source:
            errors.append("Observation missing source identifier")

        # Validate confidence bounds
        if not (0.0 <= observation.confidence <= 1.0):
            errors.append(f"Confidence value {observation.confidence} outside [0.0, 1.0]")

        # Check staleness
        is_stale = observation.is_stale(now)
        if is_stale:
            warnings.append(
                f"Observation is stale (observed at {observation.observed_at.isoformat()}, "
                f"validity {observation.validity_period_seconds}s)"
            )

        eff_conf = observation.effective_confidence(now)
        if eff_conf < 0.20:
            warnings.append(f"Effective confidence critically low ({eff_conf:.2f})")

        return {
            "valid": len(errors) == 0,
            "is_stale": is_stale,
            "errors": errors,
            "warnings": warnings,
            "effective_confidence": eff_conf,
            "confidence_grade": (
                ConfidenceGrade.HIGH_CONFIDENCE
                if eff_conf >= 0.8
                else ConfidenceGrade.MEDIUM_CONFIDENCE
                if eff_conf >= 0.5
                else ConfidenceGrade.LOW_CONFIDENCE
            ),
        }

    def validate_batch(
        self,
        batch: ObservationBatch,
        current_time: datetime | None = None,
    ) -> dict[str, Any]:
        """Validates an entire batch of observations."""
        now = current_time or datetime.now(UTC)
        results = [self.validate_observation(obs, now) for obs in batch.observations]

        all_valid = all(r["valid"] for r in results)
        total_errors = sum(len(r["errors"]) for r in results)
        total_warnings = sum(len(r["warnings"]) for r in results)

        return {
            "valid": all_valid,
            "total_observations": len(batch.observations),
            "total_errors": total_errors,
            "total_warnings": total_warnings,
            "results": results,
        }
