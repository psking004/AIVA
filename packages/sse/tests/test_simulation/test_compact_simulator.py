"""Unit and performance tests for Streamed O(1)-Memory Simulator."""

from __future__ import annotations

import tracemalloc

import numpy as np
import pytest

from sse.agents.policies import (
    AlwaysCooperatePolicy,
    AlwaysDefectPolicy,
    TitForTatPolicy,
    WinStayLoseShiftPolicy,
)
from sse.simulation.compact_simulator import (
    RunningMoments,
    StreamedTournamentSimulator,
)


def test_welford_running_moments_accuracy() -> None:
    """Verifies that Welford's algorithm matches analytical NumPy statistics."""
    rng = np.random.default_rng(123)
    values = rng.normal(loc=10.0, scale=3.0, size=500).tolist()

    stats = RunningMoments()
    for v in values:
        stats.update(v)

    expected_mean = float(np.mean(values))
    expected_std = float(np.std(values, ddof=1))

    assert pytest.approx(stats.mean, rel=1e-5) == expected_mean
    assert pytest.approx(stats.std_dev, rel=1e-5) == expected_std
    assert stats.count == 500
    assert stats.downside_semi_variance > 0.0

    # VaR-95 should be lower than mean
    var_95 = stats.compute_var_95()
    assert var_95 < stats.mean


def test_streamed_evaluation_prisoner_dilemma() -> None:
    """Verifies mutual cooperation between two Tit-for-Tat agents."""
    # Standard Prisoner's Dilemma: (R=3, S=0, T=5, P=1)
    # [ [ (3,3), (0,5) ],
    #   [ (5,0), (1,1) ] ]
    pd_matrix = np.array(
        [
            [[3.0, 3.0], [0.0, 5.0]],
            [[5.0, 0.0], [1.0, 1.0]],
        ],
        dtype=np.float32,
    )

    sim = StreamedTournamentSimulator(pd_matrix, trembling_noise=0.0)
    p1 = TitForTatPolicy("TFT1")
    p2 = TitForTatPolicy("TFT2")

    result = sim.run_streamed_evaluation(p1, p2, rounds=500, seed=42)

    assert result.mean_payoff_p1 == pytest.approx(3.0)
    assert result.mean_payoff_p2 == pytest.approx(3.0)
    assert result.cooperation_rate_p1 == 1.0
    assert result.cooperation_rate_p2 == 1.0
    assert result.std_payoff_p1 == pytest.approx(0.0)


def test_streamed_tournament_rankings() -> None:
    """Verifies round-robin tournament execution."""
    pd_matrix = np.array(
        [
            [[3.0, 3.0], [0.0, 5.0]],
            [[5.0, 0.0], [1.0, 1.0]],
        ],
        dtype=np.float32,
    )

    sim = StreamedTournamentSimulator(pd_matrix, trembling_noise=0.02)
    policies = [
        TitForTatPolicy("TFT"),
        AlwaysDefectPolicy("AllD"),
        AlwaysCooperatePolicy("AllC"),
        WinStayLoseShiftPolicy("WSLS"),
    ]

    tourney = sim.run_streamed_tournament(policies, rounds_per_match=200, seed=42)
    assert len(tourney.rankings) == 4
    # AllD should exploit AllC
    all_d_vs_all_c = tourney.matchups[("AllD", "AllC")]
    assert all_d_vs_all_c.mean_payoff_p1 > 4.5
    assert all_d_vs_all_c.mean_payoff_p2 < 0.5


def test_o1_memory_flatness_across_10k_rounds() -> None:
    """Ensures memory remains strictly flat (O(1)) across 10,000 streamed rounds."""
    pd_matrix = np.array(
        [
            [[3.0, 3.0], [0.0, 5.0]],
            [[5.0, 0.0], [1.0, 1.0]],
        ],
        dtype=np.float32,
    )

    sim = StreamedTournamentSimulator(pd_matrix, trembling_noise=0.01)
    p1 = TitForTatPolicy("TFT")
    p2 = WinStayLoseShiftPolicy("WSLS")

    tracemalloc.start()
    tracemalloc.reset_peak()

    mem_checkpoints = []
    round_count = 0

    for _inter in sim.stream_rounds(p1, p2, rounds=10000, seed=42):
        round_count += 1
        if round_count in (1000, 5000, 10000):
            current, _peak = tracemalloc.get_traced_memory()
            mem_checkpoints.append(current)

    tracemalloc.stop()

    assert round_count == 10000
    assert len(mem_checkpoints) == 3

    # The memory growth between 1,000 rounds and 10,000 rounds must not exceed 250 KB
    growth_bytes = mem_checkpoints[2] - mem_checkpoints[0]
    assert growth_bytes < 250 * 1024, f"Memory growth too high: {growth_bytes} bytes"

