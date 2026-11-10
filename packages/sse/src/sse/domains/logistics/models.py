"""Logistics models: freight routing, shared warehouse allocation, and terminal scheduling."""

from __future__ import annotations

from collections.abc import Sequence

from sse.models import FiniteNormalFormGame


class CongestionRoutingGame:
    """Multi-carrier freight routing game across parallel corridors with congestion delay costs."""

    def __init__(self, carriers: Sequence[str] = ("Carrier_A", "Carrier_B")) -> None:
        self.carriers = list(carriers)

    def to_game(self) -> FiniteNormalFormGame:
        routes = ["Highway_Route", "Intermodal_Rail", "Secondary_Bypass"]
        # Latency/cost when alone vs when sharing route
        alone_cost = {"Highway_Route": 20.0, "Intermodal_Rail": 30.0, "Secondary_Bypass": 40.0}
        shared_cost = {"Highway_Route": 60.0, "Intermodal_Rail": 45.0, "Secondary_Bypass": 45.0}

        payoffs: list[list[float]] = []
        for r1 in routes:
            for r2 in routes:
                if r1 == r2:
                    c1 = shared_cost[r1]
                    c2 = shared_cost[r2]
                else:
                    c1 = alone_cost[r1]
                    c2 = alone_cost[r2]
                # Negative cost represents payoff (utility maximization)
                payoffs.append([-c1, -c2])

        return FiniteNormalFormGame.from_dict({
            "id": "logistics-freight-routing-congestion",
            "name": "Freight Routing Congestion Game",
            "players": self.carriers,
            "actions": {
                self.carriers[0]: routes,
                self.carriers[1]: routes,
            },
            "payoffs": payoffs,
        })


class SharedWarehouseAllocationGame:
    """Competition between e-commerce fulfillment centers for shared warehouse space."""

    def __init__(self, tenants: Sequence[str] = ("Tenant_1", "Tenant_2")) -> None:
        self.tenants = list(tenants)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Small_Footprint", "Standard_Footprint", "Surge_Expansion"]
        payoffs = [
            [25.0, 25.0], [20.0, 35.0], [15.0, 40.0],
            [35.0, 20.0], [30.0, 30.0], [18.0, 32.0],
            [40.0, 15.0], [32.0, 18.0], [10.0, 10.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "shared-warehouse-space-allocation",
            "name": "Shared Warehouse Space Allocation",
            "players": self.tenants,
            "actions": {
                self.tenants[0]: actions,
                self.tenants[1]: actions,
            },
            "payoffs": payoffs,
        })


class MultiPartySchedulingGame:
    """Port loading dock scheduling competition."""

    def __init__(self, vessels: Sequence[str] = ("Vessel_A", "Vessel_B")) -> None:
        self.vessels = list(vessels)

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Slot_0800", "Slot_1200", "Slot_1600"]
        payoffs = [
            [-50.0, -50.0], [10.0, 8.0],   [10.0, 5.0],
            [8.0, 10.0],   [-50.0, -50.0], [8.0, 5.0],
            [5.0, 10.0],   [5.0, 8.0],     [-50.0, -50.0],
        ]
        return FiniteNormalFormGame.from_dict({
            "id": "port-dock-scheduling-game",
            "name": "Port Dock Scheduling Conflict",
            "players": self.vessels,
            "actions": {
                self.vessels[0]: actions,
                self.vessels[1]: actions,
            },
            "payoffs": payoffs,
        })
