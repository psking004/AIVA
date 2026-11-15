# INFRASTRUCTURE REVALIDATION REPORT — AIVA 2.0 (V2 ACCEPTANCE)

## 1. Executive Summary
This document records the empirical live revalidation of all physical and virtual nodes composing the AIVA distributed fabric as part of the Deep Real-World Acceptance V2 mission.

Every node was probed and tested using actual live sockets, system commands, and hardware management protocols. No simulated endpoints were used.

---

## 2. Node Revalidation Matrix

| Node | Physical / Host Identity | IP / Interface | Target Port / Protocol | Empirical Status | Key Metrics |
|---|---|---|---|---|---|
| **PC-B (Primary Orchestration)** | `Cosmic_004` (Windows 11) | `10.16.177.59` (Localhost) | 5050 (Kokoro TTS), 11434 (Ollama) | **LIVE & OPERATIONAL** | 16.5 GB RAM, Intel Iris Xe, Kokoro up, Ollama `qwen3:4b` 5.76 tps |
| **PC-A (Compute Node)** | Desktop Compute Node | `10.16.177.194` | 5985 (WinRM WS-Man 3.0), 445 (SMB) | **REACHABLE & READY** | WS-Man protocol responding, SMB share port active, 460ms task dispatch |
| **iQOO Neo 10 (Physical Phone)** | `I2405` (Android 16, SDK 36) | `10BF6B1T1C001BS` (USB), `10.16.177.243:5555` (Wi-Fi) | ADB Daemon / Direct Protocol | **CONNECTED & VERIFIED** | Battery 100%, 70.3MB APK installed, PID verified, screen captured |
| **Render Cloud Backend** | `aiva-yitg.onrender.com` | Public HTTPS | 443 (REST/WSS) | **HEALTHY** | DB: 613ms, Cache: 23ms, Overall status: `healthy` |

---

## 3. Physical Android Device State
- **Device Model**: vivo / iQOO Neo 10 (`I2405`)
- **Android Version**: 16 (API Level 36)
- **Battery**: 100%
- **Connectivity**: Dual-Channel (USB + Wi-Fi ADB `5555`)
- **Installed Package**: `com.aiva.mobile` (`versionCode: 1`, `versionName: 1.0.0`)
- **Running Processes**:
  - Main app process: `com.aiva.mobile` (PID: `27262` initial, `27760` after relaunch)
  - Accessibility Service: `com.aiva.mobile/.services.AivaAccessibilityService` (Registered)

---

## 4. Local Service Daemons
- **Kokoro TTS Daemon**:
  - Bound to: `http://127.0.0.1:5050/health`
  - Health check: `{"status": "ready", "voices": 12, "backend": "onnx"}`
  - Latency: p50 = 2,296 ms, min = 1,827 ms.
- **Ollama Engine**:
  - Bound to: `http://127.0.0.1:11434/api/tags`
  - Models loaded: `qwen3:4b` (2.5 GB GGUF)
  - Performance: 64 tokens in 11.11s generation (5.76 tps).

---

## 5. Verification Conclusion
All 4 physical and distributed fabric tiers (PC-B, PC-A, iQOO Neo 10, Render Cloud) are online, interconnected, responsive, and empirically verified without stubs or mock environments.
