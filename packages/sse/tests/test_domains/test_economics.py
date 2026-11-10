"""Mathematical and algorithmic verification tests for Economics Domain."""

from __future__ import annotations

import pytest

from sse.domains.economics.adapters import EconomicsDomainAdapter
from sse.domains.economics.auctions import MultiUnitAuction
from sse.domains.economics.markets import (
    DifferentiatedBertrandCompetition,
    DynamicCournotOligopoly,
)
from sse.strategic.solvers.exact_solvers import ExactSupportEnumerationSolver


def test_cournot_analytical_nash_equilibrium_convergence() -> None:
    """Verifies that Cournot discretization converges to analytical Cournot-Nash equilibrium."""
    # Market parameters: a = 120, b = 1, c1 = 20, c2 = 20
    # Analytical: q1* = q2* = (120 - 20) / (1 * (2 + 1)) = 100 / 3 = 33.333
    model = DynamicCournotOligopoly(
        firms=("Firm_A", "Firm_B"),
        demand_a=120.0,
        demand_b=1.0,
        marginal_costs=(20.0, 20.0),
    )
    analytical_q = model.analytical_nash_equilibrium()
    assert pytest.approx(analytical_q[0], rel=1e-4) == 33.3333
    assert pytest.approx(analytical_q[1], rel=1e-4) == 33.3333

    # Discretize onto Chebyshev grid around analytical equilibrium
    game = model.discretize(n_points=7, scheme="chebyshev", min_q=20.0, max_q=50.0)

    # Solve via exact Support Enumeration
    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1

    # Check equilibrium strategy concentrates on action nearest to 33.33
    eq = res.equilibria[0]
    supp1 = eq.support_1
    chosen_action = game.actions[0][supp1[0]]
    # Extract numerical value from action string 'q_XX.XX'
    chosen_val = float(chosen_action.replace("q_", ""))
    assert abs(chosen_val - 33.333) < 4.0


def test_differentiated_bertrand_pricing_analytical_solution() -> None:
    """Verifies differentiated Bertrand analytical equilibrium price calculation."""
    # alpha = 40, beta = 2, gamma = 1, c1 = 10, c2 = 10
    # 2*beta*p - gamma*p = alpha + beta*c => 4*p - p = 40 + 20 => 3*p = 60 => p* = 20.0
    bertrand = DifferentiatedBertrandCompetition(
        firms=("Alpha", "Beta"),
        alpha=40.0,
        beta=2.0,
        gamma=1.0,
        marginal_costs=(10.0, 10.0),
    )
    p_star = bertrand.analytical_equilibrium_prices()
    assert pytest.approx(p_star[0], rel=1e-4) == 20.0
    assert pytest.approx(p_star[1], rel=1e-4) == 20.0

    # Test game conversion via adapter
    price_grid = [15.0, 20.0, 25.0]
    game = EconomicsDomainAdapter.create_bertrand_price_war_game(
        firms=("Alpha", "Beta"),
        alpha=40.0,
        beta=2.0,
        gamma=1.0,
        marginal_costs=(10.0, 10.0),
        price_grid=price_grid,
    )
    assert len(game.actions[0]) == 3
    assert len(game.actions[1]) == 3


def test_vickrey_second_price_auction_truthful_dominance() -> None:
    """Mathematically verifies that truthful bidding b_i* = v_i weakly dominates any deviation."""
    auction = MultiUnitAuction(bidders=("Bidder_1", "Bidder_2"), reserve_price=0.0)

    valuations = [10.0, 25.0, 50.0, 75.0]
    deviation_bids = [5.0, 10.0, 15.0, 25.0, 35.0, 50.0, 60.0, 75.0, 90.0]

    # Evaluate weak dominance theorem across all valuation-bid pairs
    is_truthful_dominant = auction.evaluate_second_price_truthful_dominance(
        valuations=valuations,
        deviation_bids=deviation_bids,
    )
    assert is_truthful_dominant is True

    # Test game conversion
    game = auction.to_game(valuations=(50.0, 50.0), bid_levels=[20.0, 50.0, 70.0])
    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1
