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

import { Injectable, Logger } from '@nestjs/common';
import { VOICE_CONFIG, VoiceState, VOICE_STATE_TRANSITIONS } from './voice-config';
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
  transcriptions: Array<{ text: string; timestamp: Date }>;
}

@Injectable()
export class VoicePipelineService {
  private readonly logger = new Logger(VoicePipelineService.name);
  private sessions: Map<string, VoiceSession> = new Map();
  private followUpTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private aivaService: AIVAService,
  ) {
    this.logger.log('Voice Pipeline Service initialized');
    this.logger.log(`Wake word: "${VOICE_CONFIG.wakeWord}"`);
    this.logger.log(`STT model: ${VOICE_CONFIG.sttModel} (${VOICE_CONFIG.sttBackend})`);
    this.logger.log(`TTS model: ${VOICE_CONFIG.ttsModel} (speaker: ${VOICE_CONFIG.ttsSpeaker})`);
  }

  /**
   * Start a new voice session for a user
   */
  startSession(userId: string): VoiceSession {
    const sessionId = `voice_${userId}_${Date.now()}`;
    const session: VoiceSession = {
      id: sessionId,
      userId,
      state: VoiceState.IDLE,
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
  endSession(sessionId: string): void {
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
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Transition voice state with validation
   */
  private transitionState(sessionId: string, newState: VoiceState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session not found: ${sessionId}`);
      return false;
    }

    const allowedTransitions = VOICE_STATE_TRANSITIONS[session.state];
    if (!allowedTransitions.includes(newState)) {
      this.logger.warn(
        `Invalid state transition: ${session.state} → ${newState} (allowed: ${allowedTransitions.join(', ')})`,
      );
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
  onWakeWordDetected(sessionId: string): VoiceEvent {
    const transitioned = this.transitionState(sessionId, VoiceState.LISTENING);

    if (!transitioned) {
      return {
        type: 'error',
        data: { message: 'Cannot start listening — invalid state' },
        timestamp: new Date(),
      };
    }

    this.logger.log(`Wake word "${VOICE_CONFIG.wakeWord}" detected (session: ${sessionId})`);

    return {
      type: 'wake_word',
      data: { wakeWord: VOICE_CONFIG.wakeWord },
      timestamp: new Date(),
    };
  }

  /**
   * Handle incoming transcribed speech
   * Transitions: LISTENING → PROCESSING
   */
  async onSpeechTranscribed(
    sessionId: string,
    transcription: string,
  ): Promise<VoiceEvent> {
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
    const transitioned = this.transitionState(sessionId, VoiceState.PROCESSING);
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
      const response = await this.aivaService.chat(
        session.userId,
        transcription,
        session.conversationId,
      );

      // Store conversation ID for continuity
      session.conversationId = response.conversationId;

      // Transition to SPEAKING
      this.transitionState(sessionId, VoiceState.SPEAKING);

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
    } catch (error) {
      this.logger.error(`Processing failed: ${error}`);

      // Return to IDLE on error
      this.transitionState(sessionId, VoiceState.IDLE);

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
  onSpeechCompleted(sessionId: string): VoiceEvent {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        type: 'error',
        data: { message: 'Session not found' },
        timestamp: new Date(),
      };
    }

    // Start follow-up window — stay in LISTENING for a few seconds
    this.transitionState(sessionId, VoiceState.LISTENING);

    // Set timer to go back to IDLE if no follow-up
    const existingTimer = this.followUpTimers.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      const currentSession = this.sessions.get(sessionId);
      if (currentSession && currentSession.state === VoiceState.LISTENING) {
        this.transitionState(sessionId, VoiceState.IDLE);
        this.logger.debug(`Follow-up window expired (session: ${sessionId})`);
      }
      this.followUpTimers.delete(sessionId);
    }, VOICE_CONFIG.followUpWindowSeconds * 1000);

    this.followUpTimers.set(sessionId, timer);

    return {
      type: 'tts_end',
      data: { followUpWindowSeconds: VOICE_CONFIG.followUpWindowSeconds },
      timestamp: new Date(),
    };
  }

  /**
   * Get all active voice sessions
   */
  getActiveSessions(): VoiceSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get voice pipeline configuration (for clients)
   */
  getConfig() {
    return {
      wakeWord: VOICE_CONFIG.wakeWord,
      sttModel: VOICE_CONFIG.sttModel,
      ttsModel: VOICE_CONFIG.ttsModel,
      ttsSpeaker: VOICE_CONFIG.ttsSpeaker,
      sampleRate: VOICE_CONFIG.sampleRate,
      silenceTimeoutMs: VOICE_CONFIG.silenceTimeoutMs,
      followUpWindowSeconds: VOICE_CONFIG.followUpWindowSeconds,
      maxRecordingDuration: VOICE_CONFIG.maxRecordingDuration,
    };
  }
}
