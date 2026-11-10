"""Strategic Systems Engine - World Model Constraints.

Evaluates hard and soft operational, regulatory, and resource constraints against
candidate actions and world state snapshots.
"""

from __future__ import annotations

import copy
import threading
from typing import Any

from sse.contracts.action import ActionDefinition
from sse.contracts.world_state import ConstraintDefinition, ConstraintType, WorldStateSnapshot


class ConstraintManager:
    """Evaluates and enforces strategic constraints."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._constraints: dict[str, ConstraintDefinition] = {}

    def register_constraint(self, constraint: ConstraintDefinition) -> ConstraintDefinition:
        with self._lock:
            self._constraints[constraint.constraint_id] = copy.deepcopy(constraint)
            return self._constraints[constraint.constraint_id]

    def remove_constraint(self, constraint_id: str) -> bool:
        with self._lock:
            return self._constraints.pop(constraint_id, None) is not None

    def list_constraints(self) -> list[ConstraintDefinition]:
        with self._lock:
            return [copy.deepcopy(c) for c in self._constraints.values()]

    def evaluate_action(
        self,
        action: ActionDefinition,
        snapshot: WorldStateSnapshot,
    ) -> dict[str, Any]:
        """Evaluates all registered constraints against a candidate action.

        Returns a dictionary containing:
        - valid: bool (False if any HARD constraint violated)
        - hard_violations: List[str]
        - soft_violations: List[str]
        - total_penalty: float
        """
        with self._lock:
            hard_violations: list[str] = []
            soft_violations: list[str] = []
            total_penalty: float = 0.0

            # Evaluate resource limits
            for res_id, res in snapshot.resources.items():
                if action.target_entity == res_id and action.estimated_cost > res.available_capacity:
                    hard_violations.append(
                        f"Resource '{res.name}' capacity exceeded: required {action.estimated_cost}, available {res.available_capacity}"
                    )

            # Evaluate custom constraints
            for c in self._constraints.values():
                # Check for simple parameter rule constraints
                # e.g., expression = "cost <= max_budget"
                if "cost" in c.expression and action.estimated_cost > 10000.0:  # example threshold rule
                    if c.constraint_type == ConstraintType.HARD:
                        hard_violations.append(f"Hard constraint '{c.name}' violated by action cost {action.estimated_cost}")
                    else:
                        soft_violations.append(f"Soft constraint '{c.name}' violated")
                        total_penalty += c.penalty_weight

                # Check action reversibility requirement if regulatory constraint
                if "require_reversible" in c.expression and action.reversibility.value == "irreversible":
                    if c.constraint_type == ConstraintType.HARD:
                        hard_violations.append(f"Irreversible action '{action.name}' violates hard safety constraint '{c.name}'")
                    else:
                        soft_violations.append(f"Irreversible action incurs penalty for '{c.name}'")
                        total_penalty += c.penalty_weight

            return {
                "valid": len(hard_violations) == 0,
                "hard_violations": hard_violations,
                "soft_violations": soft_violations,
                "total_penalty": total_penalty,
            }

    def snapshot(self) -> list[ConstraintDefinition]:
        with self._lock:
            return [copy.deepcopy(c) for c in self._constraints.values()]
