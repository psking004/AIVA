"""Unit tests for PC-B Distributed Worker Service and PC-A Client Dispatcher."""

import time

import httpx
import pytest
from starlette.testclient import TestClient

from sse.distributed.client import RemoteWorkerClient
from sse.distributed.security import (
    generate_cluster_grant,
    verify_cluster_grant,
)
from sse.distributed.worker_service import create_worker_app


@pytest.fixture
def test_app():
    return create_worker_app(cluster_secret="test_cluster_secret_xyz")


@pytest.fixture
def test_client(test_app):
    return TestClient(test_app)


def test_cluster_grant_security_verification() -> None:
    """Verify HMAC grant generation and anti-replay verification."""
    secret = "test_cluster_secret_xyz"
    now = time.time()

    # Valid grant
    grant = generate_cluster_grant(now, secret=secret)
    is_valid, reason = verify_cluster_grant(grant, now, now, secret=secret)
    assert is_valid is True
    assert "successfully" in reason

    # Expired timestamp (skew > 300s)
    old_time = now - 350.0
    expired_grant = generate_cluster_grant(old_time, secret=secret)
    is_valid, reason = verify_cluster_grant(expired_grant, old_time, now, secret=secret)
    assert is_valid is False
    assert "expired" in reason

    # Forged secret
    forged_grant = generate_cluster_grant(now, secret="wrong_secret")
    is_valid, reason = verify_cluster_grant(forged_grant, now, now, secret=secret)
    assert is_valid is False
    assert "mismatch" in reason

    # Missing grant
    is_valid, reason = verify_cluster_grant(None, now, now, secret=secret)
    assert is_valid is False
    assert "Missing" in reason


def test_worker_health_endpoint(test_client) -> None:
    """Verify PC-B worker /health endpoint reports readiness and metrics."""
    resp = test_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "READY"
    assert data["node_id"] == "PC-B"
    assert data["cpu_percent"] >= 0.0
    assert data["ram_total_gb"] > 0.0


def test_worker_simulation_authentication_rejection(test_client) -> None:
    """Verify /execute/simulate rejects unauthenticated or expired requests with HTTP 403."""
    now = time.time()
    payload = {
        "u1": [[3.0, 0.0], [5.0, 1.0]],
        "u2": [[3.0, 5.0], [0.0, 1.0]],
        "rounds": 500,
        "noise": 0.0,
        "timestamp": now,
    }

    # 1. Missing header
    resp = test_client.post("/execute/simulate", json=payload)
    assert resp.status_code == 403

    # 2. Forged signature
    headers = {"X-Auth-Grant": "grant_invalid_signature"}
    resp = test_client.post("/execute/simulate", json=payload, headers=headers)
    assert resp.status_code == 403

    # 3. Expired request (> 300s)
    expired_time = now - 400.0
    expired_payload = dict(payload)
    expired_payload["timestamp"] = expired_time
    expired_grant = generate_cluster_grant(expired_time, secret="test_cluster_secret_xyz")
    resp = test_client.post(
        "/execute/simulate",
        json=expired_payload,
        headers={"X-Auth-Grant": expired_grant},
    )
    assert resp.status_code == 403


def test_worker_simulation_execution_welford(test_client) -> None:
    """Verify streamed O(1)-memory simulation execution on PC-B."""
    secret = "test_cluster_secret_xyz"
    now = time.time()
    grant = generate_cluster_grant(now, secret=secret)

    payload = {
        "u1": [[3.0, 0.0], [5.0, 1.0]],
        "u2": [[3.0, 5.0], [0.0, 1.0]],
        "rounds": 1000,
        "noise": 0.05,
        "timestamp": now,
        "policy_p1": "tit_for_tat",
        "policy_p2": "tit_for_tat",
    }
    headers = {"X-Auth-Grant": grant}

    resp = test_client.post("/execute/simulate", json=payload, headers=headers)
    assert resp.status_code == 200
    res = resp.json()

    assert res["status"] == "COMPLETED"
    assert res["executed_rounds"] == 1000
    assert isinstance(res["p1_mean"], float)
    assert isinstance(res["p1_variance"], float)
    assert res["p1_variance"] >= 0.0
    assert res["p2_variance"] >= 0.0


@pytest.mark.anyio
async def test_remote_worker_client_dispatcher(test_app, test_client) -> None:
    """Verify RemoteWorkerClient synchronous and asynchronous dispatch to worker service."""
    secret = "test_cluster_secret_xyz"
    async_transport = httpx.ASGITransport(app=test_app)

    async with httpx.AsyncClient(transport=async_transport, base_url="http://testworker:8220") as async_client:
        client = RemoteWorkerClient(
            worker_url="http://testworker:8220",
            cluster_secret=secret,
            sync_client=test_client,
            async_client=async_client,
        )

        # 1. Sync health check
        health_sync = client.check_health()
        assert health_sync["status"] == "READY"

        # 2. Async health check
        health_async = await client.acheck_health()
        assert health_async["status"] == "READY"

        # 3. Sync simulation dispatch
        u1 = [[3.0, 0.0], [5.0, 1.0]]
        u2 = [[3.0, 5.0], [0.0, 1.0]]
        sim_sync = client.dispatch_simulation(u1, u2, rounds=500, noise=0.0)
        assert sim_sync["status"] == "COMPLETED"
        assert sim_sync["executed_rounds"] == 500

        # 4. Async simulation dispatch
        sim_async = await client.adispatch_simulation(u1, u2, rounds=750, noise=0.02)
        assert sim_async["status"] == "COMPLETED"
        assert sim_async["executed_rounds"] == 750
