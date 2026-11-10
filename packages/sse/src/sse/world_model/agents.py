"""Strategic Systems Engine - World Model Strategic Agents.

Defines rich strategic actor models that capture belief states, payoff parameters,
risk profiles, rationality bounds, and historical action tendencies.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from sse.contracts.world_state import EntityType


@dataclass
class StrategicProfile:
    """Behavioral and decision-theoretic profile of an agent."""

    agent_id: str
    name: str
    agent_type: EntityType = EntityType.COMPETITOR
    risk_tolerance: float = 0.5  # [0.0 = extreme risk averse, 1.0 = risk neutral/seeking]
    rationality_bound: float = 1.0  # Level-k or quantal response rationality [0.0 = noise, 1.0 = optimal]
    cooperativeness: float = 0.5  # Propensity to cooperate in social dilemmas [-1.0 to 1.0]
    patience_discount_gamma: float = 0.95  # Time preference / discount factor
    observed_actions_history: list[str] = field(default_factory=list)
    strategy_priors: dict[str, float] = field(default_factory=dict)
    known_preferences: dict[str, float] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    def record_action(self, action_id: str) -> None:
        """Records an observed action into the history log."""
        self.observed_actions_history.append(action_id)
        # Update empirical frequency
        total = len(self.observed_actions_history)
        counts: dict[str, int] = {}
        for act in self.observed_actions_history:
            counts[act] = counts.get(act, 0) + 1
        self.strategy_priors = {act: count / total for act, count in counts.items()}

    def predict_action_distribution(self, available_actions: list[str]) -> dict[str, float]:
        """Predicts probability distribution over available actions based on priors and rationality."""
        if not available_actions:
            return {}

        probs: dict[str, float] = {}
        # Base probabilities from observed priors or uniform
        uniform_p = 1.0 / len(available_actions)
        for act in available_actions:
            prior = self.strategy_priors.get(act, uniform_p)
            # Blend prior with rationality bound (higher rationality shifts towards preferred)
            pref = self.known_preferences.get(act, 0.0)
            score = prior * (1.0 - self.rationality_bound) + (pref if pref > 0 else prior) * self.rationality_bound
            probs[act] = max(0.001, score)

        total = sum(probs.values())
        return {k: v / total for k, v in probs.items()}


StrategicAgentModel = StrategicProfile

class StrategicAgentRegistry:
    """Maintains models of all strategic players in the environment."""

    def __init__(self) -> None:
        self._profiles: dict[str, StrategicProfile] = {}

    def register_profile(self, profile: StrategicProfile) -> StrategicProfile:
        self._profiles[profile.agent_id] = copy.deepcopy(profile)
        return self._profiles[profile.agent_id]

    def get_profile(self, agent_id: str) -> StrategicProfile | None:
        p = self._profiles.get(agent_id)
        return copy.deepcopy(p) if p else None

    def list_profiles(self) -> list[StrategicProfile]:
        return [copy.deepcopy(p) for p in self._profiles.values()]
