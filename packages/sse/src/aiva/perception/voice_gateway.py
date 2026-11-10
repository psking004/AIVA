"""AIVA Perception - Voice Loop Binding & Bayesian EVPI Intent Disambiguation.

Transforms streaming/transcribed audio intent candidates into Bayesian decision directives:
- Normalizes acoustic/transcription confidence scores into a valid probability distribution.
- Ingests misclassification loss matrices: heavy loss (L >= 50.0) for destructive actions,
  low loss (L <= 10.0) for navigation/retrieval actions.
- Computes Bayes Risk and Expected Value of Perfect Information (EVPI).
- Emits either:
  * Non-blocking TTS clarification (< 150 chars) when EVPI > clarification_cost.
  * Frictionless direct execution when EVPI <= clarification_cost.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

DEFAULT_LOSS_PENALTIES: dict[str, float] = {
    # Destructive / Irreversible actions: Heavy loss (L >= 50.0)
    "delete_database": 100.0,
    "drop_table": 100.0,
    "push_production": 90.0,
    "git_push_production": 90.0,
    "push_main": 90.0,
    "terminate_process": 80.0,
    "wipe_cache": 75.0,
    "format_disk": 100.0,
    "financial_transfer": 100.0,
    "send_email": 60.0,
    "destructive_terminal": 85.0,
    # Navigation / Retrieval / Safe actions: Low loss (L <= 10.0)
    "open_notes": 5.0,
    "search_notes": 5.0,
    "open_calendar": 5.0,
    "view_dashboard": 5.0,
    "play_music": 5.0,
    "read_email": 8.0,
    "show_weather": 4.0,
    "query_memory": 5.0,
}


@dataclass(frozen=True)
class VoiceIntentCandidate:
    """Individual transcription candidate with raw acoustic confidence."""

    intent: str
    confidence: float
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VoiceIntentEvaluation:
    """Evaluated intent directive with Bayesian EVPI metrics."""

    directive: str  # "EXECUTE" or "CLARIFY"
    action: str
    evpi: float
    bayes_risk: float
    confidence: float
    clarification_prompt: str | None = None
    distribution: dict[str, float] = field(default_factory=dict)
    character_count: int = 0

    def to_compact_dict(self) -> dict[str, Any]:
        """Token-budgeted compact JSON representation (< 350 chars)."""
        base: dict[str, Any] = {
            "dir": self.directive,
            "act": self.action,
            "evpi": round(self.evpi, 2),
            "risk": round(self.bayes_risk, 2),
            "conf": round(self.confidence, 3),
        }
        if self.clarification_prompt:
            base["prompt"] = self.clarification_prompt
        return base


class VoiceIntentGateway:
    """Perception voice intent disambiguation engine powered by Bayesian EVPI."""

    def __init__(
        self,
        default_clarification_cost: float = 8.0,
        loss_penalties: dict[str, float] | None = None,
    ) -> None:
        self.default_clarification_cost = float(default_clarification_cost)
        self.loss_penalties = dict(loss_penalties) if loss_penalties is not None else dict(DEFAULT_LOSS_PENALTIES)

    def classify_loss(self, intent: str) -> float:
        """Resolve misclassification loss for an intent based on domain severity."""
        clean = intent.lower().strip()
        if clean in self.loss_penalties:
            return self.loss_penalties[clean]

        # Heuristic severity classification
        if any(w in clean for w in ("delete", "drop", "wipe", "push", "kill", "format", "transfer", "rm", "destroy")):
            return 85.0
        return 10.0

    def normalize_probabilities(
        self,
        candidates: list[VoiceIntentCandidate] | dict[str, float],
    ) -> dict[str, float]:
        """Convert raw transcription confidence scores into a valid probability distribution."""
        raw_probs: dict[str, float] = {}
        if isinstance(candidates, dict):
            raw_probs = {str(k).strip(): float(v) for k, v in candidates.items()}
        else:
            for c in candidates:
                raw_probs[str(c.intent).strip()] = float(c.confidence)

        if not raw_probs:
            return {}

        total = sum(max(0.0, p) for p in raw_probs.values())
        if total <= 0.0:
            uniform = 1.0 / len(raw_probs)
            return {k: uniform for k in raw_probs}

        return {k: round(max(0.0, p) / total, 4) for k, p in raw_probs.items()}

    def evaluate_intent(
        self,
        candidates: list[VoiceIntentCandidate] | dict[str, float],
        clarification_cost: float | None = None,
        custom_penalties: dict[str, float] | None = None,
    ) -> VoiceIntentEvaluation:
        """Evaluate transcribed voice candidates using Bayesian Decision Theory and EVPI.

        Computes:
            Risk(a) = (1 - P(a)) * Loss(a)
            EVPI = min_a Risk(a)

        If EVPI > clarification_cost:
            returns directive="CLARIFY" with concise TTS prompt (< 150 chars).
        Else:
            returns directive="EXECUTE" with optimal action a*.
        """
        norm_dist = self.normalize_probabilities(candidates)
        if not norm_dist:
            return VoiceIntentEvaluation(
                directive="EXECUTE",
                action="none",
                evpi=0.0,
                bayes_risk=0.0,
                confidence=0.0,
            )

        cost = float(clarification_cost) if clarification_cost is not None else self.default_clarification_cost
        penalties = dict(self.loss_penalties)
        if custom_penalties:
            penalties.update(custom_penalties)

        # Primary candidate intent from transcription
        best_action, best_confidence = max(norm_dist.items(), key=lambda item: item[1])
        loss = penalties.get(best_action, self.classify_loss(best_action))
        bayes_risk = (1.0 - best_confidence) * loss
        evpi = bayes_risk

        # Check EVPI threshold against clarification cost
        if evpi > cost:
            sorted_items = sorted(norm_dist.items(), key=lambda item: item[1], reverse=True)
            h1, p1 = sorted_items[0]
            h2, p2 = sorted_items[1] if len(sorted_items) > 1 else (h1, p1)

            # Strict character ceiling: formatted for natural TTS playback (< 150 chars)
            tts_prompt = f"Did you mean {h1} ({p1:.0%}) or {h2} ({p2:.0%})?"
            if len(tts_prompt) > 145:
                tts_prompt = tts_prompt[:142] + "..."

            eval_res = VoiceIntentEvaluation(
                directive="CLARIFY",
                action=best_action,
                evpi=round(evpi, 2),
                bayes_risk=round(bayes_risk, 2),
                confidence=best_confidence,
                clarification_prompt=tts_prompt,
                distribution=norm_dist,
                character_count=len(tts_prompt),
            )
        else:
            eval_res = VoiceIntentEvaluation(
                directive="EXECUTE",
                action=best_action,
                evpi=round(evpi, 2),
                bayes_risk=round(bayes_risk, 2),
                confidence=best_confidence,
                clarification_prompt=None,
                distribution=norm_dist,
                character_count=len(best_action),
            )

        return eval_res
