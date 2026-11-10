"""Shared solver result contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class SolverMetadata:
    solver: str
    method: str
    exact: bool
    tolerance: float | None = None
    notes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SolverResult:
    status: str
    solution_count: int
    diagnostics: dict[str, Any] = field(default_factory=dict)
    metadata: SolverMetadata | None = None
