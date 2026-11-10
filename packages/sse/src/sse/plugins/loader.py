"""Dynamic plugin discovery, validation, and registration loader."""

from __future__ import annotations

import importlib
import logging

from sse.plugins.base import PluginMetadata, SSEPlugin

logger = logging.getLogger(__name__)


class PluginLoader:
    """Manages dynamic loading and lifecycle of SSE plugins."""

    def __init__(self) -> None:
        self._plugins: dict[str, SSEPlugin] = {}

    def register_plugin(self, plugin: SSEPlugin) -> None:
        """Register, validate, and activate an SSEPlugin instance."""
        meta = plugin.metadata()
        errors = plugin.validate()
        if errors:
            raise ValueError(f"Plugin '{meta.name}' failed validation: {'; '.join(errors)}")

        plugin.register()
        self._plugins[meta.name] = plugin
        logger.info("Successfully registered SSE plugin: %s v%s", meta.name, meta.version)

    def load_from_module(self, module_name: str) -> SSEPlugin:
        """Dynamically import a module and instantiate its plugin."""
        mod = importlib.import_module(module_name)
        if not hasattr(mod, "get_plugin"):
            raise AttributeError(
                f"Module '{module_name}' must expose a 'get_plugin()' entry point function."
            )
        plugin = mod.get_plugin()
        if not isinstance(plugin, SSEPlugin):
            raise TypeError(
                f"Entry point 'get_plugin()' in '{module_name}' did not return an SSEPlugin instance."
            )
        self.register_plugin(plugin)
        return plugin

    def list_plugins(self) -> list[PluginMetadata]:
        """Return metadata for all active plugins."""
        return [p.metadata() for p in self._plugins.values()]

    def get_plugin(self, name: str) -> SSEPlugin:
        """Retrieve plugin instance by name."""
        if name not in self._plugins:
            raise KeyError(f"Plugin '{name}' is not loaded.")
        return self._plugins[name]


# Global plugin loader
loader = PluginLoader()
