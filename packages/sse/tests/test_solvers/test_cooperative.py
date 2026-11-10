from sse.core.games import CooperativeGame, GameMetadata
from sse.core.types import GameFamily
from sse.solvers.cooperative import CooperativeSolvers


def test_cooperative_shapley_and_core():
    # Symmetric 3-player majority voting game: v(S) = 1 if |S| >= 2, else 0
    players = ("A", "B", "C")
    char_vals = {
        frozenset(): 0.0,
        frozenset(["A"]): 0.0,
        frozenset(["B"]): 0.0,
        frozenset(["C"]): 0.0,
        frozenset(["A", "B"]): 1.0,
        frozenset(["A", "C"]): 1.0,
        frozenset(["B", "C"]): 1.0,
        frozenset(["A", "B", "C"]): 1.0,
    }
    game = CooperativeGame(
        metadata=GameMetadata(id="maj_vote", name="Majority Voting", family=GameFamily.COOPERATIVE),
        players=players,
        characteristic_values=char_vals,
    )
    solver = CooperativeSolvers()

    # Shapley value must be exactly 1/3 for each by symmetry
    shapley_res = solver.shapley_value(game)
    for p in players:
        assert abs(shapley_res.shapley_values[p] - 1.0 / 3.0) < 1e-5
    assert abs(shapley_res.efficiency_sum - 1.0) < 1e-5

    # In 3-player majority voting, the core is empty (any 2 players can demand 1.0 between them, so sum >= 1.5 > 1)
    core_res = solver.compute_core(game)
    assert core_res.is_core_empty
