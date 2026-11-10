"""Sensitivity analysis for strategic games and simulation parameters."""

from __future__ import annotations

import math
import statistics
from collections.abc import Callable, Mapping, Sequence
from copy import deepcopy
from typing import Any

from sse.simulation.engine import (
    SimulationEngine,
    SimulationResult,
)
from sse.simulation.experiment import Experiment


class SensitivityAnalysis:
    """Analyze how game-theoretic outcomes vary across parameter variations."""

    def __init__(
        self, base_experiment: Experiment, engine: SimulationEngine | None = None
    ) -> None:
        self.base_experiment = base_experiment
        self.engine = engine or SimulationEngine()

    def one_at_a_time(
        self,
        param_name: str,
        values: Sequence[Any],
        game_factory: Callable[..., Any] | None = None,
    ) -> dict[Any, SimulationResult]:
        """Vary a single parameter across provided values while holding others constant.

        Args:
            param_name: Name of the parameter being varied.
            values: Sequence of parameter values to evaluate.
            game_factory: Optional factory function `game_factory(**{param_name: val})`.
                If None, creates deep copies of `base_experiment.game` setting `param_name`.
        """
        if not values:
            raise ValueError("values sequence must not be empty.")

        factory = game_factory
        if factory is None:
            # Fallback: attempt deepcopy and attribute setting
            base_game = self.base_experiment.game

            def _attribute_factory(**kwargs: Any) -> Any:
                game_copy = deepcopy(base_game)
                for k, v in kwargs.items():
                    if hasattr(game_copy, k):
                        try:
                            setattr(game_copy, k, v)
                        except (AttributeError, TypeError) as exc:
                            raise ValueError(
                                f"Cannot set attribute '{k}' on game of type {type(game_copy)}: {exc}"
                            ) from exc
                    else:
                        raise ValueError(
                            f"Game has no attribute '{k}' to vary; provide explicit game_factory."
                        )
                return game_copy

            factory = _attribute_factory

        return self.engine.parameter_sweep(
            game_factory=factory,
            param_name=param_name,
            param_values=values,
            strategies=self.base_experiment.strategies,
            config=self.base_experiment.config,
        )

    def compute_sensitivity_indices(
        self,
        results: (
            dict[Any, SimulationResult]
            | dict[Any, float]
            | dict[Any, Mapping[str, float]]
        ),
        player_id: str | None = None,
    ) -> dict[str, float]:
        """Calculate statistical sensitivity indices for an output variable.

        Indices computed:
            - min_output: Minimum observed outcome
            - max_output: Maximum observed outcome
            - range: Difference between max and min
            - mean_output: Expected value across variations
            - variance: Sample variance
            - std_dev: Standard deviation
            - coefficient_of_variation: std_dev / abs(mean)
            - max_gradient: Maximum absolute slope between consecutive numeric inputs
            - mean_elasticity: Average normalized elasticity (% change out / % change in)

        Args:
            results: Parameter sweep results.
            player_id: If outcomes are multi-agent, target player ID to analyze.
        """
        if not results:
            raise ValueError("results mapping must not be empty.")

        # Extract numeric output values
        numeric_series: list[tuple[Any, float]] = []

        for param_val, outcome in results.items():
            if isinstance(outcome, SimulationResult):
                payoffs = outcome.average_payoffs
                if player_id is not None:
                    if player_id not in payoffs:
                        raise KeyError(f"player_id '{player_id}' not found in result payoffs.")
                    val = payoffs[player_id]
                else:
                    val = (
                        statistics.mean(payoffs.values())
                        if payoffs
                        else sum(outcome.total_payoffs.values())
                    )
            elif isinstance(outcome, Mapping):
                if player_id is not None:
                    val = float(outcome[player_id])
                else:
                    val = float(statistics.mean(outcome.values()))
            elif isinstance(outcome, (int, float)):
                val = float(outcome)
            else:
                raise TypeError(f"Unsupported outcome type: {type(outcome)}")

            numeric_series.append((param_val, float(val)))

        outputs = [val for _, val in numeric_series]
        min_val = min(outputs)
        max_val = max(outputs)
        val_range = max_val - min_val
        mean_val = statistics.mean(outputs)
        variance = statistics.variance(outputs) if len(outputs) > 1 else 0.0
        std_dev = math.sqrt(variance)
        cv = (std_dev / abs(mean_val)) if abs(mean_val) > 1e-12 else 0.0

        # Compute gradient and elasticity if parameter values are numeric
        max_gradient = 0.0
        elasticities: list[float] = []

        all_numeric_params = all(
            isinstance(p, (int, float)) for p, _ in numeric_series
        )
        if all_numeric_params and len(numeric_series) > 1:
            sorted_series = sorted(numeric_series, key=lambda item: float(item[0]))
            for i in range(len(sorted_series) - 1):
                x0, y0 = float(sorted_series[i][0]), sorted_series[i][1]
                x1, y1 = float(sorted_series[i + 1][0]), sorted_series[i + 1][1]
                dx = x1 - x0
                dy = y1 - y0
                if abs(dx) > 1e-12:
                    grad = abs(dy / dx)
                    max_gradient = max(max_gradient, grad)

                    # Elasticity = (dy / y_avg) / (dx / x_avg)
                    x_avg = (x0 + x1) / 2.0
                    y_avg = (y0 + y1) / 2.0
                    if abs(x_avg) > 1e-12 and abs(y_avg) > 1e-12:
                        elasticity = abs((dy / y_avg) / (dx / x_avg))
                        elasticities.append(elasticity)

        mean_elasticity = (
            statistics.mean(elasticities) if elasticities else 0.0
        )

        return {
            "min_output": float(min_val),
            "max_output": float(max_val),
            "range": float(val_range),
            "mean_output": float(mean_val),
            "variance": float(variance),
            "std_dev": float(std_dev),
            "coefficient_of_variation": float(cv),
            "max_gradient": float(max_gradient),
            "mean_elasticity": float(mean_elasticity),
        }
