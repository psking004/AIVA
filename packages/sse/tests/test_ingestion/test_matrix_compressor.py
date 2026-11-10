"""Unit and performance tests for Matrix Compressor and Ingestion Quantizer."""

from __future__ import annotations

import time

import numpy as np
import pytest

from sse.ingestion.matrix_compressor import MatrixCompressor
from sse.ingestion.payoff_formulator import ContinuousPayoffFormulator, RiskPreferences
from sse.strategic.solvers.optimized_core import TieredDecisionCore


def test_compression_reduces_dimension_to_bound() -> None:
    """Verifies that an action space > 6 is clustered down to <= 6."""
    rng = np.random.default_rng(42)
    # 12x12 payoff tensor
    raw_payoffs = rng.uniform(low=0.0, high=50.0, size=(12, 12, 2)).astype(np.float64)

    compressor = MatrixCompressor(max_actions=6)
    result = compressor.compress_matrix(raw_payoffs)

    assert result.original_shape == (12, 12)
    assert result.compressed_shape[0] <= 6
    assert result.compressed_shape[1] <= 6
    assert result.compressed_payoffs.dtype == np.float32

    # Verify [0, 100] normalization
    assert pytest.approx(float(np.min(result.compressed_payoffs)), abs=1e-4) == 0.0
    assert pytest.approx(float(np.max(result.compressed_payoffs)), abs=1e-4) == 100.0


def test_dominant_equilibrium_preserved_under_clustering() -> None:
    """Verifies that strictly dominant strategies remain dominant after clustering."""
    # Construct a 10x10 game with two main clusters:
    # Rows 0..4 are variants of 'Weak Defect' (payoff ~ 20)
    # Rows 5..9 are variants of 'Strong Dominant Attack' (payoff ~ 80)
    rng = np.random.default_rng(99)
    tensor = np.zeros((10, 10, 2), dtype=np.float64)

    # P1 payoffs: rows 5..9 strictly dominate rows 0..4
    tensor[:5, :, 0] = rng.uniform(15.0, 25.0, size=(5, 10))
    tensor[5:, :, 0] = rng.uniform(75.0, 85.0, size=(5, 10))

    # P2 payoffs: symmetric
    tensor[:, :5, 1] = rng.uniform(15.0, 25.0, size=(10, 5))
    tensor[:, 5:, 1] = rng.uniform(75.0, 85.0, size=(10, 5))

    compressor = MatrixCompressor(max_actions=4)
    result = compressor.compress_matrix(tensor)

    assert result.compressed_shape[0] <= 4
    assert result.compressed_shape[1] <= 4

    # Solve compressed game with TieredDecisionCore
    core = TieredDecisionCore()
    verdict = core.solve(result.game)

    # Check that chosen action corresponds to one of the original dominant actions (5..9)
    chosen_c_idx = verdict.action_idx
    dominant_cluster = result.mapping_p1[chosen_c_idx]
    assert all(orig_idx >= 5 for orig_idx in dominant_cluster.original_indices)


def test_compress_from_continuous_payoff_formulator() -> None:
    """Verifies end-to-end integration with ContinuousPayoffFormulator."""
    # Cournot Duopoly: Price P(Q) = 100 - (q1 + q2), Cost C(q) = 10 * q
    def rev_p1(q1: float, q2: float) -> float:
        return max(0.0, 100.0 - (q1 + q2)) * q1

    def cost(q: float) -> float:
        return 10.0 * q

    f1 = ContinuousPayoffFormulator(
        revenue_fn=rev_p1,
        cost_fn=cost,
        risk_preferences=RiskPreferences(risk_model="risk_neutral"),
    )
    f2 = ContinuousPayoffFormulator(
        revenue_fn=rev_p1,
        cost_fn=cost,
        risk_preferences=RiskPreferences(risk_model="risk_neutral"),
    )

    compressor = MatrixCompressor(max_actions=5)
    result = compressor.compress_from_formulator(
        player_1_formulator=f1,
        player_2_formulator=f2,
        interval_p1=(10.0, 50.0),
        interval_p2=(10.0, 50.0),
        grid_points_p1=15,
        grid_points_p2=15,
        scheme="uniform",
    )

    assert result.original_shape == (15, 15)
    assert result.compressed_shape[0] <= 5
    assert result.compressed_shape[1] <= 5
    assert result.game is not None
    assert len(result.game.actions[0]) <= 5


def test_solver_latency_reduction_at_least_40_percent() -> None:
    """Verifies that clustering and quantization achieves >= 40% latency reduction."""
    rng = np.random.default_rng(77)
    # 12x12 game
    raw_tensor = rng.uniform(0.0, 100.0, size=(12, 12, 2))

    # Build uncompressed game
    from sse.models import FiniteNormalFormGame, Player

    actions_p1 = tuple(f"raw_a_{i}" for i in range(12))
    actions_p2 = tuple(f"raw_b_{j}" for j in range(12))
    payoffs_raw = tuple(
        (float(raw_tensor[i, j, 0]), float(raw_tensor[i, j, 1]))
        for i in range(12)
        for j in range(12)
    )
    raw_game = FiniteNormalFormGame(
        id="raw_12x12",
        name="Raw 12x12 Game",
        players=(Player("P1", "P1"), Player("P2", "P2")),
        actions=(actions_p1, actions_p2),
        payoffs=payoffs_raw,
    )

    core = TieredDecisionCore()

    # Warmup
    _ = core.solve(raw_game)

    # Benchmark raw 12x12
    n_iters = 30
    start_raw = time.perf_counter()
    for _ in range(n_iters):
        _ = core.solve(raw_game)
    time_raw = time.perf_counter() - start_raw

    # Compress to 4x4
    compressor = MatrixCompressor(max_actions=4)
    comp_result = compressor.compress_matrix(raw_tensor)

    # Warmup compressed
    _ = core.solve(comp_result.game)

    # Benchmark compressed
    start_comp = time.perf_counter()
    for _ in range(n_iters):
        _ = core.solve(comp_result.game)
    time_comp = time.perf_counter() - start_comp

    latency_reduction = (time_raw - time_comp) / max(1e-9, time_raw)
    assert latency_reduction >= 0.40, (
        f"Expected at least 40% latency reduction, got {latency_reduction * 100:.1f}% "
        f"(raw: {time_raw * 1000:.2f}ms, comp: {time_comp * 1000:.2f}ms)"
    )
