"""Strategic Systems Engine - PC-B Distributed Worker Service.

Lightweight FastAPI worker service executing offloaded game theoretic simulations
using streamed O(1)-memory Welford accumulation and HMAC-SHA256 authentication.
"""

from __future__ import annotations

import os
import time
from typing import Annotated

import numpy as np
from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from sse.distributed.security import DEFAULT_CLUSTER_SECRET, verify_cluster_grant
from sse.ingestion.telemetry_bridge import query_host_telemetry
from sse.simulation.compact_simulator import RunningMoments


class HealthResponse(BaseModel):
    """Worker node health and capacity response."""

    status: str = "READY"
    node_id: str = "PC-B"
    cpu_percent: float
    ram_used_gb: float
    ram_total_gb: float
    timestamp: float


class SimulationPayload(BaseModel):
    """Payload for offloaded repeated interaction simulation."""

    u1: list[list[float]] = Field(..., description="Player 1 payoff matrix (m x n)")
    u2: list[list[float]] = Field(..., description="Player 2 payoff matrix (m x n)")
    rounds: int = Field(default=1000, ge=1, le=1_000_000, description="Round count")
    noise: float = Field(default=0.0, ge=0.0, le=1.0, description="Decision noise probability")
    timestamp: float = Field(..., description="Epoch seconds when request was signed")
    policy_p1: str = Field(default="tit_for_tat", description="Player 1 strategy policy")
    policy_p2: str = Field(default="tit_for_tat", description="Player 2 strategy policy")


class SimulationResponse(BaseModel):
    """Streamed O(1)-memory simulation results."""

    status: str = "COMPLETED"
    node: str = "PC-B"
    executed_rounds: int
    p1_mean: float
    p1_variance: float
    p2_mean: float
    p2_variance: float
    p1_var_95: float
    p2_var_95: float
    timestamp: float


def create_worker_app(cluster_secret: str = DEFAULT_CLUSTER_SECRET) -> FastAPI:
    """Create and configure the distributed worker FastAPI application."""
    app = FastAPI(
        title="SSE Distributed Worker Service",
        description="High-throughput game theory simulation worker for PC-B compute offload",
        version="0.1.0",
    )

    @app.get("/health", response_model=HealthResponse)
    def health_check() -> HealthResponse:
        """Query PC-B capacity and worker readiness."""
        cpu_pct, ram_used, ram_total, _, _ = query_host_telemetry()
        return HealthResponse(
            status="READY",
            node_id=os.getenv("SSE_NODE_ID", "PC-B"),
            cpu_percent=cpu_pct,
            ram_used_gb=ram_used,
            ram_total_gb=ram_total,
            timestamp=time.time(),
        )

    @app.post("/execute/simulate", response_model=SimulationResponse)
    def execute_simulation(
        payload: SimulationPayload,
        x_auth_grant: Annotated[str | None, Header(alias="X-Auth-Grant")] = None,
    ) -> SimulationResponse:
        """Execute streamed O(1)-memory simulation with cryptographic grant validation."""
        now = time.time()
        is_valid, reason = verify_cluster_grant(
            grant_header=x_auth_grant,
            timestamp=payload.timestamp,
            current_time=now,
            secret=cluster_secret,
        )

        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Authorization rejected: {reason}",
            )

        u1_mat = np.asarray(payload.u1, dtype=np.float64)
        u2_mat = np.asarray(payload.u2, dtype=np.float64)

        if u1_mat.ndim != 2 or u2_mat.ndim != 2 or u1_mat.shape != u2_mat.shape:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Payoff matrices u1 and u2 must be 2-dimensional with identical shapes.",
            )

        num_actions_p1, num_actions_p2 = u1_mat.shape
        if num_actions_p1 == 0 or num_actions_p2 == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Action sets must not be empty.",
            )

        # Streamed O(1) Welford accumulation
        m1 = RunningMoments()
        m2 = RunningMoments()

        rng = np.random.default_rng(seed=42)

        prev_a1 = 0
        prev_a2 = 0

        for r in range(payload.rounds):
            # Select action 1
            if r == 0:
                a1 = 0
                a2 = 0
            else:
                # Player 1 decision
                if rng.random() < payload.noise:
                    a1 = int(rng.integers(0, num_actions_p1))
                elif payload.policy_p1 == "tit_for_tat":
                    a1 = min(prev_a2, num_actions_p1 - 1)
                elif payload.policy_p1 == "greedy":
                    a1 = int(np.argmax(u1_mat[:, prev_a2]))
                else:
                    a1 = int(rng.integers(0, num_actions_p1))

                # Player 2 decision
                if rng.random() < payload.noise:
                    a2 = int(rng.integers(0, num_actions_p2))
                elif payload.policy_p2 == "tit_for_tat":
                    a2 = min(prev_a1, num_actions_p2 - 1)
                elif payload.policy_p2 == "greedy":
                    a2 = int(np.argmax(u2_mat[prev_a1, :]))
                else:
                    a2 = int(rng.integers(0, num_actions_p2))

            payoff_1 = float(u1_mat[a1, a2])
            payoff_2 = float(u2_mat[a1, a2])

            m1.update(payoff_1, rng=rng)
            m2.update(payoff_2, rng=rng)

            prev_a1 = a1
            prev_a2 = a2

        return SimulationResponse(
            status="COMPLETED",
            node=os.getenv("SSE_NODE_ID", "PC-B"),
            executed_rounds=payload.rounds,
            p1_mean=round(m1.mean, 5),
            p1_variance=round(m1.variance, 5),
            p2_mean=round(m2.mean, 5),
            p2_variance=round(m2.variance, 5),
            p1_var_95=round(m1.compute_var_95(), 5),
            p2_var_95=round(m2.compute_var_95(), 5),
            timestamp=time.time(),
        )

    return app


app = create_worker_app()


def run_worker(host: str = "127.0.0.1", port: int = 8220) -> None:
    """Entrypoint to launch the PC-B Uvicorn worker daemon."""
    import uvicorn

    uvicorn.run("sse.distributed.worker_service:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    run_worker()

