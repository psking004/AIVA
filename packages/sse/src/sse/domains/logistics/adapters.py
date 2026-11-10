"""Logistics Domain Adapter — Ingests multi-echelon supply network feeds and compute cluster topologies."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sse.domains.logistics.supply_chain import (
    ClusterComputeRoutingGame,
    ComputeNodeProfile,
    MultiEchelonInventoryGame,
)
from sse.models import FiniteNormalFormGame


class LogisticsDomainAdapter:
    """Translates supply chain parameters and compute node clusters into game tensors."""

    @staticmethod
    def create_bullwhip_inventory_game(
        lead_time: int = 2,
        forecast_horizon: int = 4,
        mean_demand: float = 50.0,
        demand_volatility: float = 10.0,
        order_quantities: Sequence[float] = (30.0, 50.0, 70.0),
    ) -> FiniteNormalFormGame:
        """Constructs a multi-echelon inventory game exhibiting the Bullwhip Effect."""
        model = MultiEchelonInventoryGame(
            lead_time_l=lead_time,
            forecast_horizon_p=forecast_horizon,
            mean_demand=mean_demand,
            demand_std=demand_volatility,
        )
        return model.to_game(order_quantities=order_quantities)

    @staticmethod
    def create_cluster_compute_routing_game(
        node_profiles: list[dict[str, Any]],
        batch_sizes: Sequence[int] = (100, 200),
    ) -> FiniteNormalFormGame:
        """Constructs a cluster task routing game between independent schedulers."""
        nodes: list[ComputeNodeProfile] = []
        for n in node_profiles:
            nodes.append(
                ComputeNodeProfile(
                    node_id=str(n.get("node_id", n.get("id", "worker"))),
                    execution_speed=float(n.get("speed", n.get("execution_speed", 1000.0))),
                    network_latency_ms=float(n.get("latency", n.get("network_latency_ms", 5.0))),
                    current_backlog=int(n.get("backlog", 0)),
                )
            )
        model = ClusterComputeRoutingGame(nodes=nodes)
        return model.to_game(batch_sizes=batch_sizes)

