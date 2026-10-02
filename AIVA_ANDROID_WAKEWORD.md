# AIVA Android Low-Power Wake-Word Architecture

## 1. Principles
The AIVA mobile wake-word system is designed to provide responsive, always-ready voice interaction with minimum power and memory consumption.

**Strict Prohibitions Enforced:**
- No continuous Whisper/STT.
- No continuous LLM inference.
- No continuous cloud requests or polling loops.
- No raw microphone audio streamed while idle/waiting.
- No React Native JS timers polling the microphone.

---

## 2. Two-Stage Detection Pipeline

```
                       Microphone Audio (16kHz PCM)
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │             STAGE 1: VAD / ENERGY GATING                │
       │                                                         │
       │ - Real-time Root Mean Square (RMS) energy calculation   │
       │ - Below noise threshold (< 350 RMS)?                    │
       │   --> Discard frame immediately (CPU ~0%, RAM < 5MB)    │
       └────────────────────────────┬────────────────────────────┘
                                    │ Above noise threshold
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │            STAGE 2: LOCAL KEYWORD SPOTTER               │
       │                                                         │
       │ - Sliding window analysis on 500ms audio buffer         │
       │ - Zero-crossing rate & acoustic feature matching        │
       │   for phonemes in "A-I-V-A" (/ˈaɪ.və/)                  │
       │ - Confidence < 0.72? --> Return to idle                 │
       └────────────────────────────┬────────────────────────────┘
                                    │ "AIVA" Confirmed (>= 0.72)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │             STAGE 3: FULL VOICE PIPELINE                │
       │                                                         │
       │ - Activate full audio recorder for user command         │
       │ - Record until silence timeout / completion             │
       │ - Send command to Private AIVA Cloud Backend            │
       │ - Cloud AI Router (OpenRouter / Gemini) reasoning       │
       │ - TTS Voice response streamed back to speaker           │
       └─────────────────────────────────────────────────────────┘
```

---

## 3. Battery Modes

AIVA provides 4 battery profiles that dynamically scale based on battery status:

| Mode | Sensitivity | Duty Cycle | Battery Trigger | Behavior |
|---|---|---|---|---|
| **Performance** | 0.90 | 100% continuous | Charging / AC Power | Maximum wake responsiveness. |
| **Balanced** *(Default)* | 0.75 | Gated continuous | Battery > 30% | Stage 1 VAD gating. Optimal for daily use. |
| **Battery Saver** | 0.60 | Throttled buffer window | Battery 15% - 30% | Reduces frame evaluation frequency. |
| **Ultra Low Power** | 0.00 | Paused | Battery < 15% | Always-listening paused. Falls back to manual tap-to-talk. |

---

## 4. Android Native Service & Android 14+ Compliance

- **Service:** `AivaWakeWordForegroundService` extending Android `Service`.
- **Foreground Service Type:** `android:foregroundServiceType="microphone"` in `AndroidManifest.xml` (compliant with Android 14 requirements).
- **Persistent Notification:** Transparent, non-intrusive ongoing notification informing the user that AIVA is listening for the wake word.
- **Power Management:** Battery broadcast receiver (`ACTION_BATTERY_CHANGED`) automatically transitions modes without user intervention.

---

## 5. Mobile Battery Test Procedure

To verify performance on physical hardware:

1. **Test 1 (Idle Baseline):** App in background with wake-word active. Measure battery drop after 30 mins and 1 hour.
2. **Test 2 (Activation Latency):** Speak "AIVA" in quiet and noisy environments. Measure time to voice feedback beep (< 350ms target).
3. **Test 3 (False Positive Test):** Play 1 hour of television/podcast audio. Count unintentional wake triggers.
4. **Test 4 (Offline Check):** Turn off Wi-Fi and Mobile Data. Speak "AIVA". Confirm local notification/speech: *"You're offline. I can still handle local capabilities."*
