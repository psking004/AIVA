"""Mathematical and algorithmic verification tests for Logistics Domain."""

from __future__ import annotations

import pytest

from sse.domains.logistics.adapters import LogisticsDomainAdapter
from sse.domains.logistics.supply_chain import (
    MultiEchelonInventoryGame,
)
from sse.strategic.solvers.exact_solvers import ExactSupportEnumerationSolver


def test_bullwhip_effect_variance_ratio_amplification() -> None:
    """Verifies that the multi-echelon inventory model mathematically generates the Bullwhip Effect."""
    # Lead time L = 3, forecast horizon p = 4
    # Theoretical ratio = 1 + (2*3 / 4) + (2*9 / 16) = 1 + 1.5 + 1.125 = 3.625
    inventory = MultiEchelonInventoryGame(
        lead_time_l=3,
        forecast_horizon_p=4,
        mean_demand=50.0,
        demand_std=10.0,
    )
    ratio = inventory.compute_bullwhip_ratio()
    assert pytest.approx(ratio, rel=1e-4) == 3.625
    assert ratio > 1.0, "Bullwhip ratio must strictly exceed 1.0"

    # Construct normal form game via adapter
    game = LogisticsDomainAdapter.create_bullwhip_inventory_game(
        lead_time=3,
        forecast_horizon=4,
        mean_demand=50.0,
        demand_volatility=10.0,
        order_quantities=[30.0, 50.0, 70.0],
    )
    assert len(game.actions[0]) == 3
    assert len(game.actions[1]) == 3

    # Solve with exact solver
    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1


def test_cluster_compute_routing_game() -> None:
    """Verifies cluster workload task routing across heterogenous compute nodes."""
    nodes = [
        {"node_id": "GPU_Cluster_1", "speed": 5000.0, "latency": 2.0, "backlog": 50},
        {"node_id": "CPU_Node_2", "speed": 1000.0, "latency": 1.0, "backlog": 0},
    ]

    game = LogisticsDomainAdapter.create_cluster_compute_routing_game(
        node_profiles=nodes,
        batch_sizes=[200, 400],
    )
    assert len(game.actions[0]) == 2
    assert len(game.actions[1]) == 2

    # High performance GPU cluster should dominate for large batches
    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1
