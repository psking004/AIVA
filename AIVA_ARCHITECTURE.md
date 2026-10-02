# AIVA Architecture Specification

## 1. System Overview

AIVA is a **Private Personal AI Operating System** built exclusively for a **single owner**. It operates across two primary client platforms and an independent private cloud:

```
                          AIVA PERSONAL SYSTEM
                          
                 ┌──────────────────────────────────┐
                 │       AIVA PRIVATE CLOUD         │
                 │         (Render / Cloud)         │
                 │                                  │
                 │  - NestJS API Backend            │
                 │  - Supabase PostgreSQL           │
                 │  - Upstash TLS Redis             │
                 │  - Single-Owner Auth Guard       │
                 │  - Device Authorization Manager  │
                 │  - 3-Layer Context Memory        │
                 │  - AIVA Model Router             │
                 └────────────────┬─────────────────┘
                                  │
                          HTTPS / TLS
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
                  v                               v
     ┌─────────────────────────┐     ┌─────────────────────────┐
     │   WINDOWS DESKTOP APP   │     │   ANDROID MOBILE APP    │
     │      (AIVA.exe)         │     │       (AIVA App)        │
     │                         │     │                         │
     │ - Electron System Tray  │     │ - Native Foreground Svc │
     │ - Auto-start on boot    │     │ - Low-Power Wake Word   │
     │ - Local Qwen3 8B        │     │   ("AIVA" < 5MB RAM)    │
     │   (Ollama on RTX 3050)  │     │ - 4 Battery Modes       │
     │ - Fallback: OpenRouter  │     │ - Cloud API: Private    │
     │   or Gemini             │     │   AIVA Backend          │
     └─────────────────────────┘     └─────────────────────────┘
                  │                               │
                  └───────────────┬───────────────┘
                                  │
                                  v
                        AIVA AI Router
                  ┌───────────────┴───────────────┐
                  │                               │
                  v                               v
            OpenRouter (Qwen)             Google Gemini (Gemini)
```

---

## 2. Independent Operation Guarantee

| Scenario | Windows Desktop State | Android App State | Cloud Backend State | Behavior |
|---|---|---|---|---|
| **PC Powered OFF** | OFF | **Fully Functional** | Running on Render | Android talks directly to Private Cloud backend -> OpenRouter / Gemini. Zero dependence on PC. |
| **No Internet (Offline)** | **Functional (Local)** | **Wake-Word Active** | Offline | Desktop uses local Ollama Qwen3 8B. Mobile detects wake-word and responds with offline local capabilities. |
| **Ollama Stopped** | **Functional (Fallback)** | **Fully Functional** | Running on Render | Desktop falls back to OpenRouter or Gemini. Mobile continues using cloud providers. |
| **Cloud Deployed** | Independent | Independent | Independent | Cloud backend routes between OpenRouter and Gemini. |

---

## 3. Platform Breakdown

### Windows Desktop (`apps/desktop`)
- **Runtime:** Electron + React.
- **Background Persistence:** Close or minimize button hides the app to the Windows System Tray. Background listeners remain active.
- **Auto-Start:** Automatically registers with Windows startup via `app.setLoginItemSettings({ openAtLogin: true })`.
- **Inference Strategy:** `local-first` (attempts local Ollama `qwen3:8b` via RTX 3050; transparently falls back to online OpenRouter / Gemini).

### Android Mobile (`apps/mobile`)
- **Runtime:** React Native / Android Native Kotlin.
- **Wake Word Engine:** Native Android Foreground Service (`AivaWakeWordForegroundService`) using `AudioRecord` at 16kHz mono 16-bit PCM.
- **Two-Stage Wake Word Architecture:**
  - *Stage 1 (VAD / Energy Gate):* Filters out silence and background noise with zero extra CPU overhead.
  - *Stage 2 (Keyword Spotter):* Evaluates spectral matching for "AIVA" only when speech is detected.
- **Privacy Assurance:** Zero audio is streamed or recorded until the keyword "AIVA" is spotted.
- **Inference Strategy:** `cloud-first` via Private Cloud Backend -> OpenRouter / Gemini.

### Private Cloud Backend (`backend`)
- **Runtime:** NestJS (Node 20+).
- **Database:** Supabase PostgreSQL (User, Devices, Memory, Tasks, Notes, Audit Logs).
- **Cache & Rate Limiting:** Upstash Serverless Redis (TLS `rediss://`).
- **Orchestration:** `AIVAService` + `ModelRouterService` managing Local Ollama, Cloud OpenRouter, and Cloud Google Gemini.
