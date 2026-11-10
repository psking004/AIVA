from sse.core.types import (
    GameFamily,
    NumericPrecision,
    SolverStatus,
)


def test_game_family_members():
    assert GameFamily.NORMAL_FORM in GameFamily
    assert GameFamily.EXTENSIVE_FORM in GameFamily
    assert GameFamily.COOPERATIVE in GameFamily
    assert GameFamily.EVOLUTIONARY in GameFamily
    assert len(GameFamily) >= 10


def test_solver_status():
    assert SolverStatus.SOLVED.value == "solved"
    assert SolverStatus.NO_SOLUTION.value == "no_solution"
    assert SolverStatus.TIMEOUT.value == "timeout"


def test_numeric_precision_invariants():
    prec = NumericPrecision(tolerance=1e-8, max_iterations=5000, convergence_threshold=1e-7)
    assert prec.tolerance == 1e-8
    assert prec.max_iterations == 5000
