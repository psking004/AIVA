/**
 * AIVA Mobile Voice Service
 *
 * Full Android Voice Pipeline:
 * Microphone → Speech Recognition (STT) → AIVA Cloud Brain → TTS Audio Playback → Speaker
 *
 * Voice States:
 * IDLE → LISTENING → PROCESSING → SPEAKING → INTERRUPTED → ERROR
 *
 * Barge-In:
 * Interruption detected while AIVA speaks immediately halts playback and begins capturing user speech.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AivaVoiceModule } = NativeModules;
const voiceEmitter = AivaVoiceModule ? new NativeEventEmitter(AivaVoiceModule) : null;

export type VoiceState =
  | 'DORMANT'
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR';

export interface VoiceError {
  code: number | string;
  message: string;
}

class AivaVoiceService {
  private currentState: VoiceState = 'IDLE';
  private currentUtteranceId: string | null = null;
  private stateListeners: Array<(state: VoiceState) => void> = [];
  private textListeners: Array<(text: string, isFinal: boolean) => void> = [];
  private audioLevelListeners: Array<(level: number) => void> = [];
  private errorListeners: Array<(error: VoiceError) => void> = [];
  private ttsResolve: (() => void) | null = null;
  private ttsReject: ((err: any) => void) | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private errorRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private listenersAttached: boolean = false;

  constructor() {
    this.initNativeListeners();
  }

  private initNativeListeners() {
    if (this.listenersAttached || Platform.OS !== 'android' || !voiceEmitter) return;
    this.listenersAttached = true;

    voiceEmitter.addListener('onSpeechReady', () => {
      console.log('[EVIDENCE-2] Listening begins: SpeechRecognizer is ready for speech');
      this.setState('LISTENING');
    });

    voiceEmitter.addListener('onSpeechStart', () => {
      console.log('[EVIDENCE-3] Android recognition receives speech: speech stream active');
      this.setState('LISTENING');
    });

    voiceEmitter.addListener('onSpeechRms', (data: { audioLevel: number }) => {
      const level = data?.audioLevel ?? 0;
      this.audioLevelListeners.forEach((l) => l(level));
    });

    // Handle partial results from both singular and plural event signatures
    const handlePartial = (data: { text?: string; value?: string[] }) => {
      const transcript = data?.text || data?.value?.[0] || '';
      if (transcript) {
        console.log('[AIVA Voice] Partial transcript:', transcript);
        this.textListeners.forEach((l) => l(transcript, false));
      }
    };
    voiceEmitter.addListener('onSpeechPartialResult', handlePartial);
    voiceEmitter.addListener('onSpeechPartialResults', handlePartial);

    // Handle final results from both singular and plural event signatures with deduplication
    let lastFinalTranscript = '';
    let lastFinalTime = 0;
    const handleFinal = (data: { text?: string; value?: string[]; isFinal?: boolean }) => {
      const transcript = (data?.text || data?.value?.[0] || '').trim();
      const now = Date.now();
      if (transcript) {
        if (transcript === lastFinalTranscript && now - lastFinalTime < 800) {
          return; // Deduplicate duplicate plural/singular event receipt
        }
        lastFinalTranscript = transcript;
        lastFinalTime = now;
        console.log('[EVIDENCE-4] Final STT transcript produced:', transcript);
        this.textListeners.forEach((l) => l(transcript, true));
      }
    };
    voiceEmitter.addListener('onSpeechResult', handleFinal);
    voiceEmitter.addListener('onSpeechResults', handleFinal);

    voiceEmitter.addListener('onSpeechEnd', () => {
      console.log('[AIVA Voice] onSpeechEnd received');
      if (this.currentState === 'LISTENING') {
        this.setState('PROCESSING');
      }
    });

    voiceEmitter.addListener('onSpeechError', (data: { errorCode: number; errorMessage: string }) => {
      const code = data?.errorCode;
      console.warn('[AIVA Voice] onSpeechError received:', data?.errorMessage, `(code: ${code})`);

      // Code 7 (ERROR_NO_MATCH / silence) and Code 8 (ERROR_RECOGNIZER_BUSY):
      // Cleanly reset to IDLE without treating as fatal error
      if (code === 7 || code === 8) {
        console.log(`[AIVA Voice] Code ${code} (No match / silence / busy). Resetting to IDLE cleanly.`);
        this.setState('IDLE');
        return;
      }

      const err: VoiceError = {
        code: code ?? -1,
        message: data?.errorMessage || 'Speech recognition error',
      };
      this.setState('ERROR');
      this.errorListeners.forEach((l) => l(err));

      // Auto-recover from ERROR back to IDLE after 1200ms so consecutive turns are unblocked
      this.scheduleErrorRecovery(1200);
    });

    voiceEmitter.addListener('onTtsStart', () => {
      console.log('[EVIDENCE-8] Android TTS starts speaking response');
      this.setState('SPEAKING');
    });

    voiceEmitter.addListener('onTtsDone', () => {
      console.log('[EVIDENCE-9] TTS finishes successfully with acoustic settling delay');
      this.setState('IDLE');
      console.log('[EVIDENCE-10] Voice state returns to IDLE');
      if (this.ttsResolve) {
        this.ttsResolve();
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });

    voiceEmitter.addListener('onTtsError', (data: any) => {
      console.warn('[AIVA Voice] onTtsError received:', data);
      this.setState('ERROR');
      if (this.ttsReject) {
        this.ttsReject(new Error(data?.error || 'TTS Error'));
        this.ttsResolve = null;
        this.ttsReject = null;
      }
      this.scheduleErrorRecovery(1200);
    });

    voiceEmitter.addListener('onInterrupted', () => {
      console.log('[AIVA Voice] onInterrupted received');
      this.setState('INTERRUPTED');
      if (this.ttsResolve) {
        this.ttsResolve();
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });

    voiceEmitter.addListener('onTtsInterrupted', () => {
      console.log('[AIVA Voice] onTtsInterrupted received');
      this.setState('INTERRUPTED');
      if (this.ttsResolve) {
        this.ttsResolve();
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });
  }

  private scheduleErrorRecovery(delayMs: number = 1200) {
    if (this.errorRecoveryTimer) clearTimeout(this.errorRecoveryTimer);
    this.errorRecoveryTimer = setTimeout(() => {
      if (this.currentState === 'ERROR') {
        console.log('[AIVA Voice] Auto-recovering state from ERROR to IDLE');
        this.setState('IDLE');
      }
    }, delayMs);
  }

  private armWatchdog(timeoutMs: number = 8000) {
    this.disarmWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (this.currentState === 'PROCESSING' || this.currentState === 'SPEAKING') {
        console.warn(`[AIVA Voice Watchdog] State '${this.currentState}' exceeded ${timeoutMs}ms without completion; force-resetting to IDLE.`);
        if (this.ttsResolve) {
          this.ttsResolve();
          this.ttsResolve = null;
          this.ttsReject = null;
        }
        this.setState('IDLE');
      }
    }, timeoutMs);
  }

  private disarmWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  setState(state: VoiceState) {
    if (state === this.currentState) return;
    console.log(`[AIVA Voice State] ${this.currentState} -> ${state}`);
    this.currentState = state;

    if (state === 'PROCESSING' || state === 'SPEAKING') {
      this.armWatchdog(8000);
    } else {
      this.disarmWatchdog();
    }

    this.stateListeners.forEach((l) => l(state));
  }

  getState(): VoiceState {
    return this.currentState;
  }

  async startListening(language: string = 'en-US'): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule) {
      try {
        this.setState('LISTENING');
        await AivaVoiceModule.startListening(language);
        return true;
      } catch (err: any) {
        this.setState('ERROR');
        this.errorListeners.forEach((l) =>
          l({ code: 'START_ERROR', message: err?.message || 'Could not start microphone STT' })
        );
        this.scheduleErrorRecovery(1200);
        return false;
      }
    }
    return false;
  }

  async stopListening(): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule) {
      try {
        await AivaVoiceModule.stopListening();
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  async cancelListening(): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule) {
      try {
        await AivaVoiceModule.cancelListening();
        this.setState('IDLE');
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  /**
   * Speak text aloud through device speaker using native TTS with bounded safety timeout
   */
  speak(text: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const clean = text?.trim();
      if (!clean) {
        resolve();
        return;
      }

      if (Platform.OS === 'android' && AivaVoiceModule) {
        this.currentUtteranceId = `utt_${Date.now()}`;
        this.ttsResolve = resolve;
        this.ttsReject = reject;
        this.setState('SPEAKING');

        // Bounded 15s max safety timer on TTS resolution
        const safetyTimer = setTimeout(() => {
          if (this.ttsResolve === resolve) {
            console.warn('[AIVA Voice] Speak safety timeout triggered after 15s');
            this.ttsResolve = null;
            this.ttsReject = null;
            this.setState('IDLE');
            resolve();
          }
        }, 15000);

        try {
          await AivaVoiceModule.speak(clean, this.currentUtteranceId);
        } catch (err) {
          clearTimeout(safetyTimer);
          this.setState('ERROR');
          this.ttsResolve = null;
          this.ttsReject = null;
          this.scheduleErrorRecovery(1200);
          reject(err);
        }
      } else {
        resolve();
      }
    });
  }

  /**
   * Immediately cancel any active speech playback (Barge-In)
   */
  async stopSpeaking(): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule) {
      try {
        await AivaVoiceModule.stopSpeaking();
        this.setState('INTERRUPTED');
        if (this.ttsResolve) {
          this.ttsResolve();
          this.ttsResolve = null;
          this.ttsReject = null;
        }
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  /**
   * Interrupt active speech and immediately begin listening to user's response
   */
  async bargeIn(): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule) {
      try {
        this.setState('INTERRUPTED');
        await AivaVoiceModule.bargeIn();
        this.setState('LISTENING');
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  subscribe(listener: (state: VoiceState, event?: { type: string; text?: string }) => void) {
    const unsubState = this.subscribeState((state) => listener(state));
    const unsubText = this.subscribeText((text, isFinal) => {
      if (isFinal) {
        listener(this.currentState, { type: 'RESULT', text });
      }
    });
    return () => {
      unsubState();
      unsubText();
    };
  }

  async saveTokens(accessToken: string, refreshToken: string): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule?.saveTokens) {
      try {
        await AivaVoiceModule.saveTokens(accessToken, refreshToken);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  async getStoredTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    if (Platform.OS === 'android' && AivaVoiceModule?.getStoredTokens) {
      try {
        const tokens = await AivaVoiceModule.getStoredTokens();
        return {
          accessToken: tokens?.accessToken || null,
          refreshToken: tokens?.refreshToken || null,
        };
      } catch (e) {
        return { accessToken: null, refreshToken: null };
      }
    }
    return { accessToken: null, refreshToken: null };
  }

  async launchApp(appNameOrPackage: string): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.launchApp) {
      try {
        await AivaVoiceModule.launchApp(appNameOrPackage);
        return true;
      } catch (err: any) {
        console.warn(`[AIVA Voice] Failed to launch app "${appNameOrPackage}":`, err?.message);
        return false;
      }
    }
    return false;
  }

  async createNoteDirect(content: string): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.createNoteDirect) {
      try {
        await AivaVoiceModule.createNoteDirect(content);
        return true;
      } catch (err: any) {
        console.warn('[AIVA Voice] Direct note creation failed, falling back to createNoteWithText:', err?.message);
        return this.createNoteWithText(content, 'com.vivo.notes');
      }
    }
    return this.createNoteWithText(content, 'com.vivo.notes');
  }

  async createNoteWithText(noteText: string, targetPackage: string = 'com.vivo.notes'): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.createNoteWithText) {
      try {
        await AivaVoiceModule.createNoteWithText(noteText, targetPackage);
        return true;
      } catch (err: any) {
        console.warn(`[AIVA Voice] Failed to create note with text in "${targetPackage}", falling back to launch:`, err?.message);
        return this.launchApp(targetPackage);
      }
    }
    return false;
  }

  async makePhoneCall(target: string): Promise<string | boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.makePhoneCall) {
      try {
        const res = await AivaVoiceModule.makePhoneCall(target);
        return res || true;
      } catch (err: any) {
        console.warn(`[AIVA Voice] Failed to make phone call to "${target}":`, err?.message);
        throw err;
      }
    }
    throw new Error('Telephony not supported on this platform');
  }

  async sendWhatsAppMessage(target: string, messageText: string): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.sendWhatsAppMessage) {
      try {
        await AivaVoiceModule.sendWhatsAppMessage(target, messageText);
        return true;
      } catch (err: any) {
        console.warn(`[AIVA Voice] Failed to send WhatsApp message to "${target}":`, err?.message);
        throw err;
      }
    }
    throw new Error('WhatsApp dispatch not supported on this platform');
  }

  async sendSms(phoneNumber: string, messageText: string): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.sendSms) {
      try {
        await AivaVoiceModule.sendSms(phoneNumber, messageText);
        return true;
      } catch (err: any) {
        console.warn(`[AIVA Voice] Failed to send SMS to "${phoneNumber}":`, err?.message);
        return false;
      }
    }
    return false;
  }

  async createCalendarEvent(title: string, description: string = '', startTimeMillis: number = 0, endTimeMillis: number = 0): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule && AivaVoiceModule.createCalendarEvent) {
      try {
        await AivaVoiceModule.createCalendarEvent(title, description, startTimeMillis, endTimeMillis);
        return true;
      } catch (err: any) {
        console.warn(`[AIVA Voice] Failed to create calendar event "${title}":`, err?.message);
        return false;
      }
    }
    return false;
  }

  subscribeState(listener: (state: VoiceState) => void) {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  subscribeText(listener: (text: string, isFinal: boolean) => void) {
    this.textListeners.push(listener);
    return () => {
      this.textListeners = this.textListeners.filter((l) => l !== listener);
    };
  }

  subscribeAudioLevel(listener: (level: number) => void) {
    this.audioLevelListeners.push(listener);
    return () => {
      this.audioLevelListeners = this.audioLevelListeners.filter((l) => l !== listener);
    };
  }

  subscribeError(listener: (error: VoiceError) => void) {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener);
    };
  }
}

export const aivaVoiceService = new AivaVoiceService();
