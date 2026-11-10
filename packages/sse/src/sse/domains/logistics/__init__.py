"""Logistics domain extension package."""

from sse.domains.logistics.adapters import LogisticsDomainAdapter
from sse.domains.logistics.models import (
    CongestionRoutingGame,
    MultiPartySchedulingGame,
    SharedWarehouseAllocationGame,
)
from sse.domains.logistics.scenarios import (
    dock_scheduling,
    shared_warehouse_allocation,
    simple_freight_routing,
)
from sse.domains.logistics.supply_chain import (
    ClusterComputeRoutingGame,
    ComputeNodeProfile,
    MultiEchelonInventoryGame,
)
from sse.models import FiniteNormalFormGame


class LogisticsDomain:
    name = "logistics"
    description = "Freight routing, warehouse space allocation, and dock scheduling games."

    def list_scenarios(self) -> list[str]:
        return [
            "simple_freight_routing",
            "shared_warehouse_allocation",
            "dock_scheduling",
        ]

    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        factories = {
            "simple_freight_routing": simple_freight_routing,
            "shared_warehouse_allocation": shared_warehouse_allocation,
            "dock_scheduling": dock_scheduling,
        }
        if name not in factories:
            raise KeyError(f"Scenario '{name}' not found in logistics domain.")
        return factories[name]()


__all__ = [
    "ClusterComputeRoutingGame",
    "ComputeNodeProfile",
    "CongestionRoutingGame",
    "LogisticsDomain",
    "LogisticsDomainAdapter",
    "MultiEchelonInventoryGame",
    "MultiPartySchedulingGame",
    "SharedWarehouseAllocationGame",
    "dock_scheduling",
    "shared_warehouse_allocation",
    "simple_freight_routing",
]
