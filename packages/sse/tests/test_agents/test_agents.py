from sse.agents.learning import QLearningAgent
from sse.agents.strategies import (
    TitForTatAgent,
)
from sse.agents.tournament import Tournament
from sse.core.actions import DiscreteActionSpace
from sse.models import FiniteNormalFormGame


def prisoners_dilemma():
    return FiniteNormalFormGame.from_dict({
        "id": "pd",
        "name": "Prisoner's Dilemma",
        "players": ["A", "B"],
        "actions": {"A": ["Cooperate", "Defect"], "B": ["Cooperate", "Defect"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    })


def test_tit_for_tat_mutual_cooperation():
    space = DiscreteActionSpace(("Cooperate", "Defect"))
    tft1 = TitForTatAgent("TFT1", space)
    tft2 = TitForTatAgent("TFT2", space)

    game = prisoners_dilemma()
    tourney = Tournament(game, [tft1, tft2], rounds_per_match=20)
    res = tourney.run()

    # Both TFT cooperate for all 20 rounds, yielding 3*20 = 60 each
    match = res.matches[0]
    assert match.agent1_total_payoff == 60.0
    assert match.agent2_total_payoff == 60.0


def test_q_learning_agent_learns_defect():
    prisoners_dilemma()
    space = DiscreteActionSpace(("Cooperate", "Defect"))
    from sse.agents.base import AgentConfig
    agent = QLearningAgent("QLearn", space, config=AgentConfig(learning_rate=0.2, discount_factor=0.0, exploration_rate=0.3, seed=42))

    # Train against fixed opponent for 400 steps
    for _ in range(400):
        action = agent.select_action("state_0")
        reward = 5.0 if action == "Defect" else 3.0
        agent.update(action, reward, next_observation="state_0")

    # Q-value for Defect must be strictly greater than Cooperate (5.0 vs 3.0)
    q_vals = agent.q_table["state_0"]
    assert q_vals["Defect"] > q_vals["Cooperate"]
