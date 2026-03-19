"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var VoicePipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoicePipelineService = void 0;
const common_1 = require("@nestjs/common");
const voice_config_1 = require("./voice-config");
const aiva_service_1 = require("../aiva.service");
let VoicePipelineService = VoicePipelineService_1 = class VoicePipelineService {
    aivaService;
    logger = new common_1.Logger(VoicePipelineService_1.name);
    sessions = new Map();
    followUpTimers = new Map();
    constructor(aivaService) {
        this.aivaService = aivaService;
        this.logger.log('Voice Pipeline Service initialized');
        this.logger.log(`Wake word: "${voice_config_1.VOICE_CONFIG.wakeWord}"`);
        this.logger.log(`STT model: ${voice_config_1.VOICE_CONFIG.sttModel} (${voice_config_1.VOICE_CONFIG.sttBackend})`);
        this.logger.log(`TTS model: ${voice_config_1.VOICE_CONFIG.ttsModel} (speaker: ${voice_config_1.VOICE_CONFIG.ttsSpeaker})`);
    }
    /**
     * Start a new voice session for a user
     */
    startSession(userId) {
        const sessionId = `voice_${userId}_${Date.now()}`;
        const session = {
            id: sessionId,
            userId,
            state: voice_config_1.VoiceState.IDLE,
            startedAt: new Date(),
            lastActivityAt: new Date(),
            transcriptions: [],
        };
        this.sessions.set(sessionId, session);
        this.logger.log(`Voice session started: ${sessionId} for user ${userId}`);
        return session;
    }
    /**
     * End a voice session
     */
    endSession(sessionId) {
        const timer = this.followUpTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.followUpTimers.delete(sessionId);
        }
        this.sessions.delete(sessionId);
        this.logger.log(`Voice session ended: ${sessionId}`);
    }
    /**
     * Get current session state
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Transition voice state with validation
     */
    transitionState(sessionId, newState) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.logger.warn(`Session not found: ${sessionId}`);
            return false;
        }
        const allowedTransitions = voice_config_1.VOICE_STATE_TRANSITIONS[session.state];
        if (!allowedTransitions.includes(newState)) {
            this.logger.warn(`Invalid state transition: ${session.state} → ${newState} (allowed: ${allowedTransitions.join(', ')})`);
            return false;
        }
        const oldState = session.state;
        session.state = newState;
        session.lastActivityAt = new Date();
        this.logger.debug(`State transition: ${oldState} → ${newState} (session: ${sessionId})`);
        return true;
    }
    /**
     * Handle wake word detection
     * Transitions: IDLE → LISTENING
     */
    onWakeWordDetected(sessionId) {
        const transitioned = this.transitionState(sessionId, voice_config_1.VoiceState.LISTENING);
        if (!transitioned) {
            return {
                type: 'error',
                data: { message: 'Cannot start listening — invalid state' },
                timestamp: new Date(),
            };
        }
        this.logger.log(`Wake word "${voice_config_1.VOICE_CONFIG.wakeWord}" detected (session: ${sessionId})`);
        return {
            type: 'wake_word',
            data: { wakeWord: voice_config_1.VOICE_CONFIG.wakeWord },
            timestamp: new Date(),
        };
    }
    /**
     * Handle incoming transcribed speech
     * Transitions: LISTENING → PROCESSING
     */
    async onSpeechTranscribed(sessionId, transcription) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                type: 'error',
                data: { message: 'Session not found' },
                timestamp: new Date(),
            };
        }
        // Store transcription
        session.transcriptions.push({
            text: transcription,
            timestamp: new Date(),
        });
        // Transition to PROCESSING
        const transitioned = this.transitionState(sessionId, voice_config_1.VoiceState.PROCESSING);
        if (!transitioned) {
            return {
                type: 'error',
                data: { message: 'Cannot process — invalid state' },
                timestamp: new Date(),
            };
        }
        this.logger.log(`Processing transcription: "${transcription.substring(0, 80)}..."`);
        try {
            // Send to AIVA core for processing
            const response = await this.aivaService.chat(session.userId, transcription, session.conversationId);
            // Store conversation ID for continuity
            session.conversationId = response.conversationId;
            // Transition to SPEAKING
            this.transitionState(sessionId, voice_config_1.VoiceState.SPEAKING);
            return {
                type: 'response',
                data: {
                    text: response.response,
                    conversationId: response.conversationId,
                    agentType: response.agentType,
                    toolCalls: response.toolCalls,
                },
                timestamp: new Date(),
            };
        }
        catch (error) {
            this.logger.error(`Processing failed: ${error}`);
            // Return to IDLE on error
            this.transitionState(sessionId, voice_config_1.VoiceState.IDLE);
            return {
                type: 'error',
                data: { message: 'Failed to process speech', error: String(error) },
                timestamp: new Date(),
            };
        }
    }
    /**
     * Handle TTS completion
     * Transitions: SPEAKING → IDLE or SPEAKING → LISTENING (follow-up)
     */
    onSpeechCompleted(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                type: 'error',
                data: { message: 'Session not found' },
                timestamp: new Date(),
            };
        }
        // Start follow-up window — stay in LISTENING for a few seconds
        this.transitionState(sessionId, voice_config_1.VoiceState.LISTENING);
        // Set timer to go back to IDLE if no follow-up
        const existingTimer = this.followUpTimers.get(sessionId);
        if (existingTimer)
            clearTimeout(existingTimer);
        const timer = setTimeout(() => {
            const currentSession = this.sessions.get(sessionId);
            if (currentSession && currentSession.state === voice_config_1.VoiceState.LISTENING) {
                this.transitionState(sessionId, voice_config_1.VoiceState.IDLE);
                this.logger.debug(`Follow-up window expired (session: ${sessionId})`);
            }
            this.followUpTimers.delete(sessionId);
        }, voice_config_1.VOICE_CONFIG.followUpWindowSeconds * 1000);
        this.followUpTimers.set(sessionId, timer);
        return {
            type: 'tts_end',
            data: { followUpWindowSeconds: voice_config_1.VOICE_CONFIG.followUpWindowSeconds },
            timestamp: new Date(),
        };
    }
    /**
     * Get all active voice sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.values());
    }
    /**
     * Get voice pipeline configuration (for clients)
     */
    getConfig() {
        return {
            wakeWord: voice_config_1.VOICE_CONFIG.wakeWord,
            sttModel: voice_config_1.VOICE_CONFIG.sttModel,
            ttsModel: voice_config_1.VOICE_CONFIG.ttsModel,
            ttsSpeaker: voice_config_1.VOICE_CONFIG.ttsSpeaker,
            sampleRate: voice_config_1.VOICE_CONFIG.sampleRate,
            silenceTimeoutMs: voice_config_1.VOICE_CONFIG.silenceTimeoutMs,
            followUpWindowSeconds: voice_config_1.VOICE_CONFIG.followUpWindowSeconds,
            maxRecordingDuration: voice_config_1.VOICE_CONFIG.maxRecordingDuration,
        };
    }
};
exports.VoicePipelineService = VoicePipelineService;
exports.VoicePipelineService = VoicePipelineService = VoicePipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aiva_service_1.AIVAService])
], VoicePipelineService);
//# sourceMappingURL=voice-pipeline.service.js.map