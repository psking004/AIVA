"""Autonomous Systems Domain Adapter — Ingests spatial telemetry, velocities, and task priority queues."""

from __future__ import annotations

from collections.abc import Sequence

from sse.domains.autonomous.coordination import (
    SharedPriorityArbitration,
    SpatialAgentState,
    SpatialCorridorVelocityGame,
)
from sse.models import FiniteNormalFormGame


class AutonomousCoordinationAdapter:
    """Translates velocity obstacles, corridor geometry, and task queues into strategic game models."""

    @staticmethod
    def create_velocity_obstacle_game(
        agent_names: Sequence[str] = ("AV_1", "AV_2"),
        target_distances: Sequence[float] = (10.0, 10.0),
        max_velocities: Sequence[float] = (2.0, 2.0),
        collision_penalty: float = 100.0,
    ) -> FiniteNormalFormGame:
        """Constructs a velocity obstacle contention game for autonomous agents."""
        agents = [
            SpatialAgentState(
                agent_id=agent_names[i],
                target_distance=target_distances[i],
                max_velocity=max_velocities[i],
            )
            for i in range(2)
        ]
        game_model = SpatialCorridorVelocityGame(
            agents=agents,
            collision_penalty=collision_penalty,
        )
        return game_model.to_game()

    @staticmethod
    def create_priority_arbitration_game(
        task_names: Sequence[str] = ("Task_Safety", "Task_Logging"),
        deadlines_ms: Sequence[float] = (50.0, 200.0),
        valuations: Sequence[float] = (100.0, 30.0),
        bid_levels: Sequence[float] = (5.0, 15.0, 30.0),
    ) -> FiniteNormalFormGame:
        """Constructs a shared priority arbitration bidding game between real-time tasks."""
        model = SharedPriorityArbitration(
            task_names=task_names,
            deadlines_ms=deadlines_ms,
            valuations=valuations,
        )
        return model.to_game(bid_levels=bid_levels)

