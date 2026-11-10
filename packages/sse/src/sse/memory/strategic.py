"""Strategic Systems Engine - Strategic Memory.

Aggregates historical outcomes to calibrate solver accuracy, quantify forecast bias,
and distill persistent behavioral patterns across episodes.
"""

from __future__ import annotations

import math
import threading
from typing import Any

from sse.memory.episodic import EpisodicMemory


class StrategicMemory:
    """Extracts meta-strategic patterns and model calibrations from episodic records."""

    def __init__(self, episodic_memory: EpisodicMemory | None = None) -> None:
        self._lock = threading.RLock()
        self.episodic_memory = episodic_memory or EpisodicMemory()

    def calculate_solver_calibration(self) -> dict[str, dict[str, float]]:
        """Calculates prediction accuracy metrics (Mean Absolute Error, Bias) across episodes.

        Returns {solver_name: {"mae": float, "bias": float, "samples": int}}.
        """
        with self._lock:
            episodes = self.episodic_memory.list_episodes(limit=500)
            solver_errors: dict[str, list[float]] = {}

            for ep in episodes:
                if ep.prediction_variance is None:
                    continue

                # Identify which solver provided the recommendation
                solver_name = "default_solver"
                for alt in ep.response.alternatives:
                    if alt.action_id == ep.executed_action_id:
                        solver_name = alt.solver_method
                        break

                solver_errors.setdefault(solver_name, []).append(ep.prediction_variance)

            calibration: dict[str, dict[str, float]] = {}
            for s_name, errors in solver_errors.items():
                n = len(errors)
                if n > 0:
                    bias = sum(errors) / n  # Positive = underpredicted, Negative = overpredicted
                    mae = sum(abs(e) for e in errors) / n
                    mse = sum(e**2 for e in errors) / n
                    rmse = math.sqrt(mse)
                    calibration[s_name] = {
                        "samples": float(n),
                        "bias": round(bias, 4),
                        "mae": round(mae, 4),
                        "rmse": round(rmse, 4),
                    }

            return calibration

    def get_summary_insights(self) -> dict[str, Any]:
        """Provides an executive summary of strategic patterns observed to date."""
        with self._lock:
            calib = self.calculate_solver_calibration()
            episodes = self.episodic_memory.list_episodes(limit=100)
            resolved_count = sum(1 for e in episodes if e.resolved_at is not None)

            return {
                "total_episodes_recorded": len(episodes),
                "resolved_episodes": resolved_count,
                "solver_calibrations": calib,
                "confidence_calibration_status": "calibrated" if resolved_count >= 10 else "warming_up",
            }
