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
export declare const VOICE_CONFIG: {
    /** Wake word to activate AIVA */
    readonly wakeWord: "AIVA";
    /** Whisper model size for speech-to-text */
    readonly sttModel: "base.en";
    /** STT backend — faster-whisper for low-latency */
    readonly sttBackend: "faster-whisper";
    /** Coqui TTS model for voice synthesis */
    readonly ttsModel: "tts_models/en/vctk/vits";
    /** Female speaker ID from VCTK dataset */
    readonly ttsSpeaker: "p303";
    /** Audio sample rate in Hz */
    readonly sampleRate: 16000;
    /** Silence threshold for end-of-speech detection (ms) */
    readonly silenceTimeoutMs: 1500;
    /** Seconds to stay in LISTENING after response for follow-ups */
    readonly followUpWindowSeconds: 5;
    /** Audio chunk size for processing */
    readonly audioChunkSize: 4096;
    /** Maximum recording duration (seconds) */
    readonly maxRecordingDuration: 30;
    /** Minimum audio level to consider as speech */
    readonly speechThreshold: 0.01;
};
/**
 * Voice interaction states
 */
export declare enum VoiceState {
    /** Waiting for wake word */
    IDLE = "IDLE",
    /** Wake word detected, recording user speech */
    LISTENING = "LISTENING",
    /** Speech recognized, LLM generating response */
    PROCESSING = "PROCESSING",
    /** TTS playing response through speaker */
    SPEAKING = "SPEAKING"
}
/**
 * Voice state transition rules
 *
 * IDLE → LISTENING (wake word detected)
 * LISTENING → PROCESSING (speech recognized, silence timeout hit)
 * PROCESSING → SPEAKING (LLM response ready, TTS begins)
 * SPEAKING → IDLE (response fully played)
 * SPEAKING → LISTENING (follow-up detected within window)
 */
export declare const VOICE_STATE_TRANSITIONS: Record<VoiceState, VoiceState[]>;
export type VoiceConfigType = typeof VOICE_CONFIG;
//# sourceMappingURL=voice-config.d.ts.map