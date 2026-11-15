# AIVA 2.0 Live Failure Analysis & Incident Diagnostic Runbook

**Document Role:** System Fault Trace & Hardening Review  
**Date:** 2026-11-15  

---

## 1. Documented Real-World Incidents & Resolutions

### Incident 1: Ollama Model Cold-Start Timeout
* **Symptom:** Querying 5.2 GB GGUF model (`qwen3:8b`) on cold disk exceeded 10-second default request timeout.
* **Root Cause:** Loading weights from physical SSD into CPU memory under Windows background thread scheduling takes ~15–20s on first invocation.
* **Resolution:** Implemented multi-tier timeout handling in `ModelRouter`:
  1. Low-latency fast chat defaults to warm 2.5 GB model `qwen3:4b`.
  2. Cold models trigger non-blocking deterministic fallback to ensure conversational responsiveness is never blocked.
  3. Subsequent queries to loaded models execute in memory without disk penalty.

### Incident 2: Method Signature Inconsistencies During Tool Integration
* **Symptom:** `IndependentVerifier` and `BargeInController` threw `AttributeError` on initial integration test.
* **Root Cause:** Method names in historical modules (`verify_execution` vs `verify_task_execution`, `trigger_interruption` vs `handle_user_interruption`) differed between prototypes.
* **Resolution:** Aligned all caller signatures in `SwarmOrchestrator` and `run_aiva2_benchmarks.py` directly to the underlying class implementations. Verified 100% test passing across all 8 benchmarks.

### Incident 3: Android Device Audio Routing Collision
* **Symptom:** Previous mobile service iterations hijacked Android audio focus, silencing media players (YouTube, Instagram) and phone calls.
* **Root Cause:** Exclusive `AUDIOFOCUS_GAIN` was requested on microphone open.
* **Resolution:** Switched to unmanaged audio recording with `VOICE_RECOGNITION` audio source in `AivaWakeWordForegroundService.kt`. Verified audio coexistence on physical iQOO Neo 10 device.

