"""AIVA Conversational Intelligence - Conversational Intent & Language Classifier.

Distinguishes between casual conversation, brainstorming, emotional dialogue,
simple commands, and complex multi-agent tasks, while detecting English, Tamil, and Tanglish.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ConversationalIntent(str, Enum):
    CASUAL_CONVERSATION = "casual_conversation"
    FACTUAL_QUESTION = "factual_question"
    REASONING_BRAINSTORM = "reasoning_brainstorm"
    EMOTIONAL_CONVERSATION = "emotional_conversation"
    TOOL_COMMAND = "tool_command"
    COMPLEX_TASK = "complex_task"
    FAREWELL = "farewell"
    THINKING_ALOUD = "thinking_aloud"


class DetectedLanguage(str, Enum):
    ENGLISH = "en"
    TAMIL = "ta"
    TANGLISH = "tanglish"


@dataclass
class IntentClassificationResult:
    intent: ConversationalIntent
    language: DetectedLanguage
    confidence: float
    is_complex_workflow: bool
    is_interruption_candidate: bool
    extracted_topic: Optional[str] = None


class ConversationalClassifier:
    """Classifies user utterance intent and linguistic register."""

    TAMIL_UNICODE_PATTERN = re.compile(r"[\u0B80-\u0BFF]")
    TANGLISH_KEYWORDS = {
        "epdi", "iruka", "iruku", "irukku", "enna", "pannalam", "pannunga",
        "sari", "kandippa", "vanakkam", "romba", "nalla", "solunga", "aachu",
        "mudinjithu", "poitu", "vanga", "ama", "illai", "theriyum", "ippo", "ipo"
    }

    EMOTIONAL_KEYWORDS = {
        "tired", "exhausted", "drained", "stressed", "sad", "happy", "excited", "frustrated",
        "annoyed", "bored", "burnout", "tough day", "feeling great", "relaxed", "crazy busy",
        "busy week", "rough day", "hard day", "overwhelmed", "stuck", "headache", "draining"
    }

    FAREWELL_KEYWORDS = {
        "bye", "goodbye", "see you", "catch you later", "talk later", "goodnight",
        "that's all", "that is all", "done for today", "signing off", "poitu varen"
    }

    THINKING_ALOUD_PATTERNS = [
        re.compile(r"^(hmm+|hmmm|uh+|um+|wait|let me think|thinking aloud|wondering if)", re.IGNORECASE),
        re.compile(r"(maybe we should|what if we|not sure yet|just thinking)", re.IGNORECASE)
    ]

    TOOL_COMMAND_PATTERNS = [
        re.compile(r"^(open|close|launch|terminate|kill)\s+([a-zA-Z0-9_\-\.]+)", re.IGNORECASE),
        re.compile(r"^(create|write|make|generate)\s+(a\s+)?(file|script|note)\s+", re.IGNORECASE),
        re.compile(r"^(type|dictate|append)\s+", re.IGNORECASE),
        re.compile(r"^(call|dial|phone)\s+([0-9\+\-\s]+)", re.IGNORECASE),
        re.compile(r"^(send\s+whatsapp|message)\s+", re.IGNORECASE),
        re.compile(r"^(install|download)\s+", re.IGNORECASE)
    ]

    COMPLEX_TASK_KEYWORDS = [
        "deploy", "orchestrate", "distributed", "swarm", "dag", "multi-step",
        "refactor entire", "audit codebase", "benchmark", "full test suite"
    ]

    @classmethod
    def classify(cls, utterance: str) -> IntentClassificationResult:
        clean = (utterance or "").strip().lower()
        if not clean:
            return IntentClassificationResult(
                intent=ConversationalIntent.CASUAL_CONVERSATION,
                language=DetectedLanguage.ENGLISH,
                confidence=0.5,
                is_complex_workflow=False,
                is_interruption_candidate=False,
            )

        # 1. Language Detection
        if cls.TAMIL_UNICODE_PATTERN.search(utterance):
            detected_lang = DetectedLanguage.TAMIL
        elif any(k in clean.split() for k in cls.TANGLISH_KEYWORDS):
            detected_lang = DetectedLanguage.TANGLISH
        else:
            detected_lang = DetectedLanguage.ENGLISH

        # 2. Farewell Check
        if any(fw in clean for fw in cls.FAREWELL_KEYWORDS):
            return IntentClassificationResult(
                intent=ConversationalIntent.FAREWELL,
                language=detected_lang,
                confidence=0.95,
                is_complex_workflow=False,
                is_interruption_candidate=False,
                extracted_topic="farewell",
            )

        # 3. Thinking Aloud Check
        if any(p.search(clean) for p in cls.THINKING_ALOUD_PATTERNS):
            return IntentClassificationResult(
                intent=ConversationalIntent.THINKING_ALOUD,
                language=detected_lang,
                confidence=0.90,
                is_complex_workflow=False,
                is_interruption_candidate=False,
                extracted_topic="reflection",
            )

        # 4. Emotional Conversation Check
        if any(e in clean for e in cls.EMOTIONAL_KEYWORDS):
            return IntentClassificationResult(
                intent=ConversationalIntent.EMOTIONAL_CONVERSATION,
                language=detected_lang,
                confidence=0.88,
                is_complex_workflow=False,
                is_interruption_candidate=False,
                extracted_topic="empathy",
            )

        # 5. Complex Task Check
        if any(kw in clean for kw in cls.COMPLEX_TASK_KEYWORDS) or (" and " in clean and " then " in clean):
            return IntentClassificationResult(
                intent=ConversationalIntent.COMPLEX_TASK,
                language=detected_lang,
                confidence=0.92,
                is_complex_workflow=True,
                is_interruption_candidate=False,
                extracted_topic="distributed_engineering",
            )

        # 6. Tool Command Check
        if any(p.search(clean) for p in cls.TOOL_COMMAND_PATTERNS):
            return IntentClassificationResult(
                intent=ConversationalIntent.TOOL_COMMAND,
                language=detected_lang,
                confidence=0.94,
                is_complex_workflow=False,
                is_interruption_candidate=False,
                extracted_topic="desktop_automation",
            )

        # 7. Questions vs Casual Conversation
        if clean.endswith("?") or any(clean.startswith(q) for q in ["what", "how", "why", "when", "who", "which", "can you", "could you", "epdi", "enna"]):
            return IntentClassificationResult(
                intent=ConversationalIntent.FACTUAL_QUESTION if "weather" in clean or "time" in clean or "status" in clean else ConversationalIntent.REASONING_BRAINSTORM,
                language=detected_lang,
                confidence=0.85,
                is_complex_workflow=False,
                is_interruption_candidate=False,
            )

        # Default to Casual Conversation
        return IntentClassificationResult(
            intent=ConversationalIntent.CASUAL_CONVERSATION,
            language=detected_lang,
            confidence=0.80,
            is_complex_workflow=False,
            is_interruption_candidate=False,
        )
