"""Mathematical and algorithmic verification tests for Social Systems Domain."""

from __future__ import annotations

import pytest

from sse.domains.social.adapters import SocialSystemsAdapter
from sse.domains.social.voting import (
    WeightedVotingBody,
)
from sse.strategic.solvers.exact_solvers import ExactSupportEnumerationSolver


def test_shapley_shubik_and_banzhaf_mathematical_invariants() -> None:
    """Verifies that Shapley-Shubik indices sum to 1.0 and Banzhaf reflects voting power."""
    # Classic voting body [q=51; 48, 48, 4]
    # Here, any two voters form a winning coalition of >= 51.
    # Therefore, all 3 voters are symmetric in power despite unequal weights!
    weights = [48.0, 48.0, 4.0]
    quota = 51.0
    body = WeightedVotingBody(weights=weights, quota=quota, voter_names=["A", "B", "C"])

    # 1. Verify Shapley-Shubik sum == 1.0
    ss = body.shapley_shubik_indices()
    total_ss = sum(ss.values())
    assert pytest.approx(total_ss, abs=1e-6) == 1.0

    # Symmetric swing power check
    assert pytest.approx(ss["A"], rel=1e-3) == 1.0 / 3.0
    assert pytest.approx(ss["B"], rel=1e-3) == 1.0 / 3.0
    assert pytest.approx(ss["C"], rel=1e-3) == 1.0 / 3.0

    # 2. Verify Banzhaf indices
    _abs_b, norm_b = body.penrose_banzhaf_indices()
    assert pytest.approx(sum(norm_b.values()), abs=1e-6) == 1.0
    assert pytest.approx(norm_b["C"], rel=1e-3) == 1.0 / 3.0


def test_dictator_and_dummy_voter_power_indices() -> None:
    """Verifies that a dummy voter receives 0.0 power and a dictator receives 1.0."""
    # [q=60; 70, 20, 10] -> Voter 1 is a dictator (w1 >= q), Voters 2 and 3 are dummies
    body = WeightedVotingBody(weights=[70.0, 20.0, 10.0], quota=60.0, voter_names=["Dictator", "Dummy1", "Dummy2"])
    ss = body.shapley_shubik_indices()

    assert pytest.approx(ss["Dictator"], abs=1e-6) == 1.0
    assert pytest.approx(ss["Dummy1"], abs=1e-6) == 0.0
    assert pytest.approx(ss["Dummy2"], abs=1e-6) == 0.0


def test_ostrom_common_pool_resource_governance() -> None:
    """Verifies Ostrom CPR extraction game with graduated sanctions."""
    game = SocialSystemsAdapter.create_common_pool_resource_game(
        pool_capacity=100.0,
        regeneration_rate=0.20,
        p_inspect=0.40,
        graduated_sanction_factor=3.0,
        extraction_levels=[10.0, 20.0, 40.0],
    )
    assert len(game.actions[0]) == 3
    assert len(game.actions[1]) == 3

    # Solve via exact solver
    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1
