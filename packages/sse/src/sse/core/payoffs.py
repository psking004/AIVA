"""Payoff representations including payoff matrices, payoff functions, linear, and zero-sum payoffs."""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

try:
    import numpy as np
except ImportError:
    np = None  # type: ignore[assignment]


@dataclass(frozen=True, slots=True)
class PayoffMatrix:
    """Multidimensional payoff tensor stored in canonical Cartesian row-major order."""

    num_players: int
    action_counts: tuple[int, ...]
    payoffs: tuple[tuple[float, ...], ...]

    def __init__(
        self,
        num_players: int,
        action_counts: Sequence[int],
        payoffs: Sequence[Sequence[float]],
    ) -> None:
        if not isinstance(num_players, int) or isinstance(num_players, bool) or num_players < 1:
            raise ValueError(f"num_players must be an integer >= 1, got {num_players}.")

        counts = tuple(int(c) for c in action_counts)
        if len(counts) != num_players:
            raise ValueError(
                f"action_counts length ({len(counts)}) must equal num_players ({num_players})."
            )
        for i, c in enumerate(counts):
            if c < 1:
                raise ValueError(f"action count for player {i} must be >= 1, got {c}.")

        expected_profiles = math.prod(counts)
        payoff_tuple = tuple(tuple(float(p) for p in row) for row in payoffs)
        if len(payoff_tuple) != expected_profiles:
            raise ValueError(
                f"Expected {expected_profiles} payoff profiles, got {len(payoff_tuple)}."
            )

        for row_idx, row in enumerate(payoff_tuple):
            if len(row) != num_players:
                raise ValueError(
                    f"Payoff row at index {row_idx} has length {len(row)}, expected {num_players}."
                )
            for val in row:
                if not math.isfinite(val):
                    raise ValueError(
                        f"Non-finite payoff value ({val}) encountered at profile {row_idx}."
                    )

        object.__setattr__(self, "num_players", num_players)
        object.__setattr__(self, "action_counts", counts)
        object.__setattr__(self, "payoffs", payoff_tuple)

    def profile_index(self, profile: Sequence[int]) -> int:
        """Map an action-index profile to its flattened row index."""
        if len(profile) != self.num_players:
            raise ValueError(
                f"Profile length ({len(profile)}) must equal num_players ({self.num_players})."
            )
        index = 0
        for action_index, count in zip(profile, self.action_counts, strict=True):
            if not isinstance(action_index, int) or isinstance(action_index, bool):
                raise TypeError(f"Action indices must be integers, got {type(action_index).__name__}.")
            if action_index < 0 or action_index >= count:
                raise IndexError(
                    f"Action index {action_index} out of bounds for player with {count} actions."
                )
            index = index * count + action_index
        return index

    def get_payoff(self, profile: Sequence[int]) -> tuple[float, ...]:
        """Return the payoff vector for a given action-index profile."""
        return self.payoffs[self.profile_index(profile)]

    def is_zero_sum(self, tolerance: float = 1e-9) -> bool:
        """Return True if the sum of payoffs across all players is zero for every profile."""
        return all(abs(sum(row)) <= tolerance for row in self.payoffs)

    def is_symmetric(self, tolerance: float = 1e-9) -> bool:
        """Return True if the payoff matrix represents a symmetric 2-player game."""
        if self.num_players != 2 or self.action_counts[0] != self.action_counts[1]:
            return False
        n = self.action_counts[0]
        for i in range(n):
            for j in range(n):
                u1, u2 = self.get_payoff((i, j))
                v1, v2 = self.get_payoff((j, i))
                if abs(u1 - v2) > tolerance or abs(u2 - v1) > tolerance:
                    return False
        return True

    def to_numpy(self) -> Any:
        """Convert payoffs to a NumPy ndarray of shape (*action_counts, num_players).

        Raises:
            ImportError: If NumPy is not installed.
        """
        if np is None:
            raise ImportError("NumPy is required to export to a NumPy ndarray.")
        return np.array(self.payoffs, dtype=float).reshape(*self.action_counts, self.num_players)

    @classmethod
    def from_numpy(
        cls,
        array: Any,
        action_counts: Sequence[int] | None = None,
    ) -> PayoffMatrix:
        """Construct a PayoffMatrix from a NumPy ndarray.

        Args:
            array: A NumPy array. Either of shape (*action_counts, num_players) or
                   (total_profiles, num_players) if action_counts is supplied.
            action_counts: Optional explicit action counts if array is 2D.

        Raises:
            ImportError: If NumPy is not installed.
            ValueError: If array dimensions or counts do not match expected shapes.
        """
        if np is None:
            raise ImportError("NumPy is required to construct PayoffMatrix from a NumPy ndarray.")
        arr = np.asarray(array, dtype=float)

        if action_counts is not None:
            counts = tuple(int(c) for c in action_counts)
            num_players = len(counts)
            expected_profiles = math.prod(counts)
            if arr.ndim == 2:
                if arr.shape != (expected_profiles, num_players):
                    raise ValueError(
                        f"2D array shape {arr.shape} does not match ({expected_profiles}, {num_players})."
                    )
                payoffs = tuple(tuple(float(x) for x in row) for row in arr)
                return cls(num_players=num_players, action_counts=counts, payoffs=payoffs)
            elif arr.shape == (*counts, num_players):
                reshaped = arr.reshape(-1, num_players)
                payoffs = tuple(tuple(float(x) for x in row) for row in reshaped)
                return cls(num_players=num_players, action_counts=counts, payoffs=payoffs)
            else:
                raise ValueError(
                    f"Array shape {arr.shape} does not conform to action_counts {counts}."
                )

        # Inferred from ndarray shape
        if arr.ndim < 2:
            raise ValueError(f"NumPy array must have at least 2 dimensions, got ndim={arr.ndim}.")

        num_players = arr.shape[-1]
        counts = arr.shape[:-1]
        if len(counts) != num_players:
            raise ValueError(
                f"Tensor shape {arr.shape} has {len(counts)} action axes but last axis has size {num_players}."
            )
        reshaped = arr.reshape(-1, num_players)
        payoffs = tuple(tuple(float(x) for x in row) for row in reshaped)
        return cls(num_players=num_players, action_counts=counts, payoffs=payoffs)


class PayoffFunction(ABC):
    """Abstract base class for functional (analytical or simulation-based) payoffs."""

    @abstractmethod
    def __call__(self, profile: Sequence[Any]) -> tuple[float, ...]:
        """Compute the payoff vector for all players given an action/feature profile."""


@dataclass(frozen=True, slots=True)
class LinearPayoff(PayoffFunction):
    """Linear payoff function where each player's payoff is an affine combination of profile features."""

    coefficients: tuple[tuple[float, ...], ...]
    intercepts: tuple[float, ...] = ()

    def __init__(
        self,
        coefficients: Sequence[Sequence[float]],
        intercepts: Sequence[float] | None = None,
    ) -> None:
        if not coefficients:
            raise ValueError("coefficients must contain at least one player's weight vector.")

        coeff_tuples = tuple(tuple(float(w) for w in player_w) for player_w in coefficients)
        num_features = len(coeff_tuples[0])
        if num_features == 0:
            raise ValueError("Player weight vectors must contain at least one feature coefficient.")

        for i, w in enumerate(coeff_tuples):
            if len(w) != num_features:
                raise ValueError(
                    f"Player {i} weight vector has length {len(w)}, expected {num_features}."
                )
            for val in w:
                if not math.isfinite(val):
                    raise ValueError(f"Coefficient value {val} must be finite.")

        if intercepts is not None:
            intercept_tuple = tuple(float(b) for b in intercepts)
            if len(intercept_tuple) != len(coeff_tuples):
                raise ValueError(
                    f"intercepts length ({len(intercept_tuple)}) must match players ({len(coeff_tuples)})."
                )
            for b in intercept_tuple:
                if not math.isfinite(b):
                    raise ValueError(f"Intercept value {b} must be finite.")
        else:
            intercept_tuple = tuple(0.0 for _ in range(len(coeff_tuples)))

        object.__setattr__(self, "coefficients", coeff_tuples)
        object.__setattr__(self, "intercepts", intercept_tuple)

    def __call__(self, profile: Sequence[Any]) -> tuple[float, ...]:
        expected_len = len(self.coefficients[0])
        if len(profile) != expected_len:
            raise ValueError(
                f"Feature profile length ({len(profile)}) must match expected features ({expected_len})."
            )
        feature_vector = tuple(float(x) for x in profile)
        payoffs = []
        for weights, intercept in zip(self.coefficients, self.intercepts, strict=True):
            dot = sum(w * x for w, x in zip(weights, feature_vector, strict=True))
            payoffs.append(dot + intercept)
        return tuple(payoffs)


@dataclass(frozen=True, slots=True)
class ZeroSumPayoff(PayoffFunction):
    """Payoff wrapper for 2-player zero-sum games: player 1 gets u, player 2 gets -u."""

    payoff_fn: Callable[[Sequence[Any]], float]

    def __call__(self, profile: Sequence[Any]) -> tuple[float, float]:
        u1 = float(self.payoff_fn(profile))
        if not math.isfinite(u1):
            raise ValueError(f"Computed payoff ({u1}) must be a finite float.")
        return (u1, -u1)
