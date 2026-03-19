"use strict";
/**
 * Voice Configuration - AIVA Female Voice System
 *
 * Pipeline: Microphone → Wake Word (Porcupine) → STT (Whisper) → LLM → TTS (Coqui) → Speaker
 *
 * Latency targets:
 *   Wake word < 200ms
 *   STT < 1s
 *   LLM < 2s
 *   TTS < 500ms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_STATE_TRANSITIONS = exports.VoiceState = exports.VOICE_CONFIG = void 0;
exports.VOICE_CONFIG = {
    /** Wake word to activate AIVA */
    wakeWord: 'AIVA',
    /** Whisper model size for speech-to-text */
    sttModel: 'base.en',
    /** STT backend — faster-whisper for low-latency */
    sttBackend: 'faster-whisper',
    /** Coqui TTS model for voice synthesis */
    ttsModel: 'tts_models/en/vctk/vits',
    /** Female speaker ID from VCTK dataset */
    ttsSpeaker: 'p303',
    /** Audio sample rate in Hz */
    sampleRate: 16000,
    /** Silence threshold for end-of-speech detection (ms) */
    silenceTimeoutMs: 1500,
    /** Seconds to stay in LISTENING after response for follow-ups */
    followUpWindowSeconds: 5,
    /** Audio chunk size for processing */
    audioChunkSize: 4096,
    /** Maximum recording duration (seconds) */
    maxRecordingDuration: 30,
    /** Minimum audio level to consider as speech */
    speechThreshold: 0.01,
};
/**
 * Voice interaction states
 */
var VoiceState;
(function (VoiceState) {
    /** Waiting for wake word */
    VoiceState["IDLE"] = "IDLE";
    /** Wake word detected, recording user speech */
    VoiceState["LISTENING"] = "LISTENING";
    /** Speech recognized, LLM generating response */
    VoiceState["PROCESSING"] = "PROCESSING";
    /** TTS playing response through speaker */
    VoiceState["SPEAKING"] = "SPEAKING";
})(VoiceState || (exports.VoiceState = VoiceState = {}));
/**
 * Voice state transition rules
 *
 * IDLE → LISTENING (wake word detected)
 * LISTENING → PROCESSING (speech recognized, silence timeout hit)
 * PROCESSING → SPEAKING (LLM response ready, TTS begins)
 * SPEAKING → IDLE (response fully played)
 * SPEAKING → LISTENING (follow-up detected within window)
 */
exports.VOICE_STATE_TRANSITIONS = {
    [VoiceState.IDLE]: [VoiceState.LISTENING],
    [VoiceState.LISTENING]: [VoiceState.PROCESSING, VoiceState.IDLE],
    [VoiceState.PROCESSING]: [VoiceState.SPEAKING, VoiceState.IDLE],
    [VoiceState.SPEAKING]: [VoiceState.IDLE, VoiceState.LISTENING],
};
//# sourceMappingURL=voice-config.js.map