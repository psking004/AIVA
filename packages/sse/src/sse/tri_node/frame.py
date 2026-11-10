"""Strategic Systems Engine - Cryptographic Tri-Node Frame Protocol.

Defines signed cryptographic communication frames exchanged between PC-A, PC-B, and Mobile.
Guarantees message authenticity, anti-replay protection, and deterministic canonicalization.
Zero external dependencies (pure standard library).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET


@dataclass(slots=True)
class TriNodeFrame:
    """Cryptographic wire frame for peer-to-peer mesh dispatch and synchronization."""

    action: str
    payload: dict[str, Any] = field(default_factory=dict)
    sender_node_id: str = "PC_A"
    target_node_id: str = "*"
    timestamp: float = field(default_factory=time.time)
    nonce: str = field(default_factory=lambda: uuid.uuid4().hex)
    signature: str = ""

    def canonical_bytes(self) -> bytes:
        """Serialize frame fields into deterministic canonical byte string for signing."""
        canonical_payload = json.dumps(self.payload, sort_keys=True, separators=(",", ":"))
        raw = f"{self.sender_node_id}:{self.action}:{self.timestamp:.3f}:{self.nonce}:{canonical_payload}"
        return raw.encode("utf-8")

    def compute_signature(self, secret: str = CLUSTER_SHARED_SECRET) -> str:
        """Compute HMAC-SHA256 signature over the canonical frame bytes."""
        return hmac.new(
            secret.encode("utf-8"),
            self.canonical_bytes(),
            hashlib.sha256,
        ).hexdigest()

    def sign(self, secret: str = CLUSTER_SHARED_SECRET) -> str:
        """Sign this frame in-place using cluster shared secret and return signature."""
        self.signature = self.compute_signature(secret)
        return self.signature

    def verify_signature(self, secret: str = CLUSTER_SHARED_SECRET) -> bool:
        """Verify HMAC-SHA256 frame signature using constant-time evaluation."""
        if not self.signature:
            return False
        expected = self.compute_signature(secret)
        return hmac.compare_digest(expected, self.signature)

    def to_dict(self) -> dict[str, Any]:
        """Convert frame into wire-safe dictionary."""
        return {
            "action": self.action,
            "payload": self.payload,
            "sender_node_id": self.sender_node_id,
            "target_node_id": self.target_node_id,
            "timestamp": round(self.timestamp, 3),
            "nonce": self.nonce,
            "signature": self.signature,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TriNodeFrame:
        """Instantiate a TriNodeFrame from wire dictionary."""
        return cls(
            action=str(data.get("action", "")),
            payload=dict(data.get("payload", {})),
            sender_node_id=str(data.get("sender_node_id", "UNKNOWN")),
            target_node_id=str(data.get("target_node_id", "*")),
            timestamp=float(data.get("timestamp", time.time())),
            nonce=str(data.get("nonce", "")),
            signature=str(data.get("signature", "")),
        )
