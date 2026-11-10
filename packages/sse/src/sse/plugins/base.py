"""Base contracts and lifecycle interfaces for SSE plugins."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class PluginMetadata:
    """Provenance and compatibility metadata for an SSE plugin."""

    name: str
    version: str
    author: str
    description: str
    plugin_type: str  # "solver", "game_family", "domain", "agent", "storage"
    compatibility: str = ">=0.1.0"

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("Plugin name must not be empty.")
        if not self.version.strip():
            raise ValueError("Plugin version must not be empty.")
        valid_types = {"solver", "game_family", "domain", "agent", "storage"}
        if self.plugin_type not in valid_types:
            raise ValueError(
                f"Invalid plugin_type '{self.plugin_type}'. Must be one of {valid_types}."
            )


class SSEPlugin(ABC):
    """Abstract base class for all third-party SSE plugins."""

    @abstractmethod
    def metadata(self) -> PluginMetadata:
        """Return the plugin metadata description."""
        ...

    @abstractmethod
    def register(self) -> None:
        """Register solver backends, game models, or domain extensions with SSE registries."""
        ...

    def validate(self) -> list[str]:
        """Validate environment readiness, dependencies, or licenses. Returns list of errors."""
        return []


class SolverPlugin(SSEPlugin):
    """Specialized plugin interface for custom game theory solvers."""

    @abstractmethod
    def get_solver(self) -> Any:
        ...


class DomainPlugin(SSEPlugin):
    """Specialized plugin interface for domain scenario packs."""

    @abstractmethod
    def get_domain(self) -> Any:
        ...


class GameFamilyPlugin(SSEPlugin):
    """Specialized plugin interface for new mathematical game representations."""

    @abstractmethod
    def get_game_family(self) -> Any:
        ...

