# AIVA Natural Voice Engineering Specification

**Document Date:** 2026-11-15T19:09:45+05:30  
**Engine:** Kokoro-82M ONNX + Clean-Room Multi-Lingual Style Vector  

---

## 1. Desired Vocal Identity & Personality

AIVA's voice identity is calibrated to sound:
- Naturally warm, composed, and encouraging.
- Grounded and clear in English with natural conversational inflection.
- Capable of fluid Tamil and Tanglish articulation without synthetic pronunciation distortion.
- Paced comfortably at $1.04\times$ to $1.05\times$ speed to sound alert and modern without sounding rushed.
- Tuned with a foundational pitch of $0.98\text{f}$ on mobile and grounded formants on desktop.

---

## 2. Reference Audio Ingestion & Physical Measurements

The three reference recordings located in [`apps/desktop/voices/raw_refs/`](file:///C:/Users/bhara/AIVA/apps/desktop/voices/raw_refs/):

| Reference File | Measured Sample Rate | Duration | Peak Amplitude | Dynamic Range | Perceived Acoustic Personality |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `ref_english.mp3` | 44,100 Hz | 32.64s | 0.653 | High | Calm, articulate, clear cadence, thoughtful pauses |
| `ref_tamil.mp3` | 44,100 Hz | 25.60s | 0.677 | High | Fluid Tamil phonemes, native Tamil Nadu intonation |
| `ref_tanglish.mp3` | 44,100 Hz | 24.48s | 0.678 | High | Natural conversational Tanglish, bilingual transitions |

---

## 3. Resampling & Processing Pipeline ([`scripts/extract_voice_embedding.py`](file:///C:/Users/bhara/AIVA/scripts/extract_voice_embedding.py))

1. **Mono Normalization:** Audio tracks are verified mono or downmixed.
2. **Silence Trimming:** Leading and trailing non-speech artifacts ($< 0.01\text{ RMS}$) are stripped.
3. **True Resampling:** Linear interpolation audio resampling converts 44.1 kHz sources cleanly to the native 24 kHz Kokoro input specification.
4. **Loudness Normalization:** Normalizes signals to $-20\text{ dBFS}$ with safe headroom ($\text{RMS} = 0.10$).
5. **Acoustic Profiling:** Extracts spectral density contours across a 1024-sample FFT window with 256-sample hops.
6. **Output Vectors:**
   - Vector: `apps/desktop/voices/aiva_voice_vector.npz`
   - Master Wave: `apps/desktop/voices/aiva_fused_reference_24k.wav`

---

## 4. Full-Duplex Dialogue & Barge-In Safeguards

- **Language-Gated Cold Start:**
  - `userSpokeTamil = false`: Cold-boot sessions output 100% English wake greetings.
  - `userSpokeTamil = true`: Transcribed Tamil script (`[\u0B80-\u0BFF]`) or Tanglish tokens (`pannu`, `panlam`, `sollu`, `vaanga`, etc.) unlock Tamil/Tanglish greetings.
- **Phonetic Normalization:** All spoken text normalizes `"AIVA"` $\rightarrow$ `"Eyva"`, strips Markdown syntax (`*#_```), and expands abbreviations.
- **Barge-In Interruption:** Touching the holographic interface or speaking while `voiceState === 'SPEAKING'` executes an immediate `stopSpeaking()` halt and re-opens the listening stream.
- **12-Second Follow-Up Listening:** After speech completes, the microphone remains armed in follow-up mode for continuous, hands-free dialogue.

