"""Unit tests for the Ingestion Package."""

from datetime import UTC, datetime, timedelta

from sse.contracts import Observation, ObservationBatch
from sse.ingestion import ObservationReconciler, ObservationValidator
from sse.world_model import WorldStateManager


def test_observation_validation():
    validator = ObservationValidator()
    now = datetime.now(UTC)

    # Valid observation
    obs = Observation(
        source="sensor_alpha",
        entity_id="server_1",
        attribute_name="cpu_load",
        value=0.72,
        confidence=0.95,
        observed_at=now,
        validity_period_seconds=120.0,
    )
    val_res = validator.validate_observation(obs, now)
    assert val_res["valid"]
    assert not val_res["is_stale"]
    assert val_res["effective_confidence"] == 0.95

    # Expired observation
    past = now - timedelta(seconds=200)
    obs_stale = Observation(
        source="sensor_alpha",
        entity_id="server_1",
        attribute_name="cpu_load",
        value=0.72,
        confidence=0.95,
        observed_at=past,
        validity_period_seconds=120.0,
    )
    val_res_stale = validator.validate_observation(obs_stale, now)
    assert val_res_stale["valid"]  # structurally valid
    assert val_res_stale["is_stale"]
    assert len(val_res_stale["warnings"]) > 0


def test_observation_reconciliation_conflict():
    state_mgr = WorldStateManager()
    reconciler = ObservationReconciler(state_manager=state_mgr)

    now = datetime.now(UTC)
    obs1 = Observation(
        source="source_A",
        entity_id="target_co",
        attribute_name="valuation_million",
        value=100.0,
        confidence=0.8,
        observed_at=now,
    )
    obs2 = Observation(
        source="source_B",
        entity_id="target_co",
        attribute_name="valuation_million",
        value=120.0,
        confidence=0.2,
        observed_at=now,
    )

    batch = ObservationBatch(observations=[obs1, obs2])
    res = reconciler.reconcile_and_apply(batch)

    assert res["conflicts_detected"] == 1
    # Weighted average: (100 * 0.8 + 120 * 0.2) / 1.0 = 80 + 24 = 104.0
    entity = state_mgr.entities.get_entity("target_co")
    assert entity is not None
    assert abs(entity.attributes["valuation_million"] - 104.0) < 1e-4
