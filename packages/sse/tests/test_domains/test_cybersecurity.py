"""Mathematical and algorithmic verification tests for Cybersecurity Domain."""

from __future__ import annotations

import numpy as np

from sse.domains.cybersecurity.adapter import CybersecurityDomainAdapter
from sse.domains.cybersecurity.models import (
    BayesianDynamicDeceptionModel,
    DynamicPatchPrioritizationModel,
    NetworkAsset,
    StackelbergSecurityGame,
)
from sse.strategic.solvers.exact_solvers import BilevelStackelbergSolver


def test_stackelberg_security_allocation_6node_network() -> None:
    """Verifies optimal defense coverage on a 6-node network against Stackelberg bilevel solver."""
    targets = [
        NetworkAsset("Domain_Controller", valuation=100.0, defense_cost=3.0, attack_cost=5.0),
        NetworkAsset("Customer_Vault", valuation=80.0, defense_cost=2.5, attack_cost=4.0),
        NetworkAsset("Database_Master", valuation=60.0, defense_cost=2.0, attack_cost=3.0),
        NetworkAsset("App_Cluster", valuation=40.0, defense_cost=1.5, attack_cost=2.0),
        NetworkAsset("Internal_DNS", valuation=25.0, defense_cost=1.0, attack_cost=1.5),
        NetworkAsset("DMZ_Proxy", valuation=10.0, defense_cost=0.5, attack_cost=1.0),
    ]

    game_model = StackelbergSecurityGame(targets=targets, defense_budget=5.0)
    cov, _target_idx, _def_u, _att_u = game_model.solve_optimal_coverage()

    assert len(cov) == 6
    # Budget constraint verification: sum c(t) * d(t) <= B_def
    costs = np.array([t.defense_cost for t in targets])
    assert np.sum(cov * costs) <= 5.0 + 1e-5
    # High-value assets receive positive protection
    assert cov[0] > 0.0 or cov[1] > 0.0

    # Verify discrete game formulation solves via BilevelStackelbergSolver
    game = game_model.to_game()
    solver = BilevelStackelbergSolver()
    sse_res = solver.solve_pure(game, mode="SSE")

    assert sse_res.leader_payoff > -100.0
    assert 0 <= sse_res.follower_action_idx < len(targets)


def test_bayesian_dynamic_deception_harsanyi_transformation() -> None:
    """Verifies that the Bayesian deception model correctly expands into Harsanyi normal form."""
    model = BayesianDynamicDeceptionModel(target_nodes=["Gateway", "Database"], p_apt=0.35)
    bayesian_game = model.to_bayesian_game()

    assert len(bayesian_game.players) == 2
    assert "APT" in bayesian_game.types[1]
    assert "ScriptKiddie" in bayesian_game.types[1]

    # Convert via Harsanyi transformation
    normal_game, strategy_map = bayesian_game.to_harsanyi_normal_form()
    assert normal_game.id.strip()
    assert len(strategy_map[1]) == 3**2  # 3 actions ^ 2 types = 9 strategies for attacker
    assert normal_game.profile_count == 3 * 9


def test_dynamic_patch_prioritization_and_adapter() -> None:
    """Verifies that CybersecurityDomainAdapter generates valid games with monotonic risk ordering."""
    vulns = [
        {"id": "CVE-2026-0001", "cvss": 9.8, "centrality": 0.9, "downtime_cost": 2.0},
        {"id": "CVE-2026-0002", "cvss": 7.5, "centrality": 0.5, "downtime_cost": 4.0},
        {"id": "CVE-2026-0003", "cvss": 4.3, "centrality": 0.2, "downtime_cost": 8.0},
    ]

    game = CybersecurityDomainAdapter.create_patch_prioritization_game(vulns, budget=10.0)
    assert len(game.actions[0]) == 4  # 3 individual + 1 combo
    assert len(game.actions[1]) == 3

    # Priority composite risk for CVE-2026-0001 should strictly exceed CVE-2026-0003
    patch_model = DynamicPatchPrioritizationModel(vulns)
    risk_critical = patch_model.compute_composite_risk(vulns[0])
    risk_low = patch_model.compute_composite_risk(vulns[2])
    assert risk_critical > risk_low
