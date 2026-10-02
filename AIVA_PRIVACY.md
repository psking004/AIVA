# AIVA Privacy Policy & Data Guarantees

## 1. Zero Pre-Wake Audio Transmission
- While waiting for the keyword "AIVA", all audio processing happens **strictly on-device in temporary circular memory buffers**.
- No audio frames, acoustic features, or telemetry are ever transmitted to any cloud server during passive listening.
- Audio is only recorded and processed for intent understanding **after** the keyword "AIVA" has been positively identified on the device.

---

## 2. On-Device vs Cloud Processing Boundary

| Data Type | Desktop Behavior | Android Mobile Behavior |
|---|---|---|
| **Passive Microphone Stream** | On-device memory only (Discarded instantly) | On-device memory only (Discarded instantly) |
| **Wake-Word Spotting** | Local inference | Local native Stage 1/Stage 2 pipeline |
| **Active Voice Command** | Local Whisper / STT | Cloud STT over TLS to Private Cloud |
| **LLM Inference** | Local Qwen3 8B (RTX 3050) / OpenRouter & Gemini fallback | Cloud OpenRouter Qwen / Gemini via Private Cloud |
| **Context Memory** | Local / Supabase PostgreSQL | Supabase PostgreSQL |

---

## 3. Logging Hygiene
- Sensitive authentication credentials (passwords, JWTs, refresh tokens) are never written to logs.
- AI vendor keys are strictly excluded from all client-facing bundles, API responses, and logs.
- Audit logs only store operation names and non-sensitive resource IDs.
