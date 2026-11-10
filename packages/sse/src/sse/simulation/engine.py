"""Core simulation engine for strategic interactions and repeated games."""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sse.models import FiniteNormalFormGame

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SimulationConfig:
    """Configuration for a simulation run.

    Attributes:
        seed: Random seed for reproducibility.
        max_steps: Maximum number of rounds/steps allowed in a simulation.
        max_time_seconds: Wall-clock execution timeout in seconds.
        record_history: Whether to store each StepResult in the output result.
        parallel: Whether to execute independent runs in parallel.
        tolerance: Numerical threshold for convergence detection.
    """

    seed: int | None = None
    max_steps: int = 1000
    max_time_seconds: float = 300.0
    record_history: bool = True
    parallel: bool = False
    tolerance: float = 1e-6

    def __post_init__(self) -> None:
        if self.max_steps <= 0:
            raise ValueError(f"max_steps must be positive, got {self.max_steps}")
        if self.max_time_seconds <= 0.0:
            raise ValueError(f"max_time_seconds must be positive, got {self.max_time_seconds}")
        if self.tolerance < 0.0:
            raise ValueError(f"tolerance must be non-negative, got {self.tolerance}")


@dataclass(frozen=True, slots=True)
class StepResult:
    """Result of a single simulation step.

    Attributes:
        step: 0-indexed step/round number.
        actions: Mapping of player ID to action taken.
        payoffs: Mapping of player ID to payoff received.
        state: Optional environment or interaction state at this step.
    """

    step: int
    actions: dict[str, Any]
    payoffs: dict[str, float]
    state: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.step < 0:
            raise ValueError(f"step must be non-negative, got {self.step}")


@dataclass(slots=True)
class SimulationResult:
    """Complete result of a simulation run.

    Attributes:
        config: Configuration used for this simulation run.
        steps: Recorded step results (empty if record_history is False).
        total_payoffs: Cumulative payoffs keyed by player ID.
        metadata: Arbitrary metadata regarding the run.
        start_time: UTC timestamp when simulation started.
        end_time: UTC timestamp when simulation ended.
        converged: Whether the interaction converged prior to max_steps.
    """

    config: SimulationConfig
    steps: list[StepResult]
    total_payoffs: dict[str, float]
    metadata: dict[str, Any]
    start_time: datetime
    end_time: datetime
    converged: bool = False

    @property
    def duration_seconds(self) -> float:
        """Total duration of the simulation run in seconds."""
        return (self.end_time - self.start_time).total_seconds()

    @property
    def step_count(self) -> int:
        """Number of steps executed."""
        return self.metadata.get("steps_executed", len(self.steps))

    @property
    def average_payoffs(self) -> dict[str, float]:
        """Average payoff per step per player."""
        count = self.step_count
        if count == 0:
            return {pid: 0.0 for pid in self.total_payoffs}
        return {pid: total / count for pid, total in self.total_payoffs.items()}


class SimulationEngine:
    """Execute strategic interactions between agents and game environments."""

    def __init__(self, default_config: SimulationConfig | None = None) -> None:
        self.default_config = default_config or SimulationConfig()

    def _resolve_players(self, game: Any, strategies: Any) -> list[str]:
        """Extract canonical player identifiers in consistent order."""
        if isinstance(game, FiniteNormalFormGame):
            return [player.id for player in game.players]
        if hasattr(game, "players"):
            players = game.players
            return [p.id if hasattr(p, "id") else str(p) for p in players]
        if isinstance(game, Mapping) and "players" in game:
            raw = game["players"]
            return [p.id if hasattr(p, "id") else str(p) for p in raw]
        if isinstance(strategies, Mapping):
            return list(strategies.keys())
        if isinstance(strategies, Sequence):
            return [f"player_{i}" for i in range(len(strategies))]
        raise ValueError("Could not determine player identifiers from game or strategies.")

    def _normalize_strategies(
        self, player_ids: list[str], strategies: Any
    ) -> dict[str, Any]:
        """Map player IDs to their respective strategy/agent instances."""
        if isinstance(strategies, Mapping):
            missing = [pid for pid in player_ids if pid not in strategies]
            if missing:
                raise ValueError(f"Missing strategy for players: {missing}")
            return {pid: strategies[pid] for pid in player_ids}
        if isinstance(strategies, Sequence):
            if len(strategies) != len(player_ids):
                raise ValueError(
                    f"Expected {len(player_ids)} strategies, got {len(strategies)}"
                )
            return {pid: strat for pid, strat in zip(player_ids, strategies)}
        if len(player_ids) == 1:
            return {player_ids[0]: strategies}
        raise ValueError(
            "Strategies must be a Mapping[str, Any] or Sequence[Any] matching players."
        )

    def _evaluate_game(
        self, game: Any, actions: dict[str, Any], player_ids: list[str]
    ) -> dict[str, float]:
        """Compute payoffs for an action profile."""
        if isinstance(game, FiniteNormalFormGame):
            profile_indices: list[int] = []
            for player_idx, player in enumerate(game.players):
                action = actions[player.id]
                player_actions = game.actions[player_idx]
                if isinstance(action, int) and 0 <= action < len(player_actions):
                    profile_indices.append(action)
                elif isinstance(action, str) and action in player_actions:
                    profile_indices.append(player_actions.index(action))
                else:
                    raise ValueError(
                        f"Action '{action}' is not valid for player '{player.id}'. "
                        f"Valid actions: {player_actions}"
                    )
            payoff_tuple = game.payoff(profile_indices)
            return {
                player.id: float(payoff_tuple[idx])
                for idx, player in enumerate(game.players)
            }

        if callable(game):
            result = game(actions)
            if isinstance(result, Mapping):
                return {pid: float(result[pid]) for pid in player_ids}
            if isinstance(result, (Sequence, tuple)):
                return {pid: float(v) for pid, v in zip(player_ids, result)}
            raise TypeError(f"Callable game returned unsupported type: {type(result)}")

        if hasattr(game, "evaluate"):
            res = game.evaluate(actions)
            if isinstance(res, Mapping):
                return {pid: float(res[pid]) for pid in player_ids}
            if isinstance(res, (Sequence, tuple)):
                return {pid: float(v) for pid, v in zip(player_ids, res)}

        if hasattr(game, "payoff"):
            res = game.payoff(actions)
            if isinstance(res, Mapping):
                return {pid: float(res[pid]) for pid in player_ids}
            if isinstance(res, (Sequence, tuple)):
                return {pid: float(v) for pid, v in zip(player_ids, res)}

        raise TypeError(
            f"Game of type {type(game)} is not callable and has no evaluate/payoff method."
        )

    def _select_action(self, agent: Any, player_id: str, observation: Any) -> Any:
        """Query an agent or strategy for its chosen action."""
        if hasattr(agent, "select_action"):
            try:
                return agent.select_action(observation)
            except TypeError:
                return agent.select_action()
        if callable(agent):
            try:
                return agent(observation)
            except TypeError:
                return agent()
        # Direct static action
        return agent

    def _update_agent(
        self, agent: Any, action: Any, reward: float, next_observation: Any
    ) -> None:
        """Notify an agent of the transition and payoff."""
        if hasattr(agent, "update"):
            try:
                agent.update(action=action, reward=reward, next_observation=next_observation)
            except TypeError:
                try:
                    agent.update(action, reward, next_observation)
                except TypeError:
                    try:
                        agent.update(action, reward)
                    except TypeError:
                        pass

    def run_single(
        self, game: Any, strategies: Any, config: SimulationConfig | None = None
    ) -> SimulationResult:
        """Run a single-shot game with given strategies."""
        cfg = config or self.default_config
        start_time = datetime.now(UTC)
        player_ids = self._resolve_players(game, strategies)
        strat_map = self._normalize_strategies(player_ids, strategies)

        # Seed random if configured
        if cfg.seed is not None:
            random.seed(cfg.seed)

        # Reset strategies if available
        for strat in strat_map.values():
            if hasattr(strat, "reset"):
                strat.reset()

        initial_obs = {
            "step": 0,
            "last_actions": {},
            "last_payoffs": {},
            "players": list(player_ids),
        }

        actions: dict[str, Any] = {}
        for pid in player_ids:
            obs = dict(initial_obs)
            obs["player_id"] = pid
            actions[pid] = self._select_action(strat_map[pid], pid, obs)

        payoffs = self._evaluate_game(game, actions, player_ids)

        # Step results
        step_res = StepResult(step=0, actions=actions, payoffs=payoffs)
        steps = [step_res] if cfg.record_history else []

        next_obs = {
            "step": 1,
            "last_actions": dict(actions),
            "last_payoffs": dict(payoffs),
            "players": list(player_ids),
        }
        for pid in player_ids:
            agent_obs = dict(next_obs)
            agent_obs["player_id"] = pid
            self._update_agent(strat_map[pid], actions[pid], payoffs[pid], agent_obs)

        end_time = datetime.now(UTC)
        return SimulationResult(
            config=cfg,
            steps=steps,
            total_payoffs=dict(payoffs),
            metadata={"mode": "single_shot", "steps_executed": 1},
            start_time=start_time,
            end_time=end_time,
            converged=True,
        )

    def run_repeated(
        self,
        game: Any,
        strategies: Any,
        num_rounds: int,
        config: SimulationConfig | None = None,
    ) -> SimulationResult:
        """Run a repeated game for num_rounds."""
        if num_rounds <= 0:
            raise ValueError(f"num_rounds must be positive, got {num_rounds}")

        cfg = config or self.default_config
        start_time = datetime.now(UTC)
        start_mono = time.monotonic()

        player_ids = self._resolve_players(game, strategies)
        strat_map = self._normalize_strategies(player_ids, strategies)

        if cfg.seed is not None:
            random.seed(cfg.seed)

        for strat in strat_map.values():
            if hasattr(strat, "reset"):
                strat.reset()

        total_payoffs: dict[str, float] = {pid: 0.0 for pid in player_ids}
        steps: list[StepResult] = []

        last_actions: dict[str, Any] = {}
        last_payoffs: dict[str, float] = {}

        consecutive_stable_rounds = 0
        convergence_window = 10
        converged = False

        max_steps_allowed = min(num_rounds, cfg.max_steps)

        for step_idx in range(max_steps_allowed):
            # Check timeout
            if time.monotonic() - start_mono > cfg.max_time_seconds:
                logger.warning(
                    "Simulation exceeded max_time_seconds=%s at step %d",
                    cfg.max_time_seconds,
                    step_idx,
                )
                break

            obs = {
                "step": step_idx,
                "last_actions": dict(last_actions),
                "last_payoffs": dict(last_payoffs),
                "players": list(player_ids),
            }

            actions: dict[str, Any] = {}
            for pid in player_ids:
                agent_obs = dict(obs)
                agent_obs["player_id"] = pid
                # Provide opponent's last action convenience key if 2-player
                opponents = [other for other in player_ids if other != pid]
                if len(opponents) == 1 and opponents[0] in last_actions:
                    agent_obs["opponent_action"] = last_actions[opponents[0]]
                actions[pid] = self._select_action(strat_map[pid], pid, agent_obs)

            payoffs = self._evaluate_game(game, actions, player_ids)

            # Check convergence
            if actions == last_actions:
                payoff_diff = max(
                    abs(payoffs[pid] - last_payoffs.get(pid, 0.0)) for pid in player_ids
                )
                if payoff_diff <= cfg.tolerance:
                    consecutive_stable_rounds += 1
                else:
                    consecutive_stable_rounds = 0
            else:
                consecutive_stable_rounds = 0

            if consecutive_stable_rounds >= convergence_window:
                converged = True

            for pid in player_ids:
                total_payoffs[pid] += payoffs[pid]

            step_res = StepResult(step=step_idx, actions=actions, payoffs=payoffs)
            if cfg.record_history:
                steps.append(step_res)

            next_obs = {
                "step": step_idx + 1,
                "last_actions": dict(actions),
                "last_payoffs": dict(payoffs),
                "players": list(player_ids),
            }
            for pid in player_ids:
                agent_obs = dict(next_obs)
                agent_obs["player_id"] = pid
                self._update_agent(strat_map[pid], actions[pid], payoffs[pid], agent_obs)

            last_actions = actions
            last_payoffs = payoffs

            if converged:
                break

        end_time = datetime.now(UTC)
        steps_executed = len(steps) if cfg.record_history else step_idx + 1

        return SimulationResult(
            config=cfg,
            steps=steps,
            total_payoffs=total_payoffs,
            metadata={
                "mode": "repeated",
                "steps_requested": num_rounds,
                "steps_executed": steps_executed,
            },
            start_time=start_time,
            end_time=end_time,
            converged=converged,
        )

    def run_monte_carlo(
        self,
        game: Any,
        strategies: Any,
        num_samples: int,
        config: SimulationConfig | None = None,
    ) -> list[SimulationResult]:
        """Run Monte Carlo simulations with independent random seeds."""
        if num_samples <= 0:
            raise ValueError(f"num_samples must be positive, got {num_samples}")

        base_cfg = config or self.default_config
        base_seed = base_cfg.seed if base_cfg.seed is not None else random.randint(0, 1_000_000)

        def _run_single_sample(sample_idx: int) -> SimulationResult:
            sample_seed = base_seed + sample_idx * 10007
            sample_cfg = SimulationConfig(
                seed=sample_seed,
                max_steps=base_cfg.max_steps,
                max_time_seconds=base_cfg.max_time_seconds,
                record_history=base_cfg.record_history,
                parallel=False,
                tolerance=base_cfg.tolerance,
            )
            # Create isolated deep copies of strategies if mutable
            try:
                sample_strats = deepcopy(strategies)
            except Exception:
                sample_strats = strategies

            if sample_cfg.max_steps == 1:
                return self.run_single(game, sample_strats, sample_cfg)
            return self.run_repeated(
                game, sample_strats, num_rounds=sample_cfg.max_steps, config=sample_cfg
            )

        if base_cfg.parallel and num_samples > 1:
            with ThreadPoolExecutor() as executor:
                results = list(executor.map(_run_single_sample, range(num_samples)))
        else:
            results = [_run_single_sample(i) for i in range(num_samples)]

        return results

    def parameter_sweep(
        self,
        game_factory: Callable[..., Any],
        param_name: str,
        param_values: Sequence[Any],
        strategies: Any,
        config: SimulationConfig | None = None,
    ) -> dict[Any, SimulationResult]:
        """Sweep a parameter and collect simulation results for each value."""
        if not param_values:
            raise ValueError("param_values sequence must not be empty.")

        cfg = config or self.default_config
        results: dict[Any, SimulationResult] = {}

        for val in param_values:
            try:
                game_instance = game_factory(**{param_name: val})
            except TypeError:
                game_instance = game_factory(val)

            # Deepcopy strategies for isolated parameter runs
            try:
                strats = deepcopy(strategies)
            except Exception:
                strats = strategies

            if cfg.max_steps == 1:
                res = self.run_single(game_instance, strats, cfg)
            else:
                res = self.run_repeated(
                    game_instance, strats, num_rounds=cfg.max_steps, config=cfg
                )
            results[val] = res

        return results
