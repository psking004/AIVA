"""SSE Plugins — Extensibility framework for custom solvers, models, and domains."""

from sse.plugins.base import (
    DomainPlugin,
    GameFamilyPlugin,
    PluginMetadata,
    SolverPlugin,
    SSEPlugin,
)
from sse.plugins.loader import (
    PluginLoader,
    loader,
)

__all__ = [
    "DomainPlugin",
    "GameFamilyPlugin",
    "PluginLoader",
    "PluginMetadata",
    "SSEPlugin",
    "SolverPlugin",
    "loader",
]
