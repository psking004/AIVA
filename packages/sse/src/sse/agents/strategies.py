"""Classical and heuristic strategic baseline agents."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sse.agents.base import Agent, AgentConfig
from sse.core.actions import ActionSpace, DiscreteActionSpace


class RandomAgent(Agent):
    """Uniform random decision-maker across the available action space."""

    def select_action(self, observation: Any = None) -> Any:
        return self.action_space.sample(self.rng)

    def update(self, action: Any, reward: float, next_observation: Any = None) -> None:
        self._history.append({"action": action, "reward": reward})


class FixedStrategyAgent(Agent):
    """Agent that persistently selects a single predefined action."""

    def __init__(
        self,
        agent_id: str,
        action_space: ActionSpace,
        action: Any,
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        if not self.action_space.contains(action):
            raise ValueError(f"Action '{action}' is not in the agent's action space.")
        self.action = action

    def select_action(self, observation: Any = None) -> Any:
        return self.action

    def update(self, action: Any, reward: float, next_observation: Any = None) -> None:
        self._history.append({"action": action, "reward": reward})


class MixedStrategyAgent(Agent):
    """Agent that samples actions from a fixed probability distribution."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        probabilities: Sequence[float],
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        if len(probabilities) != action_space.size:
            raise ValueError(
                f"Probabilities length ({len(probabilities)}) must match actions ({action_space.size})."
            )
        if abs(sum(probabilities) - 1.0) > 1e-7:
            raise ValueError("Probabilities must sum to 1.0.")
        if any(p < 0.0 for p in probabilities):
            raise ValueError("Probabilities must be non-negative.")
        self.probabilities = tuple(probabilities)

    def select_action(self, observation: Any = None) -> Any:
        actions = self.action_space.to_list()
        return self.rng.choices(actions, weights=self.probabilities, k=1)[0]

    def update(self, action: Any, reward: float, next_observation: Any = None) -> None:
        self._history.append({"action": action, "reward": reward})


class TitForTatAgent(Agent):
    """Classical Axelrod Tit-for-Tat agent for 2-action social dilemmas."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        cooperate_action: str = "Cooperate",
        defect_action: str = "Defect",
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action
        self._last_opponent_action: str | None = None

    def select_action(self, observation: Any = None) -> Any:
        # Cooperate on round 1, otherwise copy opponent's last move
        if self._last_opponent_action is None:
            return self.cooperate_action
        return self._last_opponent_action

    def update(self, action: Any, reward: float, next_observation: Any = None) -> None:
        # If next_observation is the opponent's action
        if next_observation is not None:
            self._last_opponent_action = str(next_observation)
        self._history.append({
            "action": action,
            "reward": reward,
            "opponent_action": self._last_opponent_action,
        })

    def reset(self) -> None:
        super().reset()
        self._last_opponent_action = None


class GrimTriggerAgent(Agent):
    """Grim Trigger agent: cooperates until the opponent defects once, then defects forever."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        cooperate_action: str = "Cooperate",
        defect_action: str = "Defect",
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        self.cooperate_action = cooperate_action
        self.defect_action = defect_action
        self._triggered = False

    def select_action(self, observation: Any = None) -> Any:
        return self.defect_action if self._triggered else self.cooperate_action

    def update(self, action: Any, reward: float, next_observation: Any = None) -> None:
        if next_observation is not None and str(next_observation) == self.defect_action:
            self._triggered = True
        self._history.append({
            "action": action,
            "reward": reward,
            "triggered": self._triggered,
        })

    def reset(self) -> None:
        super().reset()
        self._triggered = False
