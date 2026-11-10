"""Strategic Systems Engine - Decision Verifier.

Performs mathematical invariant verification, constraint satisfiability checks,
and state drift revalidation before decisions are passed to governance.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from sse.contracts.action import ActionDefinition
from sse.contracts.decision import VerificationStatus
from sse.contracts.world_state import WorldStateSnapshot
from sse.world_model.constraints import ConstraintManager
from sse.world_model.state_manager import WorldStateManager


class DecisionVerifier:
    """Performs rigorous formal and empirical verification of strategic decisions."""

    def __init__(
        self,
        constraint_manager: ConstraintManager | None = None,
        state_manager: WorldStateManager | None = None,
    ) -> None:
        self.constraint_manager = constraint_manager or ConstraintManager()
        self.state_manager = state_manager or WorldStateManager()

    def verify_action_decision(
        self,
        action: ActionDefinition,
        baseline_snapshot: WorldStateSnapshot,
        current_snapshot: WorldStateSnapshot | None = None,
        expected_payoff: float = 0.0,
        risk_score: float = 0.0,
    ) -> VerificationStatus:
        """Verifies mathematical validity, constraint satisfiability, and drift."""
        invariants_passed: list[str] = []
        violations: list[str] = []

        # 1. Mathematical Invariant Checks
        if 0.0 <= risk_score <= 1.0:
            invariants_passed.append("Risk score in valid probability range [0, 1]")
        else:
            violations.append(f"Invalid risk score {risk_score}")

        if math.isfinite(expected_payoff):
            invariants_passed.append("Expected payoff is real finite number")
        else:
            violations.append("Expected payoff is NaN or infinite")

        # 2. Constraint Satisfiability Checks
        curr_snap = current_snapshot or self.state_manager.capture_snapshot()
        eval_res = self.constraint_manager.evaluate_action(action, curr_snap)

        if eval_res["valid"]:
            invariants_passed.append("All hard constraints satisfied")
        else:
            violations.extend(eval_res["hard_violations"])

        # 3. State Drift Detection
        drift_res = self.state_manager.detect_drift(baseline_snapshot, curr_snap)
        drift_detected = drift_res["drift_detected"]
        if drift_detected:
            violations.append(f"State drift detected between decision baseline and verification: {drift_res['drift_items']}")

        is_valid = (len(violations) == 0) and not drift_detected

        return VerificationStatus(
            is_valid=is_valid,
            verified_by="SSE_DecisionVerifier_v1",
            verified_at=datetime.now(UTC),
            invariants_passed=invariants_passed,
            constraint_violations=violations,
            state_drift_detected=drift_detected,
            notes="Formal verification passed" if is_valid else "Verification failed",
        )
