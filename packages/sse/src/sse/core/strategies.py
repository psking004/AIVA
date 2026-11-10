"""Pure, mixed, behavioral strategy representations and strategy profiles."""

from __future__ import annotations

import math
import random
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass

from sse.core.actions import DiscreteActionSpace
from sse.core.types import ActionId, PlayerId


@dataclass(frozen=True, slots=True)
class PureStrategy:
    """A deterministic strategic choice for a player at a game or information set."""

    player_id: PlayerId
    action: ActionId
    info_set_id: str | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.player_id, str) or not self.player_id.strip():
            raise ValueError("player_id must be a non-empty string.")
        if isinstance(self.action, str):
            if not self.action.strip():
                raise ValueError("String action must not be empty or whitespace.")
        elif isinstance(self.action, int):
            if isinstance(self.action, bool) or self.action < 0:
                raise ValueError("Integer action index must be non-negative.")
        else:
            raise TypeError(f"Action must be str or int, got {type(self.action).__name__}.")
        if self.info_set_id is not None:
            if not isinstance(self.info_set_id, str) or not self.info_set_id.strip():
                raise ValueError("info_set_id, if provided, must be a non-empty string.")


@dataclass(frozen=True, slots=True)
class MixedStrategy:
    """A probability distribution over a finite discrete action space."""

    player_id: PlayerId
    action_space: DiscreteActionSpace
    probabilities: tuple[float, ...]

    def __init__(
        self,
        player_id: PlayerId,
        action_space: DiscreteActionSpace,
        probabilities: Sequence[float],
    ) -> None:
        if not isinstance(player_id, str) or not player_id.strip():
            raise ValueError("player_id must be a non-empty string.")
        if not isinstance(action_space, DiscreteActionSpace):
            raise TypeError(f"action_space must be a DiscreteActionSpace, got {type(action_space).__name__}.")

        probs_tuple = tuple(float(p) for p in probabilities)
        if len(probs_tuple) != action_space.size:
            raise ValueError(
                f"Probabilities length ({len(probs_tuple)}) does not match action space size ({action_space.size})."
            )
        for i, p in enumerate(probs_tuple):
            if not math.isfinite(p):
                raise ValueError(f"Probability at index {i} must be a finite float, got {p}.")
            if p < -1e-12:
                raise ValueError(f"Probability at index {i} cannot be negative, got {p}.")
        # Clamp tiny negative floating artifacts to 0
        clamped = tuple(max(0.0, p) for p in probs_tuple)
        total = sum(clamped)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Probabilities must sum to 1.0 (within 1e-9), got {total:.12f}.")

        # Re-normalize slightly so sum is exactly 1.0
        normalized = tuple(p / total for p in clamped)

        object.__setattr__(self, "player_id", player_id.strip())
        object.__setattr__(self, "action_space", action_space)
        object.__setattr__(self, "probabilities", normalized)

    def probability(self, action: str) -> float:
        """Return the probability assigned to the given action."""
        if not self.action_space.contains(action):
            return 0.0
        idx = self.action_space.index(action)
        return self.probabilities[idx]

    def support(self, tol: float = 1e-12) -> tuple[str, ...]:
        """Return the tuple of actions that have strictly positive probability."""
        return tuple(
            act
            for act, prob in zip(self.action_space.actions, self.probabilities, strict=True)
            if prob > tol
        )

    def expected_payoff(self, payoff_mapping: Mapping[str, float]) -> float:
        """Compute expected payoff given a mapping from action names to payoffs.

        Raises:
            KeyError: If any action in the strategy's support is missing from payoff_mapping.
        """
        expected = 0.0
        for act in self.support():
            if act not in payoff_mapping:
                raise KeyError(f"Action '{act}' in strategy support is missing from payoff mapping.")
            idx = self.action_space.index(act)
            expected += self.probabilities[idx] * float(payoff_mapping[act])
        return expected

    def sample(self, rng: random.Random) -> str:
        """Sample an action according to this mixed strategy distribution."""
        return rng.choices(self.action_space.actions, weights=self.probabilities, k=1)[0]


@dataclass(frozen=True, slots=True)
class StrategyProfile(Mapping[PlayerId, PureStrategy | MixedStrategy]):
    """A profile containing one strategic choice (pure or mixed) per player."""

    strategies: dict[PlayerId, PureStrategy | MixedStrategy]

    def __init__(self, strategies: Mapping[PlayerId, PureStrategy | MixedStrategy]) -> None:
        if not strategies:
            raise ValueError("StrategyProfile must contain at least one player strategy.")
        sanitized: dict[PlayerId, PureStrategy | MixedStrategy] = {}
        for pid, strat in strategies.items():
            if not isinstance(pid, str) or not pid.strip():
                raise ValueError("PlayerId must be a non-empty string.")
            clean_pid = pid.strip()
            if not isinstance(strat, (PureStrategy, MixedStrategy)):
                raise TypeError(
                    f"Strategy for player '{clean_pid}' must be PureStrategy or MixedStrategy, got {type(strat).__name__}."
                )
            if strat.player_id != clean_pid:
                raise ValueError(
                    f"Strategy player_id '{strat.player_id}' does not match profile key '{clean_pid}'."
                )
            sanitized[clean_pid] = strat
        object.__setattr__(self, "strategies", sanitized)

    def __getitem__(self, player_id: PlayerId) -> PureStrategy | MixedStrategy:
        return self.strategies[player_id]

    def get_strategy(self, player_id: PlayerId) -> PureStrategy | MixedStrategy:
        """Retrieve strategy for given player identifier."""
        return self.strategies[player_id]


    def __iter__(self) -> Iterator[PlayerId]:
        return iter(self.strategies)

    def __len__(self) -> int:
        return len(self.strategies)

    def __contains__(self, player_id: object) -> bool:
        return player_id in self.strategies

    @property
    def is_pure(self) -> bool:
        """Return True if all player strategies in the profile are pure."""
        return all(isinstance(strat, PureStrategy) for strat in self.strategies.values())

    @property
    def is_mixed(self) -> bool:
        """Return True if any player strategy in the profile is mixed."""
        return any(isinstance(strat, MixedStrategy) for strat in self.strategies.values())

    def validate_for_players(self, expected_players: Sequence[PlayerId]) -> None:
        """Validate that all expected players are present with no extra players.

        Raises:
            ValueError: If players in profile do not exactly match expected_players.
        """
        expected_set = {p.strip() for p in expected_players}
        profile_set = set(self.strategies.keys())
        missing = expected_set - profile_set
        extra = profile_set - expected_set
        if missing or extra:
            err_parts = []
            if missing:
                err_parts.append(f"missing players: {sorted(missing)}")
            if extra:
                err_parts.append(f"unexpected players: {sorted(extra)}")
            raise ValueError(f"StrategyProfile player mismatch: {'; '.join(err_parts)}.")


@dataclass(frozen=True, slots=True)
class BehavioralStrategy(Mapping[str, MixedStrategy]):
    """Extensive-form behavioral strategy mapping each information set to a mixed strategy."""

    player_id: PlayerId
    strategies: dict[str, MixedStrategy]

    def __init__(self, player_id: PlayerId, strategies: Mapping[str, MixedStrategy]) -> None:
        if not isinstance(player_id, str) or not player_id.strip():
            raise ValueError("player_id must be a non-empty string.")
        clean_pid = player_id.strip()
        if not strategies:
            raise ValueError("BehavioralStrategy must contain at least one information set strategy.")
        sanitized: dict[str, MixedStrategy] = {}
        for info_set_id, strat in strategies.items():
            if not isinstance(info_set_id, str) or not info_set_id.strip():
                raise ValueError("info_set_id must be a non-empty string.")
            clean_info_id = info_set_id.strip()
            if not isinstance(strat, MixedStrategy):
                raise TypeError(
                    f"Strategy for info set '{clean_info_id}' must be MixedStrategy, got {type(strat).__name__}."
                )
            if strat.player_id != clean_pid:
                raise ValueError(
                    f"MixedStrategy player_id '{strat.player_id}' does not match BehavioralStrategy player_id '{clean_pid}'."
                )
            sanitized[clean_info_id] = strat
        object.__setattr__(self, "player_id", clean_pid)
        object.__setattr__(self, "strategies", sanitized)

    def __getitem__(self, info_set_id: str) -> MixedStrategy:
        return self.strategies[info_set_id]

    def __iter__(self) -> Iterator[str]:
        return iter(self.strategies)

    def __len__(self) -> int:
        return len(self.strategies)

    def __contains__(self, info_set_id: object) -> bool:
        return info_set_id in self.strategies

    def get_strategy(self, info_set_id: str) -> MixedStrategy:
        """Return the mixed strategy for the given information set ID."""
        try:
            return self.strategies[info_set_id]
        except KeyError as exc:
            raise KeyError(f"Information set '{info_set_id}' not found in BehavioralStrategy.") from exc
