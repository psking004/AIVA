"""Pre-configured cybersecurity scenarios."""

from __future__ import annotations

from sse.domains.cybersecurity.models import (
    AttackerDefenderGame,
    SecurityInvestmentGame,
)
from sse.models import FiniteNormalFormGame


def simple_network_defense() -> FiniteNormalFormGame:
    """Two-target server defense vs attack scenario."""
    return AttackerDefenderGame(
        targets=["Database_Server", "Web_Server"],
        target_values=[10.0, 4.0],
        defense_cost=1.5,
    ).to_game()


def apt_defense_scenario() -> FiniteNormalFormGame:
    """Advanced Persistent Threat defense across 3 critical tiers."""
    return AttackerDefenderGame(
        targets=["Domain_Controller", "Customer_Vault", "DMZ_Proxy"],
        target_values=[25.0, 15.0, 5.0],
        defense_cost=3.0,
    ).to_game()


def security_investment_2firm() -> FiniteNormalFormGame:
    """Interdependent firm security investment under breach risks."""
    return SecurityInvestmentGame().to_game()

