"""Pre-configured logistics scenarios."""

from __future__ import annotations

from sse.domains.logistics.models import (
    CongestionRoutingGame,
    MultiPartySchedulingGame,
    SharedWarehouseAllocationGame,
)
from sse.models import FiniteNormalFormGame


def simple_freight_routing() -> FiniteNormalFormGame:
    return CongestionRoutingGame().to_game()


def shared_warehouse_allocation() -> FiniteNormalFormGame:
    return SharedWarehouseAllocationGame().to_game()


def dock_scheduling() -> FiniteNormalFormGame:
    return MultiPartySchedulingGame().to_game()

