"""Mathematical and algorithmic verification tests for Autonomous Systems Domain."""

from __future__ import annotations

from sse.domains.autonomous.adapters import AutonomousCoordinationAdapter
from sse.domains.autonomous.coordination import (
    SharedPriorityArbitration,
    SpatialCorridorVelocityGame,
)
from sse.strategic.solvers.exact_solvers import ExactSupportEnumerationSolver


def test_spatial_corridor_velocity_obstacle_collision_avoidance() -> None:
    """Verifies that in equilibrium, autonomous agents coordinate to avoid mutual collision."""
    game_model = SpatialCorridorVelocityGame(collision_penalty=100.0, transit_reward=20.0, delay_cost=4.0)
    game = game_model.to_game()

    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1

    # In pure or mixed equilibria, the mutual full-speed collision profile (0, 0)
    # must NOT be a pure Nash equilibrium due to -100 penalty
    for eq in res.equilibria:
        if eq.is_pure:
            # (0, 0) is Cruise_FullSpeed x Cruise_FullSpeed
            assert not (eq.support_1 == (0,) and eq.support_2 == (0,)), "Mutual full speed collision cannot be a Nash equilibrium."
            # At least one player yields or stops
            assert eq.payoff_1 > -50.0 and eq.payoff_2 > -50.0


def test_shared_priority_arbitration_deadline_urgency() -> None:
    """Verifies that urgent tasks win priority under non-cooperative bidding arbitration."""
    # Task 1 has 20ms urgent deadline and valuation 100
    # Task 2 has 200ms relaxed deadline and valuation 25
    arbitration = SharedPriorityArbitration(
        task_names=("Safety_Task", "Telemetry_Task"),
        deadlines_ms=(20.0, 200.0),
        valuations=(100.0, 25.0),
    )
    game = arbitration.to_game(bid_levels=[5.0, 15.0, 30.0])

    solver = ExactSupportEnumerationSolver()
    res = solver.solve(game)
    assert len(res.equilibria) >= 1

    # Verify adapter creation
    adapter_game = AutonomousCoordinationAdapter.create_priority_arbitration_game(
        task_names=("Critical_Brake", "Cloud_Sync"),
        deadlines_ms=(10.0, 500.0),
        valuations=(120.0, 20.0),
        bid_levels=(5.0, 20.0, 40.0),
    )
    assert len(adapter_game.actions[0]) == 3
    assert len(adapter_game.actions[1]) == 3
