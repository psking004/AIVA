"""Strategic Systems Engine - Sovereign Tri-Node Mesh Package.

Autonomous, symmetric, zero-external-dependency distributed coordination
across Node A (workstation GPU), Node B (remote node), and Node M (mobile).
"""

from sse.tri_node.arena_dispatcher import ArenaDispatcher, ArenaTournamentDispatcher
from sse.tri_node.client import TriNodeMeshClient
from sse.tri_node.firewall import MeshFirewallConfig, MeshPayloadFirewall, PeerRateLimiter
from sse.tri_node.frame import TriNodeFrame
from sse.tri_node.ledger import GENESIS_HASH, SovereignLedger, compute_record_hash
from sse.tri_node.mesh_handlers import MeshActionDispatcher
from sse.tri_node.router import DEFAULT_NODE_PORTS, P2PRouter
from sse.tri_node.sovereign_core import (
    CLUSTER_SHARED_SECRET,
    NodeID,
    OperationalMode,
    SovereignDecisionCore,
    SovereignDecisionVerdict,
    generate_sovereign_grant,
    verify_sovereign_grant,
)

__all__ = [
    "CLUSTER_SHARED_SECRET",
    "DEFAULT_NODE_PORTS",
    "GENESIS_HASH",
    "ArenaDispatcher",
    "ArenaTournamentDispatcher",
    "MeshActionDispatcher",
    "MeshFirewallConfig",
    "MeshPayloadFirewall",
    "NodeID",
    "OperationalMode",
    "P2PRouter",
    "PeerRateLimiter",
    "SovereignDecisionCore",
    "SovereignDecisionVerdict",
    "SovereignLedger",
    "TriNodeFrame",
    "TriNodeMeshClient",
    "compute_record_hash",
    "generate_sovereign_grant",
    "verify_sovereign_grant",
]
