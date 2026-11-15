"""AIVA Conversational Intelligence - Dialogue Context & Memory.

Maintains multi-turn conversational context, topic shift detection,
implicit reference resolution, and emotional state history.
"""

from __future__ import annotations

import collections
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class DialogueTurn:
    role: str  # "user" or "aiva"
    text: str
    intent: str
    language: str
    timestamp: float = field(default_factory=time.time)
    extracted_entities: Dict[str, Any] = field(default_factory=dict)


class DialogueContextManager:
    """Manages active conversational context across multiple turns."""

    def __init__(self, max_turns: int = 12):
        self.max_turns = max_turns
        self.history: List[DialogueTurn] = []
        self.current_topic: str = "general"
        self.last_referenced_entity: Optional[str] = None
        self.user_name: Optional[str] = "Bharath"
        self.last_interaction_time: float = time.time()

    def add_turn(self, role: str, text: str, intent: str = "casual_conversation", language: str = "en", entities: Optional[Dict[str, Any]] = None) -> None:
        """Adds a turn to the sliding context buffer."""
        turn = DialogueTurn(
            role=role,
            text=text,
            intent=intent,
            language=language,
            extracted_entities=entities or {},
        )
        self.history.append(turn)
        if len(self.history) > self.max_turns:
            self.history.pop(0)

        # Update last referenced entity if present
        if entities and "file" in entities:
            self.last_referenced_entity = entities["file"]
        elif entities and "app" in entities:
            self.last_referenced_entity = entities["app"]

        self.last_interaction_time = time.time()

    def resolve_pronouns(self, utterance: str) -> str:
        """Resolves anaphora like 'it', 'that', 'the file' using recent context."""
        clean = utterance.strip()
        words = clean.lower().split()

        if self.last_referenced_entity:
            # If user asks to "open it", "run it", "check it"
            if " it" in clean.lower() or clean.lower().endswith(" it"):
                clean = clean.replace(" it", f" {self.last_referenced_entity}").replace(" It", f" {self.last_referenced_entity}")
            elif " that" in clean.lower() and len(words) <= 4:
                clean = clean.replace(" that", f" {self.last_referenced_entity}")

        return clean

    def get_recent_history_summary(self, max_items: int = 4) -> str:
        """Returns a concise summary of the last few turns for prompt conditioning."""
        if not self.history:
            return "No previous conversation turns."
        recent = self.history[-max_items:]
        return " | ".join(f"{t.role}: {t.text}" for t in recent)

    def is_conversation_stale(self, timeout_sec: float = 300.0) -> bool:
        """Checks if a significant pause occurred since the last turn."""
        return (time.time() - self.last_interaction_time) > timeout_sec

    def reset_context(self) -> None:
        """Resets conversational history when a topic concludes."""
        self.history.clear()
        self.current_topic = "general"
        self.last_referenced_entity = None

