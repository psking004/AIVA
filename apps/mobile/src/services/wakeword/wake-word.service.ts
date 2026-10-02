/**
 * AIVA Mobile Wake-Word Service
 *
 * Coordinates low-power local keyword spotting on Android with the
 * full AIVA voice pipeline when "AIVA" is spotted.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AivaWakeWordModule } = NativeModules;
const wakeWordEmitter = AivaWakeWordModule ? new NativeEventEmitter(AivaWakeWordModule) : null;

export type BatteryMode = 'PERFORMANCE' | 'BALANCED' | 'BATTERY_SAVER' | 'ULTRA_LOW_POWER';
export type VoiceState = 'IDLE' | 'LISTENING' | 'WAKE_WORD_DETECTED' | 'RECORDING_COMMAND' | 'PROCESSING_AI' | 'SPEAKING_TTS';

export interface WakeWordEvent {
  keyword: string;
  confidence: number;
  timestamp: number;
}

class WakeWordService {
  private currentState: VoiceState = 'IDLE';
  private batteryMode: BatteryMode = 'BALANCED';
  private listeners: Array<(state: VoiceState, event?: WakeWordEvent) => void> = [];
  private subscription: any = null;

  constructor() {
    if (Platform.OS === 'android' && wakeWordEmitter) {
      this.subscription = wakeWordEmitter.addListener(
        'onWakeWordDetected',
        (event: WakeWordEvent) => {
          this.handleWakeWordTriggered(event);
        },
      );
    }
  }

  /**
   * Start low-power background wake-word listening
   */
  async startListening(mode: BatteryMode = 'BALANCED'): Promise<boolean> {
    this.batteryMode = mode;
    this.setState('LISTENING');

    if (Platform.OS === 'android' && AivaWakeWordModule) {
      try {
        await AivaWakeWordModule.startWakeWord(mode);
        return true;
      } catch (err) {
        console.warn('[WakeWordService] Native wake word start error:', err);
        return false;
      }
    }

    // Fallback/simulator
    console.log(`[WakeWordService] Running in simulated mode on ${Platform.OS}`);
    return true;
  }

  /**
   * Stop wake-word listening
   */
  async stopListening(): Promise<boolean> {
    this.setState('IDLE');

    if (Platform.OS === 'android' && AivaWakeWordModule) {
      try {
        await AivaWakeWordModule.stopWakeWord();
        return true;
      } catch (err) {
        console.warn('[WakeWordService] Native wake word stop error:', err);
        return false;
      }
    }
    return true;
  }

  /**
   * Update battery optimization mode
   */
  async setBatteryMode(mode: BatteryMode): Promise<void> {
    this.batteryMode = mode;
    if (Platform.OS === 'android' && AivaWakeWordModule) {
      try {
        await AivaWakeWordModule.setBatteryMode(mode);
      } catch (err) {
        console.warn('[WakeWordService] Failed to set battery mode:', err);
      }
    }
  }

  /**
   * Called when keyword "AIVA" is spotted locally
   */
  private handleWakeWordTriggered(event: WakeWordEvent) {
    console.log(`[WakeWordService] "AIVA" wake word detected (confidence: ${event.confidence.toFixed(2)})`);
    this.setState('WAKE_WORD_DETECTED', event);
  }

  /**
   * State Machine transition helper
   */
  setState(state: VoiceState, event?: WakeWordEvent) {
    this.currentState = state;
    this.listeners.forEach((listener) => listener(state, event));
  }

  getState(): VoiceState {
    return this.currentState;
  }

  getBatteryMode(): BatteryMode {
    return this.batteryMode;
  }

  subscribe(listener: (state: VoiceState, event?: WakeWordEvent) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  destroy() {
    if (this.subscription) {
      this.subscription.remove();
    }
    this.listeners = [];
  }
}

export const wakeWordService = new WakeWordService();
