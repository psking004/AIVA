"""Strategic Systems Engine - Cluster Network Configuration.

Manages IP/port bindings, timeouts, and shared cryptographic keys
for the Sovereign Tri-Node Mesh:
- Node A (PC-A: Primary Orchestrator, RTX 3050 Laptop GPU, Port 8201)
- Node B (PC-B: Compute & Headless Browser Worker, Intel Core i5-1335U, Port 8202)
- Node M (Mobile: Root-of-Trust Authorizer, Android/iOS, Port 8203)
"""

from __future__ import annotations

import hashlib
import hmac
import os
import urllib.parse
from dataclasses import dataclass, field
from typing import Any

from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET, NodeID, NodeRole

DEFAULT_NODE_A_URL = "http://127.0.0.1:8201"
DEFAULT_NODE_B_URL = "http://127.0.0.1:8202"
DEFAULT_NODE_M_URL = "http://127.0.0.1:8203"
DEFAULT_NETWORK_TIMEOUT_SEC = 1.5


@dataclass
class ClusterNetworkConfig:
    """Manages multi-node network bindings, cryptographic secrets, and aggressive failover timeouts."""

    node_a_url: str = field(
        default_factory=lambda: os.getenv("SSE_NODE_A_URL", DEFAULT_NODE_A_URL)
    )
    node_b_url: str = field(
        default_factory=lambda: os.getenv("SSE_NODE_B_URL", DEFAULT_NODE_B_URL)
    )
    node_m_url: str = field(
        default_factory=lambda: os.getenv("SSE_NODE_M_URL", DEFAULT_NODE_M_URL)
    )
    timeout_sec: float = field(
        default_factory=lambda: float(os.getenv("SSE_NETWORK_TIMEOUT_SEC", str(DEFAULT_NETWORK_TIMEOUT_SEC)))
    )
    cluster_secret: str = field(
        default_factory=lambda: os.getenv("SSE_CLUSTER_SECRET", CLUSTER_SHARED_SECRET)
    )

    def __post_init__(self) -> None:
        # Normalize trailing slashes
        self.node_a_url = self.node_a_url.rstrip("/")
        self.node_b_url = self.node_b_url.rstrip("/")
        self.node_m_url = self.node_m_url.rstrip("/")

        if len(self.cluster_secret) < 16:
            raise ValueError("Cluster secret must be at least 16 characters for HMAC-SHA256 integrity.")

    def get_node_url(self, node_id: str | NodeID | NodeRole) -> str:
        """Resolve node URL by NodeID or NodeRole enum or string name."""
        nid = node_id.value if hasattr(node_id, "value") else str(node_id).upper()
        if nid in (NodeID.PC_A.value, "PC_A", "PC-A", "NODE_A"):
            return self.node_a_url
        if nid in (NodeID.PC_B.value, "PC_B", "PC-B", "NODE_B"):
            return self.node_b_url
        if nid in (NodeID.MOBILE.value, "MOBILE", "NODE_M"):
            return self.node_m_url
        raise KeyError(f"Unknown node identifier: '{node_id}'")

    def get_node_port(self, node_id: str | NodeID | NodeRole) -> int:
        """Extract listening port number from node URL."""
        url = self.get_node_url(node_id)
        parsed = urllib.parse.urlparse(url)
        if parsed.port:
            return parsed.port
        return 443 if parsed.scheme == "https" else 80

    def derive_node_key(self, node_id: str | NodeID | NodeRole) -> str:
        """Derive distinct per-node HMAC key from the master cluster secret."""
        nid = node_id.value if hasattr(node_id, "value") else str(node_id).upper()
        if nid in ("NODE_A", "PC_A", "PC-A"):
            nid = NodeID.PC_A.value
        elif nid in ("NODE_B", "PC_B", "PC-B"):
            nid = NodeID.PC_B.value
        elif nid in ("NODE_M", "MOBILE"):
            nid = NodeID.MOBILE.value

        return hmac.new(
            self.cluster_secret.encode("utf-8"),
            f"sse-node-key:{nid}".encode(),
            hashlib.sha256,
        ).hexdigest()

    def get_all_node_keys(self) -> dict[str, str]:
        """Return mapping of node_id -> derived HMAC key for all cluster nodes."""
        return {
            NodeID.PC_A.value: self.derive_node_key(NodeID.PC_A),
            NodeID.PC_B.value: self.derive_node_key(NodeID.PC_B),
            NodeID.MOBILE.value: self.derive_node_key(NodeID.MOBILE),
        }

    def to_dict(self) -> dict[str, Any]:
        """Serialize configuration without exposing cluster secret in plaintext."""
        return {
            "node_a_url": self.node_a_url,
            "node_b_url": self.node_b_url,
            "node_m_url": self.node_m_url,
            "timeout_sec": self.timeout_sec,
            "cluster_secret_hash": hashlib.sha256(self.cluster_secret.encode("utf-8")).hexdigest()[:16],
        }

