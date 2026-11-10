"""Transportation Domain Adapter — Ingests directed graphs, BPR parameters, and corridor traffic."""

from __future__ import annotations

from typing import Any

from sse.domains.transportation.congestion import (
    BraessParadoxDetector,
    NetworkEdge,
    NetworkRoute,
    PriceOfAnarchy,
)
from sse.models import FiniteNormalFormGame


class TransportationDomainAdapter:
    """Translates traffic corridors, edge latencies, and route flows into games and paradox analyses."""

    @staticmethod
    def create_traffic_corridor_game(
        network_edges: list[dict[str, Any]],
        route_definitions: dict[str, list[str]],
        total_demand: float = 100.0,
    ) -> FiniteNormalFormGame:
        """Constructs a 2-driver or aggregate commuter normal-form route choice game."""
        edge_map: dict[str, NetworkEdge] = {}
        for e in network_edges:
            edge_obj = NetworkEdge(
                u=e["u"],
                v=e["v"],
                free_flow_time=float(e.get("t0", e.get("free_flow_time", 10.0))),
                capacity=float(e.get("capacity", 50.0)),
                alpha=float(e.get("alpha", 0.15)),
                beta=float(e.get("beta", 4.0)),
            )
            edge_map[edge_obj.edge_id] = edge_obj

        routes: list[NetworkRoute] = []
        for r_name, e_ids in route_definitions.items():
            r_edges = [edge_map[eid] for eid in e_ids if eid in edge_map]
            routes.append(NetworkRoute(route_id=r_name, edges=r_edges))

        r_names = [r.route_id for r in routes]
        payoffs: list[list[float]] = []

        # 2 representative drivers sharing total demand
        d_each = total_demand / 2.0
        for r1 in routes:
            for r2 in routes:
                flows: dict[str, float] = {}
                for e in r1.edges:
                    flows[e.edge_id] = flows.get(e.edge_id, 0.0) + d_each
                for e in r2.edges:
                    flows[e.edge_id] = flows.get(e.edge_id, 0.0) + d_each

                lat1 = r1.latency(flows)
                lat2 = r2.latency(flows)
                # Payoff is negative latency
                payoffs.append([round(-lat1, 2), round(-lat2, 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "traffic-corridor-congestion-game",
            "name": "Traffic Corridor Congestion Game",
            "players": ["Driver_Group_1", "Driver_Group_2"],
            "actions": {
                "Driver_Group_1": r_names,
                "Driver_Group_2": r_names,
            },
            "payoffs": payoffs,
        })

    @staticmethod
    def analyze_braess_paradox(
        base_edges: list[dict[str, Any]],
        base_routes: dict[str, list[str]],
        teleport_edge: dict[str, Any],
        expanded_routes: dict[str, list[str]],
        demand: float = 6.0,
    ) -> dict[str, float | bool]:
        """Detects Braess's paradox when adding a teleport/bypass edge to a congestion network."""
        all_edges = base_edges + [teleport_edge]
        edge_map: dict[str, NetworkEdge] = {}
        for e in all_edges:
            obj = NetworkEdge(
                u=e["u"],
                v=e["v"],
                free_flow_time=float(e.get("t0", 1.0)),
                capacity=float(e.get("capacity", 1.0)),
                alpha=float(e.get("alpha", 1.0)),
                beta=float(e.get("beta", 1.0)),
            )
            edge_map[obj.edge_id] = obj

        b_routes = [NetworkRoute(r_id, [edge_map[eid] for eid in eids]) for r_id, eids in base_routes.items()]
        e_routes = [NetworkRoute(r_id, [edge_map[eid] for eid in eids]) for r_id, eids in expanded_routes.items()]

        return BraessParadoxDetector.analyze(b_routes, e_routes, total_demand=demand)

    @staticmethod
    def compute_network_price_of_anarchy(
        network_edges: list[dict[str, Any]],
        route_definitions: dict[str, list[str]],
        demand: float = 100.0,
    ) -> float:
        """Calculates Price of Anarchy for the given route network."""
        edge_map = {
            f"{e['u']}->{e['v']}": NetworkEdge(
                u=e["u"],
                v=e["v"],
                free_flow_time=float(e.get("t0", 10.0)),
                capacity=float(e.get("capacity", 50.0)),
                alpha=float(e.get("alpha", 0.15)),
                beta=float(e.get("beta", 4.0)),
            )
            for e in network_edges
        }
        routes = [NetworkRoute(rid, [edge_map[eid] for eid in eids]) for rid, eids in route_definitions.items()]
        return PriceOfAnarchy.compute(routes, total_demand=demand)
