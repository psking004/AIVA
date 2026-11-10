from sse.models import FiniteNormalFormGame
from sse.solvers.mixed_nash import SupportEnumerationSolver


def matching_pennies():
    return FiniteNormalFormGame.from_dict({
        "id": "mp",
        "name": "Matching Pennies",
        "players": ["P1", "P2"],
        "actions": {"P1": ["H", "T"], "P2": ["H", "T"]},
        "payoffs": [[1, -1], [-1, 1], [-1, 1], [1, -1]],
    })


def rock_paper_scissors():
    return FiniteNormalFormGame.from_dict({
        "id": "rps",
        "name": "Rock Paper Scissors",
        "players": ["P1", "P2"],
        "actions": {"P1": ["R", "P", "S"], "P2": ["R", "P", "S"]},
        "payoffs": [
            [0, 0], [-1, 1], [1, -1],
            [1, -1], [0, 0], [-1, 1],
            [-1, 1], [1, -1], [0, 0],
        ],
    })


def test_matching_pennies_has_50_50_mixed_equilibrium():
    solver = SupportEnumerationSolver()
    res = solver.solve(matching_pennies())
    assert res.solution_count == 1
    eq = res.equilibria[0]
    p = eq.strategies[0].probabilities
    q = eq.strategies[1].probabilities
    assert abs(p[0] - 0.5) < 1e-5
    assert abs(p[1] - 0.5) < 1e-5
    assert abs(q[0] - 0.5) < 1e-5
    assert abs(q[1] - 0.5) < 1e-5
    assert abs(eq.expected_payoffs[0] - 0.0) < 1e-5
    assert abs(eq.expected_payoffs[1] - 0.0) < 1e-5


def test_rock_paper_scissors_mixed_equilibrium():
    solver = SupportEnumerationSolver()
    res = solver.solve(rock_paper_scissors())
    assert res.solution_count == 1
    eq = res.equilibria[0]
    p = eq.strategies[0].probabilities
    q = eq.strategies[1].probabilities
    for prob in p:
        assert abs(prob - 1.0 / 3.0) < 1e-5
    for prob in q:
        assert abs(prob - 1.0 / 3.0) < 1e-5


def test_independent_verification_hook():
    game = matching_pennies()
    assert SupportEnumerationSolver.verify(game, (0.5, 0.5), (0.5, 0.5))
    assert not SupportEnumerationSolver.verify(game, (1.0, 0.0), (0.5, 0.5))
