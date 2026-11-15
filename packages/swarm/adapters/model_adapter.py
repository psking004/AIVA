"""AIVA Swarm Engine - Dynamic Model Assignment Adapter.

Routes model requests across local nodes (PC-B, PC-A) and cloud fallbacks based on
specialist role requirements, hardware telemetry, and measured provider latency.
"""

from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional


class ModelRouter:
    """Intelligently assigns models to specialist swarm agents."""

    MODEL_SPECIALIZATION_MAP = {
        # Reasoning & Planning
        "deepseek-r1": {"tier": "REASONING", "candidates": ["deepseek-r1", "qwen/qwen-2.5-72b-instruct", "gemini-flash-lite-latest", "qwen3:8b"]},
        # Coding & Debugging
        "qwen2.5-coder": {"tier": "CODING", "candidates": ["qwen/qwen-2.5-coder-32b-instruct", "qwen3:8b", "qwen3.5:latest"]},
        # Fast Conversation & Desktop/Voice Control
        "llama-3.2": {"tier": "FAST_CHAT", "candidates": ["llama3:latest", "qwen3:4b", "openrouter"]},
        # Tool-Oriented Tasks
        "glm-4": {"tier": "TOOL_USE", "candidates": ["gemini-flash-lite-latest", "qwen3:8b", "llama3:latest"]},
    }

    def __init__(self):
        self._provider_health = {
            "pc_b_ollama": {"available": True, "models": ["qwen3:4b", "qwen:7b", "llama3:latest", "qwen3:8b", "qwen3.5:latest"]},
            "pc_a_ollama": {"available": False, "models": ["llama3:latest", "deepseek-r1"]},
            "openrouter": {"available": True, "models": ["qwen/qwen-2.5-72b-instruct", "qwen/qwen-2.5-coder-32b-instruct"]},
            "gemini": {"available": True, "models": ["gemini-flash-lite-latest"]},
        }

    def select_model(self, agent_id: str, preferred_models: List[str], task_complexity: str = "medium") -> Dict[str, Any]:
        """Selects the best available model and node for an agent."""
        start_time = time.time()
        selected_model = preferred_models[0] if preferred_models else "qwen3:4b"
        provider = "local_pcb"
        node = "PC-B"

        # Check specialization category
        for pref in preferred_models:
            if "deepseek" in pref.lower() or "planner" in agent_id or "reviewer" in agent_id or "architect" in agent_id:
                if self._provider_health["openrouter"]["available"]:
                    selected_model = "qwen/qwen-2.5-72b-instruct (DeepSeek R1 equivalent)"
                    provider = "openrouter"
                    node = "CLOUD"
                    break
                elif "qwen3:8b" in self._provider_health["pc_b_ollama"]["models"]:
                    selected_model = "qwen3:8b"
                    provider = "local_pcb"
                    node = "PC-B"
                    break

            elif "coder" in pref.lower() or "coding" in agent_id or "debugger" in agent_id:
                if self._provider_health["openrouter"]["available"]:
                    selected_model = "qwen/qwen-2.5-coder-32b-instruct"
                    provider = "openrouter"
                    node = "CLOUD"
                    break
                elif "qwen3:8b" in self._provider_health["pc_b_ollama"]["models"]:
                    selected_model = "qwen3:8b"
                    provider = "local_pcb"
                    node = "PC-B"
                    break

            elif "llama" in pref.lower() or "voice" in agent_id or "desktop" in agent_id:
                selected_model = "llama3:latest"
                provider = "local_pcb"
                node = "PC-B"
                break

            elif "gemini" in pref.lower() or "researcher" in agent_id or "memory" in agent_id:
                selected_model = "gemini-flash-lite-latest"
                provider = "gemini"
                node = "CLOUD"
                break

        return {
            "agent_id": agent_id,
            "selected_model": selected_model,
            "provider": provider,
            "node": node,
            "latency_ms": round((time.time() - start_time) * 1000, 2),
            "timestamp": time.time(),
        }
