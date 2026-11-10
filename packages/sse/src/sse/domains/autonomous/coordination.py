"""Autonomous Systems domain — Spatial Corridor Velocity Obstacles and Shared Priority Arbitration."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sse.models import FiniteNormalFormGame


@dataclass(frozen=True, slots=True)
class SpatialAgentState:
    """State parameters for an autonomous mobile robot or autonomous vehicle."""

    agent_id: str
    target_distance: float
    max_velocity: float
    safety_radius: float = 1.0


class SpatialCorridorVelocityGame:
    """Discrete Velocity-Obstacle Contention Matrix for autonomous agents sharing a constrained corridor.

    Agents 1 and 2 traverse a narrow corridor where simultaneously maintaining full speed
    leads to spatial footprint intersection (velocity obstacle) and catastrophic collision.
    """

    def __init__(
        self,
        agents: Sequence[SpatialAgentState] | None = None,
        collision_penalty: float = 100.0,
        transit_reward: float = 20.0,
        delay_cost: float = 4.0,
    ) -> None:
        if agents:
            self.agents = list(agents)
        else:
            self.agents = [
                SpatialAgentState("AV_Alpha", target_distance=10.0, max_velocity=2.0),
                SpatialAgentState("AV_Beta", target_distance=10.0, max_velocity=2.0),
            ]
        self.collision_penalty = collision_penalty
        self.transit_reward = transit_reward
        self.delay_cost = delay_cost

    def to_game(self) -> FiniteNormalFormGame:
        actions = ["Cruise_FullSpeed", "Yield_HalfSpeed", "Full_Stop"]
        payoffs: list[list[float]] = []

        # P1 choices x P2 choices
        for a1 in actions:
            for a2 in actions:
                if a1 == "Cruise_FullSpeed" and a2 == "Cruise_FullSpeed":
                    # Velocity Obstacle intersection: severe collision
                    u1 = -self.collision_penalty
                    u2 = -self.collision_penalty
                elif a1 == "Cruise_FullSpeed" and a2 in ("Yield_HalfSpeed", "Full_Stop"):
                    # Agent 1 clears corridor cleanly; Agent 2 delayed
                    u1 = self.transit_reward
                    u2 = self.transit_reward * 0.5 - self.delay_cost
                elif a2 == "Cruise_FullSpeed" and a1 in ("Yield_HalfSpeed", "Full_Stop"):
                    # Agent 2 clears corridor cleanly; Agent 1 delayed
                    u1 = self.transit_reward * 0.5 - self.delay_cost
                    u2 = self.transit_reward
                elif a1 == "Yield_HalfSpeed" and a2 == "Yield_HalfSpeed":
                    # Mutual safe crawl: both pass with slight mutual delay
                    u1 = self.transit_reward * 0.7 - self.delay_cost * 0.5
                    u2 = self.transit_reward * 0.7 - self.delay_cost * 0.5
                elif a1 == "Full_Stop" and a2 == "Full_Stop":
                    # Deadlock / stall
                    u1 = -self.delay_cost * 2.0
                    u2 = -self.delay_cost * 2.0
                else:
                    u1 = self.transit_reward * 0.6 - self.delay_cost
                    u2 = self.transit_reward * 0.6 - self.delay_cost

                payoffs.append([round(float(u1), 2), round(float(u2), 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "spatial-corridor-velocity-obstacle",
            "name": "Spatial Corridor Velocity Conflict Resolution",
            "players": [self.agents[0].agent_id, self.agents[1].agent_id],
            "actions": {
                self.agents[0].agent_id: actions,
                self.agents[1].agent_id: actions,
            },
            "payoffs": payoffs,
        })


class SharedPriorityArbitration:
    """Non-cooperative dynamic priority bidding between tasks under deadlines.

    Autonomous tasks bid priority units for exclusive access to a shared resource
    (e.g., camera sensor, hardware accelerator, intersection right-of-way).
    Task with higher bid wins immediate execution; loser waits and incurs deadline degradation penalty.
    """

    def __init__(
        self,
        task_names: Sequence[str] = ("Task_SafetyCritical", "Task_Telemetry"),
        deadlines_ms: Sequence[float] = (50.0, 200.0),
        valuations: Sequence[float] = (100.0, 30.0),
    ) -> None:
        self.tasks = list(task_names)
        self.deadlines = list(deadlines_ms)
        self.values = list(valuations)

    def to_game(
        self,
        bid_levels: Sequence[float] = (5.0, 15.0, 30.0),
    ) -> FiniteNormalFormGame:
        actions_t1 = [f"Bid_{int(b)}" for b in bid_levels]
        actions_t2 = [f"Bid_{int(b)}" for b in bid_levels]

        payoffs: list[list[float]] = []
        v1, v2 = self.values[0], self.values[1]

        for b1 in bid_levels:
            for b2 in bid_levels:
                if b1 > b2:
                    # Task 1 wins priority
                    u1 = v1 - b1
                    u2 = v2 * 0.3 - b2  # delayed task loses value
                elif b2 > b1:
                    # Task 2 wins priority
                    u1 = v1 * 0.3 - b1
                    u2 = v2 - b2
                else:
                    # Tie: tie-breaker by deadline urgency (lower deadline has priority)
                    if self.deadlines[0] < self.deadlines[1]:
                        u1 = v1 - b1
                        u2 = v2 * 0.3 - b2
                    elif self.deadlines[1] < self.deadlines[0]:
                        u1 = v1 * 0.3 - b1
                        u2 = v2 - b2
                    else:
                        # Equal split
                        u1 = v1 * 0.65 - b1
                        u2 = v2 * 0.65 - b2

                payoffs.append([round(float(u1), 2), round(float(u2), 2)])

        return FiniteNormalFormGame.from_dict({
            "id": "shared-priority-arbitration",
            "name": "Shared Priority Arbitration Game",
            "players": [self.tasks[0], self.tasks[1]],
            "actions": {
                self.tasks[0]: actions_t1,
                self.tasks[1]: actions_t2,
            },
            "payoffs": payoffs,
        })
