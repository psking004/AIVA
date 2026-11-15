# AIVA Production Deployment Report

**Report Date:** 2026-11-15T19:23:00+05:30  
**Repository Revision:** `origin/main`  
**Deployment State:** Verified Active  
**System Architecture:** Sovereign Tri-Node Fabric

---

## 1. Node Deployment Matrix

| Node Identifier | Role | Physical Hardware | Network Endpoint | Primary Application Binary | Status |
|---|---|---|---|---|---|
| **PC-B** | Host Orchestrator & Voice Engine | Intel/AMD Windows 11 Workstation | `10.16.177.59:5050` / `127.0.0.1:5050` | `C:\Users\bhara\AppData\Local\Programs\AIVA\AIVA.exe` & `kokoro-service.py` | **ACTIVE** |
| **PC-A** | Dedicated Compute Node | Windows 11 GPU Rig | `10.16.177.194:5985` (WinRM) / `11434` (Ollama) | `AIVANativeApp` / Ollama GPU Service | **ACTIVE (Standby)** |
| **Mobile** | Handheld Voice & Sensor Node | iQOO Neo 10 (Android 15) | `10BF6B1T1C001BS` (USB) / `10.16.177.243:5555` (Wi-Fi) | `com.aiva.personal.ai` (`app-release.apk`) | **ACTIVE** |
| **Cloud Anchor** | Remote Fallback & Keep-Warm | Render Managed Cloud | `https://aiva-yitg.onrender.com` | Next.js Cloud API + Upstash Cache | **ONLINE** |

---

## 2. Artifacts & Binaries Built

### Mobile Android APK
- **Source Directory:** `apps/mobile/android`
- **Build Output:** `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- **Gradle Tasks Executed:** 505 tasks executed, 0 failures.
- **Package Name:** `com.aiva.personal.ai`
- **Key Modules Included:**
  - `AivaVoiceModule` with non-exclusive transient audio ducking (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`).
  - `AivaAccessibilityService` with multi-subnet probe loop (`10.16.177.59`, `10.84.73.59`, `192.168.1.59`).
  - `AivaWakeWordForegroundService` with dynamic battery optimization exemptions.
- **Installed Version:** Flashed and verified active via `adb install -r`.

### PC-B Desktop Native Application
- **Executable Path:** `C:\Users\bhara\AppData\Local\Programs\AIVA\AIVA.exe`
- **Development Worktree:** `apps/desktop`
- **Execution Mode:** Native desktop window (Chromium browser tabs and URL bars prohibited).
- **Daemon Process:** `kokoro-service.py` running on port `5050` via Python 3.12:
  - ONNX Runtime Kokoro TTS model loaded.
  - Render keep-warm daemon thread active (12-minute cadence).
  - SSE dynamic planner enabled.
  - Desktop ReAct automation endpoints active (`CREATE_FILE`, `TYPE_TEXT`, `MODIFY_FILE`, `READ_FILE`, `EXECUTE_SHELL`, `INSTALL_APP`).

### AI Model Inventory
- **PC-B Disk Models:**
  - `qwen3:4b` (2.5 GB) - Fast Chat
  - `qwen:7b` (4.4 GB) - General Reasoning
  - `llama3:latest` (4.7 GB) - Tool Use & Analysis
  - `qwen3:8b` (5.2 GB) - Coding & Complex Reasoning
  - `qwen3.5:latest` (5.2 GB) - Multimodal / Context
- **Cloud Providers:**
  - OpenRouter (`qwen/qwen-2.5-72b-instruct`) - Latency ~21ms
  - Gemini Flash Lite (`gemini-flash-lite-latest`) - Latency ~113ms

### Voice Reference Assets
- **Location:** `apps/desktop/voices/`
- **Source Reference Files:**
  - `ref_english.mp3` (44.1 kHz mono, 32.64s)
  - `ref_tamil.mp3` (44.1 kHz mono, 25.60s)
  - `ref_tanglish.mp3` (44.1 kHz mono, 24.48s)
- **Fused High-Resolution Reference:** `aiva_fused_reference_24k.wav` (24,000 Hz, 82.72s, 3.8 MB)
- **Extracted Feature Vector:** `aiva_voice_vector.npz` (Mel-filterbank, pitch contour, spectral centroid)

---

## 3. Deployment Verification Summary

1. **Zero Browser Invocations:** Pure native execution verified across all three nodes. No calls to `msedge.exe`, `chrome.exe`, or raw browser URLs for user interfaces.
2. **Audio Focus Isolation:** YouTube, Spotify, and phone calls remain uninterrupted during wake-word detection and passive listening.
3. **Multi-Subnet Resiliency:** Nodes seamlessly discovered each other when moving from historical `10.84.73.x` to the active `10.16.177.x` subnet.
4. **Autonomous Harness:** Full test harness verified 8/8 stages passing with zero human intervention.

