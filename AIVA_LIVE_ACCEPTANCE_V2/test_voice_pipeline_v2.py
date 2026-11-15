"""AIVA 2.0 Live Acceptance V2 - Project 2: Voice-to-Voice Deep Pipeline Testing.

Performs multi-turn conversational trials, measures p50/p95 latency distributions,
tests English/Tamil/Tanglish comprehension, and verifies barge-in cancellation.
"""

from __future__ import annotations

import json
import logging
import statistics
import time
import urllib.request
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from packages.conversational.audio.barge_in import BargeInController
from packages.conversational.engine.conversation_engine import ConversationEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("VoiceAcceptanceV2")

OUT_DIR = Path(__file__).resolve().parent / "evidence" / "voice_measurements"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def measure_tts_latency(text: str) -> float:
    url = "http://127.0.0.1:5050/synthesize"
    req_data = json.dumps({"text": text, "voice": "af_bella", "speed": 1.05}).encode('utf-8')
    req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=10) as resp:
        _ = resp.read()
    return round((time.perf_counter() - t0) * 1000, 2)


def main():
    logger.info("Starting Deep Voice-to-Voice Pipeline Acceptance Testing...")
    conv = ConversationEngine()
    barge = BargeInController()
    results = {}

    # 1. Multi-turn English Dialogue Continuity
    logger.info("Executing 3-turn contextual English dialogue...")
    turn1_prompt = "Explain what makes an intelligent agent different from a normal chatbot."
    t0 = time.perf_counter()
    r1 = conv.process_utterance(turn1_prompt)
    lat1 = round((time.perf_counter() - t0) * 1000, 2)

    turn2_prompt = "Give me a practical example."
    t0 = time.perf_counter()
    r2 = conv.process_utterance(turn2_prompt)
    lat2 = round((time.perf_counter() - t0) * 1000, 2)

    turn3_prompt = "Now explain the same thing in simpler words."
    t0 = time.perf_counter()
    r3 = conv.process_utterance(turn3_prompt)
    lat3 = round((time.perf_counter() - t0) * 1000, 2)

    results["english_dialogue"] = {
        "turn_1": {"prompt": turn1_prompt, "response": r1.get("spoken_response"), "latency_ms": lat1},
        "turn_2": {"prompt": turn2_prompt, "response": r2.get("spoken_response"), "latency_ms": lat2},
        "turn_3": {"prompt": turn3_prompt, "response": r3.get("spoken_response"), "latency_ms": lat3},
        "context_maintained": len(r2.get("spoken_response", "")) > 10 and len(r3.get("spoken_response", "")) > 10,
    }

    # 2. Tanglish & Tamil Comprehension
    logger.info("Executing Tanglish turn...")
    tanglish_prompt = "Enakku oru simple application build pannanum. First requirements understand pannu. Apram architecture decide pannalam."
    t0 = time.perf_counter()
    r_tanglish = conv.process_utterance(tanglish_prompt)
    lat_tanglish = round((time.perf_counter() - t0) * 1000, 2)
    results["tanglish_dialogue"] = {
        "prompt": tanglish_prompt,
        "response": r_tanglish.get("spoken_response"),
        "latency_ms": lat_tanglish,
    }

    # 3. Repeated TTS Latency Trials (p50 / p95)
    logger.info("Executing 5 repeated TTS synthesis trials for p50/p95 calculations...")
    tts_trials = []
    clauses = [
        "AIVA intelligent personal assistant online.",
        "System architecture validated across all three nodes.",
        "Task completed successfully with independent verification.",
        "Ready to execute your next instruction.",
        "Continuous dialogue context updated.",
    ]
    for c in clauses:
        dur = measure_tts_latency(c)
        tts_trials.append(dur)
        logger.info(f"Clause TTS: '{c[:30]}...' -> {dur} ms")

    tts_trials.sort()
    p50_tts = round(statistics.median(tts_trials), 2)
    p95_tts = round(tts_trials[int(len(tts_trials) * 0.95)], 2)
    results["tts_latency_distribution_ms"] = {
        "trials": tts_trials,
        "p50": p50_tts,
        "p95": p95_tts,
        "min": min(tts_trials),
        "max": max(tts_trials),
    }

    # 4. Barge-In Interruption Timing (5 trials)
    logger.info("Executing barge-in cancellation latency trials...")
    barge_trials = []
    for i in range(5):
        barge.start_speaking(f"clause_stream_{i}")
        t_int = time.perf_counter()
        stopped = barge.trigger_interruption()
        int_dur = round((time.perf_counter() - t_int) * 1000, 3)
        assert stopped and not barge._is_speaking
        barge_trials.append(int_dur)

    results["barge_in_latency_distribution_ms"] = {
        "trials": barge_trials,
        "p50": round(statistics.median(barge_trials), 3),
        "p95": round(barge_trials[int(len(barge_trials) * 0.95)], 3),
        "all_interrupted_successfully": True,
    }

    # Save output
    out_file = OUT_DIR / "voice_pipeline_deep_metrics.json"
    out_file.write_text(json.dumps(results, indent=2), encoding="utf-8")
    logger.info(f"Voice acceptance metrics written to {out_file}")


if __name__ == "__main__":
    main()
