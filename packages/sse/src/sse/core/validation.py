"""Centralized validation contracts and error reporting for strategic game representations."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sse.core.actions import ActionSpace
from sse.core.games import (
    BayesianGame,
    CongestionGame,
    CooperativeGame,
    EvolutionaryGame,
    ExtensiveFormGame,
    PotentialGame,
    RepeatedGame,
    StackelbergGame,
    StochasticGame,
)
from sse.core.strategies import MixedStrategy, PureStrategy, StrategyProfile
from sse.models import FiniteNormalFormGame


@dataclass(frozen=True, slots=True)
class ValidationResult:
    """Structured report detailing validation errors and non-critical warnings."""

    errors: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def is_valid(self) -> bool:
        """Return True if no validation errors were found."""
        return len(self.errors) == 0

    @classmethod
    def ok(cls, warnings: Sequence[str] = ()) -> ValidationResult:
        """Construct a successful validation result."""
        return cls(errors=(), warnings=tuple(warnings))

    @classmethod
    def failure(cls, errors: Sequence[str], warnings: Sequence[str] = ()) -> ValidationResult:
        """Construct a failed validation result with error messages."""
        return cls(errors=tuple(errors), warnings=tuple(warnings))


def validate_probability_distribution(
    probs: Sequence[float],
    tol: float = 1e-10,
) -> ValidationResult:
    """Validate that a sequence of floats forms a well-defined probability distribution."""
    errors: list[str] = []
    warnings: list[str] = []

    if not probs:
        return ValidationResult.failure(["Probability sequence must not be empty."])

    for i, p in enumerate(probs):
        if not math.isfinite(p):
            errors.append(f"Probability at index {i} is not finite ({p}).")
        elif p < -tol:
            errors.append(f"Probability at index {i} is negative ({p}).")
        elif p < 0.0:
            warnings.append(f"Probability at index {i} was slightly negative ({p}) and will be clamped to 0.")

    if not errors:
        total = sum(probs)
        if abs(total - 1.0) > tol:
            errors.append(f"Probabilities sum to {total:.12f}, expected 1.0 within tolerance {tol}.")

    return ValidationResult(errors=tuple(errors), warnings=tuple(warnings))


def validate_action_in_space(action: Any, space: ActionSpace) -> ValidationResult:
    """Validate whether an action is an admissible member of an action space."""
    if not isinstance(space, ActionSpace):
        return ValidationResult.failure([f"Expected an ActionSpace instance, got {type(space).__name__}."])

    if not space.contains(action):
        return ValidationResult.failure([f"Action {action!r} is not contained in action space {space}."])

    return ValidationResult.ok()


def validate_strategy_profile(profile: StrategyProfile, game: Any) -> ValidationResult:
    """Validate that a StrategyProfile is complete and consistent with a game definition."""
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(profile, StrategyProfile):
        return ValidationResult.failure([f"Expected StrategyProfile, got {type(profile).__name__}."])

    # Extract expected player IDs
    expected_players: list[str] = []
    if isinstance(game, FiniteNormalFormGame):
        expected_players = [p.id for p in game.players]
    elif isinstance(game, (ExtensiveFormGame, BayesianGame, CooperativeGame, StochasticGame, CongestionGame)):
        expected_players = [str(p) for p in game.players]
    elif isinstance(game, StackelbergGame):
        expected_players = [game.leader, game.follower]
    elif isinstance(game, RepeatedGame):
        expected_players = [p.id for p in game.stage_game.players]
    elif isinstance(game, EvolutionaryGame):
        expected_players = ["player_1", "player_2"]
    else:
        warnings.append(f"Unrecognized game type {type(game).__name__}; skipping player list validation.")

    if expected_players:
        profile_players = set(profile.keys())
        expected_set = set(expected_players)
        missing = expected_set - profile_players
        extra = profile_players - expected_set

        if missing:
            errors.append(f"Profile is missing strategies for players: {sorted(missing)}.")
        if extra:
            warnings.append(f"Profile contains extraneous strategies for players: {sorted(extra)}.")

    # Validate action domains if applicable
    if isinstance(game, FiniteNormalFormGame):
        for idx, player in enumerate(game.players):
            if player.id not in profile:
                continue
            strat = profile[player.id]
            valid_actions = set(game.actions[idx])
            if isinstance(strat, PureStrategy):
                act_str = str(strat.action)
                if act_str not in valid_actions:
                    errors.append(
                        f"Action '{act_str}' for player '{player.id}' is not in valid action set {valid_actions}."
                    )
            elif isinstance(strat, MixedStrategy):
                for act in strat.support():
                    if act not in valid_actions:
                        errors.append(
                            f"Action '{act}' in mixed strategy support for '{player.id}' is not in valid action set {valid_actions}."
                        )

    return ValidationResult(errors=tuple(errors), warnings=tuple(warnings))


def validate_game(game: Any) -> ValidationResult:
    """Perform mathematical and structural validation on any supported game representation."""
    errors: list[str] = []
    warnings: list[str] = []

    if isinstance(game, FiniteNormalFormGame):
        # Basic integrity check already done by __post_init__; verify profile consistency
        if len(game.players) < 2:
            errors.append("FiniteNormalFormGame must have at least 2 players.")
        return ValidationResult(errors=tuple(errors), warnings=tuple(warnings))

    elif isinstance(game, ExtensiveFormGame):
        if not game.players:
            errors.append("ExtensiveFormGame must have at least 1 player.")
        if game.root_id not in game.nodes:
            errors.append(f"Root node '{game.root_id}' not found in nodes.")

    elif isinstance(game, BayesianGame):
        if not game.players:
            errors.append("BayesianGame must have at least 1 player.")
        for p in game.players:
            if p not in game.type_spaces:
                errors.append(f"Player '{p}' missing from type_spaces.")
            if p not in game.prior:
                errors.append(f"Player '{p}' missing from prior distributions.")
            if p not in game.action_spaces:
                errors.append(f"Player '{p}' missing from action_spaces.")

    elif isinstance(game, CooperativeGame):
        if not game.players:
            errors.append("CooperativeGame must have at least 1 player.")
        # Check normalization v(empty) == 0
        try:
            v_empty = float(game.characteristic_function(frozenset()))
            if abs(v_empty) > 1e-9:
                warnings.append(f"Characteristic function of empty coalition is {v_empty}, standard convention is 0.0.")
        except Exception as exc:
            errors.append(f"Characteristic function failed on empty coalition: {exc}.")

    elif isinstance(game, RepeatedGame):
        if game.discount_factor <= 0.0 or game.discount_factor > 1.0:
            errors.append(f"Discount factor must be in (0, 1], got {game.discount_factor}.")
        if game.num_rounds is None and game.discount_factor == 1.0:
            warnings.append("Infinite repeated game with discount factor 1.0 may have unbounded payoffs.")

    elif isinstance(game, EvolutionaryGame):
        if not game.payoff_matrix.is_symmetric():
            errors.append("EvolutionaryGame requires a symmetric payoff matrix.")

    elif isinstance(game, StochasticGame):
        if not game.states:
            errors.append("StochasticGame requires at least one state.")

    elif isinstance(game, StackelbergGame):
        if game.leader == game.follower:
            errors.append("Leader and follower cannot be the same player.")

    elif isinstance(game, CongestionGame):
        if not game.resources:
            errors.append("CongestionGame requires at least one resource.")

    elif isinstance(game, PotentialGame):
        try:
            if not game.verify_potential():
                errors.append("Potential function verification failed for PotentialGame.")
        except Exception as exc:
            errors.append(f"Potential function verification threw an exception: {exc}.")

    else:
        warnings.append(f"Unknown game model type '{type(game).__name__}', general validation skipped.")

    return ValidationResult(errors=tuple(errors), warnings=tuple(warnings))
