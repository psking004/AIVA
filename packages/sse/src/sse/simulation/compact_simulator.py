"""Strategic Systems Engine - Streamed O(1)-Memory Monte Carlo Simulator.

Executes high-throughput repeated game simulations and tournaments without accumulating
round histories in memory, using Welford's one-pass algorithm, downside semi-variance,
and bounded reservoir sampling for Value-at-Risk (VaR-95) tracking.
"""

from __future__ import annotations

import collections
import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from collections.abc import Iterator

    from sse.agents.policies import StrategicPolicy


@dataclass(slots=True)
class RunningMoments:
    """Welford's one-pass running statistics accumulator with O(1) memory."""

    count: int = 0
    mean: float = 0.0
    m2: float = 0.0
    downside_m2: float = 0.0
    min_val: float = float("inf")
    max_val: float = float("-inf")
    # Bounded reservoir for non-parametric quantile estimation (e.g., VaR-95)
    _reservoir: list[float] = field(default_factory=list)
    _reservoir_capacity: int = 512

    def update(self, x: float, downside_threshold: float | None = None, rng: np.random.Generator | None = None) -> None:
        """Update running statistics with observation x."""
        self.count += 1
        delta = x - self.mean
        self.mean += delta / self.count
        delta2 = x - self.mean
        self.m2 += delta * delta2

        # Downside deviation: deviation below threshold (or running mean if threshold is None)
        threshold = self.mean if downside_threshold is None else downside_threshold
        if x < threshold:
            self.downside_m2 += (x - threshold) ** 2

        self.min_val = min(self.min_val, x)
        self.max_val = max(self.max_val, x)

        # Fixed-size Reservoir Sampling (Algorithm R)
        if len(self._reservoir) < self._reservoir_capacity:
            self._reservoir.append(x)
        else:
            j = rng.integers(0, self.count) if rng is not None else int(self.count * 0.5) % self.count
            if j < self._reservoir_capacity:
                self._reservoir[j] = x

    @property
    def variance(self) -> float:
        """Sample variance."""
        return self.m2 / (self.count - 1) if self.count > 1 else 0.0

    @property
    def std_dev(self) -> float:
        """Sample standard deviation."""
        return math.sqrt(max(0.0, self.variance))

    @property
    def downside_semi_variance(self) -> float:
        """Downside semi-variance."""
        return self.downside_m2 / (self.count - 1) if self.count > 1 else 0.0

    @property
    def downside_semi_deviation(self) -> float:
        """Downside semi-deviation (standard deviation of losses)."""
        return math.sqrt(max(0.0, self.downside_semi_variance))

    def compute_var_95(self) -> float:
        """Compute empirical Value-at-Risk (5th percentile of payoff distribution).

        Returns the 5th percentile payoff (or parametric fallback if reservoir is small).
        """
        if not self._reservoir:
            return 0.0
        if len(self._reservoir) >= 20:
            return float(np.percentile(self._reservoir, 5.0))
        # Parametric fallback: mean - 1.64485 * std_dev
        return float(self.mean - 1.64485 * self.std_dev)


@dataclass(frozen=True, slots=True)
class RoundInteraction:
    """Lightweight single-round interaction record."""

    round_idx: int
    action_p1: int
    action_p2: int
    payoff_p1: float
    payoff_p2: float


@dataclass(frozen=True, slots=True)
class StreamedEvaluationResult:
    """Statistical summary of a streamed multi-round simulation."""

    policy_name_p1: str
    policy_name_p2: str
    rounds_count: int
    mean_payoff_p1: float
    std_payoff_p1: float
    var_95_p1: float
    downside_semi_variance_p1: float
    mean_payoff_p2: float
    std_payoff_p2: float
    var_95_p2: float
    downside_semi_variance_p2: float
    cooperation_rate_p1: float
    cooperation_rate_p2: float
    net_exploitability: float  # max(0.0, mean_payoff_p2 - mean_payoff_p1)


@dataclass(frozen=True, slots=True)
class StreamedTournamentResult:
    """Summary of a round-robin streamed tournament across policy pairs."""

    policy_names: list[str]
    rankings: list[tuple[str, float]]  # (policy_name, average_payoff)
    matchups: dict[tuple[str, str], StreamedEvaluationResult]


class StreamedTournamentSimulator:
    """Low-memory repeated interaction simulator operating in strict O(1) heap space."""

    def __init__(
        self,
        payoff_matrix: np.ndarray,
        trembling_noise: float = 0.0,
        cooperate_action: int = 0,
        sliding_window_size: int = 10,
    ) -> None:
        """Initialize simulator with a 2-player bimatrix.

        Args:
            payoff_matrix: Array of shape (m, n, 2) or (m, n) for symmetric payoffs.
            trembling_noise: Probability of random accidental action perturbation.
            cooperate_action: Index of the cooperative action (typically 0).
            sliding_window_size: Maximum action history depth passed to policies.
        """
        if payoff_matrix.ndim == 2:
            m, n = payoff_matrix.shape
            tensor = np.zeros((m, n, 2), dtype=np.float32)
            for i in range(m):
                for j in range(n):
                    tensor[i, j, 0] = payoff_matrix[i, j]
                    tensor[i, j, 1] = payoff_matrix[j, i]
            self.payoff_matrix = tensor
        elif payoff_matrix.ndim == 3 and payoff_matrix.shape[2] == 2:
            self.payoff_matrix = np.asarray(payoff_matrix, dtype=np.float32)
        else:
            raise ValueError(f"Invalid payoff matrix shape: {payoff_matrix.shape}")

        self.num_actions_p1 = self.payoff_matrix.shape[0]
        self.num_actions_p2 = self.payoff_matrix.shape[1]
        self.trembling_noise = trembling_noise
        self.cooperate_action = cooperate_action
        self.sliding_window_size = sliding_window_size

    def stream_rounds(
        self,
        policy_p1: StrategicPolicy,
        policy_p2: StrategicPolicy,
        rounds: int,
        seed: int = 42,
    ) -> Iterator[RoundInteraction]:
        """Stream round-by-round interactions without accumulating history in memory."""
        rng = np.random.default_rng(seed)
        policy_p1.reset()
        policy_p2.reset()

        hist_p1: collections.deque[int] = collections.deque(maxlen=self.sliding_window_size)
        hist_p2: collections.deque[int] = collections.deque(maxlen=self.sliding_window_size)

        for r in range(rounds):
            list_p1 = list(hist_p1)
            list_p2 = list(hist_p2)

            # Select actions
            a1 = policy_p1.select_action(r, list_p1, list_p2, self.payoff_matrix, rng)
            a2 = policy_p2.select_action(r, list_p2, list_p1, self.payoff_matrix, rng)

            # Apply trembling-hand perturbation
            if self.trembling_noise > 0.0 and rng.random() < self.trembling_noise:
                a1 = int(rng.integers(0, self.num_actions_p1))
            if self.trembling_noise > 0.0 and rng.random() < self.trembling_noise:
                a2 = int(rng.integers(0, self.num_actions_p2))

            # Lookup stage payoffs
            u1 = float(self.payoff_matrix[a1, a2, 0])
            u2 = float(self.payoff_matrix[a1, a2, 1])

            # Update bounded history
            hist_p1.append(a1)
            hist_p2.append(a2)

            yield RoundInteraction(
                round_idx=r,
                action_p1=a1,
                action_p2=a2,
                payoff_p1=u1,
                payoff_p2=u2,
            )

    def run_streamed_evaluation(
        self,
        policy_p1: StrategicPolicy,
        policy_p2: StrategicPolicy,
        rounds: int = 1000,
        seed: int = 42,
    ) -> StreamedEvaluationResult:
        """Run a memory-bounded Monte Carlo simulation between two policies."""
        rng = np.random.default_rng(seed)
        stats_p1 = RunningMoments()
        stats_p2 = RunningMoments()

        coop_count_p1 = 0
        coop_count_p2 = 0

        for interaction in self.stream_rounds(policy_p1, policy_p2, rounds=rounds, seed=seed):
            stats_p1.update(interaction.payoff_p1, rng=rng)
            stats_p2.update(interaction.payoff_p2, rng=rng)

            if interaction.action_p1 == self.cooperate_action:
                coop_count_p1 += 1
            if interaction.action_p2 == self.cooperate_action:
                coop_count_p2 += 1

        n = max(1, rounds)
        return StreamedEvaluationResult(
            policy_name_p1=policy_p1.name,
            policy_name_p2=policy_p2.name,
            rounds_count=rounds,
            mean_payoff_p1=stats_p1.mean,
            std_payoff_p1=stats_p1.std_dev,
            var_95_p1=stats_p1.compute_var_95(),
            downside_semi_variance_p1=stats_p1.downside_semi_variance,
            mean_payoff_p2=stats_p2.mean,
            std_payoff_p2=stats_p2.std_dev,
            var_95_p2=stats_p2.compute_var_95(),
            downside_semi_variance_p2=stats_p2.downside_semi_variance,
            cooperation_rate_p1=coop_count_p1 / n,
            cooperation_rate_p2=coop_count_p2 / n,
            net_exploitability=max(0.0, stats_p2.mean - stats_p1.mean),
        )

    def run_streamed_tournament(
        self,
        policies: list[StrategicPolicy],
        rounds_per_match: int = 1000,
        seed: int = 42,
    ) -> StreamedTournamentResult:
        """Execute a round-robin tournament across all policy pairs in O(1) memory."""
        matchups: dict[tuple[str, str], StreamedEvaluationResult] = {}
        cumulative_scores: dict[str, float] = {p.name: 0.0 for p in policies}
        match_counts: dict[str, int] = {p.name: 0 for p in policies}

        seed_offset = seed
        for i, p1 in enumerate(policies):
            for j, p2 in enumerate(policies):
                eval_res = self.run_streamed_evaluation(
                    policy_p1=p1,
                    policy_p2=p2,
                    rounds=rounds_per_match,
                    seed=seed_offset,
                )
                seed_offset += 1
                matchups[(p1.name, p2.name)] = eval_res
                cumulative_scores[p1.name] += eval_res.mean_payoff_p1
                match_counts[p1.name] += 1

        rankings = [
            (name, cumulative_scores[name] / max(1, match_counts[name]))
            for name in cumulative_scores
        ]
        rankings.sort(key=lambda item: item[1], reverse=True)

        return StreamedTournamentResult(
            policy_names=[p.name for p in policies],
            rankings=rankings,
            matchups=matchups,
        )
