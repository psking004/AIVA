# AIVA Wake-Word & Application Lifecycle Specification & Audit

## 1. Executive Summary

Saying the wake word previously failed to reliably bring AIVA into its active state due to three compounding root causes:
1. **Case-Sensitivity Mismatch in Wake Validation Gate**: `apps/desktop/wake-gate.js` used a case-sensitive `Set(['AIVA', 'Hey AIVA'])` and `evaluateWakeWord()` checked `text.toUpperCase() === 'AIVA'`, rejecting variations like `"Hey Aiva"`, `"hey aiva"`, and `"hey iva"` emitted by speech engines.
2. **Microphone Device Contention from Orphaned Whisper & Speech Processes**: Lacking single-instance locking in Electron, multiple `AIVA.exe` processes spawned duplicate `speech-listener.ps1` and `whisper-service.py` background processes that competed for the Windows default microphone, starving the capture stream.
3. **Improper Activation Method on Hidden Windows**: `setAssistantState('MATERIALIZING')` called `mainWindow.showInactive()`, which failed to focus or restore minimized/hidden transparent overlay windows on Windows 11.

---

## 2. Architectural Corrections Implemented

### 2.1 Single-Instance Enforcement (`apps/desktop/main.js`)
- Enforced `app.requestSingleInstanceLock()`.
- If a secondary instance is launched (e.g., from Windows startup, user click, or automation script), it logs and exits immediately (`process.exit(0)`).
- The primary instance captures the `second-instance` event:
  - Restores the existing window if minimized (`mainWindow.restore()`).
  - Unhides the existing window (`mainWindow.show()`).
  - Focuses the existing window (`mainWindow.focus()`).
  - Transitions the authoritative avatar directly into `MATERIALIZING -> LISTENING`.

### 2.2 Case-Insensitive Phonetic Wake Validation (`apps/desktop/wake-gate.js`)
- Normalized incoming candidate text to uppercase alphanumeric.
- Added support for all natural casing variants: `"AIVA"`, `"HEY AIVA"`, `"Aiva"`, `"Hey Aiva"`, and phonetic approximations `"IVA"`, `"HEY IVA"`.
- Validated with unit tests in `scripts/test_desktop_lifecycle.js` with 100% acceptance across all casing variations.

### 2.3 Resilient Speech Recognition Grammar (`apps/desktop/speech-listener.ps1`)
- Updated `System.Speech.Recognition.Choices` grammar to include:
  `@("AIVA", "Hey AIVA", "Aiva", "Hey Aiva", "Iva", "Hey Iva")`.
- Verified real-time candidate emission latency: **30 ms** (far exceeding the <180 ms target).

### 2.4 Orphaned Process Cleanup & Singular Mic Ownership
- Added `killOrphanedWhisperProcesses()` alongside `killOrphanedSpeechListeners()` before spawning new daemon children.
- Ensured PortAudio and WASAPI input streams are owned by exactly one process at any time.

---

## 3. Verification Evidence

```
> powershell -NoProfile -ExecutionPolicy Bypass -File apps\desktop\speech-listener.ps1 -TestMic
{"confidence":1,"confirmedMs":1794755369416,"text":"Aiva","audioDetectedMs":1794755369386,"type":"candidate","isRejected":false,"isFinal":true}
{"confidence":1,"keyword":"AIVA","type":"wake","threshold":0.75,"latencyMs":30,"status":"CONFIRMED"}
[WAKE WORD HARNESS] Mic check: OK | Wake test: PASS ('AIVA') | Latency: 30ms (Target: < 180 ms)
```

