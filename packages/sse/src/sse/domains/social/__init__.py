"""Social domain extension package."""

from sse.domains.social.adapters import SocialSystemsAdapter
from sse.domains.social.models import (
    HawkDoveConflictGame,
    StagHuntGame,
    StrategicVotingGame,
)
from sse.domains.social.scenarios import (
    condorcet_voting,
    hawk_dove,
    stag_hunt,
)
from sse.domains.social.voting import (
    OstromCommonPoolGovernance,
    WeightedVotingBody,
)
from sse.models import FiniteNormalFormGame


class SocialSystemsDomain:
    name = "social"
    description = "Voting power indices, legislative coalitions, Hawk-Dove, and commons governance games."

    def list_scenarios(self) -> list[str]:
        return [
            "hawk_dove",
            "stag_hunt",
            "condorcet_voting",
        ]

    def get_scenario(self, name: str) -> FiniteNormalFormGame:
        factories = {
            "hawk_dove": hawk_dove,
            "stag_hunt": stag_hunt,
            "condorcet_voting": condorcet_voting,
        }
        if name not in factories:
            raise KeyError(f"Scenario '{name}' not found in social domain.")
        return factories[name]()


__all__ = [
    "HawkDoveConflictGame",
    "OstromCommonPoolGovernance",
    "SocialSystemsAdapter",
    "SocialSystemsDomain",
    "StagHuntGame",
    "StrategicVotingGame",
    "WeightedVotingBody",
    "condorcet_voting",
    "hawk_dove",
    "stag_hunt",
]
