"""Strategic Systems Engine - Model & Policy Registry.

Maintains versioned strategic decision models and policies, enforcing offline
evaluation gates before promoting model versions to production.
"""

from __future__ import annotations

import copy
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any


class ModelStage(str, Enum):
    """Lifecycle stages for strategic decision models in the registry."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"


@dataclass
class ModelVersionRecord:
    """Metadata and evaluation results for a registered model/policy version."""

    model_name: str
    version: str
    stage: ModelStage = ModelStage.DEVELOPMENT
    evaluation_score: float = 0.0
    passed_offline_eval: bool = False
    registered_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    parameters: dict[str, Any] = field(default_factory=dict)
    eval_metrics: dict[str, float] = field(default_factory=dict)
    description: str | None = None


class ModelRegistry:
    """Governs model versions and deployment status for the strategic intelligence engine."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._models: dict[str, dict[str, ModelVersionRecord]] = {}

    def register_model_version(
        self,
        model_name: str,
        version: str,
        parameters: dict[str, Any] | None = None,
        description: str | None = None,
    ) -> ModelVersionRecord:
        """Registers a new candidate model version in development stage."""
        with self._lock:
            record = ModelVersionRecord(
                model_name=model_name,
                version=version,
                parameters=parameters or {},
                description=description,
            )
            self._models.setdefault(model_name, {})[version] = record
            return copy.deepcopy(record)

    def record_offline_evaluation(
        self,
        model_name: str,
        version: str,
        score: float,
        metrics: dict[str, float],
        min_passing_score: float = 0.80,
    ) -> ModelVersionRecord | None:
        """Records results of an offline evaluation benchmark."""
        with self._lock:
            versions = self._models.get(model_name)
            if not versions or version not in versions:
                return None
            rec = versions[version]
            rec.evaluation_score = score
            rec.eval_metrics = metrics
            rec.passed_offline_eval = score >= min_passing_score
            return copy.deepcopy(rec)

    def promote_to_production(self, model_name: str, version: str) -> bool:
        """Promotes a version to production if it passed offline evaluation."""
        with self._lock:
            versions = self._models.get(model_name)
            if not versions or version not in versions:
                return False

            target = versions[version]
            if not target.passed_offline_eval:
                return False  # Block unverified promotion

            # Archive existing production version
            for rec in versions.values():
                if rec.stage == ModelStage.PRODUCTION:
                    rec.stage = ModelStage.ARCHIVED

            target.stage = ModelStage.PRODUCTION
            return True

    def get_production_version(self, model_name: str) -> ModelVersionRecord | None:
        """Retrieves the active production model version."""
        with self._lock:
            versions = self._models.get(model_name, {})
            for rec in versions.values():
                if rec.stage == ModelStage.PRODUCTION:
                    return copy.deepcopy(rec)
            return None
