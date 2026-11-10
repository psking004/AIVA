from sse.agents.strategies import FixedStrategyAgent, RandomAgent
from sse.core.actions import DiscreteActionSpace
from sse.models import FiniteNormalFormGame
from sse.simulation.engine import SimulationConfig, SimulationEngine


def prisoners_dilemma():
    return FiniteNormalFormGame.from_dict({
        "id": "pd",
        "name": "Prisoner's Dilemma",
        "players": ["A", "B"],
        "actions": {"A": ["C", "D"], "B": ["C", "D"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    })


def test_simulation_repeated_deterministic():
    game = prisoners_dilemma()
    engine = SimulationEngine()
    s_a = DiscreteActionSpace(game.actions[0])
    s_b = DiscreteActionSpace(game.actions[1])

    # A plays C always, B plays D always
    strat = {
        "A": FixedStrategyAgent("A", s_a, "C"),
        "B": FixedStrategyAgent("B", s_b, "D"),
    }
    cfg = SimulationConfig(max_steps=10)
    res = engine.run_repeated(game, strat, num_rounds=10, config=cfg)
    assert len(res.steps) == 10
    # Every round A gets 0, B gets 5
    assert res.total_payoffs["A"] == 0.0
    assert res.total_payoffs["B"] == 50.0


def test_monte_carlo_runs_multiple_seeds():
    game = prisoners_dilemma()
    engine = SimulationEngine()
    s_a = DiscreteActionSpace(game.actions[0])
    s_b = DiscreteActionSpace(game.actions[1])

    strat = {
        "A": RandomAgent("A", s_a),
        "B": RandomAgent("B", s_b),
    }
    results = engine.run_monte_carlo(
        game, strat, num_samples=5, config=SimulationConfig(seed=100, max_steps=1)
    )

    assert len(results) == 5
    for r in results:
        assert len(r.steps) == 1
