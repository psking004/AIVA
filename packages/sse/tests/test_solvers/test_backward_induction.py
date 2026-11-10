from sse.core.games import ExtensiveFormGame, GameMetadata, GameNode
from sse.core.types import GameFamily
from sse.solvers.backward_induction import BackwardInductionSolver


def test_backward_induction_simple_tree():
    # Player 1 moves at root (Left or Right)
    # If Left -> Player 2 chooses (Up: (3, 1), Down: (1, 2))
    # If Right -> Player 2 chooses (Up: (0, 0), Down: (2, 4))
    nodes = {
        "root": GameNode(node_id="root", node_type="DECISION", player_id="P1", actions=(("L", "p2_left"), ("R", "p2_right"))),
        "p2_left": GameNode(node_id="p2_left", node_type="DECISION", player_id="P2", actions=(("Up", "t1"), ("Down", "t2"))),
        "p2_right": GameNode(node_id="p2_right", node_type="DECISION", player_id="P2", actions=(("Up", "t3"), ("Down", "t4"))),
        "t1": GameNode(node_id="t1", node_type="TERMINAL", payoffs=(3.0, 1.0)),
        "t2": GameNode(node_id="t2", node_type="TERMINAL", payoffs=(1.0, 2.0)),
        "t3": GameNode(node_id="t3", node_type="TERMINAL", payoffs=(0.0, 0.0)),
        "t4": GameNode(node_id="t4", node_type="TERMINAL", payoffs=(2.0, 4.0)),
    }
    game = ExtensiveFormGame(
        metadata=GameMetadata(id="spne_test", name="SPNE Test", family=GameFamily.EXTENSIVE_FORM),
        players=("P1", "P2"),
        root_id="root",
        nodes=nodes,
    )
    solver = BackwardInductionSolver()
    res = solver.solve(game)

    # Player 2 prefers Down at p2_left (payoff 2 > 1) -> P1 gets 1
    # Player 2 prefers Down at p2_right (payoff 4 > 0) -> P1 gets 2
    # Player 1 compares (1 vs 2) -> chooses Right!
    assert res.optimal_actions["p2_left"] == "Down"
    assert res.optimal_actions["p2_right"] == "Down"
    assert res.optimal_actions["root"] == "R"
    assert res.root_expected_payoffs == (2.0, 4.0)
