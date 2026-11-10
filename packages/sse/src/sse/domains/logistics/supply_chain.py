"""Logistics domain — Supply Chain Bullwhip Effect and Cluster Compute Workload Routing."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sse.models import FiniteNormalFormGame


@dataclass(frozen=True, slots=True)
class ComputeNodeProfile:
    """Attributes of a cluster compute worker."""

    node_id: str
    execution_speed: float  # tasks per second
    network_latency_ms: float
    current_backlog: int = 0


class MultiEchelonInventoryGame:
    """Dynamic inventory ordering game between Upstream Supplier and Downstream Retailer.

    Isolates and quantifies the Bullwhip Effect (Lee, Padmanabhan & Whang 1997):
    Order variance amplification:
        Var(Orders) / Var(Demand) = 1 + (2*L / p) + (2*L^2 / p^2) > 1.
    """

    def __init__(
        self,
        lead_time_l: int = 2,
        forecast_horizon_p: int = 4,
        mean_demand: float = 50.0,
        demand_std: float = 10.0,
        stockout_penalty: float = 25.0,
        holding_cost: float = 2.0,
    ) -> None:
        self.l = lead_time_l
        self.p = forecast_horizon_p
        self.mu = mean_demand
        self.sigma = demand_std
        self.stockout_penalty = stockout_penalty
        self.holding_cost = holding_cost

    def compute_bullwhip_ratio(self) -> float:
        """Calculates theoretical analytical bullwhip variance amplification ratio."""
        l_val = float(self.l)
        p_val = float(self.p)
        return float(1.0 + (2.0 * l_val / p_val) + (2.0 * (l_val**2) / (p_val**2)))

    def to_game(
        self,
        order_quantities: Sequence[float] = (30.0, 50.0, 70.0),
    ) -> FiniteNormalFormGame:
        """Constructs a normal form game between Downstream Retailer and Upstream Supplier."""
        r_actions = [f"RetailerOrder_{int(q)}" for q in order_quantities]
        s_actions = [f"SupplierBatch_{int(q)}" for q in order_quantities]

        payoffs: list[list[float]] = []

        for q_r in order_quantities:
            for q_s in order_quantities:
                # Retailer cost under demand realizations
                expected_demand = self.mu
                shortage_r = max(0.0, expected_demand - min(q_r, q_s))
                excess_r = max(0.0, min(q_r, q_s) - expected_demand)
                cost_r = shortage_r * self.stockout_penalty + excess_r * self.holding_cost

                # Supplier cost under retailer order variability
                shortage_s = max(0.0, q_r - q_s)
                excess_s = max(0.0, q_s - q_r)
                cost_s = shortage_s * (self.stockout_penalty * 0.8) + excess_s * self.holding_cost

                # Payoff is negative operational cost
                payoffs.append([round(-cost_r, 2), round(-cost_s, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "multi-echelon-bullwhip-inventory",
            "name": "Multi-Echelon Bullwhip Inventory Game",
            "players": ["Downstream_Retailer", "Upstream_Supplier"],
            "actions": {
                "Downstream_Retailer": r_actions,
                "Upstream_Supplier": s_actions,
            },
            "payoffs": payoffs,
        })


class ClusterComputeRoutingGame:
    """Non-cooperative task routing between independent tenant schedulers across cluster compute nodes.

    Latency on node i for task batch x_i:
        T_i(x_i) = latency_net_i + (x_i + backlog_i) / speed_i.
    """

    def __init__(
        self,
        nodes: Sequence[ComputeNodeProfile],
        tenants: Sequence[str] = ("Tenant_Alpha", "Tenant_Beta"),
    ) -> None:
        if not nodes:
            raise ValueError("Compute nodes list must not be empty.")
        self.nodes = list(nodes)
        self.tenants = list(tenants)

    def to_game(self, batch_sizes: Sequence[int] = (100, 200)) -> FiniteNormalFormGame:
        """Constructs a normal form routing game where tenants select target compute nodes."""
        node_ids = [n.node_id for n in self.nodes]
        actions_t1 = [f"RouteTo_{nid}" for nid in node_ids]
        actions_t2 = [f"RouteTo_{nid}" for nid in node_ids]

        payoffs: list[list[float]] = []

        for n1_idx, n1 in enumerate(self.nodes):
            for n2_idx, n2 in enumerate(self.nodes):
                if n1_idx == n2_idx:
                    # Both tenants routed to same node -> shared contention
                    total_load = batch_sizes[0] + batch_sizes[1]
                    lat_1 = n1.network_latency_ms + (total_load + n1.current_backlog) / n1.execution_speed * 1000.0
                    lat_2 = n2.network_latency_ms + (total_load + n2.current_backlog) / n2.execution_speed * 1000.0
                else:
                    # Routed to distinct nodes
                    lat_1 = n1.network_latency_ms + (batch_sizes[0] + n1.current_backlog) / n1.execution_speed * 1000.0
                    lat_2 = n2.network_latency_ms + (batch_sizes[1] + n2.current_backlog) / n2.execution_speed * 1000.0

                payoffs.append([round(-lat_1, 2), round(-lat_2, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "cluster-compute-task-routing",
            "name": "Cluster Compute Workload Routing Game",
            "players": [self.tenants[0], self.tenants[1]],
            "actions": {
                self.tenants[0]: actions_t1,
                self.tenants[1]: actions_t2,
            },
            "payoffs": payoffs,
        })
