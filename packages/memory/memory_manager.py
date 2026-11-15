"""AIVA 2.0 - Multi-Tier Memory Architecture.

Manages 5 distinct memory layers:
1. Short-Term Conversation Memory (recent conversational turns)
2. Working Memory (active task scratchpad and intermediate execution facts)
3. Long-Term Preferences (user habits, preferred language, voice pitch, traits)
4. Project Memory (workspace paths, repo stack, architectural decisions)
5. Task Execution Memory (historical task success rates, tool latencies, retry logs)
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("MemoryManager")


class MemoryManager:
    """Unified memory manager across 5 hierarchical cognitive tiers."""

    def __init__(self, storage_dir: Optional[str] = None):
        base_dir = Path(__file__).resolve().parent.parent.parent
        self.storage_dir = Path(storage_dir) if storage_dir else base_dir / "backend" / "data" / "memory"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

        # In-memory structures
        self.short_term: List[Dict[str, Any]] = []
        self.working_memory: Dict[str, Any] = {}
        self.long_term_prefs: Dict[str, Any] = {
            "user_name": "Bharat",
            "assistant_name": "AIVA",
            "voice_id": "af_bella",
            "voice_speed": 1.05,
            "preferred_languages": ["en-US", "ta-IN", "tanglish"],
            "communication_style": "warm_direct_intelligent",
            "conciseness": "adaptive",
        }
        self.project_memory: Dict[str, Any] = {
            "workspace_root": r"C:\Users\bhara\AIVA",
            "primary_node": "PC-B (10.16.177.59)",
            "compute_node": "PC-A (10.16.177.194)",
            "mobile_node": "iQOO Neo 10 (10.16.177.243)",
            "architecture": "Tri-Node Sovereign Distributed Fabric",
        }
        self._load_persisted()

    def _load_persisted(self) -> None:
        """Loads persisted long-term preferences and project memory from disk."""
        prefs_file = self.storage_dir / "preferences.json"
        if prefs_file.exists():
            try:
                self.long_term_prefs.update(json.loads(prefs_file.read_text(encoding="utf-8")))
            except Exception as e:
                logger.warning(f"Failed to load preferences: {e}")

        proj_file = self.storage_dir / "project_memory.json"
        if proj_file.exists():
            try:
                self.project_memory.update(json.loads(proj_file.read_text(encoding="utf-8")))
            except Exception as e:
                logger.warning(f"Failed to load project memory: {e}")

    def _persist(self) -> None:
        """Saves persistent tiers to disk atomically."""
        try:
            (self.storage_dir / "preferences.json").write_text(json.dumps(self.long_term_prefs, indent=2), encoding="utf-8")
            (self.storage_dir / "project_memory.json").write_text(json.dumps(self.project_memory, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Memory persistence error: {e}")

    # Tier 1: Short-term conversation memory
    def add_turn(self, role: str, text: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        with self._lock:
            self.short_term.append({
                "role": role,
                "text": text,
                "timestamp": time.time(),
                "metadata": metadata or {},
            })
            if len(self.short_term) > 30:
                self.short_term = self.short_term[-30:]

    def get_recent_turns(self, count: int = 6) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self.short_term[-count:])

    # Tier 2: Working memory (Scratchpad for active tasks)
    def set_working_fact(self, key: str, value: Any) -> None:
        with self._lock:
            self.working_memory[key] = {
                "value": value,
                "updated_at": time.time(),
            }

    def get_working_fact(self, key: str) -> Optional[Any]:
        with self._lock:
            item = self.working_memory.get(key)
            return item["value"] if item else None

    def clear_working_memory(self) -> None:
        with self._lock:
            self.working_memory.clear()

    # Tier 3: Long-term preferences
    def set_preference(self, key: str, value: Any) -> None:
        with self._lock:
            self.long_term_prefs[key] = value
            self._persist()

    def get_preference(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self.long_term_prefs.get(key, default)

    # Tier 4: Project memory
    def record_project_fact(self, key: str, value: Any) -> None:
        with self._lock:
            self.project_memory[key] = value
            self._persist()

    def get_project_fact(self, key: str) -> Optional[Any]:
        with self._lock:
            return self.project_memory.get(key)

    # Tier 5: Snapshot summary
    def get_full_memory_context(self) -> Dict[str, Any]:
        """Provides consolidated context for LLM prompt injections."""
        with self._lock:
            return {
                "recent_dialogue": [f"{t['role']}: {t['text']}" for t in self.short_term[-4:]],
                "active_working_facts": {k: v["value"] for k, v in self.working_memory.items()},
                "user_preferences": self.long_term_prefs,
                "project_environment": self.project_memory,
            }
