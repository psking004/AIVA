import pytest

from sse.models import FiniteNormalFormGame, GameValidationError


def prison_game():
    return FiniteNormalFormGame.from_dict({
        "id": "pd",
        "name": "Prisoner's Dilemma",
        "players": ["A", "B"],
        "actions": {"A": ["C", "D"], "B": ["C", "D"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    })


def test_profile_index_and_payoff():
    game = prison_game()
    assert game.profile_index((1, 0)) == 2
    assert game.payoff((1, 0)) == (5.0, 0.0)
    assert game.action_names((0, 1)) == ("C", "D")


def test_round_trip_dict():
    game = prison_game()
    restored = FiniteNormalFormGame.from_dict(game.to_dict())
    assert restored == game


def test_rejects_wrong_payoff_count():
    with pytest.raises(GameValidationError):
        FiniteNormalFormGame.from_dict({
            "id": "bad", "name": "Bad", "players": ["A", "B"],
            "actions": {"A": ["x", "y"], "B": ["x", "y"]},
            "payoffs": [[1, 1]],
        })


def test_rejects_non_finite_payoff():
    with pytest.raises(GameValidationError):
        FiniteNormalFormGame(
            id="bad", name="Bad",
            players=(__import__("sse.models", fromlist=["Player"]).Player("A", "A"),
                     __import__("sse.models", fromlist=["Player"]).Player("B", "B")),
            actions=(("x",), ("y",)),
            payoffs=((float("nan"), 1.0),),
        )
