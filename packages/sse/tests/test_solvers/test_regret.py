from sse.models import FiniteNormalFormGame
from sse.solvers.regret import RegretMatchingSolver


def prisoners_dilemma():
    return FiniteNormalFormGame.from_dict({
        "id": "pd",
        "name": "Prisoner's Dilemma",
        "players": ["A", "B"],
        "actions": {"A": ["C", "D"], "B": ["C", "D"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    })


def test_regret_matching_converges_to_defect():
    solver = RegretMatchingSolver()
    res = solver.solve(prisoners_dilemma(), rounds=2000, seed=42)
    assert res.total_rounds == 2000
    strat_a = res.average_strategies["A"]
    strat_b = res.average_strategies["B"]
    # Defect (index 1) should be chosen the vast majority of rounds
    assert strat_a[1] > 0.8
    assert strat_b[1] > 0.8
