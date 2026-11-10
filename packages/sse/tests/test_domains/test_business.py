"""Mathematical and algorithmic verification tests for Business Strategy Domain."""

from __future__ import annotations

import pytest

from sse.domains.business.adapters import BusinessStrategyAdapter
from sse.domains.business.strategy import DixitEntryPreemption
from sse.strategic.solvers.exact_solvers import ExactSupportEnumerationSolver


def test_dixit_entry_preemption_threshold_and_deterrence() -> None:
    """Verifies that Dixit preemption capacity threshold accurately deters entrant entry."""
    # Market parameters: a = 120, b = 1, w = 20, r = 10, F = 225
    # a - w - r = 90
    # Monopoly Q_M = 90 / 2 = 45.0, pi_M = 45^2 = 2025.0
    # k_preempt = 90 - 2 * sqrt(1 * 225) = 90 - 2 * 15 = 60.0
    model = DixitEntryPreemption(
        demand_a=120.0,
        demand_b=1.0,
        variable_cost_w=20.0,
        capacity_cost_r=10.0,
        fixed_entry_cost_f=225.0,
    )
    benchmarks = model.compute_preemption_thresholds()

    assert pytest.approx(benchmarks["q_monopoly"], rel=1e-4) == 45.0
    assert pytest.approx(benchmarks["pi_monopoly"], rel=1e-4) == 2025.0
    assert pytest.approx(benchmarks["k_preempt"], rel=1e-4) == 60.0

    # Build game across three capacity levels: Sub-preempt (30.0), Preempt (60.0), Over-capacity (75.0)
    game = model.to_game(capacity_levels=[30.0, 60.0, 75.0])

    # In game: Incumbent is P1, Entrant is P2 ("Enter", "Stay_Out")
    # For Cap_60.0, entrant payoff when entering should be non-positive (<= 0.0)
    # actions[0] has [Cap_30.0, Cap_60.0, Cap_75.0]
    # payoffs for (Cap_60.0, Enter) is index 2 in row: 1*2 + 0 = index 2 in payoffs
    # Let's inspect payoffs directly
    payoff_tensor = game.payoffs
    # Payoff profile for Cap_60.0 and Enter: profile index 2
    u_ent_enter_60 = payoff_tensor[2][1]
    assert u_ent_enter_60 <= 0.0, f"Entrant profit at k_preempt must be <= 0, got {u_ent_enter_60}"

    # For Cap_30.0 and Enter: entrant should earn strictly positive operating profit
    u_ent_enter_30 = payoff_tensor[0][1]
    assert u_ent_enter_30 > 0.0, f"Entrant should make profit at low capacity, got {u_ent_enter_30}"


def test_two_sided_platform_pricing_and_adapter() -> None:
    """Verifies that TwoSidedPlatformPricing game generates valid payoffs and solves via support enumeration."""
    game = BusinessStrategyAdapter.create_platform_pricing_game(
        alpha_cross=0.8,
        beta_cross=1.2,
        user_prices=[0.0, 5.0, 10.0],
        dev_prices=[-5.0, 0.0, 5.0],
    )
    assert len(game.actions[0]) == 3
    assert len(game.actions[1]) == 3

    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1
    for eq in res.equilibria:
        assert eq.is_epsilon_equilibrium
