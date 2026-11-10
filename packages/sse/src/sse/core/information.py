"""Information structures, information sets, and Bayesian belief distributions."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from sse.core.types import ActionId, PlayerId


@dataclass(frozen=True, slots=True)
class InformationSet:
    """An information set grouping decision nodes indistinguishable to a player."""

    id: str
    player_id: PlayerId
    available_actions: tuple[ActionId, ...]
    node_ids: tuple[str, ...] = ()

    def __init__(
        self,
        id: str,
        player_id: PlayerId,
        available_actions: Sequence[ActionId],
        node_ids: Sequence[str] = (),
    ) -> None:
        if not isinstance(id, str) or not id.strip():
            raise ValueError("InformationSet id must be a non-empty string.")
        if not isinstance(player_id, str) or not player_id.strip():
            raise ValueError("InformationSet player_id must be a non-empty string.")
        if not available_actions:
            raise ValueError("InformationSet must have at least one available action.")

        actions_tuple: list[ActionId] = []
        for i, act in enumerate(available_actions):
            if isinstance(act, str):
                if not act.strip():
                    raise ValueError(f"Action string at index {i} must not be empty.")
                actions_tuple.append(act.strip())
            elif isinstance(act, int):
                if isinstance(act, bool) or act < 0:
                    raise ValueError(f"Action integer at index {i} must be a non-negative integer.")
                actions_tuple.append(act)
            else:
                raise TypeError(f"Action at index {i} must be str or int, got {type(act).__name__}.")

        if len(set(actions_tuple)) != len(actions_tuple):
            raise ValueError("InformationSet available actions must be unique.")

        node_id_tuple = tuple(str(nid).strip() for nid in node_ids)
        for nid in node_id_tuple:
            if not nid:
                raise ValueError("Node id in node_ids cannot be empty.")

        object.__setattr__(self, "id", id.strip())
        object.__setattr__(self, "player_id", player_id.strip())
        object.__setattr__(self, "available_actions", tuple(actions_tuple))
        object.__setattr__(self, "node_ids", node_id_tuple)


@dataclass(frozen=True, slots=True)
class InformationStructure:
    """Collection of InformationSets representing the players' knowledge partitions."""

    information_sets: tuple[InformationSet, ...]

    def __init__(self, information_sets: Sequence[InformationSet]) -> None:
        sets_tuple = tuple(information_sets)
        seen_ids: set[str] = set()
        for s in sets_tuple:
            if not isinstance(s, InformationSet):
                raise TypeError(f"All elements must be InformationSet instances, got {type(s).__name__}.")
            if s.id in seen_ids:
                raise ValueError(f"Duplicate InformationSet id '{s.id}' in InformationStructure.")
            seen_ids.add(s.id)
        object.__setattr__(self, "information_sets", sets_tuple)

    def get_sets_for_player(self, player_id: PlayerId) -> tuple[InformationSet, ...]:
        """Return all InformationSets belonging to a specific player."""
        clean_pid = player_id.strip()
        return tuple(s for s in self.information_sets if s.player_id == clean_pid)

    def get_set(self, info_set_id: str) -> InformationSet:
        """Lookup an InformationSet by its ID.

        Raises:
            KeyError: If the information set ID is not found.
        """
        clean_id = info_set_id.strip()
        for s in self.information_sets:
            if s.id == clean_id:
                return s
        raise KeyError(f"InformationSet '{info_set_id}' not found.")

    def get_set_for_node(self, node_id: str) -> InformationSet | None:
        """Return the InformationSet containing the specified node ID, or None."""
        clean_nid = node_id.strip()
        for s in self.information_sets:
            if clean_nid in s.node_ids:
                return s
        return None

    @property
    def is_perfect_information(self) -> bool:
        """Return True if every information set contains at most one decision node."""
        return all(len(s.node_ids) <= 1 for s in self.information_sets)


@dataclass(frozen=True, slots=True)
class BeliefDistribution:
    """A probability distribution over a finite set of discrete states or player types."""

    states: tuple[str, ...]
    probabilities: tuple[float, ...]

    def __init__(self, states: Sequence[str], probabilities: Sequence[float]) -> None:
        if not states:
            raise ValueError("BeliefDistribution must contain at least one state.")
        sanitized_states: list[str] = []
        for i, st in enumerate(states):
            if not isinstance(st, str):
                raise TypeError(f"State at index {i} must be a string, got {type(st).__name__}.")
            trimmed = st.strip()
            if not trimmed:
                raise ValueError(f"State at index {i} cannot be empty or whitespace.")
            sanitized_states.append(trimmed)

        if len(set(sanitized_states)) != len(sanitized_states):
            raise ValueError("BeliefDistribution state names must be unique.")

        probs_tuple = tuple(float(p) for p in probabilities)
        if len(probs_tuple) != len(sanitized_states):
            raise ValueError(
                f"Probabilities length ({len(probs_tuple)}) must match states length ({len(sanitized_states)})."
            )

        for i, p in enumerate(probs_tuple):
            if not math.isfinite(p):
                raise ValueError(f"Probability at index {i} must be finite, got {p}.")
            if p < -1e-12:
                raise ValueError(f"Probability at index {i} cannot be negative, got {p}.")

        clamped = tuple(max(0.0, p) for p in probs_tuple)
        total = sum(clamped)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Probabilities must sum to 1.0 (within 1e-9), got {total:.12f}.")

        normalized = tuple(p / total for p in clamped)

        object.__setattr__(self, "states", tuple(sanitized_states))
        object.__setattr__(self, "probabilities", normalized)

    def probability(self, state: str) -> float:
        """Return the prior probability of the given state."""
        trimmed = state.strip()
        try:
            idx = self.states.index(trimmed)
            return self.probabilities[idx]
        except ValueError:
            return 0.0

    def update_bayesian(self, likelihood: Mapping[str, float]) -> BeliefDistribution:
        """Perform exact Bayesian updating given conditional likelihood P(evidence | state).

        Args:
            likelihood: Mapping from state names to non-negative conditional likelihood values.

        Returns:
            A new posterior BeliefDistribution over the same states.

        Raises:
            ValueError: If total marginal likelihood is zero (impossible evidence).
        """
        unnormalized: list[float] = []
        for st, prior_p in zip(self.states, self.probabilities, strict=True):
            lh = float(likelihood.get(st, 0.0))
            if not math.isfinite(lh) or lh < 0.0:
                raise ValueError(f"Likelihood for state '{st}' must be a non-negative finite float, got {lh}.")
            unnormalized.append(prior_p * lh)

        total_evidence = sum(unnormalized)
        if total_evidence <= 0.0:
            raise ValueError(
                "Bayesian update impossible: total probability of evidence is zero (incompatible observation)."
            )

        posterior_probs = tuple(p / total_evidence for p in unnormalized)
        return BeliefDistribution(states=self.states, probabilities=posterior_probs)

    def entropy(self, base: float = 2.0) -> float:
        """Compute the Shannon entropy of the belief distribution.

        Args:
            base: Logarithmic base (defaults to 2 for bits).

        Returns:
            Shannon entropy value in units determined by base.
        """
        if base <= 0.0 or base == 1.0:
            raise ValueError(f"Logarithmic base must be positive and != 1, got {base}.")
        h = 0.0
        for p in self.probabilities:
            if p > 1e-15:
                h -= p * (math.log(p) / math.log(base))
        return max(0.0, h)
