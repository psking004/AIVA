"""Strategic Systems Engine - Remote Worker Client (PC-A Dispatcher).

Provides synchronous and asynchronous dispatchers to ping remote PC-B worker health,
generate cryptographic HMAC-SHA256 authorization headers, and offload simulation tasks.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import numpy as np

from sse.distributed.security import DEFAULT_CLUSTER_SECRET, generate_cluster_grant


class RemoteWorkerClient:
    """Client on PC-A managing communication and dispatch to PC-B worker node."""

    def __init__(
        self,
        worker_url: str = "http://127.0.0.1:8220",
        cluster_secret: str = DEFAULT_CLUSTER_SECRET,
        timeout: float = 10.0,
        sync_client: Any | None = None,
        async_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.worker_url = worker_url.rstrip("/")
        self.cluster_secret = cluster_secret
        self.timeout = timeout
        self.sync_client = sync_client
        self.async_client = async_client

    def check_health(self) -> dict[str, Any]:
        """Synchronously check health and readiness of the remote worker node."""
        url = f"{self.worker_url}/health"
        if self.sync_client is not None:
            resp = self.sync_client.get(url)
            resp.raise_for_status()
            return resp.json()

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.json()

    async def acheck_health(self) -> dict[str, Any]:
        """Asynchronously check health and readiness of the remote worker node."""
        url = f"{self.worker_url}/health"
        if self.async_client is not None:
            resp = await self.async_client.get(url)
            resp.raise_for_status()
            return resp.json()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()

    def dispatch_simulation(
        self,
        u1: list[list[float]] | np.ndarray,
        u2: list[list[float]] | np.ndarray,
        rounds: int = 1000,
        noise: float = 0.0,
        policy_p1: str = "tit_for_tat",
        policy_p2: str = "tit_for_tat",
    ) -> dict[str, Any]:
        """Synchronously offload a simulation payload to PC-B with HMAC authentication."""
        u1_list = u1.tolist() if isinstance(u1, np.ndarray) else u1
        u2_list = u2.tolist() if isinstance(u2, np.ndarray) else u2

        now = time.time()
        grant = generate_cluster_grant(now, secret=self.cluster_secret)

        payload = {
            "u1": u1_list,
            "u2": u2_list,
            "rounds": rounds,
            "noise": noise,
            "timestamp": now,
            "policy_p1": policy_p1,
            "policy_p2": policy_p2,
        }
        headers = {
            "X-Auth-Grant": grant,
            "Content-Type": "application/json",
        }

        url = f"{self.worker_url}/execute/simulate"
        if self.sync_client is not None:
            resp = self.sync_client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def adispatch_simulation(
        self,
        u1: list[list[float]] | np.ndarray,
        u2: list[list[float]] | np.ndarray,
        rounds: int = 1000,
        noise: float = 0.0,
        policy_p1: str = "tit_for_tat",
        policy_p2: str = "tit_for_tat",
    ) -> dict[str, Any]:
        """Asynchronously offload a simulation payload to PC-B with HMAC authentication."""
        u1_list = u1.tolist() if isinstance(u1, np.ndarray) else u1
        u2_list = u2.tolist() if isinstance(u2, np.ndarray) else u2

        now = time.time()
        grant = generate_cluster_grant(now, secret=self.cluster_secret)

        payload = {
            "u1": u1_list,
            "u2": u2_list,
            "rounds": rounds,
            "noise": noise,
            "timestamp": now,
            "policy_p1": policy_p1,
            "policy_p2": policy_p2,
        }
        headers = {
            "X-Auth-Grant": grant,
            "Content-Type": "application/json",
        }

        url = f"{self.worker_url}/execute/simulate"
        if self.async_client is not None:
            resp = await self.async_client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()
