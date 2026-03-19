/**
 * Voice Pipeline Service
 *
 * Orchestrates the full voice interaction pipeline:
 *   Microphone → Wake Word → STT → LLM/Agent → TTS → Speaker
 *
 * This service manages:
 * - Voice state machine transitions
 * - Audio I/O coordination
 * - STT / TTS integration points
 * - Streaming response for low perceived latency
 */
import { VoiceState } from './voice-config';
import { AIVAService } from '../aiva.service';
export interface VoiceEvent {
    type: 'wake_word' | 'speech_start' | 'speech_end' | 'transcription' | 'response' | 'tts_start' | 'tts_end' | 'error';
    data?: unknown;
    timestamp: Date;
}
export interface VoiceSession {
    id: string;
    userId: string;
    state: VoiceState;
    startedAt: Date;
    lastActivityAt: Date;
    conversationId?: string;
    transcriptions: Array<{
        text: string;
        timestamp: Date;
    }>;
}
export declare class VoicePipelineService {
    private aivaService;
    private readonly logger;
    private sessions;
    private followUpTimers;
    constructor(aivaService: AIVAService);
    /**
     * Start a new voice session for a user
     */
    startSession(userId: string): VoiceSession;
    /**
     * End a voice session
     */
    endSession(sessionId: string): void;
    /**
     * Get current session state
     */
    getSession(sessionId: string): VoiceSession | undefined;
    /**
     * Transition voice state with validation
     */
    private transitionState;
    /**
     * Handle wake word detection
     * Transitions: IDLE → LISTENING
     */
    onWakeWordDetected(sessionId: string): VoiceEvent;
    /**
     * Handle incoming transcribed speech
     * Transitions: LISTENING → PROCESSING
     */
    onSpeechTranscribed(sessionId: string, transcription: string): Promise<VoiceEvent>;
    /**
     * Handle TTS completion
     * Transitions: SPEAKING → IDLE or SPEAKING → LISTENING (follow-up)
     */
    onSpeechCompleted(sessionId: string): VoiceEvent;
    /**
     * Get all active voice sessions
     */
    getActiveSessions(): VoiceSession[];
    /**
     * Get voice pipeline configuration (for clients)
     */
    getConfig(): {
        wakeWord: "AIVA";
        sttModel: "base.en";
        ttsModel: "tts_models/en/vctk/vits";
        ttsSpeaker: "p303";
        sampleRate: 16000;
        silenceTimeoutMs: 1500;
        followUpWindowSeconds: 5;
        maxRecordingDuration: 30;
    };
}
//# sourceMappingURL=voice-pipeline.service.d.ts.map