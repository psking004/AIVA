"""AIVA Memory - Structured Long-Term Memory & Biographical Profile.

Combines biographical identity profile (user preferences, system identities, constraints)
with episodic hash-chain ledger logging to preserve persistent, tamper-evident memory
across agentic sessions.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from sse.storage.hardened_ledger import HardenedLedger
from sse.tri_node.ledger import SovereignLedger

logger = logging.getLogger("aiva.memory.profile")


class AivaMemoryManager:
    """Manages biographical user profiles and episodic hash-chain history."""

    def __init__(
        self,
        node_id: str = "PC_A",
        ledger: SovereignLedger | HardenedLedger | None = None,
        profile_path: Path | str | None = None,
    ) -> None:
        self.node_id = node_id
        self.ledger = ledger or HardenedLedger(node_id=self.node_id)
        self.profile_path = Path(profile_path) if profile_path else Path("aiva_user_profile.json")
        self._profile: dict[str, Any] = {
            "user_id": "operator",
            "name": "Operator",
            "timezone": "UTC",
            "communication_preference": "concise",
            "connected_services": ["github", "google"],
            "autonomy_defaults": {
                "level_1_auto_execute": True,
                "level_2_audit_required": True,
                "level_3_quorum_required": True,
            },
            "custom_attributes": {},
        }
        self.load_profile()

    def load_profile(self) -> None:
        """Load biographical profile from disk if exists."""
        if self.profile_path.exists():
            try:
                with open(self.profile_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._profile.update(data)
            except Exception as exc:
                logger.warning("Failed to load profile from %s: %s", self.profile_path, exc)

    def save_profile(self) -> None:
        """Save biographical profile to disk and append record to cryptographic ledger."""
        self.profile_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.profile_path, "w", encoding="utf-8") as f:
            json.dump(self._profile, f, indent=2)

        # Log profile mutation to cryptographic ledger
        now = time.time()
        record_data = {
            "decision_id": f"mem_profile_{int(now * 1000)}",
            "timestamp": now,
            "payload": {
                "type": "BIOGRAPHICAL_PROFILE_UPDATE",
                "profile": self._profile,
            },
        }
        if isinstance(self.ledger, HardenedLedger):
            self.ledger.atomic_append_record(record_data)
        elif isinstance(self.ledger, SovereignLedger):
            self.ledger.append_record(record_data)

    def set_attribute(self, key: str, value: Any) -> None:
        """Update a biographical attribute."""
        self._profile["custom_attributes"][key] = value
        self.save_profile()

    def get_attribute(self, key: str, default: Any = None) -> Any:
        """Retrieve a biographical attribute."""
        return self._profile["custom_attributes"].get(key, default)

    def get_profile(self) -> dict[str, Any]:
        """Return a copy of the entire biographical profile."""
        return dict(self._profile)

    def record_episodic_event(self, event_type: str, details: dict[str, Any]) -> str:
        """Record an episodic memory event directly to the cryptographic hash chain."""
        now = time.time()
        event_id = f"episode_{int(now * 1000)}"
        record_data = {
            "decision_id": event_id,
            "timestamp": now,
            "payload": {
                "type": "EPISODIC_EVENT",
                "event_type": event_type,
                "details": details,
            },
        }
        if isinstance(self.ledger, HardenedLedger):
            self.ledger.atomic_append_record(record_data)
        elif isinstance(self.ledger, SovereignLedger):
            self.ledger.append_record(record_data)

        return event_id
