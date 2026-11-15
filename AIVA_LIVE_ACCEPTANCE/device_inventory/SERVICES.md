# Device Inventory: Live Services & Network Topology

**Audit Date:** 2026-11-15  
**Local Time:** 21:08 IST  

---

## 1. Local Services on PC-B (`10.16.177.59`)
* **Kokoro TTS Service:**
  * Endpoint: `http://127.0.0.1:5050/health`
  * Status: Online (`kokoro-v0_19`, voice model: `voices.bin`, default voice: `af_bella`)
  * Daemon PID: Background task `task-12475`
* **Local Ollama Inference Engine:**
  * Endpoint: `http://127.0.0.1:11434/api/tags`
  * Status: Online (7 local GGUF models available: `qwen3:4b`, `qwen:7b`, `llama3:latest`, `qwen3:8b`, `glm-5:cloud`, `qwen3.5:latest`, `sorc/qwen3.5-claude-4.6-opus-q4:latest`)
* **AIVA Single-Instance Electron HUD:**
  * Lock: Enforced via `app.requestSingleInstanceLock()`
  * Window: HUD transparent overlay on primary display

---

## 2. Remote Services on PC-A (`10.16.177.194`)
* **WinRM (Port 5985):** Online and validated via WS-Management protocol v3.0
* **SMB (Port 445):** Port open for network file transfer

---

## 3. Remote Cloud Service (Render)
* **Endpoint:** `https://aiva-yitg.onrender.com/health`
* **Status:** `{"status":"healthy","version":"0464d08fd2642e24b377aa016184a5a218d67f14","services":{"database":{"status":"up","latency":613},"cache":{"status":"up","latency":23}}}`
* **Role:** Keep-warm ingress, cloud fallback

---

## 4. Mobile Services (iQOO Neo 10)
* **ADB USB Bridge:** `10BF6B1T1C001BS` (Authorized, Device mode)
* **ADB Wi-Fi Bridge:** `10.16.177.243:5555` (Authorized, Device mode)
* **AIVA App Package:** `com.aiva.personal.ai`
