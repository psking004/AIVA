"""Reproducible strategic experiment management and comparative analytics."""

from __future__ import annotations

import statistics
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from sse.simulation.engine import (
    SimulationConfig,
    SimulationEngine,
    SimulationResult,
)


@dataclass
class Experiment:
    """A reproducible experimental setup for strategic games.

    Attributes:
        id: Unique identifier for the experiment.
        name: Human-readable name.
        description: Detailed description of the hypothesis or setup.
        game: FiniteNormalFormGame or compatible game instance.
        strategies: Mapping of player_id to agent or strategy instance.
        config: SimulationConfig defining constraints and parameters.
        created_at: Creation timestamp in UTC.
        results: History of SimulationResults executed under this setup.
    """

    id: str
    name: str
    description: str
    game: Any
    strategies: dict[str, Any]
    config: SimulationConfig
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    results: list[SimulationResult] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("Experiment id must not be empty.")
        if not self.name.strip():
            raise ValueError("Experiment name must not be empty.")
        if not self.strategies:
            raise ValueError("Experiment must define at least one strategy.")

    def run(self, engine: SimulationEngine | None = None) -> SimulationResult:
        """Execute the experiment using the provided or default SimulationEngine."""
        eng = engine or SimulationEngine()
        if self.config.max_steps == 1:
            result = eng.run_single(self.game, self.strategies, self.config)
        else:
            result = eng.run_repeated(
                self.game,
                self.strategies,
                num_rounds=self.config.max_steps,
                config=self.config,
            )
        self.results.append(result)
        return result

    @property
    def latest_result(self) -> SimulationResult | None:
        """Most recent execution result if any."""
        return self.results[-1] if self.results else None

    def to_dict(self) -> dict[str, Any]:
        """Convert experiment metadata and summary to a dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "config": asdict(self.config),
            "created_at": self.created_at.isoformat(),
            "runs_count": len(self.results),
            "latest_result": (
                {
                    "total_payoffs": self.latest_result.total_payoffs,
                    "average_payoffs": self.latest_result.average_payoffs,
                    "duration_seconds": self.latest_result.duration_seconds,
                    "converged": self.latest_result.converged,
                }
                if self.latest_result
                else None
            ),
        }


class ExperimentComparison:
    """Compare performance, payoffs, and convergence across multiple experiments."""

    def __init__(self, experiments: Sequence[Experiment]) -> None:
        if not experiments:
            raise ValueError("experiments sequence must contain at least one Experiment.")
        self.experiments = list(experiments)

    def compare_payoffs(self) -> dict[str, dict[str, Any]]:
        """Extract and compare payoff distributions across all experiments."""
        comparison: dict[str, dict[str, Any]] = {}
        for exp in self.experiments:
            if not exp.results:
                comparison[exp.id] = {
                    "total_payoffs": {},
                    "average_payoffs": {},
                    "mean_payoff_across_players": 0.0,
                    "runs_count": 0,
                }
                continue

            last = exp.latest_result
            assert last is not None
            avg_payoffs = last.average_payoffs
            mean_across = (
                statistics.mean(avg_payoffs.values()) if avg_payoffs else 0.0
            )

            comparison[exp.id] = {
                "name": exp.name,
                "total_payoffs": dict(last.total_payoffs),
                "average_payoffs": dict(avg_payoffs),
                "mean_payoff_across_players": float(mean_across),
                "runs_count": len(exp.results),
                "converged": last.converged,
            }
        return comparison

    def rank_experiments(
        self, metric: str = "average_payoff"
    ) -> list[tuple[str, float]]:
        """Rank experiments descending by a performance metric.

        Args:
            metric: 'average_payoff' (mean payoff across players) or 'total_payoff' (sum of all payoffs).
        """
        ranks: list[tuple[str, float]] = []
        for exp in self.experiments:
            if not exp.results:
                ranks.append((exp.id, 0.0))
                continue
            last = exp.latest_result
            assert last is not None
            if metric == "total_payoff":
                score = sum(last.total_payoffs.values())
            else:
                score = (
                    statistics.mean(last.average_payoffs.values())
                    if last.average_payoffs
                    else 0.0
                )
            ranks.append((exp.id, float(score)))

        ranks.sort(key=lambda item: item[1], reverse=True)
        return ranks

    def best_experiment(self, metric: str = "average_payoff") -> Experiment:
        """Return the highest ranked experiment."""
        rankings = self.rank_experiments(metric)
        best_id = rankings[0][0]
        for exp in self.experiments:
            if exp.id == best_id:
                return exp
        return self.experiments[0]

    def summary(self) -> dict[str, Any]:
        """Comprehensive summary report comparing all experiments."""
        payoff_comp = self.compare_payoffs()
        rankings = self.rank_experiments()
        return {
            "total_experiments": len(self.experiments),
            "rankings": rankings,
            "best_experiment_id": rankings[0][0] if rankings else None,
            "payoffs": payoff_comp,
        }
