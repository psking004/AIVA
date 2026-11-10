"""AIVA Governance - Mobile Quorum Signer Daemon (Node M).

Operates as the Root-of-Trust authorizer service on mobile nodes (Termux/iOS):
- Listens for Level 3 cryptographic challenges from Orchestrator (Node A).
- Evaluates challenges via dual-mode signing:
  1. Headless Automated Policy Mode: Matches against whitelisted action patterns,
     pre-approved policy rules, and CI/CD envelopes.
  2. Interactive / Local Callback Mode: Prompts on-device confirmation hook.
- Computes canonical HMAC-SHA256 signatures:
    sig = HMAC(K_mobile, f"{action}:{target}:{timestamp:.3f}")
- Posts signed approval payload back to unfreeze execution pipeline.
"""

from __future__ import annotations

import fnmatch
import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sse.config.cluster import ClusterNetworkConfig
from sse.tri_node.sovereign_core import NodeID

logger = logging.getLogger("aiva.governance.mobile_signer")

DEFAULT_WHITELISTED_ACTIONS: set[str] = {
    "git_push_production",
    "push_main",
    "deploy_staging",
    "ci_cd_trigger",
    "arena_tournament",
    "execute_governed_action",
    "ACTION:PUSH_PRODUCTION_RELEASE",
}


@dataclass
class SignerPolicyRule:
    """Pre-signed cryptographic policy rule for autonomous challenge approval."""

    name: str
    action_pattern: str
    target_pattern: str = "*"
    enabled: bool = True
    custom_validator: Callable[[str, str, dict[str, Any]], bool] | None = None


class MobileQuorumSignerDaemon:
    """Mobile Root-of-Trust challenge signing daemon."""

    def __init__(
        self,
        node_id: str = NodeID.MOBILE.value,
        cluster_secret: str | None = None,
        auto_policy_mode: bool = True,
        whitelisted_actions: set[str] | None = None,
        callback_handler: Callable[[str, str, dict[str, Any]], bool] | None = None,
    ) -> None:
        self.node_id = str(node_id)
        self.cluster_config = ClusterNetworkConfig()
        self.secret = cluster_secret or self.cluster_config.cluster_secret
        self.mobile_key = self.cluster_config.derive_node_key(self.node_id)
        self.auto_policy_mode = auto_policy_mode
        self.whitelisted_actions = set(whitelisted_actions) if whitelisted_actions else set(DEFAULT_WHITELISTED_ACTIONS)
        self.callback_handler = callback_handler
        self._policy_rules: list[SignerPolicyRule] = []
        self._approval_history: list[dict[str, Any]] = []

    def register_policy_rule(self, rule: SignerPolicyRule) -> None:
        """Register a pre-compiled policy rule for autonomous approval."""
        self._policy_rules.append(rule)

    def evaluate_challenge_authorization(
        self,
        action: str,
        target: str,
        meta: dict[str, Any] | None = None,
    ) -> tuple[bool, str]:
        """Determine whether a Level 3 action challenge qualifies for signature."""
        metadata = meta or {}
        clean_action = str(action).strip()

        # 1. Check direct action whitelist
        whitelisted_lower = {a.lower().strip() for a in self.whitelisted_actions}
        if clean_action.lower() in whitelisted_lower or clean_action in self.whitelisted_actions:
            return True, f"ACTION_WHITELIST_MATCH: {clean_action}"

        # 2. Check registered policy rules
        for rule in self._policy_rules:
            if not rule.enabled:
                continue
            action_match = (rule.action_pattern == "*") or fnmatch.fnmatch(clean_action.lower(), rule.action_pattern.lower())
            target_match = (rule.target_pattern == "*") or fnmatch.fnmatch(target.lower(), rule.target_pattern.lower())

            if action_match and target_match:
                if rule.custom_validator:
                    if rule.custom_validator(clean_action, target, metadata):
                        return True, f"POLICY_RULE_MATCH: {rule.name}"
                else:
                    return True, f"POLICY_RULE_MATCH: {rule.name}"

        # 3. Check interactive / local callback handler
        if self.callback_handler is not None:
            approved = self.callback_handler(clean_action, target, metadata)
            if approved:
                return True, "LOCAL_CALLBACK_AUTHORIZED"
            return False, "LOCAL_CALLBACK_REJECTED"

        return False, f"POLICY_REJECTED: action '{clean_action}' not authorized on Node M"

    def sign_challenge(
        self,
        action: str,
        target: str,
        timestamp: float | None = None,
    ) -> str:
        """Compute the canonical HMAC-SHA256 signature for an approved challenge."""
        ts = float(timestamp) if timestamp is not None else time.time()
        canonical = f"{action}:{target}:{ts:.3f}".encode()
        return hmac.new(self.mobile_key.encode(), canonical, hashlib.sha256).hexdigest()

    def process_challenge(
        self,
        challenge_payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Ingest, evaluate, and sign an incoming Level 3 challenge frame.

        Payload schema:
            {
                "action": str,
                "target": str,
                "challenge": str,
                "timestamp": float,
                "meta": dict (optional)
            }
        """
        action = str(challenge_payload.get("action", ""))
        target = str(challenge_payload.get("target", "*"))
        challenge = str(challenge_payload.get("challenge", ""))
        ts = float(challenge_payload.get("timestamp", time.time()))
        meta = challenge_payload.get("meta", {})

        is_authorized, reason = self.evaluate_challenge_authorization(action, target, meta)

        now = time.time()
        if is_authorized:
            signature = self.sign_challenge(action, target, ts)
            resp = {
                "status": "APPROVED",
                "signer_node": self.node_id,
                "action": action,
                "target": target,
                "signature": signature,
                "timestamp": ts,
                "challenge": challenge,
                "reason": reason,
                "processed_at": now,
            }
        else:
            resp = {
                "status": "REJECTED",
                "signer_node": self.node_id,
                "action": action,
                "target": target,
                "signature": "",
                "timestamp": ts,
                "challenge": challenge,
                "reason": reason,
                "processed_at": now,
            }

        self._approval_history.append(resp)
        return resp

    def post_approval(
        self,
        target_url: str,
        approval_payload: dict[str, Any],
        timeout_sec: float = 2.0,
    ) -> dict[str, Any]:
        """Transmit signed approval frame back to orchestrator (Node A) over HTTP."""
        data = json.dumps(approval_payload, separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(
            f"{target_url.rstrip('/')}/mesh/quorum/approve",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {"status": "DELIVERED"}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning("Failed to post approval to %s: %s", target_url, exc)
            return {"status": "DELIVERY_FAILED", "error": str(exc)}
