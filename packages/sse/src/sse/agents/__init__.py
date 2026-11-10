"""SSE Agents — Multi-agent strategic interaction, adaptive learning, and tournaments."""

from sse.agents.base import Agent, AgentConfig
from sse.agents.learning import (
    FictitiousPlayAgent,
    QLearningAgent,
    RegretMatchingAgent,
    ReplicatorAgent,
)
from sse.agents.strategies import (
    FixedStrategyAgent,
    GrimTriggerAgent,
    MixedStrategyAgent,
    RandomAgent,
    TitForTatAgent,
)
from sse.agents.tournament import (
    MatchResult,
    Tournament,
    TournamentResult,
)

__all__ = [
    "Agent",
    "AgentConfig",
    "FictitiousPlayAgent",
    "FixedStrategyAgent",
    "GrimTriggerAgent",
    "MatchResult",
    "MixedStrategyAgent",
    "QLearningAgent",
    "RandomAgent",
    "RegretMatchingAgent",
    "ReplicatorAgent",
    "TitForTatAgent",
    "Tournament",
    "TournamentResult",
]
