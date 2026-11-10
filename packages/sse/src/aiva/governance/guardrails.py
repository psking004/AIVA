"""AIVA Governance - Cryptographic Guardrails & 2-of-3 Quorum Gate.

Classifies operations into 3 autonomy tiers:
- Level 1 (Read-Only / Internal): Frictionless immediate execution.
- Level 2 (Drafting / Staging): Local execution with cryptographic ledger audit.
- Level 3 (Irreversible / External): Hard gate requiring 2-of-3 threshold quorum
  authorization (e.g. PC-A + Node M Mobile).
"""

from __future__ import annotations

import enum
import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from sse.security.hardening import ThresholdQuorumPolicy
from sse.storage.hardened_ledger import HardenedLedger
from sse.tri_node.ledger import SovereignLedger
from sse.tri_node.sovereign_core import NodeID

logger = logging.getLogger("aiva.governance.guardrails")


class AutonomyTier(enum.IntEnum):
    """Autonomy classification levels for agentic operations."""

    LEVEL_1_READ_ONLY = 1
    LEVEL_2_STAGING = 2
    LEVEL_3_IRREVERSIBLE = 3


# Explicit mapping of action verbs to autonomy levels
TIER_MAPPINGS: dict[str, AutonomyTier] = {
    # Level 1: Read-Only / Internal
    "read_calendar": AutonomyTier.LEVEL_1_READ_ONLY,
    "scrape_portal": AutonomyTier.LEVEL_1_READ_ONLY,
    "view_dashboard": AutonomyTier.LEVEL_1_READ_ONLY,
    "run_scratchpad": AutonomyTier.LEVEL_1_READ_ONLY,
    "inspect_telemetry": AutonomyTier.LEVEL_1_READ_ONLY,
    "query_memory": AutonomyTier.LEVEL_1_READ_ONLY,
    "search_docs": AutonomyTier.LEVEL_1_READ_ONLY,
    # Level 2: Drafting / Staging
    "write_file": AutonomyTier.LEVEL_2_STAGING,
    "stage_commit": AutonomyTier.LEVEL_2_STAGING,
    "draft_email": AutonomyTier.LEVEL_2_STAGING,
    "format_brief": AutonomyTier.LEVEL_2_STAGING,
    "compile_code": AutonomyTier.LEVEL_2_STAGING,
    "run_sandbox_tests": AutonomyTier.LEVEL_2_STAGING,
    # Level 3: Irreversible / External
    "push_main": AutonomyTier.LEVEL_3_IRREVERSIBLE,
    "send_email": AutonomyTier.LEVEL_3_IRREVERSIBLE,
    "financial_transaction": AutonomyTier.LEVEL_3_IRREVERSIBLE,
    "terminate_process": AutonomyTier.LEVEL_3_IRREVERSIBLE,
    "delete_database": AutonomyTier.LEVEL_3_IRREVERSIBLE,
    "wipe_cache": AutonomyTier.LEVEL_3_IRREVERSIBLE,
    "destructive_terminal": AutonomyTier.LEVEL_3_IRREVERSIBLE,
}


class AivaGuardrailGate:
    """Zero-trust policy gate enforcing 2-of-3 threshold quorum for destructive actions."""

    def __init__(
        self,
        node_id: str = "PC_A",
        quorum_policy: ThresholdQuorumPolicy | None = None,
        ledger: SovereignLedger | HardenedLedger | None = None,
    ) -> None:
        self.node_id = str(node_id)
        self.quorum_policy = quorum_policy or ThresholdQuorumPolicy(min_threshold=2)
        self.ledger = ledger or HardenedLedger(node_id=self.node_id)
        self._pending_challenges: dict[str, dict[str, Any]] = {}

    def classify_action(self, action_name: str) -> AutonomyTier:
        """Classify action name into its corresponding autonomy tier (defaults to Level 3 if unknown)."""
        clean_name = action_name.lower().strip()
        if clean_name in TIER_MAPPINGS:
            return TIER_MAPPINGS[clean_name]

        # Heuristic classification for actions not explicitly mapped
        if any(w in clean_name for w in ("delete", "kill", "drop", "push", "send", "pay", "wipe", "rm", "exec")):
            return AutonomyTier.LEVEL_3_IRREVERSIBLE
        if any(w in clean_name for w in ("write", "stage", "draft", "build", "save", "update")):
            return AutonomyTier.LEVEL_2_STAGING
        return AutonomyTier.LEVEL_1_READ_ONLY

    def create_action_challenge(
        self,
        action_name: str,
        details: dict[str, Any] | str,
        target_role: str = NodeID.MOBILE.value,
    ) -> dict[str, Any]:
        """Freeze execution pipeline and generate an HMAC approval challenge for Level 3 actions."""
        challenge_token = f"chal_{uuid.uuid4().hex[:16]}"
        now = time.time()
        summary = details if isinstance(details, str) else details.get("summary", action_name)

        challenge_data = {
            "challenge_token": challenge_token,
            "action_name": action_name,
            "details": summary,
            "timestamp": now,
            "originator_node": self.node_id,
            "target_node": target_role,
            "status": "AWAITING_APPROVAL",
        }
        self._pending_challenges[challenge_token] = challenge_data

        logger.warning(
            "Level 3 Irreversible Action '%s' triggered. Execution frozen. Challenge [%s] created for %s.",
            action_name,
            challenge_token,
            target_role,
        )
        return challenge_data

    def sign_challenge(self, node_id: str, action_name: str, timestamp: float) -> str:
        """Sign an action challenge using a specific node's cryptographic key."""
        return self.quorum_policy.sign_action(node_id=node_id, action_payload=action_name, timestamp=timestamp)

    def evaluate_and_execute(
        self,
        action_name: str,
        payload: dict[str, Any],
        execute_fn: Callable[[], Any],
        signatures: dict[str, str] | None = None,
        challenge_token: str | None = None,
        timestamp: float | None = None,
        nonce: str | None = None,
    ) -> dict[str, Any]:
        """Evaluate action tier, gate Level 3 behind 2-of-3 quorum, and log execution audit."""
        tier = self.classify_action(action_name)
        now = timestamp if timestamp is not None else time.time()

        # Level 1: Read-Only / Internal -> Execute immediately
        if tier == AutonomyTier.LEVEL_1_READ_ONLY:
            result = execute_fn()
            return {
                "status": "EXECUTED",
                "tier": int(tier),
                "action": action_name,
                "quorum_required": False,
                "result": result,
            }

        # Level 2: Staging / Drafting -> Execute with local ledger audit
        if tier == AutonomyTier.LEVEL_2_STAGING:
            result = execute_fn()
            self._log_audit_record(
                action_name=action_name,
                tier=int(tier),
                status="EXECUTED",
                payload=payload,
            )
            return {
                "status": "EXECUTED",
                "tier": int(tier),
                "action": action_name,
                "quorum_required": False,
                "audited": True,
                "result": result,
            }

        # Level 3: Irreversible / External -> Quorum Gate
        if not signatures or len(signatures) < self.quorum_policy.min_threshold:
            # Create or return existing approval challenge
            chal = self.create_action_challenge(action_name, payload)
            self._log_audit_record(
                action_name=action_name,
                tier=int(tier),
                status="FROZEN_AWAITING_QUORUM",
                payload={"challenge": chal["challenge_token"]},
            )
            return {
                "status": "HALTED_AWAITING_QUORUM",
                "tier": int(tier),
                "action": action_name,
                "quorum_required": True,
                "challenge": chal["challenge_token"],
                "signatures_provided": len(signatures) if signatures else 0,
                "signatures_required": self.quorum_policy.min_threshold,
            }

        # Verify 2-of-3 Quorum
        valid_quorum, reason = self.quorum_policy.verify_quorum(
            action_payload=action_name,
            timestamp=now,
            signatures=signatures,
            nonce=nonce,
        )

        if not valid_quorum:
            self._log_audit_record(
                action_name=action_name,
                tier=int(tier),
                status="QUORUM_REJECTED",
                payload={"reason": reason, "signatures": list(signatures.keys())},
            )
            return {
                "status": "REJECTED_QUORUM_FAILED",
                "tier": int(tier),
                "action": action_name,
                "reason": reason,
                "signatures_provided": list(signatures.keys()),
            }

        # Quorum verified: proceed with execution
        result = execute_fn()
        self._log_audit_record(
            action_name=action_name,
            tier=int(tier),
            status="EXECUTED_QUORUM_APPROVED",
            payload={"approved_by": list(signatures.keys()), "result": str(result)[:200]},
        )

        return {
            "status": "EXECUTED",
            "tier": int(tier),
            "action": action_name,
            "quorum_required": True,
            "quorum_verified": True,
            "approved_by": list(signatures.keys()),
            "result": result,
        }

    def _log_audit_record(
        self,
        action_name: str,
        tier: int,
        status: str,
        payload: dict[str, Any],
    ) -> None:
        """Write governance audit record to ledger."""
        now = time.time()
        record_data = {
            "decision_id": f"gov_{int(now * 1000)}",
            "timestamp": now,
            "payload": {
                "type": "GOVERNANCE_ACTION_AUDIT",
                "action_name": action_name,
                "tier": tier,
                "status": status,
                "meta": payload,
            },
        }
        if isinstance(self.ledger, HardenedLedger):
            self.ledger.atomic_append_record(record_data)
        elif isinstance(self.ledger, SovereignLedger):
            self.ledger.append_record(record_data)
