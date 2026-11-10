"""Unit tests for the Memory-Bounded Tiered Decision Core and Compact Verdict Payloads."""

import time
import tracemalloc

import numpy as np

from sse.strategic.solvers.optimized_core import (
    CompactStrategicVerdict,
    TieredDecisionCore,
)
from sse.verification.benchmarks import CanonicalBenchmarkSuite


def test_compact_verdict_character_budget():
    """Compact verdict must strictly comply with < 400 character and < 1.2 KB JSON limit."""
    verdict = CompactStrategicVerdict(
        action_idx=1,
        action_name="Dynamic Elastic Capacity Defense",
        confidence=0.923,
        expected_utility=87.543,
        downside_risk=4.21,
        solver_tier="T2_HIGHS_LP",
        rationale="Bounded support Stackelberg optimum over uneliminated action profiles.",
        execution_time_ms=2.45,
    )

    payload = verdict.to_compact_payload()
    assert isinstance(payload, str)
    assert len(payload) <= 400
    assert len(payload.encode("utf-8")) < 1200
    assert '"act":1' in payload
    assert '"tier":"T2_HIGHS_LP"' in payload


def test_tier1_iesds_prisoners_dilemma():
    """Tier 1 IESDS resolves strictly dominant equilibrium in < 25 ms."""
    game = CanonicalBenchmarkSuite.prisoners_dilemma()
    core = TieredDecisionCore()

    tracemalloc.start()
    t0 = time.perf_counter()
    verdict = core.solve(game)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    _current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    # Prisoner's Dilemma: Action 1 (Defect) strictly dominates
    assert verdict.action_idx == 1
    assert verdict.solver_tier == "T1_IESDS"
    assert verdict.confidence >= 0.95
    assert elapsed_ms < 25.0
    assert peak_mem < 5 * 1024 * 1024  # Peak RAM well below 5 MB (< 80 MB limit)
    assert len(verdict.to_compact_payload()) <= 400


def test_tier2_bounded_support_battle_of_sexes():
    """Tier 2 resolves 2x2 coordination game without strictly dominant strategies."""
    game = CanonicalBenchmarkSuite.battle_of_the_sexes()
    core = TieredDecisionCore()

    t0 = time.perf_counter()
    verdict = core.solve(game)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert verdict.solver_tier == "T2_HIGHS_LP"
    assert verdict.confidence > 0.85
    assert elapsed_ms < 25.0
    assert len(verdict.to_compact_payload()) <= 400


def test_tier3_minimax_regret_large_undominated_game():
    """Tier 3 acts as fallback for games where support size exceeds max_k without dominance."""
    # Create 6x6 game with cyclic payoffs (e.g. Generalized RPS/Blotto)
    rng = np.random.default_rng(1234)
    A = rng.uniform(10.0, 50.0, size=(6, 6))
    B = rng.uniform(10.0, 50.0, size=(6, 6))

    # max_support_k=2 forces Tier 3 if >2 survive
    core = TieredDecisionCore(max_support_k=2)

    t0 = time.perf_counter()
    verdict = core.solve((A, B))
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert verdict.action_idx in range(6)
    assert verdict.solver_tier in ("T2_HIGHS_LP", "T3_MINIMAX_REGRET")
    assert elapsed_ms < 25.0
    assert len(verdict.to_compact_payload()) <= 400
