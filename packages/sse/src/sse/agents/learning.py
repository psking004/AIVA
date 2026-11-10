"""Multi-agent reinforcement learning and adaptive decision-making agents."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Sequence
from typing import Any

from sse.agents.base import Agent, AgentConfig
from sse.core.actions import DiscreteActionSpace


class QLearningAgent(Agent):
    """Tabular Q-learning agent with epsilon-greedy exploration."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        self.q_table: dict[str, dict[str, float]] = defaultdict(
            lambda: {a: 0.0 for a in self.action_space.to_list()}
        )
        self._last_state: str = "default_state"
        self._last_action: str | None = None

    def select_action(self, observation: Any = None) -> Any:
        state = str(observation) if observation is not None else "default_state"
        self._last_state = state
        actions = self.action_space.to_list()

        # Epsilon-greedy exploration
        if self.rng.random() < self.config.exploration_rate:
            action = self.rng.choice(actions)
        else:
            q_values = self.q_table[state]
            max_q = max(q_values.values())
            best_actions = [a for a, q in q_values.items() if abs(q - max_q) < 1e-9]
            action = self.rng.choice(best_actions)

        self._last_action = action
        return action

    def update(
        self,
        action: Any,
        reward: float,
        next_observation: Any = None,
    ) -> None:
        state = self._last_state
        act_str = str(action)
        next_state = str(next_observation) if next_observation is not None else state

        max_next_q = max(self.q_table[next_state].values())
        current_q = self.q_table[state][act_str]

        # Temporal-difference Bellman update
        lr = self.config.learning_rate
        gamma = self.config.discount_factor
        td_target = reward + gamma * max_next_q
        self.q_table[state][act_str] += lr * (td_target - current_q)

        self._history.append({
            "state": state,
            "action": act_str,
            "reward": reward,
            "next_state": next_state,
            "q_value": self.q_table[state][act_str],
        })

    def reset(self) -> None:
        super().reset()
        self._last_action = None
        self._last_state = "default_state"


class FictitiousPlayAgent(Agent):
    """Fictitious play: tracks opponent frequency and best-responds to empirical beliefs."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        payoff_function: Callable[[str, str], float],
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        self.payoff_function = payoff_function
        self.opponent_action_counts: dict[str, int] = defaultdict(int)
        self.total_rounds: int = 0

    def select_action(self, observation: Any = None) -> Any:
        actions = self.action_space.to_list()
        if self.total_rounds == 0:
            return self.rng.choice(actions)

        # Compute expected payoff against opponent's empirical distribution
        best_a = None
        best_exp = float("-inf")

        for my_act in actions:
            expected_u = sum(
                (count / self.total_rounds) * self.payoff_function(my_act, opp_act)
                for opp_act, count in self.opponent_action_counts.items()
            )
            if expected_u > best_exp:
                best_exp = expected_u
                best_a = my_act

        return best_a if best_a is not None else self.rng.choice(actions)

    def update(
        self,
        action: Any,
        reward: float,
        next_observation: Any = None,
    ) -> None:
        if next_observation is not None:
            opp_act = str(next_observation)
            self.opponent_action_counts[opp_act] += 1
            self.total_rounds += 1
        self._history.append({"action": action, "reward": reward})

    def reset(self) -> None:
        super().reset()
        self.opponent_action_counts.clear()
        self.total_rounds = 0


class RegretMatchingAgent(Agent):
    """Agent that adapts its strategy proportionally to positive cumulative regrets."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        counterfactual_payoff: Callable[[str, Any], float],
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        self.counterfactual_payoff = counterfactual_payoff
        self.cumulative_regrets: dict[str, float] = {
            a: 0.0 for a in self.action_space.to_list()
        }

    def select_action(self, observation: Any = None) -> Any:
        actions = self.action_space.to_list()
        pos_regrets = [max(0.0, self.cumulative_regrets[a]) for a in actions]
        sum_pos = sum(pos_regrets)

        if sum_pos > 0:
            probs = [r / sum_pos for r in pos_regrets]
            return self.rng.choices(actions, weights=probs, k=1)[0]
        return self.rng.choice(actions)

    def update(
        self,
        action: Any,
        reward: float,
        next_observation: Any = None,
    ) -> None:
        # Update regret for all alternative actions
        actions = self.action_space.to_list()
        for a in actions:
            cf_reward = self.counterfactual_payoff(a, next_observation)
            self.cumulative_regrets[a] += cf_reward - reward

        self._history.append({"action": action, "reward": reward})

    def reset(self) -> None:
        super().reset()
        for a in self.action_space.to_list():
            self.cumulative_regrets[a] = 0.0


class ReplicatorAgent(Agent):
    """Population-based strategy agent that updates probability vector proportionally to fitness."""

    def __init__(
        self,
        agent_id: str,
        action_space: DiscreteActionSpace,
        initial_distribution: Sequence[float] | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        super().__init__(agent_id, action_space, config)
        actions = self.action_space.to_list()
        n = len(actions)
        if initial_distribution is None:
            self.distribution = [1.0 / n] * n
        else:
            if len(initial_distribution) != n:
                raise ValueError("initial_distribution length must match action space.")
            s = sum(initial_distribution)
            self.distribution = [v / s for v in initial_distribution]

    def select_action(self, observation: Any = None) -> Any:
        actions = self.action_space.to_list()
        return self.rng.choices(actions, weights=self.distribution, k=1)[0]

    def update(
        self,
        action: Any,
        reward: float,
        next_observation: Any = None,
    ) -> None:
        actions = self.action_space.to_list()
        act_idx = actions.index(str(action))

        # Replicator shift: boost played action proportionally to reward
        # x_i' = x_i * (1 + lr * reward)
        lr = self.config.learning_rate
        shift = max(0.01, 1.0 + lr * reward)
        self.distribution[act_idx] *= shift

        # Re-normalize
        total = sum(self.distribution)
        if total > 0:
            self.distribution = [v / total for v in self.distribution]

        self._history.append({
            "action": action,
            "reward": reward,
            "distribution": list(self.distribution),
        })

    def reset(self) -> None:
        super().reset()
        n = self.action_space.size
        self.distribution = [1.0 / n] * n
