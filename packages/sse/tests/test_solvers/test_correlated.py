from sse.models import FiniteNormalFormGame
from sse.solvers.correlated import CorrelatedEquilibriumSolver


def chicken_traffic_game():
    # Chicken / Traffic intersection game:
    # Stop, Go
    return FiniteNormalFormGame.from_dict({
        "id": "traffic_chicken",
        "name": "Traffic Chicken Game",
        "players": ["Car_1", "Car_2"],
        "actions": {
            "Car_1": ["Stop", "Go"],
            "Car_2": ["Stop", "Go"],
        },
        "payoffs": [
            [0.0, 0.0],  [2.0, 7.0],
            [7.0, 2.0],  [-10.0, -10.0],
        ],
    })


def test_correlated_equilibrium_solves_traffic():
    solver = CorrelatedEquilibriumSolver()
    res = solver.solve(chicken_traffic_game())
    assert res.status == "solved"
    assert res.solution_count >= 1
    assert res.social_welfare > 0.0
    # The collision profile ("Go", "Go") must receive zero probability in an optimal CE
    assert res.joint_distribution.get(("Go", "Go"), 0.0) < 1e-4
