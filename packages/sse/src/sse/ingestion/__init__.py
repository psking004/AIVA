"""Strategic Systems Engine - Ingestion Package.

Provides observation validation, confidence decay tracking, provenance checking,
and multi-source conflict reconciliation.
"""

from sse.ingestion.matrix_compressor import (
    ActionClusterMapping,
    CompressedMatrixResult,
    MatrixCompressor,
)
from sse.ingestion.payoff_formulator import (
    ContinuousPayoffFormulator,
    DiscretizationScheme,
    RiskPreferences,
)
from sse.ingestion.reconciler import ObservationReconciler
from sse.ingestion.telemetry_bridge import (
    NodeTelemetry,
    TelemetryBridge,
    TelemetryContext,
    query_gpu_telemetry,
    query_host_telemetry,
)
from sse.ingestion.validator import ObservationValidator

__all__ = [
    "ActionClusterMapping",
    "CompressedMatrixResult",
    "ContinuousPayoffFormulator",
    "DiscretizationScheme",
    "MatrixCompressor",
    "NodeTelemetry",
    "ObservationReconciler",
    "ObservationValidator",
    "RiskPreferences",
    "TelemetryBridge",
    "TelemetryContext",
    "query_gpu_telemetry",
    "query_host_telemetry",
]

