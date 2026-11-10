"""Research-grade test suite verifying the 4 mathematical pillars of the Strategic Systems Engine:
1. Exact Equilibrium Solvers (Support Enumeration, Lemke-Howson, Bilevel Stackelberg)
2. Bayesian Incomplete Information (Harsanyi transformation, BNE, continuous utility & risk)
3. Repeated Interaction Monte Carlo Simulator (GTFT, ZD, Adaptive Defender, ESS verification)
4. Canonical Benchmark Invariant Checks (Epsilon-Nash, Minimax identity, Dominance pruning, Stackelberg gain)
"""

import numpy as np

from sse.agents.policies import (
    AdaptiveReciprocalDefender,
    GenerousTitForTatPolicy,
    GreedyMyopicPolicy,
    TitForTatPolicy,
)
from sse.ingestion.payoff_formulator import (
    ContinuousPayoffFormulator,
    DiscretizationScheme,
    RiskPreferences,
)
from sse.models import Player
from sse.models.bayesian import BayesianGame
from sse.simulation.runtime import RepeatedGameRuntime
from sse.strategic.solvers.exact_solvers import (
    BilevelStackelbergSolver,
    ExactSupportEnumerationSolver,
    LemkeHowsonSolver,
)
from sse.verification.benchmarks import (
    CanonicalBenchmarkSuite,
    MathematicalInvariantEngine,
)

# ---------------------------------------------------------------------------
# Module 1 & 4 Tests: Exact Solvers & Mathematical Invariants on Canonical Games
# ---------------------------------------------------------------------------

def test_support_enumeration_prisoners_dilemma():
    """Prisoner's Dilemma has unique strictly dominant pure Nash equilibrium (Defect, Defect)."""
    game = CanonicalBenchmarkSuite.prisoners_dilemma()
    solver = ExactSupportEnumerationSolver()
    result = solver.solve(game)

    assert len(result.equilibria) == 1
    eq = result.equilibria[0]
    assert eq.is_pure
    # Actions: 0=Cooperate, 1=Defect
    assert np.allclose(eq.strategy_1, [0.0, 1.0])
    assert np.allclose(eq.strategy_2, [0.0, 1.0])
    assert abs(eq.payoff_1 - 1.0) < 1e-6
    assert abs(eq.payoff_2 - 1.0) < 1e-6

    # Invariant assertions
    valid_eps, max_dev = MathematicalInvariantEngine.verify_epsilon_nash(game, eq, epsilon_tol=1e-7)
    assert valid_eps
    assert max_dev <= 1e-7

    # Strict dominance assertion: Cooperate is strictly dominated and must have prob 0.0
    assert MathematicalInvariantEngine.verify_strict_dominance_pruning(game, eq)


def test_support_enumeration_matching_pennies():
    """Matching Pennies has unique completely mixed Nash equilibrium (0.5, 0.5)."""
    game = CanonicalBenchmarkSuite.matching_pennies()
    solver = ExactSupportEnumerationSolver()
    result = solver.solve(game)

    assert len(result.equilibria) == 1
    eq = result.equilibria[0]
    assert not eq.is_pure
    assert np.allclose(eq.strategy_1, [0.5, 0.5])
    assert np.allclose(eq.strategy_2, [0.5, 0.5])
    assert abs(eq.payoff_1 - 0.0) < 1e-6
    assert abs(eq.payoff_2 - 0.0) < 1e-6

    # Invariant assertions: Epsilon-Nash & Minimax identity
    valid_eps, _ = MathematicalInvariantEngine.verify_epsilon_nash(game, eq, epsilon_tol=1e-7)
    assert valid_eps

    A = np.array([[1.0, -1.0], [-1.0, 1.0]])
    B = -A
    assert MathematicalInvariantEngine.verify_minimax_identity(A, B, eq, tol=1e-7)


def test_support_enumeration_rock_paper_scissors():
    """Rock-Paper-Scissors has unique completely mixed Nash equilibrium (1/3, 1/3, 1/3)."""
    game = CanonicalBenchmarkSuite.rock_paper_scissors()
    solver = ExactSupportEnumerationSolver()
    result = solver.solve(game)

    assert len(result.equilibria) == 1
    eq = result.equilibria[0]
    assert not eq.is_pure
    expected_prob = 1.0 / 3.0
    assert np.allclose(eq.strategy_1, [expected_prob, expected_prob, expected_prob])
    assert np.allclose(eq.strategy_2, [expected_prob, expected_prob, expected_prob])
    assert abs(eq.payoff_1 - 0.0) < 1e-6

    valid_eps, _ = MathematicalInvariantEngine.verify_epsilon_nash(game, eq, epsilon_tol=1e-7)
    assert valid_eps


def test_support_enumeration_battle_of_the_sexes():
    """Battle of the Sexes has 3 equilibria: 2 pure and 1 mixed."""
    game = CanonicalBenchmarkSuite.battle_of_the_sexes()
    solver = ExactSupportEnumerationSolver()
    result = solver.solve(game)

    assert len(result.equilibria) == 3
    pure_eqs = [eq for eq in result.equilibria if eq.is_pure]
    mixed_eqs = [eq for eq in result.equilibria if not eq.is_pure]

    assert len(pure_eqs) == 2
    assert len(mixed_eqs) == 1

    # Mixed equilibrium is (3/5, 2/5) for P1 and (2/5, 3/5) for P2
    m_eq = mixed_eqs[0]
    assert np.allclose(m_eq.strategy_1, [0.6, 0.4], atol=1e-4)
    assert np.allclose(m_eq.strategy_2, [0.4, 0.6], atol=1e-4)

    for eq in result.equilibria:
        valid_eps, _ = MathematicalInvariantEngine.verify_epsilon_nash(game, eq, epsilon_tol=1e-7)
        assert valid_eps


def test_lemke_howson_solver():
    """Lemke-Howson algorithm finds sample mixed Nash equilibrium."""
    game_mp = CanonicalBenchmarkSuite.matching_pennies()
    lh_solver = LemkeHowsonSolver()
    res_mp = lh_solver.solve(game_mp, initial_dropped_label=0)

    assert np.allclose(res_mp.equilibrium.strategy_1, [0.5, 0.5])
    assert np.allclose(res_mp.equilibrium.strategy_2, [0.5, 0.5])
    assert res_mp.pivots_count > 0

    # Test on Battle of the Sexes: dropping different labels traces different equilibria
    game_bos = CanonicalBenchmarkSuite.battle_of_the_sexes()
    res_bos_0 = lh_solver.solve(game_bos, initial_dropped_label=0)
    res_bos_1 = lh_solver.solve(game_bos, initial_dropped_label=1)

    assert res_bos_0.equilibrium.is_pure
    assert res_bos_1.equilibrium.is_pure
    # The two pure equilibria are (Opera, Opera) and (Football, Football)
    assert not np.allclose(res_bos_0.equilibrium.strategy_1, res_bos_1.equilibrium.strategy_1)


def test_bilevel_stackelberg_solver_and_leadership_gain():
    """Stackelberg leader commitment guarantees leader payoff >= simultaneous Nash payoff."""
    game = CanonicalBenchmarkSuite.stackelberg_market()
    stackelberg_solver = BilevelStackelbergSolver()
    sse_res = stackelberg_solver.solve_pure(game, mode="SSE")
    wse_res = stackelberg_solver.solve_pure(game, mode="WSE")

    # In SSE, leader gets at least what they get in WSE
    assert sse_res.leader_payoff >= wse_res.leader_payoff

    # Simultaneous Nash
    ne_res = ExactSupportEnumerationSolver().solve(game)
    top_ne = ne_res.equilibria[0]

    # Invariant: Leader payoff in SSE >= simultaneous Nash
    assert MathematicalInvariantEngine.verify_stackelberg_leadership_gain(game, top_ne, sse_res)

    # Test mixed Stackelberg
    mixed_sse = stackelberg_solver.solve_mixed(game)
    assert mixed_sse.leader_payoff >= sse_res.leader_payoff - 1e-6


# ---------------------------------------------------------------------------
# Module 2 Tests: Bayesian Game & Continuous Utility Formulator
# ---------------------------------------------------------------------------

def test_bayesian_game_and_harsanyi_transformation():
    """Harsanyi transformation converts Bayesian game into expanded normal form to solve BNE."""
    # 2 players: P1 (Defender), P2 (Attacker).
    # P1 has 1 type (Known). P2 has 2 types: Aggressive (prob 0.6) and Mild (prob 0.4).
    # Actions: P1 in (Defend, Concede), P2 in (Attack, Retreat).
    players = (Player("P1", "Defender"), Player("P2", "Attacker"))
    actions = (("Defend", "Concede"), ("Attack", "Retreat"))
    types = (("Normal",), ("Aggressive", "Mild"))
    prior = {
        ("Normal", "Aggressive"): 0.6,
        ("Normal", "Mild"): 0.4,
    }

    # Payoff tables per type profile:
    # Under Aggressive P2:
    # Defend, Attack: (0, 0); Defend, Retreat: (4, -1); Concede, Attack: (-2, 4); Concede, Retreat: (2, 0)
    # Under Mild P2:
    # Defend, Attack: (2, -2); Defend, Retreat: (4, 0); Concede, Attack: (-1, 2); Concede, Retreat: (2, 0)
    payoff_tables = {
        ("Normal", "Aggressive"): ((0.0, 0.0), (4.0, -1.0), (-2.0, 4.0), (2.0, 0.0)),
        ("Normal", "Mild"): ((2.0, -2.0), (4.0, 0.0), (-1.0, 2.0), (2.0, 0.0)),
    }

    bg = BayesianGame(
        id="deterrence_game",
        name="Security Deterrence Bayesian Game",
        players=players,
        actions=actions,
        types=types,
        prior_distribution=prior,
        payoff_tables=payoff_tables,
    )

    expanded_game, _ = bg.to_harsanyi_normal_form()
    # P1 has 2 strategies. P2 has 2^2 = 4 strategies (one for each type).
    assert len(expanded_game.actions[0]) == 2
    assert len(expanded_game.actions[1]) == 4

    bne_results = bg.solve_bayesian_nash()
    assert len(bne_results) >= 1
    top_bne = bne_results[0]
    assert "P1" in top_bne.player_type_strategies
    assert "P2" in top_bne.player_type_strategies
    # Both types of P2 have strategy distributions
    p2_strats = top_bne.player_type_strategies["P2"]
    assert "Aggressive" in p2_strats
    assert "Mild" in p2_strats


def test_continuous_payoff_formulator_and_discretization():
    """Continuous utility formulation with Chebyshev discretization and CARA/CRRA risk models."""
    # Cournot profit: Revenue = q1 * (30 - (q1 + q2)), Cost = 6 * q1
    def revenue(q1, q2):
        return q1 * max(0.0, 30.0 - (q1 + q2))

    def cost(q1):
        return 6.0 * q1

    # Formulator with CARA risk aversion
    risk_cara = RiskPreferences(risk_model="cara", alpha_cara=0.02)
    formulator_p1 = ContinuousPayoffFormulator(revenue_fn=revenue, cost_fn=cost, risk_preferences=risk_cara)
    formulator_p2 = ContinuousPayoffFormulator(revenue_fn=revenue, cost_fn=cost, risk_preferences=risk_cara)

    game_cheb = ContinuousPayoffFormulator.discretize_bimatrix_game(
        game_id="disc_cournot_cheb",
        name="Discretized Cournot (Chebyshev)",
        player_1_formulator=formulator_p1,
        player_2_formulator=formulator_p2,
        interval_p1=(2.0, 12.0),
        interval_p2=(2.0, 12.0),
        grid_points_p1=6,
        grid_points_p2=6,
        scheme="chebyshev",
    )

    assert len(game_cheb.actions[0]) == 6
    assert len(game_cheb.actions[1]) == 6
    assert len(game_cheb.payoffs) == 36

    # Verify Chebyshev nodes strictly inside interval
    nodes = DiscretizationScheme.chebyshev(2.0, 12.0, 6)
    assert len(nodes) == 6
    assert nodes[0] > 2.0
    assert nodes[-1] < 12.0


# ---------------------------------------------------------------------------
# Module 3 Tests: Repeated Game Runtime & Evolutionary Stability (ESS)
# ---------------------------------------------------------------------------

def test_repeated_game_monte_carlo_and_ess():
    """Repeated interaction runtime across Monte Carlo seeds and Maynard Smith ESS evaluation."""
    # Standard Prisoner's Dilemma matrix: C=0, D=1
    pd_matrix = np.array([
        [[3.0, 3.0], [0.0, 5.0]],
        [[5.0, 0.0], [1.0, 1.0]],
    ])

    runtime = RepeatedGameRuntime(
        payoff_matrix=pd_matrix,
        rounds_t=100,
        discount_factor_delta=0.95,
        trembling_noise=0.03,
        cooperate_action=0,
    )

    tft = TitForTatPolicy("TFT")
    gtft = GenerousTitForTatPolicy("GTFT", defect_penalty=0.35)
    greedy = GreedyMyopicPolicy("Greedy")
    defender = AdaptiveReciprocalDefender("AdaptiveDefender", window_size=5)

    # 1. Run Monte Carlo simulation across 20 seeds
    summary_tft_vs_greedy = runtime.run_monte_carlo(tft, greedy, n_seeds=20, base_seed=42)
    assert summary_tft_vs_greedy.trials_count == 20
    assert summary_tft_vs_greedy.mean_discounted_payoff_p1 > 0.0

    summary_defender = runtime.run_monte_carlo(defender, greedy, n_seeds=20, base_seed=42)
    assert summary_defender.trials_count == 20

    # 2. GTFT should maintain higher cooperation than pure greedy
    summary_gtft = runtime.run_monte_carlo(gtft, gtft, n_seeds=20, base_seed=100)
    assert summary_gtft.mean_cooperation_rate_p1 > 0.50

    # 3. Evolutionary Stability (ESS) Verification:
    # Defector (Greedy) population cannot be invaded by a pure cooperator in standard stage-game PD
    ess_result = runtime.verify_evolutionary_stability(
        resident_policy=greedy,
        mutant_policy=tft,
        n_seeds=20,
        base_seed=200,
    )
    # Greedy resident against itself vs TFT mutant against Greedy
    assert ess_result.is_evolutionary_stable
    assert ess_result.stability_condition in ("STRICT_NASH", "SECOND_ORDER_INVASION_RESISTANT")
