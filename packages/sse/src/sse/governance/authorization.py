"""Strategic Systems Engine - Authorization Gate.

Enforces bounded autonomy through an independent authorization checkpoint,
executing the 8 mandatory policy gates before issuing execution grant tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sse.contracts.action import ActionDefinition
from sse.contracts.authorization import (
    AuthorizationGrant,
    AuthorizationRequest,
    AutonomyLevel,
    RevocationReason,
)
from sse.contracts.decision import VerificationStatus
from sse.contracts.world_state import WorldStateSnapshot
from sse.governance.policies import PolicyEngine
from sse.world_model.state_manager import WorldStateManager


class AuthorizationGate:
    """Independent authorization service enforcing bounded autonomy and execution controls."""

    def __init__(
        self,
        policy_engine: PolicyEngine | None = None,
        state_manager: WorldStateManager | None = None,
        signing_secret: str | None = None,
    ) -> None:
        self._lock = threading.RLock()
        self.policy_engine = policy_engine or PolicyEngine()
        self.state_manager = state_manager or WorldStateManager()
        self._secret = (signing_secret or secrets.token_hex(32)).encode("utf-8")
        self._emergency_stop_engaged: bool = False
        self._emergency_reason: str | None = None
        self._grants: dict[str, AuthorizationGrant] = {}

    @property
    def is_emergency_stopped(self) -> bool:
        return self._emergency_stop_engaged

    def trigger_emergency_stop(self, reason: str = "Operator manual emergency stop") -> int:
        """Immediately engages global emergency stop and revokes all active grants."""
        with self._lock:
            self._emergency_stop_engaged = True
            self._emergency_reason = reason
            revoked_count = 0
            for grant in self._grants.values():
                if not grant.is_revoked:
                    grant.is_revoked = True
                    grant.revocation_reason = RevocationReason.EMERGENCY_STOP
                    revoked_count += 1
            return revoked_count

    def reset_emergency_stop(self, confirmation_token: str) -> bool:
        """Resets emergency stop status."""
        with self._lock:
            if confirmation_token == "CONFIRM_RESET":
                self._emergency_stop_engaged = False
                self._emergency_reason = None
                return True
            return False

    def evaluate_authorization(
        self,
        request: AuthorizationRequest,
        action: ActionDefinition,
        verification: VerificationStatus,
        baseline_snapshot: WorldStateSnapshot,
    ) -> dict[str, Any]:
        """Evaluates the 8 mandatory governance gates.

        Returns approval status, grant token if approved, and rejection reasons.
        """
        with self._lock:
            checks_passed: list[str] = []
            rejection_reasons: list[str] = []

            # Check 1: Emergency Stop Check
            if self._emergency_stop_engaged:
                rejection_reasons.append(f"Global emergency stop is active: {self._emergency_reason}")
            else:
                checks_passed.append("EMERGENCY_STOP_CLEAR")

            # Check 2: Identity & Requester Check
            if not request.requester_id:
                rejection_reasons.append("Requester identity is empty or unauthenticated")
            else:
                checks_passed.append("AUTHENTICATED_REQUESTER")

            # Check 3: Formal Verification Check
            if not verification.is_valid:
                rejection_reasons.append(
                    f"Action failed prior verification: {verification.constraint_violations}"
                )
            else:
                checks_passed.append("VERIFICATION_VALID")

            # Check 4: State Drift Check
            curr_snap = self.state_manager.capture_snapshot()
            drift_res = self.state_manager.detect_drift(baseline_snapshot, curr_snap)
            if drift_res["drift_detected"]:
                rejection_reasons.append(f"World state drifted since decision formulation: {drift_res['drift_items']}")
            else:
                checks_passed.append("STATE_STABILITY_CONFIRMED")

            # Check 5: Autonomy Level & Permission Scope Match
            if request.requested_autonomy == AutonomyLevel.READ_ONLY:
                rejection_reasons.append("READ_ONLY autonomy cannot authorize action execution")
            elif request.requested_autonomy == AutonomyLevel.ADVISORY:
                rejection_reasons.append("ADVISORY autonomy requires human authorization to execute")
            else:
                checks_passed.append("AUTONOMY_LEVEL_SUFFICIENT")

            # Check 6: Safety Policies Compliance
            policy_res = self.policy_engine.evaluate(action, request.requested_autonomy)
            if not policy_res.is_allowed:
                rejection_reasons.extend(policy_res.violations)
            else:
                checks_passed.append("SAFETY_POLICIES_PASSED")

            # Check 7: Resource Budget Check
            for res_id, res in curr_snap.resources.items():
                if action.target_entity == res_id and action.estimated_cost > res.available_capacity:
                    rejection_reasons.append(
                        f"Insufficient resource '{res.name}' capacity: required {action.estimated_cost}, available {res.available_capacity}"
                    )
            if not any("Insufficient resource" in r for r in rejection_reasons):
                checks_passed.append("RESOURCE_BUDGET_AVAILABLE")

            # Check 8: Reversibility Check under autonomy level
            if request.requested_autonomy == AutonomyLevel.BOUNDED_AUTONOMOUS and action.reversibility.value != "reversible":
                rejection_reasons.append(
                    f"Action reversibility is '{action.reversibility.value}'; bounded autonomy allows only fully reversible actions"
                )
            else:
                checks_passed.append("REVERSIBILITY_COMPLIANT")

            is_approved = len(rejection_reasons) == 0

            grant: AuthorizationGrant | None = None
            if is_approved:
                # Issue cryptographically signed token
                now = datetime.now(UTC)
                valid_until = now + timedelta(seconds=request.timeout_seconds)
                token_payload = f"{request.decision_id}:{action.action_id}:{valid_until.isoformat()}"
                signature = hmac.new(self._secret, token_payload.encode("utf-8"), hashlib.sha256).hexdigest()
                grant_token = f"grant_{signature[:24]}"

                grant = AuthorizationGrant(
                    grant_id=str(uuid.uuid4()),
                    decision_id=request.decision_id,
                    action_id=action.action_id,
                    authorized_by=f"AuthorizationGate_{request.requester_id}",
                    autonomy_level=request.requested_autonomy,
                    granted_scope=request.requested_scope,
                    grant_token=grant_token,
                    issued_at=now,
                    valid_until=valid_until,
                    baseline_state_checksum=baseline_snapshot.calculate_checksum(),
                    restrictions=[],
                )
                self._grants[grant.grant_token] = grant

            return {
                "approved": is_approved,
                "grant": grant,
                "grant_token": grant.grant_token if grant else None,
                "checks_passed": checks_passed,
                "rejection_reasons": rejection_reasons,
            }

    def validate_grant(self, grant_token: str) -> dict[str, Any]:
        """Validates that a grant token is authentic, unrevoked, and unexpired."""
        with self._lock:
            if self._emergency_stop_engaged:
                return {"valid": False, "reason": "Emergency stop active"}

            grant = self._grants.get(grant_token)
            if not grant:
                return {"valid": False, "reason": "Grant token not found"}

            if grant.is_revoked:
                return {"valid": False, "reason": f"Grant revoked: {grant.revocation_reason}"}

            now = datetime.now(UTC)
            if now > grant.valid_until:
                grant.is_revoked = True
                grant.revocation_reason = RevocationReason.EXPIRED
                return {"valid": False, "reason": "Grant has expired"}

            return {"valid": True, "grant": grant}
