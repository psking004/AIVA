"""Universal strategic game representations across all foundational game families."""

from __future__ import annotations

import itertools
import math
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sse.core.actions import DiscreteActionSpace
from sse.core.information import BeliefDistribution, InformationSet
from sse.core.payoffs import PayoffMatrix
from sse.core.types import ActionId, GameFamily, PlayerId
from sse.models import FiniteNormalFormGame, GameValidationError  # backward compat


class GameContractError(GameValidationError):
    """Raised when a game definition or operation violates mathematical constraints."""



@dataclass(frozen=True, slots=True)
class GameMetadata:
    """Universal provenance, naming, and classification metadata for game models."""

    id: str
    name: str
    family: GameFamily
    description: str = ""
    version: str = "1.0"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not self.id.strip():
            raise ValueError("GameMetadata id must be a non-empty string.")
        if not isinstance(self.name, str) or not self.name.strip():
            raise ValueError("GameMetadata name must not be empty.")
        if not isinstance(self.family, GameFamily):
            raise TypeError(f"GameMetadata family must be a GameFamily enum, got {type(self.family).__name__}.")


@dataclass(frozen=True, slots=True)
class GameNode:
    """A node in an extensive-form game tree (decision, chance, or terminal)."""

    node_id: str
    node_type: str  # DECISION, CHANCE, TERMINAL
    player_id: PlayerId | None = None
    info_set_id: str | None = None
    actions: tuple[tuple[ActionId, str], ...] = ()
    payoffs: tuple[float, ...] | None = None
    chance_probs: tuple[float, ...] | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.node_id, str) or not self.node_id.strip():
            raise ValueError("GameNode node_id must be a non-empty string.")
        normalized_type = self.node_type.strip().upper()
        if normalized_type not in ("DECISION", "CHANCE", "TERMINAL"):
            raise ValueError(f"node_type must be DECISION, CHANCE, or TERMINAL, got '{self.node_type}'.")

        if normalized_type == "DECISION":
            if self.player_id is None or not str(self.player_id).strip():
                raise ValueError("DECISION node must specify a valid player_id.")
            if not self.actions:
                raise ValueError("DECISION node must have at least one outgoing action branch.")
            if self.payoffs is not None:
                raise ValueError("DECISION node cannot specify terminal payoffs.")
            if self.chance_probs is not None:
                raise ValueError("DECISION node cannot specify chance probabilities.")

        elif normalized_type == "CHANCE":
            if not self.actions:
                raise ValueError("CHANCE node must have at least one outgoing outcome branch.")
            if self.chance_probs is None:
                raise ValueError("CHANCE node must specify chance_probs.")
            if len(self.chance_probs) != len(self.actions):
                raise ValueError(
                    f"CHANCE node chance_probs length ({len(self.chance_probs)}) must match actions ({len(self.actions)})."
                )
            for p in self.chance_probs:
                if not math.isfinite(p) or p < -1e-12:
                    raise ValueError(f"Chance probability {p} must be a non-negative finite float.")
            total_prob = sum(self.chance_probs)
            if abs(total_prob - 1.0) > 1e-9:
                raise ValueError(f"CHANCE node probabilities must sum to 1.0, got {total_prob:.10f}.")
            if self.payoffs is not None:
                raise ValueError("CHANCE node cannot specify terminal payoffs.")

        elif normalized_type == "TERMINAL":
            if self.payoffs is None:
                raise ValueError("TERMINAL node must specify a payoffs tuple.")
            if not self.payoffs:
                raise ValueError("TERMINAL node payoffs must not be empty.")
            for val in self.payoffs:
                if not math.isfinite(val):
                    raise ValueError(f"Payoff {val} must be a finite float.")
            if self.actions:
                raise ValueError("TERMINAL node cannot have outgoing actions.")
            if self.chance_probs is not None:
                raise ValueError("TERMINAL node cannot specify chance probabilities.")


@dataclass(frozen=True, slots=True)
class ExtensiveFormGame:
    """Game in extensive (tree) form with complete or imperfect information."""

    metadata: GameMetadata
    players: tuple[PlayerId, ...]
    nodes: dict[str, GameNode]
    root_id: str
    information_sets: tuple[InformationSet, ...] = ()

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.EXTENSIVE_FORM:
            raise ValueError(f"ExtensiveFormGame metadata family must be EXTENSIVE_FORM, got {self.metadata.family}.")
        if not self.players:
            raise ValueError("ExtensiveFormGame requires at least one player.")
        clean_players = tuple(p.strip() for p in self.players)
        if len(set(clean_players)) != len(clean_players):
            raise ValueError("Player IDs in ExtensiveFormGame must be unique.")

        if self.root_id not in self.nodes:
            raise ValueError(f"Root node '{self.root_id}' is not in nodes dictionary.")

        # Validate tree structure (acyclic, unique incoming edges, valid references)
        in_degree: dict[str, int] = {nid: 0 for nid in self.nodes}
        visited: set[str] = set()
        queue = [self.root_id]

        while queue:
            current_id = queue.pop(0)
            if current_id in visited:
                raise ValueError(f"Cycle detected in extensive-form tree at node '{current_id}'.")
            visited.add(current_id)

            node = self.nodes.get(current_id)
            if node is None:
                raise ValueError(f"Node '{current_id}' referenced as child does not exist in nodes.")

            if node.node_type == "DECISION":
                if node.player_id not in clean_players:
                    raise ValueError(f"Node '{current_id}' references unknown player '{node.player_id}'.")
            elif node.node_type == "TERMINAL":
                if node.payoffs is not None and len(node.payoffs) != len(clean_players):
                    raise ValueError(
                        f"Terminal node '{current_id}' has {len(node.payoffs)} payoffs, expected {len(clean_players)}."
                    )

            for _action, child_id in node.actions:
                if child_id not in self.nodes:
                    raise ValueError(f"Node '{current_id}' transitions to unknown child '{child_id}'.")
                in_degree[child_id] = in_degree.get(child_id, 0) + 1
                if in_degree[child_id] > 1:
                    raise ValueError(f"Node '{child_id}' has multiple parents; extensive form must be a tree.")
                queue.append(child_id)

        # Validate information sets if provided
        if self.information_sets:
            info_set_map: dict[str, InformationSet] = {}
            for info_set in self.information_sets:
                if info_set.player_id not in clean_players:
                    raise ValueError(
                        f"InformationSet '{info_set.id}' references unknown player '{info_set.player_id}'."
                    )
                info_set_map[info_set.id] = info_set

            for nid in visited:
                node = self.nodes[nid]
                if node.node_type == "DECISION" and node.info_set_id is not None:
                    if node.info_set_id not in info_set_map:
                        raise ValueError(
                            f"Decision node '{nid}' references unregistered info_set_id '{node.info_set_id}'."
                        )
                    iset = info_set_map[node.info_set_id]
                    if iset.player_id != node.player_id:
                        raise ValueError(
                            f"Node '{nid}' player '{node.player_id}' mismatch with info set player '{iset.player_id}'."
                        )

    @property
    def is_perfect_information(self) -> bool:
        """Return True if the game has perfect information (no nontrivial information sets)."""
        return len(self.information_sets) == 0



@dataclass(frozen=True, slots=True)
class BayesianGame:
    """Incomplete information game with player types, priors, and type-dependent payoffs."""

    metadata: GameMetadata
    players: tuple[PlayerId, ...]
    type_spaces: dict[PlayerId, tuple[str, ...]]
    prior: dict[PlayerId, BeliefDistribution]
    action_spaces: dict[PlayerId, DiscreteActionSpace]
    payoff_function: Callable[[dict[PlayerId, str], dict[PlayerId, str]], tuple[float, ...]]

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.BAYESIAN:
            raise ValueError(f"BayesianGame metadata family must be BAYESIAN, got {self.metadata.family}.")
        if not self.players:
            raise ValueError("BayesianGame requires at least one player.")
        player_set = {p.strip() for p in self.players}
        if len(player_set) != len(self.players):
            raise ValueError("Player IDs in BayesianGame must be unique.")

        if set(self.type_spaces.keys()) != player_set:
            raise ValueError(
                f"type_spaces keys {set(self.type_spaces.keys())} do not match players {player_set}."
            )
        if set(self.prior.keys()) != player_set:
            raise ValueError(f"prior keys {set(self.prior.keys())} do not match players {player_set}.")
        if set(self.action_spaces.keys()) != player_set:
            raise ValueError(
                f"action_spaces keys {set(self.action_spaces.keys())} do not match players {player_set}."
            )

        for p in self.players:
            clean_types = tuple(t.strip() for t in self.type_spaces[p])
            if self.prior[p].states != clean_types:
                raise ValueError(
                    f"Player '{p}' prior states {self.prior[p].states} do not match type space {clean_types}."
                )


@dataclass(frozen=True, slots=True)
class CooperativeGame:
    """Cooperative characteristic function game (TU-game) with transferable utility."""

    metadata: GameMetadata
    players: tuple[PlayerId, ...]
    characteristic_function: Callable[[frozenset[PlayerId]], float] | None = None
    characteristic_values: Mapping[frozenset[PlayerId], float] | None = None

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.COOPERATIVE:
            raise ValueError(f"CooperativeGame metadata family must be COOPERATIVE, got {self.metadata.family}.")
        if not self.players:
            raise ValueError("CooperativeGame requires at least one player.")
        clean_players = tuple(p.strip() for p in self.players)
        if len(set(clean_players)) != len(clean_players):
            raise ValueError("Player IDs in CooperativeGame must be unique.")

        if self.characteristic_function is None and self.characteristic_values is not None:
            vals = dict(self.characteristic_values)
            object.__setattr__(self, "characteristic_function", lambda s: float(vals.get(frozenset(s), 0.0)))
        elif self.characteristic_function is None:
            raise ValueError("Either characteristic_function or characteristic_values must be provided.")

    @property
    def grand_coalition(self) -> frozenset[PlayerId]:
        """Return the frozenset of all players."""
        return frozenset(self.players)

    def v(self, coalition: frozenset[PlayerId]) -> float:
        """Evaluate the characteristic function for a given coalition."""
        assert self.characteristic_function is not None
        return float(self.characteristic_function(frozenset(coalition)))

    def subsets_of(self, players: Sequence[PlayerId]) -> list[frozenset[PlayerId]]:
        """Return all subset coalitions of the provided player sequence."""
        res: list[frozenset[PlayerId]] = []
        p_list = list(players)
        for r in range(len(p_list) + 1):
            for combo in itertools.combinations(p_list, r):
                res.append(frozenset(combo))
        return res


    def grand_coalition_value(self) -> float:
        """Return the characteristic value v(N) of the grand coalition."""
        return float(self.characteristic_function(frozenset(self.players)))

    def individual_values(self) -> dict[PlayerId, float]:
        """Return the singleton coalition values v({i}) for all players."""
        return {p: float(self.characteristic_function(frozenset([p]))) for p in self.players}

    def all_coalitions(self) -> Iterator[frozenset[PlayerId]]:
        """Yield all 2^N coalitions in order of increasing size."""
        for r in range(len(self.players) + 1):
            for combo in itertools.combinations(self.players, r):
                yield frozenset(combo)

    def is_superadditive(self, tolerance: float = 1e-9) -> bool:
        """Return True if v(S union T) >= v(S) + v(T) for all disjoint coalitions S, T."""
        coalition_list = list(self.all_coalitions())
        v_cache = {c: float(self.characteristic_function(c)) for c in coalition_list}

        for i, s in enumerate(coalition_list):
            for t in coalition_list[i:]:
                if s.isdisjoint(t):
                    union_st = s | t
                    if v_cache[union_st] < (v_cache[s] + v_cache[t] - tolerance):
                        return False
        return True

    def is_convex(self, tolerance: float = 1e-9) -> bool:
        """Return True if v(S union T) + v(S intersect T) >= v(S) + v(T) for all S, T."""
        coalition_list = list(self.all_coalitions())
        v_cache = {c: float(self.characteristic_function(c)) for c in coalition_list}

        for s in coalition_list:
            for t in coalition_list:
                union_val = v_cache[s | t]
                intersect_val = v_cache[s & t]
                if (union_val + intersect_val) < (v_cache[s] + v_cache[t] - tolerance):
                    return False
        return True


@dataclass(frozen=True, slots=True)
class RepeatedGame:
    """Repeated strategic game played over multiple discrete rounds with discounting."""

    metadata: GameMetadata
    stage_game: FiniteNormalFormGame
    num_rounds: int | None
    discount_factor: float = 1.0

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.REPEATED:
            raise ValueError(f"RepeatedGame metadata family must be REPEATED, got {self.metadata.family}.")
        if not math.isfinite(self.discount_factor) or self.discount_factor <= 0.0 or self.discount_factor > 1.0:
            raise ValueError(
                f"discount_factor must be in (0, 1], got {self.discount_factor}."
            )
        if self.num_rounds is not None:
            if not isinstance(self.num_rounds, int) or isinstance(self.num_rounds, bool) or self.num_rounds < 1:
                raise ValueError(f"num_rounds must be a positive integer or None, got {self.num_rounds}.")


@dataclass(frozen=True, slots=True)
class EvolutionaryGame:
    """Symmetric 2-player population game for evolutionary dynamics."""

    metadata: GameMetadata
    strategies: tuple[str, ...]
    payoff_matrix: PayoffMatrix

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.EVOLUTIONARY:
            raise ValueError(f"EvolutionaryGame metadata family must be EVOLUTIONARY, got {self.metadata.family}.")
        if len(self.strategies) < 2:
            raise ValueError("EvolutionaryGame requires at least two population strategies.")
        clean_strats = tuple(s.strip() for s in self.strategies)
        if len(set(clean_strats)) != len(clean_strats):
            raise ValueError("EvolutionaryGame strategies must be unique.")

        if self.payoff_matrix.num_players != 2:
            raise ValueError(
                f"EvolutionaryGame requires a 2-player payoff matrix, got {self.payoff_matrix.num_players}."
            )
        expected_counts = (len(clean_strats), len(clean_strats))
        if self.payoff_matrix.action_counts != expected_counts:
            raise ValueError(
                f"PayoffMatrix action_counts {self.payoff_matrix.action_counts} must match strategies {expected_counts}."
            )
        if not self.payoff_matrix.is_symmetric():
            raise ValueError("EvolutionaryGame payoff matrix must be symmetric between players.")


@dataclass(frozen=True, slots=True)
class StochasticGame:
    """Markov game with state transitions conditioned on joint action profiles."""

    metadata: GameMetadata
    players: tuple[PlayerId, ...]
    states: tuple[str, ...]
    action_spaces: dict[PlayerId, DiscreteActionSpace]
    transition_function: Callable[[str, dict[PlayerId, str]], dict[str, float]]
    reward_function: Callable[[str, dict[PlayerId, str]], tuple[float, ...]]
    discount_factor: float

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.STOCHASTIC:
            raise ValueError(f"StochasticGame metadata family must be STOCHASTIC, got {self.metadata.family}.")
        if not self.players:
            raise ValueError("StochasticGame requires at least one player.")
        if not self.states:
            raise ValueError("StochasticGame requires at least one state.")
        clean_players = tuple(p.strip() for p in self.players)
        if len(set(clean_players)) != len(clean_players):
            raise ValueError("Player IDs in StochasticGame must be unique.")

        if set(self.action_spaces.keys()) != set(clean_players):
            raise ValueError("action_spaces keys must match game players.")

        if not math.isfinite(self.discount_factor) or self.discount_factor <= 0.0 or self.discount_factor > 1.0:
            raise ValueError(f"discount_factor must be in (0, 1], got {self.discount_factor}.")


@dataclass(frozen=True, slots=True)
class StackelbergGame:
    """Sequential leader-follower game with commitment."""

    metadata: GameMetadata
    leader: PlayerId
    follower: PlayerId
    leader_actions: DiscreteActionSpace
    follower_actions: DiscreteActionSpace
    leader_payoff: PayoffMatrix
    follower_payoff: PayoffMatrix

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.STACKELBERG:
            raise ValueError(f"StackelbergGame metadata family must be STACKELBERG, got {self.metadata.family}.")
        clean_leader = self.leader.strip()
        clean_follower = self.follower.strip()
        if not clean_leader or not clean_follower:
            raise ValueError("Leader and follower IDs must be non-empty strings.")
        if clean_leader == clean_follower:
            raise ValueError("Leader and follower must be distinct players.")

        expected_counts = (self.leader_actions.size, self.follower_actions.size)
        if self.leader_payoff.action_counts != expected_counts:
            raise ValueError(
                f"leader_payoff action_counts {self.leader_payoff.action_counts} must match actions {expected_counts}."
            )
        if self.follower_payoff.action_counts != expected_counts:
            raise ValueError(
                f"follower_payoff action_counts {self.follower_payoff.action_counts} must match actions {expected_counts}."
            )


@dataclass(frozen=True, slots=True)
class CongestionGame:
    """Congestion game where players select subsets of shared resources with congestion-dependent costs."""

    metadata: GameMetadata
    players: tuple[PlayerId, ...]
    resources: tuple[str, ...]
    resource_sets: dict[PlayerId, tuple[frozenset[str], ...]]
    cost_functions: dict[str, Callable[[int], float]]

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.CONGESTION:
            raise ValueError(f"CongestionGame metadata family must be CONGESTION, got {self.metadata.family}.")
        if not self.players:
            raise ValueError("CongestionGame requires at least one player.")
        if not self.resources:
            raise ValueError("CongestionGame requires at least one resource.")

        clean_players = tuple(p.strip() for p in self.players)
        clean_resources = {r.strip() for r in self.resources}

        if set(self.resource_sets.keys()) != set(clean_players):
            raise ValueError("resource_sets keys must match players.")

        for p in clean_players:
            strategies = self.resource_sets[p]
            if not strategies:
                raise ValueError(f"Player '{p}' must have at least one strategy (resource set).")
            for strat in strategies:
                if not strat.issubset(clean_resources):
                    raise ValueError(
                        f"Player '{p}' strategy {strat} contains resources outside {clean_resources}."
                    )

        for r in clean_resources:
            if r not in self.cost_functions:
                raise ValueError(f"Missing cost function for resource '{r}'.")

    def compute_costs(self, profile: Mapping[PlayerId, frozenset[str]]) -> dict[PlayerId, float]:
        """Compute the cost incurred by each player under a chosen strategy profile."""
        congestion: dict[str, int] = {r: 0 for r in self.resources}
        for p in self.players:
            for r in profile[p]:
                congestion[r] += 1

        costs: dict[PlayerId, float] = {}
        for p in self.players:
            total_cost = sum(float(self.cost_functions[r](congestion[r])) for r in profile[p])
            costs[p] = total_cost
        return costs

    def compute_payoffs(self, profile: Mapping[PlayerId, frozenset[str]]) -> dict[PlayerId, float]:
        """Compute payoffs (negative cost) for each player under a strategy profile."""
        costs = self.compute_costs(profile)
        return {p: -c for p, c in costs.items()}


@dataclass(frozen=True, slots=True)
class PotentialGame:
    """Normal-form game possessing an exact potential function."""

    metadata: GameMetadata
    underlying_game: FiniteNormalFormGame
    potential_function: Callable[[Sequence[int]], float]

    def __post_init__(self) -> None:
        if self.metadata.family != GameFamily.POTENTIAL:
            raise ValueError(f"PotentialGame metadata family must be POTENTIAL, got {self.metadata.family}.")

    def verify_potential(self, tolerance: float = 1e-10) -> bool:
        """Verify that the potential function satisfies the exact potential property for all unilateral deviations."""
        game = self.underlying_game
        num_players = len(game.players)
        action_counts = game.action_counts

        for profile in game.profiles():
            base_payoffs = game.payoff(profile)
            base_potential = float(self.potential_function(profile))

            for p_idx in range(num_players):
                current_action = profile[p_idx]
                for alt_action in range(action_counts[p_idx]):
                    if alt_action == current_action:
                        continue
                    alt_profile = list(profile)
                    alt_profile[p_idx] = alt_action
                    alt_tuple = tuple(alt_profile)

                    alt_payoffs = game.payoff(alt_tuple)
                    alt_potential = float(self.potential_function(alt_tuple))

                    delta_u = alt_payoffs[p_idx] - base_payoffs[p_idx]
                    delta_phi = alt_potential - base_potential

                    if abs(delta_u - delta_phi) > tolerance:
                        return False
        return True
