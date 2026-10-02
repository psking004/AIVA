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

export const VOICE_CONFIG = {
  /** Wake word to activate AIVA */
  wakeWord: 'AIVA',

  /** Whisper model size for speech-to-text */
  sttModel: 'base.en',

  /** STT backend — faster-whisper for low-latency */
  sttBackend: 'faster-whisper' as const,

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
} as const;

/**
 * Voice interaction states
 */
export enum VoiceState {
  /** Waiting for wake word */
  IDLE = 'IDLE',

  /** Wake word detected, recording user speech */
  LISTENING = 'LISTENING',

  /** Speech recognized, LLM generating response */
  PROCESSING = 'PROCESSING',

  /** TTS playing response through speaker */
  SPEAKING = 'SPEAKING',
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
export const VOICE_STATE_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  [VoiceState.IDLE]: [VoiceState.LISTENING],
  [VoiceState.LISTENING]: [VoiceState.PROCESSING, VoiceState.IDLE],
  [VoiceState.PROCESSING]: [VoiceState.SPEAKING, VoiceState.IDLE],
  [VoiceState.SPEAKING]: [VoiceState.IDLE, VoiceState.LISTENING],
};

export type VoiceConfigType = typeof VOICE_CONFIG;
