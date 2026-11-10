"""Strategic Systems Engine - Distributed Execution Package.

Provides worker services, remote clients, and HMAC-authenticated execution
for offloaded game theoretic simulations and multi-node compute distribution.
"""

from sse.distributed.client import RemoteWorkerClient
from sse.distributed.security import (
    DEFAULT_CLUSTER_SECRET,
    generate_cluster_grant,
    verify_cluster_grant,
)
from sse.distributed.worker_service import (
    HealthResponse,
    SimulationPayload,
    SimulationResponse,
    app,
    create_worker_app,
    run_worker,
)

__all__ = [
    "DEFAULT_CLUSTER_SECRET",
    "HealthResponse",
    "RemoteWorkerClient",
    "SimulationPayload",
    "SimulationResponse",
    "app",
    "create_worker_app",
    "generate_cluster_grant",
    "run_worker",
    "verify_cluster_grant",
]

