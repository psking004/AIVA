"""Strategic Systems Engine - Ingestion Observation Reconciler.

Detects conflicting observations across heterogeneous sources, performs
confidence-weighted value reconciliation, and updates the world model.
"""

from __future__ import annotations

from typing import Any

from sse.contracts.observation import Observation, ObservationBatch
from sse.contracts.world_state import EntityType
from sse.world_model.state_manager import WorldStateManager


class ObservationReconciler:
    """Reconciles observations and applies coherent updates to the World Model."""

    def __init__(self, state_manager: WorldStateManager | None = None) -> None:
        self.state_manager = state_manager or WorldStateManager()

    def detect_conflicts(self, observations: list[Observation]) -> list[dict[str, Any]]:
        """Identifies conflicting observations targeting the same entity and attribute."""
        grouped: dict[tuple, list[Observation]] = {}
        for obs in observations:
            key = (obs.entity_id, obs.attribute_name)
            grouped.setdefault(key, []).append(obs)

        conflicts: list[dict[str, Any]] = []
        for (ent_id, attr), obs_list in grouped.items():
            if len(obs_list) > 1:
                # Check for distinct values
                values = [o.value for o in obs_list]
                # Compare values
                has_divergence = any(v != values[0] for v in values)
                if has_divergence:
                    conflicts.append({
                        "entity_id": ent_id,
                        "attribute_name": attr,
                        "observations": obs_list,
                        "values": values,
                    })
        return conflicts

    def reconcile_numeric_values(self, observations: list[Observation]) -> float:
        """Computes a confidence-weighted average of numeric observations."""
        weighted_sum = sum(float(obs.value) * obs.confidence for obs in observations)
        total_weight = sum(obs.confidence for obs in observations)
        if total_weight == 0:
            return float(observations[0].value)
        return float(weighted_sum / total_weight)

    def reconcile_and_apply(self, batch: ObservationBatch) -> dict[str, Any]:
        """Reconciles a batch of observations and updates the active world state entities."""
        conflicts = self.detect_conflicts(batch.observations)

        # Group by (entity_id, attribute_name)
        grouped: dict[tuple, list[Observation]] = {}
        for obs in batch.observations:
            key = (obs.entity_id, obs.attribute_name)
            grouped.setdefault(key, []).append(obs)

        applied_updates: dict[str, dict[str, Any]] = {}

        for (ent_id, attr), obs_list in grouped.items():
            # If single observation or unanimous, take latest highest confidence
            if len(obs_list) == 1:
                chosen_val = obs_list[0].value
            else:
                # If numeric, compute weighted average
                if all(isinstance(o.value, (int, float)) for o in obs_list):
                    chosen_val = self.reconcile_numeric_values(obs_list)
                else:
                    # Non-numeric: choose highest confidence
                    sorted_obs = sorted(obs_list, key=lambda o: o.confidence, reverse=True)
                    chosen_val = sorted_obs[0].value

            applied_updates.setdefault(ent_id, {})[attr] = chosen_val

            # Update entity in world state
            entity = self.state_manager.entities.get_entity(ent_id)
            if entity:
                self.state_manager.entities.update_attributes(ent_id, {attr: chosen_val})
            else:
                # Auto-register entity as neutral/environment actor if unknown
                from sse.contracts.world_state import EntityState
                new_ent = EntityState(
                    entity_id=ent_id,
                    name=f"Entity {ent_id}",
                    entity_type=EntityType.NEUTRAL_ACTOR,
                    attributes={attr: chosen_val},
                )
                self.state_manager.entities.register_entity(new_ent)

        return {
            "applied_count": len(applied_updates),
            "conflicts_detected": len(conflicts),
            "conflicts": conflicts,
            "applied_updates": applied_updates,
        }
