from sse.core.games import (
    CooperativeGame,
    ExtensiveFormGame,
    GameMetadata,
    GameNode,
    RepeatedGame,
)
from sse.core.types import GameFamily
from sse.models import FiniteNormalFormGame


def test_cooperative_game():
    # 3-player airport game
    players = ("A", "B", "C")
    char_vals = {
        frozenset(): 0.0,
        frozenset(["A"]): 10.0,
        frozenset(["B"]): 15.0,
        frozenset(["C"]): 20.0,
        frozenset(["A", "B"]): 25.0,
        frozenset(["A", "C"]): 30.0,
        frozenset(["B", "C"]): 35.0,
        frozenset(["A", "B", "C"]): 50.0,
    }
    game = CooperativeGame(
        metadata=GameMetadata(id="airport", name="Airport Runway", family=GameFamily.COOPERATIVE),
        players=players,
        characteristic_values=char_vals,
    )
    assert game.v(frozenset(["A", "B"])) == 25.0
    assert game.v(game.grand_coalition) == 50.0
    assert game.is_superadditive()


def test_extensive_form_game():
    nodes = {
        "root": GameNode(
            node_id="root",
            node_type="DECISION",
            player_id="P1",
            actions=(("L", "n1"), ("R", "n2")),
        ),
        "n1": GameNode(node_id="n1", node_type="TERMINAL", payoffs=(3.0, 1.0)),
        "n2": GameNode(node_id="n2", node_type="TERMINAL", payoffs=(0.0, 2.0)),
    }
    game = ExtensiveFormGame(
        metadata=GameMetadata(id="simple_efg", name="Simple Tree", family=GameFamily.EXTENSIVE_FORM),
        players=("P1", "P2"),
        root_id="root",
        nodes=nodes,
    )
    assert game.is_perfect_information
    assert len(game.nodes) == 3


def test_repeated_game():
    stage = FiniteNormalFormGame.from_dict({
        "id": "pd", "name": "PD", "players": ["A", "B"],
        "actions": {"A": ["C", "D"], "B": ["C", "D"]},
        "payoffs": [[3, 3], [0, 5], [5, 0], [1, 1]],
    })
    rep_game = RepeatedGame(
        metadata=GameMetadata(id="rep_pd", name="Repeated PD", family=GameFamily.REPEATED),
        stage_game=stage,
        num_rounds=10,
        discount_factor=0.9,
    )
    assert rep_game.num_rounds == 10
    assert rep_game.discount_factor == 0.9
