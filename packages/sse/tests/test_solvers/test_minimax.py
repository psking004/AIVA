from sse.models import FiniteNormalFormGame
from sse.solvers.minimax import MinimaxSolver


def matching_pennies():
    return FiniteNormalFormGame.from_dict({
        "id": "mp",
        "name": "Matching Pennies",
        "players": ["P1", "P2"],
        "actions": {"P1": ["H", "T"], "P2": ["H", "T"]},
        "payoffs": [[1, -1], [-1, 1], [-1, 1], [1, -1]],
    })


def saddle_point_game():
    return FiniteNormalFormGame.from_dict({
        "id": "saddle",
        "name": "Saddle Point Game",
        "players": ["P1", "P2"],
        "actions": {"P1": ["Top", "Bottom"], "P2": ["Left", "Right"]},
        "payoffs": [[3, -3], [2, -2], [4, -4], [1, -1]],
    })


def test_minimax_on_matching_pennies():
    solver = MinimaxSolver()
    res = solver.solve(matching_pennies())
    assert abs(res.game_value - 0.0) < 1e-4
    assert not res.is_pure_saddle_point
    assert res.row_strategy is not None
    assert res.col_strategy is not None
    assert abs(res.row_strategy.probabilities[0] - 0.5) < 1e-4
    assert abs(res.col_strategy.probabilities[0] - 0.5) < 1e-4
    assert res.duality_gap < 1e-4


def test_minimax_saddle_point():
    solver = MinimaxSolver()
    res = solver.solve(saddle_point_game())
    assert res.is_pure_saddle_point
    assert abs(res.game_value - 2.0) < 1e-4
