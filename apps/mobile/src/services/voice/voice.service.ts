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

  constructor() {
    this.initNativeListeners();
  }

  private initNativeListeners() {
    if (Platform.OS !== 'android' || !voiceEmitter) return;

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

    voiceEmitter.addListener('onSpeechPartialResult', (data: { text: string }) => {
      if (data?.text) {
        console.log('[AIVA Voice] Partial transcript:', data.text);
        this.textListeners.forEach((l) => l(data.text, false));
      }
    });

    voiceEmitter.addListener('onSpeechResult', (data: { text: string; isFinal: boolean }) => {
      if (data?.text) {
        console.log('[EVIDENCE-4] Final STT transcript is produced:', data.text);
        this.textListeners.forEach((l) => l(data.text, true));
      }
    });

    voiceEmitter.addListener('onSpeechEnd', () => {
      if (this.currentState === 'LISTENING') {
        this.setState('PROCESSING');
      }
    });

    voiceEmitter.addListener('onSpeechError', (data: { errorCode: number; errorMessage: string }) => {
      const err: VoiceError = {
        code: data.errorCode,
        message: data.errorMessage || 'Speech recognition error',
      };
      this.setState('ERROR');
      this.errorListeners.forEach((l) => l(err));
    });

    voiceEmitter.addListener('onTtsStart', () => {
      console.log('[EVIDENCE-8] Android TTS starts speaking response');
      this.setState('SPEAKING');
    });

    voiceEmitter.addListener('onTtsDone', () => {
      console.log('[EVIDENCE-9] TTS finishes successfully');
      this.setState('IDLE');
      console.log('[EVIDENCE-10] Voice state returns to IDLE');
      if (this.ttsResolve) {
        this.ttsResolve();
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });

    voiceEmitter.addListener('onTtsError', (data: any) => {
      this.setState('ERROR');
      if (this.ttsReject) {
        this.ttsReject(new Error(data?.error || 'TTS Error'));
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });

    voiceEmitter.addListener('onInterrupted', () => {
      this.setState('INTERRUPTED');
      if (this.ttsResolve) {
        this.ttsResolve();
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });

    voiceEmitter.addListener('onTtsInterrupted', () => {
      this.setState('INTERRUPTED');
      if (this.ttsResolve) {
        this.ttsResolve();
        this.ttsResolve = null;
        this.ttsReject = null;
      }
    });
  }

  setState(state: VoiceState) {
    this.currentState = state;
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
        return false;
      }
    }
    return false;
  }

  async stopListening(): Promise<boolean> {
    if (Platform.OS === 'android' && AivaVoiceModule) {
      try {
        await AivaVoiceModule.stopListening();
    try { this.speechRecognizer?.cancel(); } catch (e) {}
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
   * Speak text aloud through device speaker using native TTS
   */
  speak(text: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!text || !text.trim()) {
        resolve();
        return;
      }

      if (Platform.OS === 'android' && AivaVoiceModule) {
        this.currentUtteranceId = `utt_${Date.now()}`;
        this.ttsResolve = resolve;
        this.ttsReject = reject;
        this.setState('SPEAKING');

        try {
          await AivaVoiceModule.speak(text, this.currentUtteranceId);
        } catch (err) {
          this.setState('ERROR');
          this.ttsResolve = null;
          this.ttsReject = null;
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

