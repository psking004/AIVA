from sse.models import FiniteNormalFormGame
from sse.solvers.dominant import DominantStrategySolver


def prisoners_dilemma():
    return FiniteNormalFormGame.from_dict({
        "id": "pd",
        "name": "Prisoner's Dilemma",
        "players": ["A", "B"],
        "actions": {"A": ["C", "D"], "B": ["C", "D"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    })


def test_dominant_strategy_finds_defect_defect():
    solver = DominantStrategySolver()
    res = solver.solve(prisoners_dilemma(), strict=True)
    assert res.strictly_dominant["A"] == "D"
    assert res.strictly_dominant["B"] == "D"
    assert res.is_solvable_by_ieds
    assert res.remaining_actions["A"] == ("D",)
    assert res.remaining_actions["B"] == ("D",)
    assert ("A", "C") in res.eliminated_actions
    assert ("B", "C") in res.eliminated_actions
