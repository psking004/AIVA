"""Pre-configured social systems scenarios."""

from __future__ import annotations

from sse.domains.social.models import (
    HawkDoveConflictGame,
    StagHuntGame,
    StrategicVotingGame,
)
from sse.models import FiniteNormalFormGame


def hawk_dove() -> FiniteNormalFormGame:
    return HawkDoveConflictGame().to_game()


def stag_hunt() -> FiniteNormalFormGame:
    return StagHuntGame().to_game()


def condorcet_voting() -> FiniteNormalFormGame:
    return StrategicVotingGame().to_game()

