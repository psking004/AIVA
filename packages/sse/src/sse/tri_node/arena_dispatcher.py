"""Strategic Systems Engine - Tri-Node Swarm Arena Dispatcher.

Coordinates remote stress tournaments across the P2P mesh:
- Packages candidate source deliverables into signed cryptographic frames.
- Dispatches to compute worker (Node B / PC-B) over port 8202.
- Handles automated fallback to local execution on network partition.
- Formats tournament outcome into token-budgeted payloads (< 350 chars).
"""

from __future__ import annotations

import contextlib
import json
import logging
import urllib.error
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sse.config.cluster import ClusterNetworkConfig

from sse.tri_node.client import TriNodeMeshClient
from sse.tri_node.router import NodeRole
from sse.tri_node.sovereign_core import NodeID

logger = logging.getLogger("sse.tri_node.arena_dispatcher")


class ArenaDispatcher:
    """Dispatches adversarial stress tournaments across cluster nodes."""

    def __init__(
        self,
        node_role: NodeRole = NodeRole.NODE_A,
        mesh_client: TriNodeMeshClient | None = None,
        cluster_config: ClusterNetworkConfig | None = None,
    ) -> None:
        self.node_role = node_role
        if cluster_config is None:
            from sse.config.cluster import ClusterNetworkConfig

            self.cluster_config = ClusterNetworkConfig()
        else:
            self.cluster_config = cluster_config

        self.mesh_client = mesh_client or TriNodeMeshClient(
            current_role=self.node_role,
            shared_secret=self.cluster_config.cluster_secret,
        )

    def dispatch_tournament(
        self,
        project_name: str,
        files: dict[str, str],
        target_node: NodeRole = NodeRole.NODE_B,
        rounds: int = 4,
        timeout_sec: float = 30.0,
    ) -> dict[str, Any]:
        """Dispatch candidate deliverable for 4-vector stress testing on target node."""
        target_url = self.cluster_config.get_node_url(target_node)
        target_str = target_node.value if hasattr(target_node, "value") else str(target_node)

        logger.info(
            "Dispatching arena tournament '%s' to %s (%s)...",
            project_name,
            target_str,
            target_url,
        )

        res = self.mesh_client.dispatch_arena_tournament(
            target_role=target_str,
            target_url=target_url,
            project_name=project_name,
            files=files,
            rounds=rounds,
            timeout_sec=timeout_sec,
        )

        # Budgeted compact payload formatting (< 350 chars)
        res["compact_payload"] = (
            f"ARENA_DISPATCH|candidate={res.get('candidate_id')}|passed={res.get('passed_gate')}|"
            f"elo={res.get('final_elo')}|surv={res.get('survival_rate'):.1%}|"
            f"dispatched_to={res.get('dispatched_to')}|fallback={res.get('fallback_local')}"
        )

        return res


class ArenaTournamentDispatcher:
    """Dispatches adversarial tournament workloads across the Sovereign Tri-Node Mesh."""

    def __init__(
        self,
        node_id: str | NodeID = NodeID.PC_A,
        peer_url: str = "http://127.0.0.1:8202",
        local_arena: Any | None = None,
    ) -> None:
        self.node_id = str(node_id.value if isinstance(node_id, NodeID) else node_id)
        self.peer_url = peer_url.rstrip("/")
        if local_arena is None:
            from sse.swarm.arena import SwarmArena

            self.local_arena = SwarmArena()
        else:
            self.local_arena = local_arena

    def dispatch_tournament(
        self,
        workspace_dir: Path | str,
        candidate_id: str = "candidate_01",
        rounds: int = 20,
        timeout: float = 15.0,
    ) -> Any:
        """Attempt to offload tournament execution to peer node; fallback to local on failure."""
        from sse.swarm.arena import TournamentSummary

        work_path = Path(workspace_dir).resolve()

        # 1. Package workspace files for offload
        files: dict[str, str] = {}
        if work_path.exists():
            for p in work_path.rglob("*"):
                if p.is_file():
                    rel = str(p.relative_to(work_path)).replace("\\", "/")
                    with contextlib.suppress(Exception):
                        files[rel] = p.read_text(encoding="utf-8")

        # 2. Attempt remote dispatch
        if self.peer_url:
            url = f"{self.peer_url}/mesh/arena"
            req_data = {
                "candidate_id": candidate_id,
                "rounds": rounds,
                "files": files,
                "sender_node_id": self.node_id,
            }
            body = json.dumps(req_data, separators=(",", ":")).encode()
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    if resp.status == 200:
                        res_json = json.loads(resp.read().decode("utf-8"))
                        return TournamentSummary(
                            candidate_id=res_json["candidate_id"],
                            rounds_played=res_json["rounds"],
                            wins=res_json["wins"],
                            losses=res_json["losses"],
                            draws=res_json["draws"],
                            survival_rate=res_json["survival_rate"],
                            initial_elo=res_json["initial_elo"],
                            final_elo=res_json["final_elo"],
                            elo_delta=res_json["elo_delta"],
                            passed_gate=res_json["passed_gate"],
                            worst_case_regret=res_json["worst_case_regret"],
                        )
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "Arena peer %s unreachable (%s). Initiating instant local fallback on %s.",
                    self.peer_url,
                    exc,
                    self.node_id,
                )

        # 3. Local Sovereign Execution Fallback (Zero socket hanging, 100% resilient)
        return self.local_arena.run_tournament(
            workspace_dir=work_path,
            candidate_id=candidate_id,
            rounds=rounds,
        )

