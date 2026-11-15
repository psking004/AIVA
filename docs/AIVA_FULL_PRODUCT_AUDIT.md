# AIVA Full Product Audit & Stabilization Baseline Report
**Date:** 2026-11-15 20:30 IST  
**Git HEAD:** `e0e95ff7af17574d32425d881206d7a1be43ec65`  
**Tracking Remote:** `https://github.com/psking004/AIVA.git` (branch: `main`)  
**Recent Commits:**
- `e0e95ff` — feat(voice): natural human-like conversational experience, multi-turn dialogue context, Tanglish support, and barge-in
- `3f45063` — feat(sse-swarm): complete Strategic Systems Engine integration, multi-agent swarm engine (14 specialists)
- `4a63549` — feat(aiva): complete distributed voice fabric, model routing, agent integrations and hardware verification

---

## 1. Running Processes & Process Tree Audit

Inspection of running processes revealed an immediate catastrophic defect in application lifecycle management:

### 1.1 Duplicate Running Instances
Multiple distinct process trees of `AIVA.exe` were discovered executing concurrently on PC-B:

| Process Group | Main AIVA.exe PID | Child Renderers & Utility PIDs | Child Whisper PID | Child Kokoro PID |
| :--- | :--- | :--- | :--- | :--- |
| **Instance 1** (19:52:51) | PID `24660` | `17228`, `27028`, `17488`, `37356` | PID `39684` | PID `37212` |
| **Instance 2** (20:13:54) | PID `22864` | `15468`, `5584`, `28420`, `38864` | PID `22588` | PID `18000` |
| **Instance 3** (20:16:07) | PID `39224` | `3732`, `13468`, `29860`, `24900` | PID `27408` | PID `30752` |
| **Stand-alone Daemon** | N/A | Background task `task-12475` | N/A | PID `6128` |

### 1.2 Root Cause of Duplicate Overlapping Faces
In `apps/desktop/main.js`:
- `app.requestSingleInstanceLock()` is **completely absent**.
- When `AIVA.exe` is launched (whether by startup shortcut, scheduled task, user click, or automation script), it creates a new borderless, transparent, full-screen `BrowserWindow` with `alwaysOnTop: true`.
- Each instance runs its own React DOM tree (`App.tsx`), hosting an independent avatar renderer.
- When one instance is listening while another is speaking (or in different visual states), the user sees **two overlapping faces**.

### 1.3 Root Cause of Wake-Word Unreliability
- Because 3 distinct instances of `whisper-service.py` and multiple instances of `speech-listener.ps1` were spawned, they compete for the Windows default recording device.
- Microphone resource contention and PortAudio device locks cause audio buffer starvation and dropped wake events.
- Closing the window or launching a new one without single-instance locking spawns orphaned listeners.

### 1.4 Root Cause of 4–5 Second PC-B Voice Latency
- When an AI response arrives (`desktop-ai-response`), `App.tsx` calls `setLatestResponse` immediately, displaying the text in the dialog bubble at $t = 0$.
- `playAudioTTS` then initiates a synchronous HTTP POST to `http://127.0.0.1:5050/synthesize`.
- The Kokoro ONNX service synthesizes the **entire paragraph** synchronously on CPU in one batch (taking 2.5–4.5s for 150–250 chars).
- Only after the complete WAV buffer is generated, transferred, and decoded as a Blob does `audio.play()` begin.
- **Result:** Audible speech lags 4–5 seconds behind visible text.

---

## 2. Audit Matrix & Planned Architectural Corrections

| Defect # | Component | Line / File | Defect Details | Remediation Plan |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-01** | Desktop Main Process | `apps/desktop/main.js:2560-2613` | No single-instance lock (`app.requestSingleInstanceLock()`). Spawns duplicate windows, trays, and child daemons. | Enforce `app.requestSingleInstanceLock()`. If lock denied, exit immediately. If second instance launched, restore and focus existing window. |
| **DEF-02** | Avatar UI Lifecycle | `apps/desktop/src/App.tsx:780-915` | Multiple render roots / processes overlaying transparent stages. | Single instance enforcement guarantees exactly ONE window and ONE avatar stage. Clean state transition guarantees previous state is replaced. |
| **DEF-03** | Wake-word Service | `apps/desktop/main.js` & `speech-listener.ps1` | Wake-word listener coupled to full Electron UI instead of persistent background listener. | Background listener starts on login, stays active when window is minimized/hidden to tray, wakes existing single window on phrase match. |
| **DEF-04** | TTS Pipeline Latency | `apps/desktop/src/App.tsx:373` & `kokoro-service.py` | Monolithic paragraph synthesis. Text displays at $t=0$, audio blocked on full generation ($4-5$s lag). | Implement clause/sentence streaming. Synthesize first sentence immediately ($<500$ms), stream audio chunks incrementally, synchronized with avatar visemes. |
| **DEF-05** | Microphone Contention | `apps/desktop/whisper-service.py` | Multiple whisper processes holding mic input streams open. | Enforce singular child process lifecycle. Clean up existing processes before spawning. |
| **DEF-06** | Barge-In Interruption | `App.tsx`, `main.js`, `barge_in.py` | UI cancels HTML audio, but backend and TTS streams may continue buffering. | Spacebar, mic activity, and wake word trigger immediate audio element pause, TTS abort controller, and Kokoro synthesis cancellation. |

