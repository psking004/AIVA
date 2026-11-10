"""Strategic Systems Engine - Tri-Node Mesh Client.

High-level cryptographic client for peer inspection, remote sandboxed execution,
and ledger synchronization across the Sovereign Tri-Node Mesh (PC-A, PC-B, Mobile).
Guarantees zero-hang local fallback if peer is unreachable or in air-gapped isolation.
"""

from __future__ import annotations

import json
import logging
import tempfile
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from sse.tri_node.frame import TriNodeFrame
from sse.tri_node.ledger import SovereignLedger
from sse.tri_node.mesh_handlers import MeshActionDispatcher
from sse.tri_node.sovereign_core import CLUSTER_SHARED_SECRET, NodeID

logger = logging.getLogger("sse.tri_node.client")


class TriNodeMeshClient:
    """Client for authenticated, cryptographically signed P2P mesh operations.

    Supports:
    - Cross-node telemetry and VRAM inspection
    - Sandboxed remote file writing with path-traversal prevention
    - Sandboxed remote build and security-audited test execution
    - Bidirectional ledger synchronization
    - Instant fallback to local sovereign execution on network disconnect
    """

    def __init__(
        self,
        node_id: str | NodeID | None = None,
        secret: str | None = None,
        ledger: SovereignLedger | None = None,
        workspace_base_dir: Path | str | None = None,
        current_role: Any = None,
        shared_secret: Any = None,
    ) -> None:
        role = current_role if current_role is not None else (node_id or NodeID.PC_A)
        self.node_id = str(role.value if hasattr(role, "value") else role)
        sec = shared_secret if shared_secret is not None else (secret or CLUSTER_SHARED_SECRET)
        if isinstance(sec, bytes):
            sec = sec.decode("utf-8", errors="replace")
        self.secret = sec
        self.ledger = ledger or SovereignLedger(node_id=self.node_id)
        self.workspace_base_dir = Path(workspace_base_dir) if workspace_base_dir else None
        self._local_dispatcher: MeshActionDispatcher | None = None

    def _get_dispatcher(self) -> MeshActionDispatcher:
        """Lazy-initialize local action dispatcher for local fallback."""
        if self._local_dispatcher is None:
            self._local_dispatcher = MeshActionDispatcher(
                node_id=self.node_id,
                ledger=self.ledger,
                workspace_base_dir=self.workspace_base_dir,
            )
        return self._local_dispatcher

    def _send_signed_frame(
        self,
        target_url: str,
        action: str,
        payload: dict[str, Any],
        timeout: float,
    ) -> dict[str, Any]:
        """Create, sign, and post a TriNodeFrame to the target node's /mesh/dispatch endpoint."""
        frame = TriNodeFrame(
            sender_node_id=self.node_id,
            action=action,
            payload=payload,
            nonce=uuid.uuid4().hex[:12],
        )
        frame.sign(self.secret)
        req_body = json.dumps(frame.to_dict(), separators=(",", ":")).encode("utf-8")

        url = f"{target_url.rstrip('/')}/mesh/dispatch"
        req = urllib.request.Request(
            url,
            data=req_body,
            headers={
                "Content-Type": "application/json",
                "X-Mesh-Node": self.node_id,
                "X-Mesh-Action": action,
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
            return json.loads(data) if data else {}

    def inspect_node(
        self,
        target_role: str,
        target_url: str | None = None,
        timeout: float = 2.0,
    ) -> dict[str, Any]:
        """Inspect telemetry, VRAM headroom, and latest ledger hash of a peer node.

        If target_url is None or unreachable, falls back to local inspection.
        """
        if target_url:
            try:
                res = self._send_signed_frame(
                    target_url=target_url,
                    action="inspect_telemetry",
                    payload={"target_role": target_role},
                    timeout=timeout,
                )
                res["target_role"] = target_role
                res["target_url"] = target_url
                res["fallback_local"] = False
                return res
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "Peer %s at %s unreachable (%s). Falling back to local inspection.",
                    target_role,
                    target_url,
                    exc,
                )

        # Local fallback execution
        local_res = self._get_dispatcher().handle_inspect_telemetry()
        local_res["target_role"] = target_role
        local_res["target_url"] = target_url
        local_res["fallback_local"] = True
        return local_res

    def write_remote_file(
        self,
        target_url: str | None,
        relative_path: str,
        content: str,
        sandbox_id: str | None = None,
        timeout: float = 5.0,
    ) -> dict[str, Any]:
        """Atomically write a file into a guarded sandbox on a remote peer or fallback locally."""
        payload = {
            "relative_path": relative_path,
            "content": content,
            "sandbox_id": sandbox_id or "default_sandbox",
        }

        if target_url:
            try:
                res = self._send_signed_frame(
                    target_url=target_url,
                    action="write_file",
                    payload=payload,
                    timeout=timeout,
                )
                res["fallback_local"] = False
                return res
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "Remote write to %s failed (%s). Falling back to local sandbox.",
                    target_url,
                    exc,
                )

        # Local guarded sandbox write
        local_res = self._get_dispatcher().handle_write_file(payload)
        local_res["fallback_local"] = True
        return local_res

    def dispatch_remote_build(
        self,
        target_role: str,
        target_url: str | None,
        project_name: str,
        files: dict[str, str] | list[dict[str, str]],
        test_command: str | list[str] | None = None,
        timeout_sec: float = 30.0,
    ) -> dict[str, Any]:
        """Dispatch software build, security audit, and test execution to peer with local fallback."""
        payload = {
            "project_name": project_name,
            "files": files,
            "test_command": test_command,
            "target_role": target_role,
            "timeout_sec": timeout_sec,
        }

        if target_url:
            try:
                res = self._send_signed_frame(
                    target_url=target_url,
                    action="build_software",
                    payload=payload,
                    timeout=timeout_sec + 2.0,
                )
                res["dispatched_to"] = target_role
                res["fallback_local"] = False
                return res
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "Remote build dispatch to %s (%s) failed (%s). Falling back to local guarded execution.",
                    target_role,
                    target_url,
                    exc,
                )

        # Local guarded execution fallback
        local_res = self._get_dispatcher().handle_build_software(payload)
        local_res["dispatched_to"] = "LOCAL_FALLBACK"
        local_res["fallback_local"] = True
        return local_res

    def dispatch_arena_tournament(
        self,
        target_role: str,
        target_url: str | None,
        project_name: str,
        files: dict[str, str],
        rounds: int = 4,
        timeout_sec: float = 30.0,
    ) -> dict[str, Any]:
        """Dispatch candidate deliverables for 4-vector adversarial arena tournament with local fallback."""
        payload = {
            "project_name": project_name,
            "candidate_id": project_name,
            "files": files,
            "rounds": rounds,
            "target_role": target_role,
        }

        if target_url:
            try:
                res = self._send_signed_frame(
                    target_url=target_url,
                    action="arena_tournament",
                    payload=payload,
                    timeout=timeout_sec + 2.0,
                )
                res["dispatched_to"] = target_role
                res["fallback_local"] = False
                return res
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "Remote arena dispatch to %s (%s) failed (%s). Falling back to local arena execution.",
                    target_role,
                    target_url,
                    exc,
                )

        # Local fallback execution
        with tempfile.TemporaryDirectory(prefix="local_arena_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            for rel_path, content in files.items():
                t = tmp_path / rel_path
                t.parent.mkdir(parents=True, exist_ok=True)
                t.write_text(content, encoding="utf-8")

            from sse.swarm.arena import SwarmArena

            arena = SwarmArena(baseline_elo=1400.0)
            summary = arena.run_tournament(tmp_path, candidate_id=project_name, rounds=rounds)

            return {
                "status": "COMPLETED",
                "candidate_id": summary.candidate_id,
                "rounds": summary.rounds_played,
                "wins": summary.wins,
                "losses": summary.losses,
                "draws": summary.draws,
                "survival_rate": summary.survival_rate,
                "initial_elo": summary.initial_elo,
                "final_elo": summary.final_elo,
                "elo_delta": summary.elo_delta,
                "passed_gate": summary.passed_gate,
                "worst_case_regret": summary.worst_case_regret,
                "compact_payload": summary.to_compact_payload(),
                "dispatched_to": "LOCAL_FALLBACK",
                "fallback_local": True,
            }

    def sync_ledger_with_peer(
        self,
        target_url: str,
        timeout: float = 2.0,
    ) -> tuple[int, str]:
        """Bidirectionally synchronize ledger records with peer; return (merged_count, latest_hash)."""
        url = f"{target_url.rstrip('/')}/mesh/sync"
        local_records = self.ledger.read_records()
        local_lines = [json.dumps(r, separators=(",", ":")) for r in local_records]

        req_data = {"records": local_lines}
        body = json.dumps(req_data, separators=(",", ":")).encode("utf-8")
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
                    remote_records = res_json.get("records", [])
                    merged = self.ledger.merge_remote_records(remote_records)
                    return merged, self.ledger.get_latest_hash()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.warning("Ledger sync with %s failed: %s", target_url, exc)

        return 0, self.ledger.get_latest_hash()
