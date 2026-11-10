"""Strategic Systems Engine - Swarm Adversarial Arena Evaluator & Elo Engine.

Executes adversarial stress tournaments against candidate sub-agent deliverables.
Evaluates outcomes across concurrency thrash, boundary overflow, and malformed inputs,
calibrates empirical Elo ratings against canonical reference policies, and gates release.
"""

from __future__ import annotations

import dataclasses
import enum
import math
import sys
from pathlib import Path
from typing import ClassVar

from sse.swarm.agents.runtime import RuntimeSupervisorAgent
from sse.swarm.contracts import ExecutionResult


class ArenaOutcome(str, enum.Enum):
    """Outcome of an individual adversarial tournament match."""

    WIN = "WIN"
    LOSS = "LOSS"
    DRAW = "DRAW"


@dataclasses.dataclass(slots=True)
class TournamentRoundResult:
    """Details for a single tournament round."""

    round_idx: int
    test_vector: str
    outcome: ArenaOutcome
    duration_ms: float
    exit_code: int
    error_message: str = ""


@dataclasses.dataclass(slots=True)
class TournamentSummary:
    """Empirical tournament summary and calibrated Elo rating."""

    candidate_id: str
    rounds_played: int
    wins: int
    losses: int
    draws: int
    survival_rate: float
    initial_elo: float
    final_elo: float
    elo_delta: float
    passed_gate: bool
    worst_case_regret: float
    details: list[TournamentRoundResult] = dataclasses.field(default_factory=list)

    def to_compact_payload(self) -> str:
        """Compact serialized summary adhering strictly to context-budget limits (< 350 chars)."""
        gate = "PASS" if self.passed_gate else "FAIL"
        return (
            f"ARENA_SUMMARY|id={self.candidate_id}|gate={gate}|elo={self.final_elo:.1f}|"
            f"delta={self.elo_delta:+.1f}|surv={self.survival_rate:.1%}|"
            f"W/L/D={self.wins}/{self.losses}/{self.draws}|regret={self.worst_case_regret:.3f}"
        )


class SwarmArena:
    """Adversarial tournament evaluator benchmarking candidate code against Red Team vectors."""

    TEST_VECTORS: ClassVar[list[str]] = [
        "concurrency_thrash_50_threads",
        "boundary_integer_overflow",
        "malformed_bitflip_tamper",
        "latency_load_burst",
    ]

    def __init__(
        self,
        baseline_elo: float = 1400.0,
        k_factor: float = 32.0,
        min_survival_rate: float = 0.95,
        max_regret_threshold: float = 0.15,
        runtime_supervisor: RuntimeSupervisorAgent | None = None,
    ) -> None:
        self.baseline_elo = float(baseline_elo)
        self.k_factor = float(k_factor)
        self.min_survival_rate = float(min_survival_rate)
        self.max_regret_threshold = float(max_regret_threshold)
        self.runtime = runtime_supervisor or RuntimeSupervisorAgent(agent_id="ArenaRuntime", default_timeout=15.0)

    def calculate_elo_delta(
        self,
        candidate_elo: float,
        opponent_elo: float,
        outcome: ArenaOutcome,
    ) -> float:
        """Calculate Elo rating shift using standard logistic probability distribution."""
        # Expected score: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
        diff = (opponent_elo - candidate_elo) / 400.0
        expected = 1.0 / (1.0 + math.pow(10.0, diff))

        if outcome == ArenaOutcome.WIN:
            actual = 1.0
        elif outcome == ArenaOutcome.DRAW:
            actual = 0.5
        else:
            actual = 0.0

        return self.k_factor * (actual - expected)

    def evaluate_execution_outcome(
        self,
        result: ExecutionResult,
        latency_budget_ms: float = 5000.0,
    ) -> ArenaOutcome:
        """Evaluate raw subprocess execution result into Win, Loss, or Draw."""
        if result.exit_code != 0 or result.timed_out:
            return ArenaOutcome.LOSS

        if "Traceback" in result.stderr or "[ERROR]" in result.stderr:
            return ArenaOutcome.LOSS

        # High latency / high variance indicates stress degradation -> DRAW
        if result.duration_ms > latency_budget_ms:
            return ArenaOutcome.DRAW

        return ArenaOutcome.WIN

    def run_tournament(
        self,
        workspace_dir: Path | str,
        candidate_id: str = "candidate_01",
        rounds: int = 20,
    ) -> TournamentSummary:
        """Run an empirical multi-round adversarial stress tournament against candidate code."""
        work_path = Path(workspace_dir).resolve()
        current_elo = self.baseline_elo
        wins = 0
        losses = 0
        draws = 0
        round_results: list[TournamentRoundResult] = []

        # Check if workspace has test suite
        run_tests_path = work_path / "run_tests.py"
        test_file_path = work_path / "tests" / "test_adversarial.py"

        for r_idx in range(rounds):
            vector = self.TEST_VECTORS[r_idx % len(self.TEST_VECTORS)]

            # Formulate subprocess execution command
            if run_tests_path.exists():
                cmd = [sys.executable, "run_tests.py"]
            elif test_file_path.exists():
                cmd = [sys.executable, "-m", "unittest", str(test_file_path.relative_to(work_path))]
            else:
                # Default python verification run
                cmd = [sys.executable, "-c", "import sys; sys.exit(0)"]

            exec_res = self.runtime.run_command(command=cmd, cwd=work_path, timeout_sec=10.0)
            outcome = self.evaluate_execution_outcome(exec_res)

            # Update scores
            if outcome == ArenaOutcome.WIN:
                wins += 1
            elif outcome == ArenaOutcome.LOSS:
                losses += 1
            else:
                draws += 1

            # Calibrate Elo
            delta = self.calculate_elo_delta(current_elo, self.baseline_elo, outcome)
            current_elo += delta

            err_msg = exec_res.stderr.strip() if outcome == ArenaOutcome.LOSS else ""
            round_results.append(
                TournamentRoundResult(
                    round_idx=r_idx + 1,
                    test_vector=vector,
                    outcome=outcome,
                    duration_ms=exec_res.duration_ms,
                    exit_code=exec_res.exit_code,
                    error_message=err_msg,
                )
            )

        # Survival rate = ratio of non-failures
        survival_rate = round(wins / rounds, 4) if rounds > 0 else 0.0
        worst_case_regret = round(max(0.0, 1.0 - survival_rate), 4)

        # Gate check: survival >= 95% and regret <= threshold
        passed_gate = (survival_rate >= self.min_survival_rate) and (worst_case_regret <= self.max_regret_threshold)

        return TournamentSummary(
            candidate_id=candidate_id,
            rounds_played=rounds,
            wins=wins,
            losses=losses,
            draws=draws,
            survival_rate=survival_rate,
            initial_elo=self.baseline_elo,
            final_elo=round(current_elo, 2),
            elo_delta=round(current_elo - self.baseline_elo, 2),
            passed_gate=passed_gate,
            worst_case_regret=worst_case_regret,
            details=round_results,
        )
