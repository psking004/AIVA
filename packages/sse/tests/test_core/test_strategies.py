import pytest

from sse.core.actions import DiscreteActionSpace
from sse.core.strategies import (
    MixedStrategy,
    PureStrategy,
    StrategyProfile,
)


def test_mixed_strategy_support_and_expected_payoff():
    space = DiscreteActionSpace(("Heads", "Tails"))
    strat = MixedStrategy(
        player_id="P1",
        action_space=space,
        probabilities=(0.5, 0.5),
    )
    assert strat.support() == ("Heads", "Tails")
    payoff_map = {"Heads": 1.0, "Tails": -1.0}
    assert strat.expected_payoff(payoff_map) == 0.0


def test_mixed_strategy_validation():
    space = DiscreteActionSpace(("A", "B"))
    with pytest.raises(ValueError):
        # Probabilities do not sum to 1
        MixedStrategy("P1", space, (0.5, 0.6))

    with pytest.raises(ValueError):
        # Negative probability
        MixedStrategy("P1", space, (-0.1, 1.1))


def test_strategy_profile():
    DiscreteActionSpace(("C", "D"))
    DiscreteActionSpace(("C", "D"))
    strat1 = PureStrategy(player_id="P1", action="C")
    strat2 = PureStrategy(player_id="P2", action="D")

    profile = StrategyProfile(strategies={"P1": strat1, "P2": strat2})
    assert profile.get_strategy("P1").action == "C"
    assert profile.get_strategy("P2").action == "D"
