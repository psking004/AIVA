"""Mathematical and algorithmic verification tests for Transportation Domain."""

from __future__ import annotations

import pytest

from sse.domains.transportation.congestion import (
    BraessParadoxDetector,
    NetworkEdge,
    NetworkRoute,
    PriceOfAnarchy,
    WardropUserEquilibrium,
)


def test_wardrop_user_equilibrium_equal_used_latencies() -> None:
    """Verifies Wardrop's First Principle: used paths have equal minimum latency."""
    # Two parallel routes:
    # Route 1: t0 = 10, cap = 40, alpha=0.15, beta=2
    # Route 2: t0 = 15, cap = 60, alpha=0.15, beta=2
    e1 = NetworkEdge(u="O", v="D", free_flow_time=10.0, capacity=40.0, alpha=0.15, beta=2.0, name="e_corridor_1")
    e2 = NetworkEdge(u="O", v="D", free_flow_time=15.0, capacity=60.0, alpha=0.15, beta=2.0, name="e_corridor_2")

    r1 = NetworkRoute("Route_1", [e1])
    r2 = NetworkRoute("Route_2", [e2])

    eq = WardropUserEquilibrium(routes=[r1, r2], total_demand=100.0)
    flows = eq.solve_equilibrium(max_iters=100)

    assert flows["Route_1"] > 0.0
    assert flows["Route_2"] > 0.0
    assert pytest.approx(flows["Route_1"] + flows["Route_2"], rel=1e-3) == 100.0

    # Evaluate latencies on each route under equilibrium flow
    edge_flows = {e1.edge_id: flows["Route_1"], e2.edge_id: flows["Route_2"]}
    lat1 = r1.latency(edge_flows)
    lat2 = r2.latency(edge_flows)

    # In user equilibrium, travel times on all utilized routes are equalized
    assert pytest.approx(lat1, rel=0.05) == lat2


def test_braess_paradox_positive_identification() -> None:
    """Verifies that adding a zero-cost bypass link in the classic diamond network triggers Braess's Paradox."""
    # Classic Braess network:
    # Origin S, Destination T, Intermediate nodes A and B
    # Edges:
    # S->A: l(x) = x / 100
    # S->B: l(x) = 45
    # A->T: l(x) = 45
    # B->T: l(x) = x / 100
    # Bypass link A->B: l(x) = 0
    # For total demand = 4000:
    # Without bypass: 2000 on SAT, 2000 on SBT. Total travel time = 20 + 45 = 65.
    # With bypass A->B: Everyone chooses S->A->B->T. Total travel time = 40 + 0 + 40 = 80! (degradation)
    # Using normalized scale (demand = 6.0):
    e_sa = NetworkEdge(u="S", v="A", free_flow_time=1.0, capacity=1.0, alpha=1.0, beta=1.0)
    e_sb = NetworkEdge(u="S", v="B", free_flow_time=5.0, capacity=100.0, alpha=0.0, beta=1.0)
    e_at = NetworkEdge(u="A", v="T", free_flow_time=5.0, capacity=100.0, alpha=0.0, beta=1.0)
    e_bt = NetworkEdge(u="B", v="T", free_flow_time=1.0, capacity=1.0, alpha=1.0, beta=1.0)

    # Base network routes
    r_sat = NetworkRoute("SAT", [e_sa, e_at])
    r_sbt = NetworkRoute("SBT", [e_sb, e_bt])

    # Teleport/bypass edge from A to B with zero latency
    e_ab = NetworkEdge(u="A", v="B", free_flow_time=0.01, capacity=100.0, alpha=0.0, beta=1.0)
    r_sabt = NetworkRoute("SABT", [e_sa, e_ab, e_bt])

    result = BraessParadoxDetector.analyze(
        base_routes=[r_sat, r_sbt],
        expanded_routes=[r_sat, r_sbt, r_sabt],
        total_demand=6.0,
    )

    assert result["has_braess_paradox"] is True
    assert result["delta_latency"] > 0.0
    assert result["throughput_degradation_pct"] > 0.0


def test_price_of_anarchy_bounds() -> None:
    """Verifies Price of Anarchy calculation satisfies PoA >= 1.0."""
    e1 = NetworkEdge(u="O", v="D", free_flow_time=10.0, capacity=50.0, alpha=0.15, beta=4.0)
    e2 = NetworkEdge(u="O", v="D", free_flow_time=20.0, capacity=50.0, alpha=0.15, beta=4.0)

    r1 = NetworkRoute("R1", [e1])
    r2 = NetworkRoute("R2", [e2])

    poa = PriceOfAnarchy.compute([r1, r2], total_demand=80.0)
    assert poa >= 1.0
