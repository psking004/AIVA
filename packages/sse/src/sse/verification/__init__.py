"""Strategic Systems Engine - Verification Package.

Provides formal mathematical and state-drift verifiers for decisions.
"""

from sse.verification.benchmarks import (
    CanonicalBenchmarkSuite,
    InvariantVerificationReport,
    MathematicalInvariantEngine,
)
from sse.verification.verifier import DecisionVerifier

__all__ = [
    "CanonicalBenchmarkSuite",
    "DecisionVerifier",
    "InvariantVerificationReport",
    "MathematicalInvariantEngine",
]

