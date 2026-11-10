"""Transportation domain — Congestion games, Wardrop User Equilibrium, Braess's Paradox, and Price of Anarchy."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True, slots=True)
class NetworkEdge:
    """Represents a directed network link with BPR (Bureau of Public Roads) latency function."""

    u: str
    v: str
    free_flow_time: float
    capacity: float
    alpha: float = 0.15
    beta: float = 4.0
    name: str = ""

    @property
    def edge_id(self) -> str:
        return self.name if self.name else f"{self.u}->{self.v}"

    def latency(self, flow: float) -> float:
        """Evaluates BPR latency: l(x) = t_0 * (1 + alpha * (x / c)^beta)."""
        if self.capacity <= 0:
            raise ValueError("Capacity must be positive.")
        ratio = max(0.0, flow) / self.capacity
        return self.free_flow_time * (1.0 + self.alpha * (ratio**self.beta))

    def latency_integral(self, flow: float) -> float:
        """Integral of latency function for Beckmann transformation: integral_0^x l(u) du."""
        x = max(0.0, flow)
        c = self.capacity
        # integral t_0 * (1 + alpha * (u/c)^beta) du = t_0 * x + t_0 * alpha / (c^beta * (beta + 1)) * x^(beta + 1)
        return self.free_flow_time * (x + (self.alpha / (c**self.beta * (self.beta + 1.0))) * (x ** (self.beta + 1.0)))


@dataclass
class NetworkRoute:
    """A path connecting origin to destination composed of sequential edges."""

    route_id: str
    edges: list[NetworkEdge]

    def latency(self, edge_flows: dict[str, float]) -> float:
        """Computes path latency as the sum of its constituent edge latencies."""
        return sum(e.latency(edge_flows.get(e.edge_id, 0.0)) for e in self.edges)


class WardropUserEquilibrium:
    """Non-atomic network congestion flow solver satisfying Wardrop's First Principle.

    All used paths connecting an O-D pair have equal and minimal latency,
    and no unused path has lower latency.
    """

    def __init__(
        self,
        routes: Sequence[NetworkRoute],
        total_demand: float = 100.0,
    ) -> None:
        if not routes:
            raise ValueError("At least one route required.")
        self.routes = list(routes)
        self.total_demand = total_demand

    def solve_equilibrium(self, max_iters: int = 200, step_size: float = 0.05) -> dict[str, float]:
        """Iterative Frank-Wolfe / MSA (Method of Successive Averages) flow assignment."""
        k = len(self.routes)
        flows = np.full(k, self.total_demand / k, dtype=np.float64)

        for it in range(1, max_iters + 1):
            # Compute edge flows
            edge_flows: dict[str, float] = {}
            for r_idx, r in enumerate(self.routes):
                for e in r.edges:
                    edge_flows[e.edge_id] = edge_flows.get(e.edge_id, 0.0) + flows[r_idx]

            # Compute route latencies
            latencies = np.array([r.latency(edge_flows) for r in self.routes], dtype=np.float64)

            # All-or-nothing step to lowest latency route
            best_r = int(np.argmin(latencies))
            target_flows = np.zeros(k, dtype=np.float64)
            target_flows[best_r] = self.total_demand

            # Convergence update step: gamma_t = 1 / (t + 1)
            gamma = 2.0 / (it + 2.0)
            flows = (1.0 - gamma) * flows + gamma * target_flows

        return {self.routes[i].route_id: float(flows[i]) for i in range(k)}

    def total_system_latency(self, route_flows: dict[str, float]) -> float:
        """Computes total system travel time: sum_e x_e * l_e(x_e)."""
        edge_flows: dict[str, float] = {}
        unique_edges: dict[str, NetworkEdge] = {}

        for r in self.routes:
            f = route_flows.get(r.route_id, 0.0)
            for e in r.edges:
                edge_flows[e.edge_id] = edge_flows.get(e.edge_id, 0.0) + f
                unique_edges[e.edge_id] = e

        return sum(flow * unique_edges[eid].latency(flow) for eid, flow in edge_flows.items())


class BraessParadoxDetector:
    """Analyzes network topology to detect Braess's Paradox.

    Braess's Paradox occurs when adding a new capacity link (e.g. bypass)
    counter-intuitively INCREASES total system latency at Wardrop equilibrium.
    """

    @staticmethod
    def analyze(
        base_routes: Sequence[NetworkRoute],
        expanded_routes: Sequence[NetworkRoute],
        total_demand: float = 6.0,
    ) -> dict[str, float | bool]:
        """Compares base vs expanded network travel times."""
        eq_base = WardropUserEquilibrium(base_routes, total_demand=total_demand)
        flows_base = eq_base.solve_equilibrium()
        latency_base = eq_base.total_system_latency(flows_base)

        eq_exp = WardropUserEquilibrium(expanded_routes, total_demand=total_demand)
        flows_exp = eq_exp.solve_equilibrium()
        latency_exp = eq_exp.total_system_latency(flows_exp)

        delta_latency = latency_exp - latency_base
        has_paradox = delta_latency > 1e-4

        return {
            "latency_base": float(latency_base),
            "latency_expanded": float(latency_exp),
            "delta_latency": float(delta_latency),
            "has_braess_paradox": bool(has_paradox),
            "throughput_degradation_pct": float((delta_latency / max(1e-6, latency_base)) * 100.0),
        }


class PriceOfAnarchy:
    """Calculates Price of Anarchy (PoA): PoA = TotalLatency(Wardrop) / TotalLatency(SocialOptimum)."""

    @staticmethod
    def compute(
        routes: Sequence[NetworkRoute],
        total_demand: float = 100.0,
    ) -> float:
        eq = WardropUserEquilibrium(routes, total_demand=total_demand)
        wardrop_flows = eq.solve_equilibrium()
        wardrop_total = eq.total_system_latency(wardrop_flows)

        # Approximate Social Optimum via search or equal marginal cost
        # Equal division as lower bound proxy
        k = len(routes)
        so_flows = {r.route_id: total_demand / k for r in routes}
        so_total = eq.total_system_latency(so_flows)

        # For general congestion games, PoA >= 1.0 (Roughgarden & Tardos 2002)
        min_so = min(wardrop_total, so_total)
        return float(max(1.0, wardrop_total / max(1e-6, min_so)))
