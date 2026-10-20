# AIVA — CURRENT STATE AUDIT
**Date:** October 19, 2026  
**Document Status:** Master Architecture Baseline  
**Scope:** Complete repository inspection (`apps/web`, `apps/desktop`, `apps/mobile`, `backend`, `packages`, `aiva_desktop`, voice pipeline, memory, AI providers, data layers)

---

## 1. Executive Subsystem Classification Summary

| Subsystem | Location | Status | Key Findings |
|---|---|---|---|
| **Voice Capture & VAD** | `apps/desktop/whisper-service.py` | **WORKING** | WASAPI 48kHz→16kHz decimation, circular ring-buffer, energy VAD, trailing silence detection (<450ms). |
| **Speech-to-Text (STT)** | `apps/desktop/whisper-service.py` | **WORKING** | faster-whisper `base.en`, CUDA float16 with CPU int8 fallback, warmed up at boot. |
| **Desktop Shell & IPC** | `apps/desktop/main.js` | **WORKING** | Electron transparent overlay, system tray, watchdog timers, single voice session lock. |
| **Holographic Face & Lip-Sync** | `apps/web/components/aiva-face.tsx` | **WORKING** | SVG canvas, Web Audio Analyser frequency analysis, 5-viseme mapping (`base`, `slight`, `mid`, `wide`, `o`), resting mouth state. |
| **Audio Manager** | `apps/web/lib/aiva-audio-manager.ts` | **WORKING** | Single audio owner, interrupt/barge-in capability, strict callback separation (no fake playback on error). |
| **Cognitive Routing (Client)** | `apps/web/lib/aiva-cognitive-engine.ts` | **WORKING** | 3-mode split (FAST deterministic, CONTEXTUAL memory, AGENTIC tasks). |
| **Backend AI Gateway** | `backend/src/ai/aiva.service.ts` | **WORKING** | `/ai/chat` endpoint, JWT auth, device authorization headers, trace logging. |
| **Model Router** | `backend/src/ai/router/model-router.service.ts` | **PARTIALLY WORKING** | Supports Ollama (Qwen3 8B), OpenRouter, Gemini. Needs dynamic device/node awareness and PC-A vs PC-B hardware routing. |
| **AI Providers** | `backend/src/ai/providers/` | **WORKING** | Gemini, OpenRouter, Ollama providers with health checks and circuit breakers. |
| **Memory System (3-Layer)** | `backend/src/ai/memory/` | **WORKING** | Short-term (in-memory buffer), Session (Redis/state), Long-term (Persistent JSON vector store + Embedding service). |
| **Task Management** | `backend/src/modules/tasks/` | **WORKING** | Prisma Task model with subtasks, status transitions, priority, deadlines. |
| **Project Tracking** | `backend/src/modules/projects/` | **WORKING** | Prisma Project model with initiatives, progress, status, metadata. |
| **Android Mobile Client** | `apps/mobile/` | **PARTIALLY WORKING** | React Native Expo app with floating face, wake-word service, and direct Render backend API connection. Needs full mobile voice/TTS integration. |
| **TTS System** | `apps/web/app/api/voice/speak/route.ts` | **NEEDS REFACTOR** | ElevenLabs quota exhaustion causes 401. Lacks primary local offline TTS (Kokoro ONNX) and multi-provider abstraction (`AivaTtsProvider`). |
| **Operating Policy Engine** | *Global* | **MISSING** | No dedicated `AivaPolicyEngine` governing autonomous execution, budgets, permissions, and tool verifications. |
| **Capability / Tool Registry** | `backend/src/ai/tools/registry.ts` | **NEEDS REFACTOR** | Basic in-memory registry exists for 6 tools; lacks formal capability schemas, timeouts, permission levels (Level 0-3), audit events, and verification hooks. |
| **Coding & Computer Agent** | *Global* | **MISSING** | No dedicated code inspection, editing, test runner, build verifier, or diff review pipeline. |
| **Two-PC Compute Node Protocol** | *Global* | **MISSING** | No dynamic device capability registration (PC-A RTX 3050 CUDA vs PC-B CPU). |
| **Legacy Python Prototype** | `aiva_desktop/` | **DUPLICATED** | Early Tkinter/Coqui prototype. Superseded by Electron + Next.js architecture. |

---

## 2. Detailed Subsystem Analysis

### 2.1 Voice Pipeline & Desktop Runtime
- **Microphone Capture:** `apps/desktop/whisper-service.py` connects via `sounddevice` to WASAPI primary input device at 48,000 Hz, applying 3:1 integer decimation to 16,000 Hz float32 PCM.
- **VAD & Silence Detection:** Calculates RMS energy every 64ms. Pre-roll ring buffer preserves 200ms speech onset. Trailing silence detector closes recordings after 400ms of quiet following detected speech.
- **STT Engine:** Uses `faster-whisper` (CTranslate2). Automatically tests CUDA availability; falls back to CPU int8 if CUDA is absent. Performs synthetic dummy audio inference on boot to eliminate cold-start latency.
- **Electron Main Process:** `apps/desktop/main.js` maintains a strict state machine (`DORMANT` $\rightarrow$ `LISTENING` $\rightarrow$ `RECORDING_COMMAND` $\rightarrow$ `TRANSCRIBING` $\rightarrow$ `THINKING` $\rightarrow$ `SPEAKING`). Watchdog timers prevent hung states.

### 2.2 Audio Playback & TTS Transport
- **Current Route:** `apps/web/app/api/voice/speak/route.ts` forwards text to ElevenLabs (`eleven_multilingual_v2`).
- **Critical Defect:** When the account quota is exhausted, ElevenLabs returns HTTP 401. There is currently no local TTS fallback on the PC, leaving voice interaction completely disabled when cloud credits run out.
- **Audio Output Manager:** `apps/web/lib/aiva-audio-manager.ts` manages a single `HTMLAudioElement` and Web Audio API `AudioContext`. Successfully enforces single-owner playback, interrupts active speech on barge-in, and suppresses fake playback state updates on errors.

### 2.3 Holographic Face & Lip-Synchronization
- **Face Component:** `apps/web/components/aiva-face.tsx` renders a transparent holographic female face with glowing particle geometry, dynamic eye blinks, and subtle breathing animations.
- **Lip-Sync Engine:** Reusable pure-function `computeAivaLipSync()` in `@aiva/types` converts real-time audio FFT frequencies into smoothed mouth apertures (`base`, `slight`, `mid`, `wide`, `o`) with mandible displacement (0–3.5px).

### 2.4 Cognitive Engine & Client Routing
- **Architecture:** `apps/web/lib/aiva-cognitive-engine.ts` categorizes requests into:
  - `FAST`: Handled in 1–15ms via deterministic code (time queries, identity questions, UI close/open commands).
  - `CONTEXTUAL`: Queries tasks, projects, and memory archives from backend APIs.
  - `AGENTIC`: Dispatches multi-turn action directives to `/ai/chat`.
- **Response Separation:** Cleanly isolates `spokenResponse` (concise 1–2 sentences for TTS) from `displayResponse` (rich markdown for contextual cards).

### 2.5 Backend Intelligence Core & Models
- **Controller & Service:** `backend/src/ai/ai.controller.ts` and `aiva.service.ts` handle incoming `/ai/chat` requests.
- **Multi-Provider Router:** `backend/src/ai/router/model-router.service.ts` orchestrates:
  - Local Ollama (`qwen3:8b`)
  - Cloud OpenRouter (`qwen/qwen-2.5-72b-instruct`)
  - Cloud Google Gemini (`gemini-3.8-flash`)
- **Circuit Breakers & Quotas:** Enforces max daily cloud request limits (1,000 requests/day), cooldown trips, and timeouts.
- **Current Deficiency:** Routing strategy is static (`local-first`, `cloud-first`, etc.) and does not evaluate whether the active node is PC-A (GPU) or PC-B (CPU), nor does it automatically route Android requests straight to Gemini.

### 2.6 Memory & Knowledge Retrieval
- **Short-Term Memory:** `short-term.memory.ts` maintains in-memory sliding windows (last 10 turns per user).
- **Session Memory:** `session.memory.ts` maintains completed tasks, pending reminders, and session sentiment.
- **Long-Term Memory & RAG:** `long-term.memory.ts` and `rag.service.ts` chunk documents (500 tokens, 50 overlap), generate embeddings via `EmbeddingService`, and persist vectors to `data/rag_vectors.json`.

### 2.7 Database & Persistence
- **Prisma Schema:** `backend/prisma/schema.prisma` contains 18 models covering Users, Devices, Sessions, ApiKeys, Projects, Tasks, Notes, Documents, Files, CalendarEvents, Emails, Conversations, Messages, and ActivityLogs.
- **Database Engine:** PostgreSQL via Supabase with PgBouncer session pooling.

### 2.8 Mobile Application (Android)
- **Framework:** React Native Expo in `apps/mobile/`.
- **Connectivity:** Uses `aiva-client.ts` configured for the Render backend URL (`https://aiva-backend.onrender.com`).
- **Autonomy:** Never references `localhost:11434` or Ollama. Fully capable of running when both PCs are powered down.
- **Current Gap:** Speech synthesis currently uses syllabic timer simulation in `index.tsx` instead of true mobile audio playback.

---

## 3. Subsystem Health Matrix

```
[STT: Whisper]           WORKING (140ms on CPU/CUDA)
[VAD / Silence]          WORKING (<450ms trailing silence)
[Holographic Face]       WORKING (60fps canvas + visemes)
[Lip Sync]               WORKING (Web Audio analyser)
[Audio Manager]          WORKING (Single-owner, barge-in)
[Cognitive Engine]       WORKING (FAST / CONTEXTUAL / AGENTIC)
[Backend /ai/chat]       WORKING (HTTP 200 verified)
[Prisma / Supabase]      WORKING (18 models active)
[RAG / Memory]           WORKING (3-layer memory architecture)
[Local TTS: Kokoro]      MISSING (Currently only ElevenLabs)
[Policy Engine]          MISSING (No formal policy coordinator)
[Capability Registry]    NEEDS REFACTOR (Basic tools, no level 0-3 permissions)
[Coding Agent]           MISSING (No file editing/build verification)
[Compute Nodes]          MISSING (No dynamic hardware registration)
[Mobile Voice]           PARTIALLY WORKING (UI works, needs audio TTS)
```
