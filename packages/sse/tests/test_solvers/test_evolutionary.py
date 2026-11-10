from sse.solvers.evolutionary import EvolutionarySolver


def test_hawk_dove_replicator_dynamics():
    # Symmetric 2-player Hawk-Dove game payoff matrix:
    # V = 4, C = 6
    # Hawk vs Hawk: (4-6)/2 = -1
    # Hawk vs Dove: 4
    # Dove vs Hawk: 0
    # Dove vs Dove: 2
    # Analytical ESS: p(Hawk) = V/C = 4/6 = 2/3 ≈ 0.6667
    A = [
        [-1.0, 4.0],
        [0.0, 2.0],
    ]
    solver = EvolutionarySolver()
    res = solver.replicator_dynamics(A, initial_pop=[0.2, 0.8], dt=0.02, max_steps=4000)
    assert res.converged
    final_p = res.final_state
    assert abs(final_p[0] - 2.0 / 3.0) < 0.05
    assert abs(final_p[1] - 1.0 / 3.0) < 0.05


def test_pure_ess_prisoners_dilemma():
    strats = ["Cooperate", "Defect"]
    # Payoffs against Cooperate, Defect
    A = [
        [3.0, 0.0],
        [5.0, 1.0],
    ]
    solver = EvolutionarySolver()
    res = solver.find_pure_ess(strats, A)
    # Defect is the unique strict Nash and thus unique pure ESS
    assert res.pure_ess_strategies == ("Defect",)
