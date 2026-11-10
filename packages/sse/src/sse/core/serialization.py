"""Serialization and deserialization framework for strategic game models."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from sse.core.actions import DiscreteActionSpace
from sse.core.games import (
    CooperativeGame,
    EvolutionaryGame,
    ExtensiveFormGame,
    GameMetadata,
    GameNode,
    RepeatedGame,
    StackelbergGame,
)
from sse.core.information import InformationSet
from sse.core.payoffs import PayoffMatrix
from sse.core.types import GameFamily, PlayerId
from sse.models import FiniteNormalFormGame

SERIALIZATION_VERSION = "1.0"

# Registry mapping GameFamily to (serializer_func, deserializer_func)
_GAME_REGISTRY: dict[
    GameFamily,
    tuple[Callable[[Any], dict[str, Any]], Callable[[dict[str, Any]], Any]],
] = {}


def register_game_type(
    family: GameFamily,
    serializer: Callable[[Any], dict[str, Any]],
    deserializer: Callable[[dict[str, Any]], Any],
) -> None:
    """Register serializer and deserializer callables for a game family."""
    if not isinstance(family, GameFamily):
        raise TypeError(f"family must be a GameFamily enum member, got {type(family).__name__}.")
    _GAME_REGISTRY[family] = (serializer, deserializer)


def serialize_metadata(meta: GameMetadata) -> dict[str, Any]:
    """Serialize a GameMetadata object to a JSON-compatible dictionary."""
    return {
        "id": meta.id,
        "name": meta.name,
        "family": meta.family.value,
        "description": meta.description,
        "version": meta.version,
        "created_at": meta.created_at.isoformat(),
    }


def deserialize_metadata(data: dict[str, Any]) -> GameMetadata:
    """Deserialize a dictionary to a GameMetadata instance."""
    created_at_raw = data.get("created_at")
    if created_at_raw:
        try:
            created_at = datetime.fromisoformat(str(created_at_raw))
        except (ValueError, TypeError):
            created_at = datetime.now(UTC)
    else:
        created_at = datetime.now(UTC)

    return GameMetadata(
        id=str(data["id"]),
        name=str(data["name"]),
        family=GameFamily(str(data["family"])),
        description=str(data.get("description", "")),
        version=str(data.get("version", "1.0")),
        created_at=created_at,
    )


# ---------------------------------------------------------------------------
# Serializers and Deserializers for Built-in Models
# ---------------------------------------------------------------------------


def _serialize_normal_form(game: FiniteNormalFormGame) -> dict[str, Any]:
    doc = game.to_dict()
    doc["serialization_version"] = SERIALIZATION_VERSION
    doc["family"] = GameFamily.NORMAL_FORM.value
    return doc


def _deserialize_normal_form(data: dict[str, Any]) -> FiniteNormalFormGame:
    return FiniteNormalFormGame.from_dict(data)


def _serialize_cooperative(game: CooperativeGame) -> dict[str, Any]:
    coalition_values: dict[str, float] = {}
    for coalition in game.all_coalitions():
        key = ",".join(sorted(coalition))
        coalition_values[key] = float(game.characteristic_function(coalition))

    return {
        "serialization_version": SERIALIZATION_VERSION,
        "family": GameFamily.COOPERATIVE.value,
        "metadata": serialize_metadata(game.metadata),
        "players": list(game.players),
        "coalition_values": coalition_values,
    }


def _deserialize_cooperative(data: dict[str, Any]) -> CooperativeGame:
    metadata = deserialize_metadata(data["metadata"])
    players = tuple(str(p) for p in data["players"])
    coalition_values = {
        str(k): float(v) for k, v in data.get("coalition_values", {}).items()
    }

    def characteristic_fn(coalition: frozenset[PlayerId]) -> float:
        key = ",".join(sorted(coalition))
        return coalition_values.get(key, 0.0)

    return CooperativeGame(
        metadata=metadata,
        players=players,
        characteristic_function=characteristic_fn,
    )


def _serialize_repeated(game: RepeatedGame) -> dict[str, Any]:
    return {
        "serialization_version": SERIALIZATION_VERSION,
        "family": GameFamily.REPEATED.value,
        "metadata": serialize_metadata(game.metadata),
        "stage_game": game.stage_game.to_dict(),
        "num_rounds": game.num_rounds,
        "discount_factor": float(game.discount_factor),
    }


def _deserialize_repeated(data: dict[str, Any]) -> RepeatedGame:
    metadata = deserialize_metadata(data["metadata"])
    stage_game = FiniteNormalFormGame.from_dict(data["stage_game"])
    num_rounds = int(data["num_rounds"]) if data.get("num_rounds") is not None else None
    discount = float(data.get("discount_factor", 1.0))
    return RepeatedGame(
        metadata=metadata,
        stage_game=stage_game,
        num_rounds=num_rounds,
        discount_factor=discount,
    )


def _serialize_evolutionary(game: EvolutionaryGame) -> dict[str, Any]:
    return {
        "serialization_version": SERIALIZATION_VERSION,
        "family": GameFamily.EVOLUTIONARY.value,
        "metadata": serialize_metadata(game.metadata),
        "strategies": list(game.strategies),
        "payoff_matrix": {
            "num_players": game.payoff_matrix.num_players,
            "action_counts": list(game.payoff_matrix.action_counts),
            "payoffs": [list(row) for row in game.payoff_matrix.payoffs],
        },
    }


def _deserialize_evolutionary(data: dict[str, Any]) -> EvolutionaryGame:
    metadata = deserialize_metadata(data["metadata"])
    strategies = tuple(str(s) for s in data["strategies"])
    pm_data = data["payoff_matrix"]
    payoff_matrix = PayoffMatrix(
        num_players=int(pm_data["num_players"]),
        action_counts=pm_data["action_counts"],
        payoffs=pm_data["payoffs"],
    )
    return EvolutionaryGame(
        metadata=metadata,
        strategies=strategies,
        payoff_matrix=payoff_matrix,
    )


def _serialize_stackelberg(game: StackelbergGame) -> dict[str, Any]:
    return {
        "serialization_version": SERIALIZATION_VERSION,
        "family": GameFamily.STACKELBERG.value,
        "metadata": serialize_metadata(game.metadata),
        "leader": game.leader,
        "follower": game.follower,
        "leader_actions": game.leader_actions.to_list(),
        "follower_actions": game.follower_actions.to_list(),
        "leader_payoff": {
            "num_players": game.leader_payoff.num_players,
            "action_counts": list(game.leader_payoff.action_counts),
            "payoffs": [list(r) for r in game.leader_payoff.payoffs],
        },
        "follower_payoff": {
            "num_players": game.follower_payoff.num_players,
            "action_counts": list(game.follower_payoff.action_counts),
            "payoffs": [list(r) for r in game.follower_payoff.payoffs],
        },
    }


def _deserialize_stackelberg(data: dict[str, Any]) -> StackelbergGame:
    metadata = deserialize_metadata(data["metadata"])
    leader = str(data["leader"])
    follower = str(data["follower"])
    leader_actions = DiscreteActionSpace(data["leader_actions"])
    follower_actions = DiscreteActionSpace(data["follower_actions"])
    lp = data["leader_payoff"]
    fp = data["follower_payoff"]
    leader_payoff = PayoffMatrix(lp["num_players"], lp["action_counts"], lp["payoffs"])
    follower_payoff = PayoffMatrix(fp["num_players"], fp["action_counts"], fp["payoffs"])
    return StackelbergGame(
        metadata=metadata,
        leader=leader,
        follower=follower,
        leader_actions=leader_actions,
        follower_actions=follower_actions,
        leader_payoff=leader_payoff,
        follower_payoff=follower_payoff,
    )


def _serialize_extensive(game: ExtensiveFormGame) -> dict[str, Any]:
    serialized_nodes: dict[str, Any] = {}
    for nid, node in game.nodes.items():
        serialized_nodes[nid] = {
            "node_id": node.node_id,
            "node_type": node.node_type,
            "player_id": node.player_id,
            "info_set_id": node.info_set_id,
            "actions": [list(item) for item in node.actions],
            "payoffs": list(node.payoffs) if node.payoffs is not None else None,
            "chance_probs": list(node.chance_probs) if node.chance_probs is not None else None,
        }

    serialized_info_sets = [
        {
            "id": iset.id,
            "player_id": iset.player_id,
            "available_actions": list(iset.available_actions),
            "node_ids": list(iset.node_ids),
        }
        for iset in game.information_sets
    ]

    return {
        "serialization_version": SERIALIZATION_VERSION,
        "family": GameFamily.EXTENSIVE_FORM.value,
        "metadata": serialize_metadata(game.metadata),
        "players": list(game.players),
        "root_id": game.root_id,
        "nodes": serialized_nodes,
        "information_sets": serialized_info_sets,
    }


def _deserialize_extensive(data: dict[str, Any]) -> ExtensiveFormGame:
    metadata = deserialize_metadata(data["metadata"])
    players = tuple(str(p) for p in data["players"])
    root_id = str(data["root_id"])

    nodes: dict[str, GameNode] = {}
    for nid, ndata in data["nodes"].items():
        actions = tuple(tuple(item) for item in ndata.get("actions", ()))
        payoffs = tuple(ndata["payoffs"]) if ndata.get("payoffs") is not None else None
        chance_probs = tuple(ndata["chance_probs"]) if ndata.get("chance_probs") is not None else None
        nodes[nid] = GameNode(
            node_id=str(ndata["node_id"]),
            node_type=str(ndata["node_type"]),
            player_id=ndata.get("player_id"),
            info_set_id=ndata.get("info_set_id"),
            actions=actions,
            payoffs=payoffs,
            chance_probs=chance_probs,
        )

    info_sets: list[InformationSet] = []
    for iset_data in data.get("information_sets", ()):
        info_sets.append(
            InformationSet(
                id=str(iset_data["id"]),
                player_id=str(iset_data["player_id"]),
                available_actions=iset_data["available_actions"],
                node_ids=iset_data.get("node_ids", ()),
            )
        )

    return ExtensiveFormGame(
        metadata=metadata,
        players=players,
        nodes=nodes,
        root_id=root_id,
        information_sets=tuple(info_sets),
    )


def _serialize_callable_metadata_only(game: Any) -> dict[str, Any]:
    """Fallback serializer for games with functional/callable components."""
    family = getattr(game.metadata, "family", None)
    family_val = family.value if family else type(game).__name__
    return {
        "serialization_version": SERIALIZATION_VERSION,
        "family": family_val,
        "metadata": serialize_metadata(game.metadata),
        "note": (
            f"Game type {family_val} contains runtime callable functions "
            "which cannot be statically serialized; callables must be re-attached."
        ),
    }


def _deserialize_callable_metadata_only(data: dict[str, Any]) -> dict[str, Any]:
    """Fallback deserializer for functional games; returns envelope dictionary."""
    return data


# Register default game serializers
register_game_type(GameFamily.NORMAL_FORM, _serialize_normal_form, _deserialize_normal_form)
register_game_type(GameFamily.COOPERATIVE, _serialize_cooperative, _deserialize_cooperative)
register_game_type(GameFamily.REPEATED, _serialize_repeated, _deserialize_repeated)
register_game_type(GameFamily.EVOLUTIONARY, _serialize_evolutionary, _deserialize_evolutionary)
register_game_type(GameFamily.STACKELBERG, _serialize_stackelberg, _deserialize_stackelberg)
register_game_type(GameFamily.EXTENSIVE_FORM, _serialize_extensive, _deserialize_extensive)
register_game_type(GameFamily.BAYESIAN, _serialize_callable_metadata_only, _deserialize_callable_metadata_only)
register_game_type(GameFamily.STOCHASTIC, _serialize_callable_metadata_only, _deserialize_callable_metadata_only)
register_game_type(GameFamily.CONGESTION, _serialize_callable_metadata_only, _deserialize_callable_metadata_only)
register_game_type(GameFamily.POTENTIAL, _serialize_callable_metadata_only, _deserialize_callable_metadata_only)


def serialize_game(game: Any) -> dict[str, Any]:
    """Serialize any registered strategic game model to a JSON-compatible dictionary."""
    if isinstance(game, FiniteNormalFormGame):
        return _serialize_normal_form(game)

    if hasattr(game, "metadata") and isinstance(game.metadata, GameMetadata):
        family = game.metadata.family
        if family in _GAME_REGISTRY:
            serializer, _ = _GAME_REGISTRY[family]
            return serializer(game)

    raise ValueError(f"No serializer registered for game type {type(game).__name__}.")


def deserialize_game(data: dict[str, Any]) -> Any:
    """Deserialize a dictionary representation back into its strategic game model."""
    if "family" in data:
        family_str = str(data["family"])
        try:
            family = GameFamily(family_str)
        except ValueError as exc:
            raise ValueError(f"Unrecognized GameFamily '{family_str}'.") from exc

        if family in _GAME_REGISTRY:
            _, deserializer = _GAME_REGISTRY[family]
            return deserializer(data)
        raise ValueError(f"No deserializer registered for GameFamily '{family}'.")

    # If legacy FiniteNormalFormGame JSON schema (without family)
    if "players" in data and "actions" in data and "payoffs" in data:
        return FiniteNormalFormGame.from_dict(data)

    raise ValueError("Cannot determine game family from serialized document.")
