"""AIVA Conversational Intelligence - Core Engine.

Processes user utterances through intent classification, contextual memory,
multilingual synthesis, and natural conversational response generation.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request
from typing import Any, Dict, List, Optional

from packages.conversational.core.intent_classifier import (
    ConversationalClassifier,
    ConversationalIntent,
    DetectedLanguage,
    IntentClassificationResult,
)
from packages.conversational.core.personality import (
    AIVA_PERSONA_INSTRUCTIONS,
    PersonalityProfile,
)
from packages.conversational.memory.dialogue_context import DialogueContextManager

logger = logging.getLogger("AivaConversationEngine")


class ConversationEngine:
    """Central conversational coordinator delivering natural human-like companion dialogues."""

    def __init__(self):
        self.context = DialogueContextManager()
        self.classifier = ConversationalClassifier()

    def process_utterance(self, raw_utterance: str, target_node: str = "PC-B") -> Dict[str, Any]:
        """Main conversational processing loop:

        1. Resolves pronouns using dialogue memory.
        2. Classifies intent and language (English, Tamil, Tanglish).
        3. Formulates natural response (or routes to tool / SSE swarm).
        4. Cleans response for natural TTS speech rhythm.
        5. Updates multi-turn dialogue history.
        """
        raw_text = (raw_utterance or "").strip()
        if not raw_text:
            return {
                "spoken_response": "I'm listening whenever you're ready!",
                "intent": "idle",
                "language": "en",
                "should_speak": True,
            }

        # 1. Resolve Pronouns with Active Context
        resolved_text = self.context.resolve_pronouns(raw_text)

        # 2. Intent & Language Classification
        classification: IntentClassificationResult = self.classifier.classify(resolved_text)

        # 3. Generate Spoken Response
        spoken_response = ""
        delegated_action = None

        # A. Thinking Aloud Handling
        if classification.intent == ConversationalIntent.THINKING_ALOUD:
            if classification.language == DetectedLanguage.TANGLISH:
                spoken_response = "Take your time! Enna yosikareenga? We can figure it out together."
            else:
                spoken_response = "Take your time! What direction are you thinking? I'm right here with you."

        # B. Emotional Empathy Handling
        elif classification.intent == ConversationalIntent.EMOTIONAL_CONVERSATION:
            clean_lower = resolved_text.lower()
            if any(t in clean_lower for t in ["tired", "exhausted", "drained", "burnout", "compiler", "errors"]):
                if classification.language == DetectedLanguage.TANGLISH:
                    spoken_response = "Romba tired ah iruka? Konjam rest edunga, let me take care of the tasks here."
                else:
                    spoken_response = "You've been working so hard. Take a breath and step back for a moment—I'm right here to take the load off."
            elif any(t in clean_lower for t in ["crazy busy", "busy week", "hectic"]):
                spoken_response = "Sounds like quite a whirlwind week! Glad you're checking in—make sure you take a minute to catch your breath too."
            else:
                spoken_response = "I hear you! Let's take it one step at a time. I'm right here with you."

        # C. Farewell Handling
        elif classification.intent == ConversationalIntent.FAREWELL:
            if classification.language in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
                spoken_response = "Kandippa! Poitu vanga, I'll be right here whenever you need me."
            else:
                spoken_response = "Catch you later! Have a great one, and reach out anytime."
            self.context.reset_context()

        # D. Casual Greetings & Checking In
        elif any(g in resolved_text.lower() for g in ["hi aiva", "hello aiva", "hey aiva", "vanakkam", "epdi iruka"]):
            if any(t in resolved_text.lower() for t in ["busy", "week", "tired", "crazy"]):
                spoken_response = "Hey! Sounds like quite a whirlwind week! Glad you're checking in—make sure you take a minute to catch your breath too."
            elif classification.language in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
                spoken_response = "Vanakkam! Semma energetic ah iruken. All systems are green—what are we building today?"
            else:
                spoken_response = "Hey! Really good to connect. PC-B and all our nodes are running smooth—what are we tackling?"

        # E. Casual Banter / Statements
        elif classification.intent == ConversationalIntent.CASUAL_CONVERSATION:
            spoken_response = self._generate_casual_chat(resolved_text, classification.language)

        # F. Factual Question / Brainstorming
        elif classification.intent in (ConversationalIntent.FACTUAL_QUESTION, ConversationalIntent.REASONING_BRAINSTORM):
            spoken_response = self._generate_factual_or_brainstorm(resolved_text, classification.language)

        # G. Tool Commands & Complex Tasks (Delegation with natural acknowledgment)
        else:
            delegated_action = classification.intent.value
            spoken_response = self._generate_task_acknowledgment(resolved_text, classification.language)

        # 4. Clean and Format for Natural Voice TTS (Remove code symbols, format rhythm)
        cleaned_speech = self.format_for_speech(spoken_response)

        # 5. Record Dialogue Turn
        self.context.add_turn(
            role="user",
            text=raw_text,
            intent=classification.intent.value,
            language=classification.language.value,
        )
        self.context.add_turn(
            role="aiva",
            text=cleaned_speech,
            intent="response",
            language=classification.language.value,
        )

        return {
            "spoken_response": cleaned_speech,
            "intent": classification.intent.value,
            "language": classification.language.value,
            "is_complex": classification.is_complex_workflow,
            "delegated_action": delegated_action,
            "should_speak": True,
        }

    def _generate_casual_chat(self, text: str, lang: DetectedLanguage) -> str:
        clean = text.lower()
        if any(w in clean for w in ["busy", "week", "hectic", "crazy"]):
            return "Sounds like quite a whirlwind! Glad you checked in—make sure you take a minute to catch your breath too."
        if "weather" in clean:
            if lang == DetectedLanguage.TANGLISH:
                return "Outside Chennai la nice and warm ah iruku, but both our workstation fans are keeping everything chill!"
            return "Outside it's warm and clear, and both PC-B and PC-A are holding nice and cool!"
        if "how are you" in clean or "epdi iruka" in clean:
            if lang in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
                return "Naan super ah iruken! Fabric connection fully ready. Ready to build with you!"
            return "I'm doing great! Everything is synced up and ready to go."
        if "thank" in clean:
            if lang in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
                return "Romba welcome! Glad I could help out."
            return "Anytime! Always happy to help."
        
        # General response
        if lang in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
            return "Kandippa! That makes a lot of sense. Enna next step edukalam?"
        return "I like where you're going with that. What's the next move?"

    def _generate_factual_or_brainstorm(self, text: str, lang: DetectedLanguage) -> str:
        # Try local LLM completion if available
        llm_reply = self._query_local_or_cloud_llm(text)
        if llm_reply:
            return llm_reply

        # Fallback intelligent response
        if lang in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
            return "Idhu interesting topic! Architecture point of view la nalla fit aagum. Let's explore that together."
        return "That's a really interesting thought! From a system architecture perspective, it gives us a lot of flexibility."

    def _generate_task_acknowledgment(self, text: str, lang: DetectedLanguage) -> str:
        if lang in (DetectedLanguage.TAMIL, DetectedLanguage.TANGLISH):
            return "Sari, I'm on it! Setting that up across the nodes right now."
        return "Got it! Running that on the workstation right now."

    def _query_local_or_cloud_llm(self, prompt: str) -> Optional[str]:
        """Attempts to generate a quick conversational reply via local Ollama or cloud backend."""
        try:
            # Query local Ollama fast chat model (e.g. qwen3:4b or llama3:latest) with short timeout
            req_data = {
                "model": "qwen3:4b",
                "prompt": f"{AIVA_PERSONA_INSTRUCTIONS}\n\nUser: {prompt}\nAIVA (conversational, warm, concise, 1-2 sentences):",
                "stream": False,
                "options": {"num_predict": 60, "temperature": 0.7}
            }
            req = urllib.request.Request(
                "http://127.0.0.1:11434/api/generate",
                data=json.dumps(req_data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=1.8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                response_text = data.get("response", "").strip()
                if response_text:
                    return response_text
        except Exception:
            pass
        return None

    @classmethod
    def format_for_speech(cls, text: str) -> str:
        """Strips markdown and technical clutter to ensure natural rhythm for Kokoro TTS."""
        if not text:
            return ""
        # Strip markdown links: [label](url) -> label
        clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
        # Strip code fences and inline backticks
        clean = re.sub(r"```[a-zA-Z]*\n?([^`]+)```", r"\1", clean)
        clean = clean.replace("`", "")
        # Strip markdown headers, asterisks, bullet dashes
        clean = re.sub(r"^#+\s*", "", clean, flags=re.MULTILINE)
        clean = clean.replace("**", "").replace("*", "")
        clean = re.sub(r"^\s*-\s+", "", clean, flags=re.MULTILINE)
        # Ensure single spaces
        clean = re.sub(r"\s+", " ", clean).strip()
        return clean
