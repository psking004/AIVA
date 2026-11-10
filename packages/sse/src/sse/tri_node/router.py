"""Strategic Systems Engine - Peer-to-Peer Mesh Router.

Lightweight, offline-first P2P communication and dispatch router for the Sovereign Tri-Node Mesh.
Built exclusively using Python standard library (http.server, threading, urllib.request).
Guarantees zero-hang timeout fallback to local execution on network partitions.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from sse.swarm.security_sandbox import SandboxedWorkspaceGuard
from sse.tri_node.firewall import MeshPayloadFirewall
from sse.tri_node.frame import TriNodeFrame
from sse.tri_node.ledger import SovereignLedger
from sse.tri_node.mesh_handlers import MeshActionDispatcher
from sse.tri_node.sovereign_core import (
    CLUSTER_SHARED_SECRET,
    NodeID,
    NodeRole,
    OperationalMode,
    SovereignDecisionCore,
    SovereignDecisionVerdict,
)

logger = logging.getLogger("sse.tri_node.router")

DEFAULT_NODE_PORTS: dict[str, int] = {
    NodeID.PC_A.value: 8201,
    NodeID.PC_B.value: 8202,
    NodeID.MOBILE.value: 8203,
}

__all__ = [
    "DEFAULT_NODE_PORTS",
    "MeshRequestHandler",
    "MeshServer",
    "NodeRole",
    "P2PRouter",
]


class MeshRequestHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP request handler for sovereign mesh communication."""

    server: MeshServer  # Type hint for custom server attributes

    def log_message(self, format: str, *args: Any) -> None:
        """Silence standard stderr logging to preserve clean console output."""

    def _send_json(self, status_code: int, data: dict[str, Any]) -> None:
        raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        if status_code in (413, 415):
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(raw)
        self.wfile.flush()

    def _discard_excess_body(self, content_length: int, max_drain: int = 4_194_304) -> None:
        """Drain bounded incoming request bytes in a 64 KB buffer so clients receive HTTP 413/415 cleanly."""
        if content_length <= 0 or content_length > max_drain:
            return
        remaining = content_length
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)

    def do_GET(self) -> None:
        """Route GET requests for health, telemetry, and ledger records."""
        path = self.path.split("?")[0]
        if path == "/health":
            latest_hash = self.server.ledger.get_latest_hash()
            self._send_json(
                200,
                {
                    "status": "READY",
                    "node_id": self.server.node_id,
                    "mode": self.server.mode,
                    "port": self.server.server_address[1],
                    "latest_hash": latest_hash,
                    "timestamp": time.time(),
                },
            )
        elif path in ("/mesh/inspect", "/mesh/telemetry"):
            data = self.server.action_dispatcher.handle_inspect_telemetry()
            self._send_json(200, data)
        elif path in ("/mesh/records", "/mesh/ledger"):
            records = self.server.ledger.read_records()
            self._send_json(
                200,
                {
                    "node_id": self.server.node_id,
                    "record_count": len(records),
                    "records": [json.dumps(r, separators=(",", ":")) for r in records],
                },
            )
        else:
            self._send_json(404, {"error": "Endpoint not found"})

    def _read_bounded_body(self, content_length: int, max_bytes: int) -> bytes | None:
        """Read request body using streamed bounding before JSON parsing."""
        if content_length <= 0:
            return b"{}"
        chunks: list[bytes] = []
        remaining = content_length
        total_read = 0
        while remaining > 0:
            chunk_size = min(remaining, 65536)
            chunk = self.rfile.read(chunk_size)
            if not chunk:
                break
            total_read += len(chunk)
            if total_read > max_bytes:
                return None
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def do_POST(self) -> None:
        """Route POST requests for mutual compute dispatch and ledger synchronization."""
        path = self.path.split("?")[0]
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (ValueError, TypeError):
            self._send_json(400, {"error": "INVALID_CONTENT_LENGTH: Header must be an integer"})
            return

        # Enforce header and size validation via firewall BEFORE reading body stream
        valid_hdr, err_hdr = self.server.firewall.validate_headers(self.headers, content_length)
        if not valid_hdr:
            if "PAYLOAD_TOO_LARGE" in err_hdr:
                status_code = 413
            elif "INVALID_CONTENT_TYPE" in err_hdr:
                status_code = 415
            else:
                status_code = 400
            self._discard_excess_body(content_length)
            self._send_json(status_code, {"error": err_hdr})
            return

        max_bytes = self.server.firewall.config.max_payload_bytes
        body = self._read_bounded_body(content_length, max_bytes)
        if body is None:
            self._send_json(
                413,
                {"error": f"PAYLOAD_TOO_LARGE: Streamed body exceeded ceiling of {max_bytes} bytes"},
            )
            return

        client_ip = self.client_address[0] if hasattr(self, "client_address") else "127.0.0.1"

        valid_payload, payload, reason = self.server.firewall.validate_payload(body, peer_ip=client_ip)
        if not valid_payload:
            if "PAYLOAD_TOO_LARGE" in reason:
                status_code = 413
            elif "RATE_LIMIT" in reason:
                status_code = 429
            elif "REPLAY_DETECTED" in reason:
                status_code = 401
            elif "UNRECOGNIZED_NODE_ID" in reason:
                status_code = 403
            elif "CLOCK_SKEW_EXCEEDED" in reason:
                status_code = 401
            else:
                status_code = 400
            self._send_json(status_code, {"error": reason})
            return

        payload = payload or {}

        if path == "/mesh/dispatch":
            # Check for signed cryptographic frame
            if "signature" in payload:
                try:
                    frame = TriNodeFrame.from_dict(payload)
                except Exception as exc:
                    self._send_json(400, {"error": "MALFORMED_FRAME", "details": str(exc)})
                    return

                if not frame.verify_signature(self.server.core.secret):
                    self._send_json(
                        401,
                        {"error": "INVALID_SIGNATURE", "reason": "HMAC signature mismatch"},
                    )
                    return

                max_skew = self.server.firewall.config.max_clock_skew_sec
                if abs(time.time() - frame.timestamp) > max_skew:
                    self._send_json(
                        401,
                        {"error": "EXPIRED_FRAME", "reason": "Frame timestamp outside valid drift window"},
                    )
                    return

                action = frame.action
                action_payload = frame.payload
            else:
                action = payload.get("action")
                action_payload = payload.get("payload", payload)

            # Route by action
            if action in ("inspect_telemetry", "health"):
                res = self.server.action_dispatcher.handle_inspect_telemetry()
                self._send_json(200, res)
                return

            if action == "write_file":
                try:
                    res = self.server.action_dispatcher.handle_write_file(action_payload)
                    self._send_json(200, res)
                except PermissionError as pe:
                    self._send_json(403, {"error": "SANDBOX_ESCAPE_REJECTED", "details": str(pe)})
                except Exception as exc:
                    self._send_json(400, {"error": "WRITE_FILE_FAILED", "details": str(exc)})
                return

            if action == "build_software":
                try:
                    res = self.server.action_dispatcher.handle_build_software(action_payload)
                    status_code = 200 if res.get("status") == "COMPLETED" else 422
                    self._send_json(status_code, res)
                except PermissionError as pe:
                    self._send_json(403, {"error": "SANDBOX_VIOLATION", "details": str(pe)})
                except Exception as exc:
                    self._send_json(500, {"error": "BUILD_FAILED", "details": str(exc)})
                return

            if action == "arena_tournament":
                try:
                    candidate_id = str(action_payload.get("candidate_id", action_payload.get("project_name", "candidate_remote")))
                    rounds = int(action_payload.get("rounds", 4))
                    files = action_payload.get("files", {})

                    with tempfile.TemporaryDirectory(prefix="mesh_arena_") as tmp_dir:
                        tmp_path = Path(tmp_dir)
                        arena_guard = SandboxedWorkspaceGuard(tmp_path)
                        if isinstance(files, dict):
                            for rel_path, content in files.items():
                                arena_guard.safe_write(str(rel_path), str(content))
                        elif isinstance(files, list):
                            for f_entry in files:
                                p = f_entry.get("path") or f_entry.get("relative_path")
                                c = f_entry.get("content", "")
                                if p:
                                    arena_guard.safe_write(str(p), str(c))

                        from sse.swarm.arena import SwarmArena

                        arena = SwarmArena(baseline_elo=1400.0)
                        summary = arena.run_tournament(tmp_path, candidate_id=candidate_id, rounds=rounds)

                        res_data = {
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
                        }
                        status_code = 200 if summary.passed_gate else 422
                        self._send_json(status_code, res_data)
                except PermissionError as pe:
                    self._send_json(403, {"error": "SANDBOX_ESCAPE_REJECTED", "details": str(pe)})
                except Exception as exc:
                    self._send_json(500, {"error": "ARENA_TOURNAMENT_FAILED", "details": str(exc)})
                return

            if action in ("quorum_challenge", "challenge"):
                from aiva.governance.mobile_signer import MobileQuorumSignerDaemon

                signer = getattr(self.server, "quorum_signer", None)
                if signer is None:
                    signer = MobileQuorumSignerDaemon(node_id=self.server.node_id)
                res = signer.process_challenge(action_payload)
                status_code = 200 if res.get("status") == "APPROVED" else 403
                self._send_json(status_code, res)
                return

            if action in ("notify_brief", "notify"):
                now = time.time()
                brief_payload = action_payload if isinstance(action_payload, dict) else {"content": str(action_payload)}
                record_data = {
                    "decision_id": f"notify_{int(now * 1000)}",
                    "timestamp": now,
                    "payload": {
                        "type": "PUSH_NOTIFICATION",
                        "action": action,
                        "data": brief_payload,
                    },
                }
                from sse.storage.hardened_ledger import HardenedLedger

                if isinstance(self.server.ledger, HardenedLedger):
                    self.server.ledger.atomic_append_record(record_data)
                elif hasattr(self.server.ledger, "append_record"):
                    self.server.ledger.append_record(record_data)

                self._send_json(
                    200,
                    {
                        "status": "RECEIVED",
                        "action": action,
                        "node_id": self.server.node_id,
                        "timestamp": now,
                    },
                )
                return

            # Default to bimatrix game solving
            mat_dict = action_payload if isinstance(action_payload, dict) and "u1" in action_payload else payload
            u1 = mat_dict.get("u1")
            u2 = mat_dict.get("u2")
            if not u1 or not u2:
                self._send_json(422, {"error": "Payload must contain 'u1' and 'u2' matrices or valid action"})
                return

            act_p1 = mat_dict.get("actions_p1")
            act_p2 = mat_dict.get("actions_p2")
            dec_id = mat_dict.get("decision_id")
            prev_hash = self.server.ledger.get_latest_hash()

            verdict = self.server.core.solve_matrix(
                u1=u1,
                u2=u2,
                actions_p1=act_p1,
                actions_p2=act_p2,
                decision_id=dec_id,
                prev_hash=prev_hash,
                airgapped_solo=False,
            )

            # Append to local ledger
            self.server.ledger.append_verdict(verdict, extra_meta={"dispatched_via": "mesh"})

            self._send_json(
                200,
                {
                    "status": "COMPLETED",
                    "verdict": json.loads(verdict.to_compact_payload()),
                },
            )

        elif path in ("/mesh/inspect", "/mesh/telemetry"):
            res = self.server.action_dispatcher.handle_inspect_telemetry()
            self._send_json(200, res)

        elif path == "/mesh/write_file":
            try:
                res = self.server.action_dispatcher.handle_write_file(payload.get("payload", payload))
                self._send_json(200, res)
            except PermissionError as pe:
                self._send_json(403, {"error": "SANDBOX_ESCAPE_REJECTED", "details": str(pe)})
            except Exception as exc:
                self._send_json(400, {"error": "WRITE_FILE_FAILED", "details": str(exc)})

        elif path == "/mesh/build":
            try:
                res = self.server.action_dispatcher.handle_build_software(payload.get("payload", payload))
                status_code = 200 if res.get("status") == "COMPLETED" else 422
                self._send_json(status_code, res)
            except PermissionError as pe:
                self._send_json(403, {"error": "SANDBOX_VIOLATION", "details": str(pe)})
            except Exception as exc:
                self._send_json(500, {"error": "BUILD_FAILED", "details": str(exc)})

        elif path == "/mesh/sync":
            incoming_lines = payload.get("records", [])
            merged_count = self.server.ledger.merge_remote_records(incoming_lines)

            # Send back all local records for reciprocal synchronization
            all_records = self.server.ledger.read_records()
            all_lines = [json.dumps(r, separators=(",", ":")) for r in all_records]

            self._send_json(
                200,
                {
                    "status": "SYNCED",
                    "merged_count": merged_count,
                    "latest_hash": self.server.ledger.get_latest_hash(),
                    "records": all_lines,
                },
            )

        elif path == "/mesh/arena":
            candidate_id = str(payload.get("candidate_id", "candidate_remote"))
            rounds = int(payload.get("rounds", 10))
            files = payload.get("files", {})

            try:
                with tempfile.TemporaryDirectory(prefix="mesh_arena_") as tmp_dir:
                    tmp_path = Path(tmp_dir)
                    arena_guard = SandboxedWorkspaceGuard(tmp_path)
                    if isinstance(files, dict):
                        for rel_path, content in files.items():
                            arena_guard.safe_write(str(rel_path), str(content))
                    elif isinstance(files, list):
                        for f_entry in files:
                            p = f_entry.get("path") or f_entry.get("relative_path")
                            c = f_entry.get("content", "")
                            if p:
                                arena_guard.safe_write(str(p), str(c))

                    from sse.swarm.arena import SwarmArena

                    arena = SwarmArena(baseline_elo=1400.0)
                    summary = arena.run_tournament(tmp_path, candidate_id=candidate_id, rounds=rounds)

                    self._send_json(
                        200,
                        {
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
                            "node_id": self.server.node_id,
                        },
                    )
            except PermissionError as pe:
                self._send_json(403, {"error": "SANDBOX_ESCAPE_REJECTED", "details": str(pe)})

        elif path == "/mesh/quorum/challenge":
            from aiva.governance.mobile_signer import MobileQuorumSignerDaemon

            signer = getattr(self.server, "quorum_signer", None)
            if signer is None:
                signer = MobileQuorumSignerDaemon(node_id=self.server.node_id)
            res = signer.process_challenge(payload)
            status_code = 200 if res.get("status") == "APPROVED" else 403
            self._send_json(status_code, res)

        elif path == "/mesh/quorum/approve":
            action_name = payload.get("action", "")
            target = payload.get("target", "*")
            signature = payload.get("signature", "")
            now = time.time()
            record_data = {
                "decision_id": f"quorum_appr_{int(now * 1000)}",
                "timestamp": now,
                "payload": {
                    "type": "QUORUM_APPROVAL_RECEIPT",
                    "action": action_name,
                    "target": target,
                    "signature": signature,
                    "signer_node": payload.get("signer_node", "UNKNOWN"),
                },
            }
            if hasattr(self.server.ledger, "append_record"):
                self.server.ledger.append_record(record_data)
            self._send_json(200, {"status": "APPROVAL_COMMITTED", "timestamp": now})
        else:
            self._send_json(404, {"error": "Endpoint not found"})


class MeshServer(ThreadingHTTPServer):
    """Custom ThreadingHTTPServer holding references to sovereign core and ledger."""

    def __init__(
        self,
        server_address: tuple[str, int],
        RequestHandlerClass: type[BaseHTTPRequestHandler],
        node_id: str,
        mode: str,
        core: SovereignDecisionCore,
        ledger: SovereignLedger,
        firewall: MeshPayloadFirewall | None = None,
    ) -> None:
        self.node_id = node_id
        self.mode = mode
        self.core = core
        self.ledger = ledger
        self.action_dispatcher = MeshActionDispatcher(node_id=self.node_id, ledger=self.ledger)
        self.firewall = firewall or MeshPayloadFirewall()
        self.daemon_threads = True
        super().__init__(server_address, RequestHandlerClass)


class P2PRouter:
    """Manages peer discovery, compute offload, and zero-hang offline fallback."""

    def __init__(
        self,
        node_id: str | NodeID = NodeID.PC_A,
        port: int | None = None,
        mode: str | OperationalMode = OperationalMode.SOLO,
        ledger_path: str | Path | None = None,
        secret: str = CLUSTER_SHARED_SECRET,
        firewall: MeshPayloadFirewall | None = None,
    ) -> None:
        self.node_id = str(node_id.value if isinstance(node_id, NodeID) else node_id)
        self.mode = str(mode.value if isinstance(mode, OperationalMode) else mode)
        self.port = port or DEFAULT_NODE_PORTS.get(self.node_id, 8201)
        self.secret = secret

        self.core = SovereignDecisionCore(node_id=self.node_id, mode=self.mode, secret=self.secret)
        try:
            from sse.storage.hardened_ledger import HardenedLedger

            self.ledger: SovereignLedger = HardenedLedger(node_id=self.node_id, ledger_path=ledger_path)
        except Exception:
            self.ledger = SovereignLedger(node_id=self.node_id, ledger_path=ledger_path)
        self.firewall = firewall or MeshPayloadFirewall()
        self._server: MeshServer | None = None
        self._thread: threading.Thread | None = None

    def start_server(
        self,
        host: str = "127.0.0.1",
        background: bool = True,
        allow_external: bool = False,
    ) -> MeshServer:
        """Start the mesh HTTP server daemon (loopback-only by default)."""
        is_loopback = host in ("127.0.0.1", "localhost", "::1")
        if not is_loopback and not allow_external and os.getenv("SSE_ALLOW_EXTERNAL_BIND") != "1":
            raise PermissionError(
                f"Binding to non-loopback host '{host}' is disabled by default. "
                "Pass allow_external=True or set SSE_ALLOW_EXTERNAL_BIND=1 explicitly."
            )
        server_address = (host, self.port)
        self._server = MeshServer(
            server_address=server_address,
            RequestHandlerClass=MeshRequestHandler,
            node_id=self.node_id,
            mode=self.mode,
            core=self.core,
            ledger=self.ledger,
            firewall=self.firewall,
        )

        if background:
            self._thread = threading.Thread(
                target=self._server.serve_forever,
                name=f"P2PRouter_{self.node_id}",
                daemon=True,
            )
            self._thread.start()
        else:
            self._server.serve_forever()

        return self._server

    def stop_server(self) -> None:
        """Cleanly shutdown the server."""
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

    def dispatch_task(
        self,
        peer_url: str | None,
        u1: list[list[float]],
        u2: list[list[float]],
        actions_p1: list[str] | None = None,
        actions_p2: list[str] | None = None,
        timeout: float = 1.5,
    ) -> SovereignDecisionVerdict:
        """Attempt to dispatch compute to peer; fall back instantly to local sovereign execution on failure."""
        if peer_url and self.mode != OperationalMode.SOLO.value:
            url = f"{peer_url.rstrip('/')}/mesh/dispatch"
            req_data = {
                "u1": u1,
                "u2": u2,
                "actions_p1": actions_p1,
                "actions_p2": actions_p2,
            }
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
                        v_data = res_json.get("verdict", {})
                        return SovereignDecisionVerdict(
                            node_id=v_data["node"],
                            decision_id=v_data["dec_id"],
                            action_idx=v_data["act"],
                            action_name=v_data["name"],
                            expected_utility=v_data["util"],
                            worst_case_regret=v_data["regret"],
                            solver_tier=v_data["tier"],
                            grant_token=v_data["grant"],
                            record_hash_16=v_data["hash"],
                            mode="MESH",
                        )
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "Peer %s unreachable (%s). Initiating instant local sovereign fallback on %s.",
                    peer_url,
                    exc,
                    self.node_id,
                )

        # Local Sovereign Execution Fallback (Zero socket hanging, 100% resilient)
        prev_hash = self.ledger.get_latest_hash()
        verdict = self.core.solve_matrix(
            u1=u1,
            u2=u2,
            actions_p1=actions_p1,
            actions_p2=actions_p2,
            prev_hash=prev_hash,
            airgapped_solo=True,
        )
        self.ledger.append_verdict(
            verdict,
            extra_meta={"fallback_from": peer_url or "NONE"},
        )
        return verdict

    def sync_with_peer(self, peer_url: str, timeout: float = 1.5) -> dict[str, Any]:
        """Bidirectionally synchronize ledger records with a remote peer node."""
        url = f"{peer_url.rstrip('/')}/mesh/sync"
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
                    return {
                        "status": "SYNCED",
                        "peer_url": peer_url,
                        "merged_count": merged,
                        "latest_hash": self.ledger.get_latest_hash(),
                    }
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {
                "status": "PEER_OFFLINE",
                "peer_url": peer_url,
                "error": str(exc),
                "latest_hash": self.ledger.get_latest_hash(),
            }

        return {
            "status": "FAILED",
            "peer_url": peer_url,
            "latest_hash": self.ledger.get_latest_hash(),
        }

