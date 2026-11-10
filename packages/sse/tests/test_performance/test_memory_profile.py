"""End-to-End Performance, Memory Profiling, and Character Budget Verification Suite."""

from __future__ import annotations

import json
import time
import tracemalloc

import numpy as np

from sse.agents.policies import (
    TitForTatPolicy,
    WinStayLoseShiftPolicy,
)
from sse.ingestion.matrix_compressor import MatrixCompressor
from sse.ingestion.payoff_formulator import ContinuousPayoffFormulator, RiskPreferences
from sse.models import FiniteNormalFormGame, Player
from sse.simulation.compact_simulator import StreamedTournamentSimulator
from sse.strategic.solvers.optimized_core import TieredDecisionCore


def test_end_to_end_pipeline_memory_under_80mb() -> None:
    """Verifies that the entire pipeline operates under 80 MB peak heap memory."""
    tracemalloc.start()
    tracemalloc.reset_peak()

    # Step 1: Formulate continuous game
    def rev_p1(a1: float, a2: float) -> float:
        return max(0.0, 120.0 - (a1 + 0.5 * a2)) * a1

    def cost(a: float) -> float:
        return 5.0 * a + 0.1 * (a**2)

    f1 = ContinuousPayoffFormulator(
        revenue_fn=rev_p1,
        cost_fn=cost,
        risk_preferences=RiskPreferences(risk_model="mean_variance", lambda_risk=0.01),
    )
    f2 = ContinuousPayoffFormulator(
        revenue_fn=rev_p1,
        cost_fn=cost,
        risk_preferences=RiskPreferences(risk_model="mean_variance", lambda_risk=0.01),
    )

    # Step 2: Discretize and Compress
    compressor = MatrixCompressor(max_actions=5)
    comp_res = compressor.compress_from_formulator(
        player_1_formulator=f1,
        player_2_formulator=f2,
        interval_p1=(5.0, 40.0),
        interval_p2=(5.0, 40.0),
        grid_points_p1=16,
        grid_points_p2=16,
    )

    # Step 3: Solve with Tiered Decision Core
    core = TieredDecisionCore()
    verdict = core.solve(comp_res.game)

    # Step 4: Serialize Compact Verdict
    payload = verdict.to_compact_payload()
    _parsed = json.loads(payload)

    _current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    peak_mb = peak / (1024 * 1024)
    # Hard RAM limit: strictly < 80 MB
    assert peak_mb < 80.0, f"Peak memory exceeded 80 MB limit: {peak_mb:.2f} MB"


def test_tiered_solver_latency_under_25ms() -> None:
    """Verifies that TieredDecisionCore solves games in < 25 ms."""
    core = TieredDecisionCore()

    # Create test game (4x4)
    rng = np.random.default_rng(42)
    t = rng.uniform(0.0, 100.0, size=(4, 4, 2))
    game = FiniteNormalFormGame(
        id="bench_4x4",
        name="Benchmark 4x4",
        players=(Player("P1", "P1"), Player("P2", "P2")),
        actions=(tuple(f"a_{i}" for i in range(4)), tuple(f"b_{j}" for j in range(4))),
        payoffs=tuple((float(t[i, j, 0]), float(t[i, j, 1])) for i in range(4) for j in range(4)),
    )

    # Warmup
    _ = core.solve(game)

    latencies_ms = []
    for _ in range(50):
        t0 = time.perf_counter()
        _v = core.solve(game)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        latencies_ms.append(elapsed_ms)

    mean_latency = float(np.mean(latencies_ms))
    p95_latency = float(np.percentile(latencies_ms, 95))

    assert mean_latency < 25.0, f"Mean latency exceeded 25 ms: {mean_latency:.2f} ms"
    assert p95_latency < 25.0, f"p95 latency exceeded 25 ms: {p95_latency:.2f} ms"


def test_simultaneous_pipeline_latency_under_100ms() -> None:
    """Verifies complete end-to-end pipeline latency is under 100 ms."""
    compressor = MatrixCompressor(max_actions=5)
    core = TieredDecisionCore()

    rng = np.random.default_rng(101)
    raw_tensor = rng.uniform(10.0, 90.0, size=(10, 10, 2))

    t0 = time.perf_counter()
    comp_res = compressor.compress_matrix(raw_tensor)
    verdict = core.solve(comp_res.game)
    payload = verdict.to_compact_payload()
    _ = json.loads(payload)
    total_time_ms = (time.perf_counter() - t0) * 1000.0

    assert total_time_ms < 100.0, f"End-to-end pipeline latency exceeded 100 ms: {total_time_ms:.2f} ms"


def test_streamed_simulation_latency_under_250ms() -> None:
    """Verifies that 1,000 streamed Monte Carlo rounds execute in < 250 ms."""
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

    # Warmup
    _ = sim.run_streamed_evaluation(p1, p2, rounds=100, seed=42)

    t0 = time.perf_counter()
    res = sim.run_streamed_evaluation(p1, p2, rounds=1000, seed=42)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert res.rounds_count == 1000
    assert elapsed_ms < 250.0, f"Streamed 1,000-round simulation exceeded 250 ms: {elapsed_ms:.2f} ms"


def test_compact_verdict_character_budget_and_json_validity() -> None:
    """Asserts that 100% of CompactStrategicVerdict payloads are < 400 chars and valid JSON."""
    core = TieredDecisionCore()
    rng = np.random.default_rng(555)

    for i in range(20):
        m, n = rng.integers(2, 6), rng.integers(2, 6)
        tensor = rng.uniform(-50.0, 150.0, size=(m, n, 2))

        game = FiniteNormalFormGame(
            id=f"test_game_{i}",
            name=f"Random Game {i} with a very long descriptive name that should not bloat the output",
            players=(Player("P1", "Alpha"), Player("P2", "Beta")),
            actions=(
                tuple(f"action_long_name_p1_{r}" for r in range(m)),
                tuple(f"action_long_name_p2_{c}" for c in range(n)),
            ),
            payoffs=tuple(
                (float(tensor[r, c, 0]), float(tensor[r, c, 1]))
                for r in range(m)
                for c in range(n)
            ),
        )

        verdict = core.solve(game)
        payload = verdict.to_compact_payload()

        # Strict character budget assertion (< 400 characters)
        assert len(payload) < 400, f"Payload exceeded 400 characters: length={len(payload)}"

        # Strict JSON parseability
        data = json.loads(payload)
        assert "act" in data
        assert "name" in data
        assert "conf" in data
        assert "util" in data
        assert "risk" in data
        assert "tier" in data
        assert "msg" in data
        assert "ms" in data
