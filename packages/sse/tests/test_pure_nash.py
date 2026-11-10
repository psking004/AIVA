from sse.models import FiniteNormalFormGame
from sse.solvers.pure_nash import PureNashSolver


def load_example(name):
    import json
    from pathlib import Path
    return FiniteNormalFormGame.from_dict(
        json.loads((Path(__file__).parents[1] / "examples" / name).read_text())
    )


def test_prisoners_dilemma_has_defect_defect_equilibrium():
    result = PureNashSolver().solve(load_example("prisoners_dilemma.json"))
    assert [eq.actions for eq in result.equilibria] == [("Defect", "Defect")]
    assert result.equilibria[0].payoffs == (1.0, 1.0)
    assert result.metadata is not None and result.metadata.exact


def test_matching_pennies_has_no_pure_equilibrium():
    result = PureNashSolver().solve(load_example("matching_pennies.json"))
    assert result.solution_count == 0


def test_verify_accepts_and_rejects_profiles():
    game = load_example("prisoners_dilemma.json")
    assert PureNashSolver.verify(game, (1, 1))
    assert not PureNashSolver.verify(game, (0, 0))


def test_tolerance_changes_approximate_equilibrium_test():
    game = FiniteNormalFormGame.from_dict({
        "id": "near", "name": "Small-payoff Matching Pennies",
        "players": ["A", "B"],
        "actions": {"A": ["x", "y"], "B": ["x", "y"]},
        "payoffs": [[0.0001, -0.0001], [-0.0001, 0.0001],
                    [-0.0001, 0.0001], [0.0001, -0.0001]],
    })
    exact = PureNashSolver().solve(game)
    approximate = PureNashSolver().solve(game, tolerance=0.001)
    assert exact.solution_count == 0
    assert approximate.solution_count == 4
    assert approximate.metadata is not None and not approximate.metadata.exact
