"""Base agent interfaces and lifecycle contracts for strategic interaction."""

from __future__ import annotations

import random
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from sse.core.actions import ActionSpace


@dataclass(frozen=True, slots=True)
class AgentConfig:
    """Hyperparameters and runtime settings for strategic agents."""

    learning_rate: float = 0.1
    discount_factor: float = 0.95
    exploration_rate: float = 0.1
    seed: int | None = None


class Agent(ABC):
    """Abstract base class for all strategic and adaptive agents."""

    def __init__(
        self,
        agent_id: str,
        action_space: ActionSpace,
        config: AgentConfig | None = None,
    ) -> None:
        if not agent_id.strip():
            raise ValueError("agent_id must not be empty.")
        self.agent_id = agent_id
        self.action_space = action_space
        self.config = config or AgentConfig()
        self.rng = random.Random(self.config.seed)
        self._history: list[dict[str, Any]] = []

    @abstractmethod
    def select_action(self, observation: Any = None) -> Any:
        """Choose an action given the current environmental observation or history."""
        ...

    @abstractmethod
    def update(
        self,
        action: Any,
        reward: float,
        next_observation: Any = None,
    ) -> None:
        """Update internal state, beliefs, or policy following environmental feedback."""
        ...

    def reset(self) -> None:
        """Reset internal history and temporary state for a new episode."""
        self._history.clear()
        self.rng = random.Random(self.config.seed)

    @property
    def history(self) -> list[dict[str, Any]]:
        """Read-only access to step history."""
        return list(self._history)
