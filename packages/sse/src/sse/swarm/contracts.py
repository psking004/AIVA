"""Strategic Systems Engine - Swarm Inter-Agent Contracts and State Management.

Defines the typed data structures, execution results, vulnerability findings,
and workspace state governing the autonomous sub-agent swarm pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class TaskStatus(str, Enum):
    """Lifecycle status of a swarm generation and convergence task."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    AUDITING = "AUDITING"
    PATCHING = "PATCHING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class VulnerabilitySeverity(str, Enum):
    """Severity ratings for security audit findings."""

    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


@dataclass(slots=True)
class VulnerabilityFinding:
    """Security audit vulnerability finding with exact location and remediation."""

    rule_id: str
    severity: VulnerabilitySeverity
    file_path: str
    line_number: int
    description: str
    remediation_suggestion: str


@dataclass(slots=True)
class SwarmFileArtifact:
    """A generated file artifact stored in the workspace."""

    relative_path: str
    content: str
    executable: bool = False


@dataclass(slots=True)
class ExecutionResult:
    """Subprocess execution output and telemetry."""

    command: list[str] | str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    timed_out: bool = False


@dataclass(slots=True)
class SwarmWorkspaceState:
    """Managed workspace state tracking artifacts, tests, security audits, and iterations."""

    project_name: str
    root_path: Path
    status: TaskStatus = TaskStatus.PENDING
    files: dict[str, SwarmFileArtifact] = field(default_factory=dict)
    test_results: list[ExecutionResult] = field(default_factory=list)
    vulnerabilities: list[VulnerabilityFinding] = field(default_factory=list)
    iteration_count: int = 0
    max_iterations: int = 5
    logs: list[str] = field(default_factory=list)

    @property
    def iterations(self) -> int:
        """Alias for iteration_count."""
        return self.iteration_count

    @property
    def iteration(self) -> int:
        """Singular alias for iteration_count."""
        return self.iteration_count

    def log(self, message: str) -> None:
        """Append an event message to the workspace audit trail."""
        self.logs.append(message)

    def has_critical_or_high_vulnerabilities(self) -> bool:
        """Check if any active vulnerabilities have CRITICAL or HIGH severity."""
        return any(
            v.severity in (VulnerabilitySeverity.CRITICAL, VulnerabilitySeverity.HIGH)
            for v in self.vulnerabilities
        )

    def add_file(self, relative_path: str, content: str, executable: bool = False) -> None:
        """Add or update a file artifact in the workspace."""
        norm_path = relative_path.replace("\\", "/")
        self.files[norm_path] = SwarmFileArtifact(
            relative_path=norm_path,
            content=content,
            executable=executable,
        )

