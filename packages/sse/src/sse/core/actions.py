"""Action space abstractions for discrete, continuous, and product strategic actions."""

from __future__ import annotations

import itertools
import math
import random
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any


class ActionSpace(ABC):
    """Abstract base class representing an agent's available action space."""

    @property
    @abstractmethod
    def is_finite(self) -> bool:
        """Return True if the action space contains a finite number of actions."""

    @property
    @abstractmethod
    def size(self) -> int:
        """Return the cardinality of the action space.

        Raises:
            TypeError: If the action space is infinite or continuous.
        """

    @abstractmethod
    def contains(self, action: Any) -> bool:
        """Return True if the specified action is a valid member of this space."""

    @abstractmethod
    def sample(self, rng: random.Random) -> Any:
        """Draw an action uniformly at random from this space."""

    @abstractmethod
    def to_list(self) -> list[Any]:
        """Return all actions as a list for finite spaces.

        Raises:
            TypeError: If the action space is infinite or continuous.
        """

    def __contains__(self, action: Any) -> bool:
        return self.contains(action)


@dataclass(frozen=True, slots=True)
class DiscreteActionSpace(ActionSpace):
    """A finite, ordered collection of named discrete actions."""

    actions: tuple[str, ...]

    def __init__(self, actions: Sequence[str]) -> None:
        if not actions:
            raise ValueError("DiscreteActionSpace must contain at least one action.")
        sanitized = []
        for i, act in enumerate(actions):
            if not isinstance(act, str):
                raise TypeError(f"Action at index {i} must be a string, got {type(act).__name__}.")
            trimmed = act.strip()
            if not trimmed:
                raise ValueError(f"Action at index {i} must not be empty or whitespace.")
            sanitized.append(trimmed)
        if len(set(sanitized)) != len(sanitized):
            raise ValueError(f"DiscreteActionSpace action names must be unique: {sanitized}")
        object.__setattr__(self, "actions", tuple(sanitized))

    @property
    def is_finite(self) -> bool:
        return True

    @property
    def size(self) -> int:
        return len(self.actions)

    def contains(self, action: Any) -> bool:
        return isinstance(action, str) and action in self.actions

    def sample(self, rng: random.Random) -> str:
        return rng.choice(self.actions)

    def to_list(self) -> list[str]:
        return list(self.actions)

    def index(self, action: str) -> int:
        """Return the 0-based index of the given action.

        Raises:
            ValueError: If the action is not in this space.
        """
        try:
            return self.actions.index(action)
        except ValueError as exc:
            raise ValueError(f"Action '{action}' is not in DiscreteActionSpace.") from exc

    def action_at(self, index: int) -> str:
        """Return the action at the given 0-based index.

        Raises:
            IndexError: If the index is out of bounds.
        """
        return self.actions[index]


@dataclass(frozen=True, slots=True)
class ContinuousActionSpace(ActionSpace):
    """A bounded continuous 1D interval [low, high]."""

    low: float
    high: float

    def __post_init__(self) -> None:
        if not math.isfinite(self.low):
            raise ValueError(f"low bound must be a finite float, got {self.low}")
        if not math.isfinite(self.high):
            raise ValueError(f"high bound must be a finite float, got {self.high}")
        if self.low >= self.high:
            raise ValueError(f"low bound ({self.low}) must be strictly less than high bound ({self.high})")

    @property
    def is_finite(self) -> bool:
        return False

    @property
    def size(self) -> int:
        raise TypeError("ContinuousActionSpace has infinite size.")

    def contains(self, action: Any) -> bool:
        if not isinstance(action, (int, float)) or isinstance(action, bool):
            return False
        if not math.isfinite(action):
            return False
        return self.low <= float(action) <= self.high

    def sample(self, rng: random.Random) -> float:
        return rng.uniform(self.low, self.high)

    def to_list(self) -> list[Any]:
        raise TypeError("ContinuousActionSpace cannot be converted to a finite list.")


@dataclass(frozen=True, slots=True)
class ProductActionSpace(ActionSpace):
    """Cartesian product of multiple component ActionSpaces."""

    spaces: tuple[ActionSpace, ...]

    def __init__(self, spaces: Sequence[ActionSpace]) -> None:
        if not spaces:
            raise ValueError("ProductActionSpace requires at least one component ActionSpace.")
        for i, space in enumerate(spaces):
            if not isinstance(space, ActionSpace):
                raise TypeError(
                    f"Component at index {i} must be an ActionSpace, got {type(space).__name__}."
                )
        object.__setattr__(self, "spaces", tuple(spaces))

    @property
    def is_finite(self) -> bool:
        return all(space.is_finite for space in self.spaces)

    @property
    def size(self) -> int:
        if not self.is_finite:
            raise TypeError("ProductActionSpace containing continuous components has infinite size.")
        return math.prod(space.size for space in self.spaces)

    def contains(self, action: Any) -> bool:
        if not isinstance(action, (tuple, list)):
            return False
        if len(action) != len(self.spaces):
            return False
        return all(space.contains(act) for space, act in zip(self.spaces, action))

    def sample(self, rng: random.Random) -> tuple[Any, ...]:
        return tuple(space.sample(rng) for space in self.spaces)

    def to_list(self) -> list[tuple[Any, ...]]:
        if not self.is_finite:
            raise TypeError("ProductActionSpace containing continuous spaces cannot be converted to a list.")
        return [tuple(prod) for prod in itertools.product(*(space.to_list() for space in self.spaces))]
