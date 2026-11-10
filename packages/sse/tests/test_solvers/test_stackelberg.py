from sse.models import FiniteNormalFormGame
from sse.solvers.stackelberg import StackelbergSolver


def market_entry_game():
    return FiniteNormalFormGame.from_dict({
        "id": "entry",
        "name": "Market Entry",
        "players": ["Leader", "Follower"],
        "actions": {
            "Leader": ["Commit_High", "Commit_Low"],
            "Follower": ["Enter", "Stay_Out"],
        },
        "payoffs": [
            [4.0, 1.0], [6.0, 0.0],  # Commit_High: Follower prefers Enter (1>0), Leader gets 4
            [2.0, 3.0], [5.0, 0.0],  # Commit_Low: Follower prefers Enter (3>0), Leader gets 2
        ],
    })


def test_stackelberg_commitment():
    solver = StackelbergSolver()
    res = solver.solve(market_entry_game())
    assert res.leader_action == "Commit_High"
    assert res.follower_action == "Enter"
    assert res.leader_payoff == 4.0
    assert res.follower_payoff == 1.0
