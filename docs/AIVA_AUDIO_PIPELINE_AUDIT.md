# AIVA Audio Pipeline Audit & Barge-In Specification

## 1. Microphone & Speaker Ownership

### 1.1 Capture Pipeline
- **Wake Candidate Listener (`speech-listener.ps1`)**:
  - Uses `System.Speech.Recognition` at the Windows OS level.
  - Paused dynamically via stdin command (`"pause"` / `"resume"`) during active TTS playback to prevent acoustic echo feedback.
- **Utterance Transcription (`whisper-service.py`)**:
  - Uses `faster-whisper` with `sounddevice.InputStream` configured for 16kHz audio capture with a 350ms pre-roll ring buffer.
  - Single process enforcement (`killOrphanedWhisperProcesses()`) prevents device sharing contention on the microphone.

### 1.2 Full-Duplex Interruption (Barge-In)
When the user speaks or presses Spacebar during active speech:
1. `interruptPlayback()` is triggered.
2. `playbackSessionRef.current += 1`: Invalidates the active turn ID.
3. `abortController.abort()`: Cancels in-flight HTTP synthesis requests to port 5050.
4. `activeAudioElRef.current.pause()`: Cuts audio output within < 15 ms.
5. All pending audio chunk URLs are revoked via `URL.revokeObjectURL()`.
6. Avatar transitions to `LISTENING` state immediately.
7. Microphones are re-armed to capture the new utterance.

---

## 2. Audio Pipeline Verification

- Benchmark test script: `scripts/test_desktop_lifecycle.js`
- Test 5: Barge-in Session Token Invalidation: **PASS**
- Speech recognition benchmark: `apps/desktop/whisper-service.py --warmup` -> **1017.4 ms (Target: < 1800 ms)**.
- Wake grammar check: `speech-listener.ps1 -TestMic` -> **30 ms (Target: < 180 ms)**.

