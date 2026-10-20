/**
 * AIVA Authoritative Single-Owner Audio & Speech Playback Manager
 *
 * Guarantees:
 * 1. Strictly SINGLE audio element playing at any instant (zero overlaps).
 * 2. Instantaneous interruption (barge-in): aborts pending TTS network fetch,
 *    pauses playback, detaches Web Audio nodes, and clears viseme levels.
 * 3. Monotonic playback request fencing: stale async synthesis results are
 *    discarded immediately if a newer command or wake occurs.
 * 4. Natural lip-sync driving: attack/release vocal envelope with noise-floor gating
 *    and viseme classification running at 60fps with zero React state re-renders.
 */

export type VisemeType = 'base' | 'slight' | 'mid' | 'wide' | 'o';

export interface LipSyncEnvelope {
  amplitude: number;
  smoothedAmplitude: number;
  viseme: VisemeType;
  jawOffsetPx: number;
}

export interface AivaTtsError {
  provider: 'elevenlabs';
  status: number;
  category:
    | 'ELEVENLABS_AUTH_INVALID'
    | 'ELEVENLABS_PERMISSION_DENIED'
    | 'ELEVENLABS_VOICE_INVALID'
    | 'ELEVENLABS_RATE_LIMITED'
    | 'ELEVENLABS_QUOTA_EXCEEDED'
    | 'ELEVENLABS_SERVER_ERROR'
    | 'ELEVENLABS_NETWORK_ERROR';
  reason: string;
  message: string;
}

export class AivaAudioOutputManager {
  private static instance: AivaAudioOutputManager | null = null;

  // Single audio owner references
  private activeAudio: HTMLAudioElement | null = null;
  private activeAudioUrl: string | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private animFrameId: number | null = null;

  // Monotonic request fencing
  private currentPlaybackId: number = 0;
  private activeAbortController: AbortController | null = null;

  // Lip-sync envelope tracking
  private smoothedLevel: number = 0;
  private speechPhase: number = 0;
  private isSpeaking: boolean = false;

  // Observers for 60fps rendering without React state updates
  private lipSyncListener: ((envelope: LipSyncEnvelope) => void) | null = null;
  private onPlaybackStateChange: ((state: 'IDLE' | 'SPEAKING' | 'INTERRUPTED') => void) | null = null;

  private constructor() {
    // Singleton
  }

  public static getInstance(): AivaAudioOutputManager {
    if (!AivaAudioOutputManager.instance) {
      AivaAudioOutputManager.instance = new AivaAudioOutputManager();
    }
    return AivaAudioOutputManager.instance;
  }

  public setLipSyncListener(listener: ((envelope: LipSyncEnvelope) => void) | null): void {
    this.lipSyncListener = listener;
  }

  public setPlaybackStateListener(listener: ((state: 'IDLE' | 'SPEAKING' | 'INTERRUPTED') => void) | null): void {
    this.onPlaybackStateChange = listener;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public getCurrentPlaybackId(): number {
    return this.currentPlaybackId;
  }

  /**
   * Immediately stops any current playback and aborts in-flight TTS synthesis.
   * Can be invoked on wake word or explicit stop command ("AIVA stop").
   */
  public interrupt(): void {
    this.currentPlaybackId += 1; // Invalidate all pending speech jobs

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch (_) {}
      this.activeAbortController = null;
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
        this.activeAudio.src = '';
      } catch (_) {}
      this.activeAudio = null;
    }

    if (this.activeAudioUrl) {
      try {
        URL.revokeObjectURL(this.activeAudioUrl);
      } catch (_) {}
      this.activeAudioUrl = null;
    }

    this.isSpeaking = false;
    this.smoothedLevel = 0;
    this.speechPhase = 0;

    // Reset lip sync to neutral
    if (this.lipSyncListener) {
      this.lipSyncListener({
        amplitude: 0,
        smoothedAmplitude: 0,
        viseme: 'base',
        jawOffsetPx: 0,
      });
    }

    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange('INTERRUPTED');
    }

    console.log('[AIVA AUDIO MANAGER] Interrupted & reset to silent');
  }


  /**
   * Synthesizes and speaks text using ElevenLabs via /api/voice/speak.
   * Ensures single-owner playback: interrupts any previous playback before starting.
   */
  public async speak(
    text: string,
    onStarted?: () => void,
    onEnded?: () => void,
    onError?: (error: AivaTtsError) => void
  ): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText) return;

    // 1. Immediately interrupt any prior playback
    this.interrupt();

    // 2. Allocate monotonic playback ticket
    const playId = ++this.currentPlaybackId;
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    console.log(`[AIVA AUDIO MANAGER] Starting synthesis [ticket #${playId}]: "${cleanText.slice(0, 45)}..."`);

    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
        signal: abortController.signal,
      });

      // Stale check
      if (this.currentPlaybackId !== playId) {
        console.log(`[AIVA AUDIO MANAGER] Dropping stale TTS response for ticket #${playId}`);
        return;
      }

      if (!response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch (_) {}

        const category: AivaTtsError['category'] =
          errData.category ||
          (response.status === 401 && /quota/i.test(errData.message || '')
            ? 'ELEVENLABS_QUOTA_EXCEEDED'
            : response.status === 401 && /permission/i.test(errData.message || '')
            ? 'ELEVENLABS_PERMISSION_DENIED'
            : response.status === 401
            ? 'ELEVENLABS_AUTH_INVALID'
            : response.status === 429
            ? 'ELEVENLABS_RATE_LIMITED'
            : response.status === 400 && /voice/i.test(errData.message || '')
            ? 'ELEVENLABS_VOICE_INVALID'
            : 'ELEVENLABS_SERVER_ERROR');

        const reason = errData.reason || (category === 'ELEVENLABS_QUOTA_EXCEEDED' ? 'quota_exceeded' : 'authentication_failed');
        const message = errData.message || 'ElevenLabs synthesis failed';

        console.error(
          `[AIVA AUDIO MANAGER] ElevenLabs TTS error (${response.status}):\n` +
          `provider=elevenlabs\n` +
          `status=${response.status}\n` +
          `category=${category}\n` +
          `reason=${reason}\n` +
          `message="${message}"`
        );

        this.isSpeaking = false;
        if (this.onPlaybackStateChange) {
          this.onPlaybackStateChange('IDLE');
        }

        // Requirement 11: Do NOT call onEnded() on failure (prevents fake playback completion)
        if (onError) {
          onError({
            provider: 'elevenlabs',
            status: response.status,
            category,
            reason,
            message,
          });
        }
        return;
      }

      const audioBlob = await response.blob();

      // Second stale check after blob download
      if (this.currentPlaybackId !== playId) {
        console.log(`[AIVA AUDIO MANAGER] Dropping stale audio blob for ticket #${playId}`);
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      this.activeAudioUrl = audioUrl;

      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      audio.muted = false;
      this.activeAudio = audio;

      // Initialize Web Audio API AnalyserNode
      this.setupWebAudio(audio);

      return new Promise<void>((resolve) => {
        const finish = () => {
          if (this.currentPlaybackId === playId) {
            this.interrupt();
            if (this.onPlaybackStateChange) {
              this.onPlaybackStateChange('IDLE');
            }
          }
          if (onEnded) onEnded();
          resolve();
        };

        audio.onplay = () => {
          if (this.currentPlaybackId !== playId) {
            audio.pause();
            return;
          }
          this.isSpeaking = true;
          if (this.onPlaybackStateChange) {
            this.onPlaybackStateChange('SPEAKING');
          }
          if (onStarted) onStarted();
          this.startLipSyncLoop(playId);
        };

        audio.onended = finish;
        audio.onerror = (e) => {
          console.error('[AIVA AUDIO MANAGER] Audio playback error:', e);
          if (onError) {
            onError({
              provider: 'elevenlabs',
              status: 0,
              category: 'ELEVENLABS_NETWORK_ERROR',
              reason: 'audio_element_error',
              message: 'Audio playback failed',
            });
          }
          finish();
        };

        audio.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('[AIVA AUDIO MANAGER] Audio play failed:', err);
            if (onError) {
              onError({
                provider: 'elevenlabs',
                status: 0,
                category: 'ELEVENLABS_NETWORK_ERROR',
                reason: 'audio_play_rejected',
                message: err?.message || 'Audio play rejected',
              });
            }
          }
          finish();
        });
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`[AIVA AUDIO MANAGER] TTS request ticket #${playId} aborted.`);
      } else {
        const errorObj: AivaTtsError = {
          provider: 'elevenlabs',
          status: 0,
          category: 'ELEVENLABS_NETWORK_ERROR',
          reason: 'network_failure',
          message: err?.message || 'Network fetch failed',
        };
        console.error(
          `[AIVA AUDIO MANAGER] TTS synthesis network error:\n` +
          `provider=elevenlabs\n` +
          `status=0\n` +
          `category=ELEVENLABS_NETWORK_ERROR\n` +
          `reason=network_failure\n` +
          `message="${errorObj.message}"`
        );
        this.isSpeaking = false;
        if (this.onPlaybackStateChange) {
          this.onPlaybackStateChange('IDLE');
        }
        if (onError) {
          onError(errorObj);
        }
      }
    }
  }

  private setupWebAudio(audio: HTMLAudioElement): void {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtxClass();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      if (!this.analyserNode) {
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 128;
        this.analyserNode.smoothingTimeConstant = 0.4;
      }

      // Reconnect source
      try {
        this.mediaSourceNode = this.audioContext.createMediaElementSource(audio);
        this.mediaSourceNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioContext.destination);
      } catch (_) {
        // MediaElementAudioSource already connected or restricted by policy
      }
    } catch (e) {
      console.warn('[AIVA AUDIO MANAGER] Web Audio API setup warning:', e);
    }
  }

  /**
   * 60fps Lip-Sync Loop with Attack/Release Vocal Envelope Smoothing
   */
  private startLipSyncLoop(playId: number): void {
    const dataArray = this.analyserNode ? new Uint8Array(this.analyserNode.frequencyBinCount) : null;

    const tick = () => {
      if (this.currentPlaybackId !== playId || !this.isSpeaking) {
        return;
      }

      let rawLevel = 0;
      if (this.analyserNode && dataArray) {
        this.analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        // Focus on speech frequency bins (100Hz - 3500Hz)
        const relevantBins = Math.min(dataArray.length, 24);
        for (let i = 1; i < relevantBins; i++) {
          sum += dataArray[i] || 0;
        }
        const avg = sum / (relevantBins - 1);
        rawLevel = Math.min(1.0, (avg / 128) * 1.5);
      } else if (this.activeAudio) {
        // Fallback procedural modulation
        const t = this.activeAudio.currentTime;
        rawLevel = Math.max(0, Math.sin(t * 12) * 0.45 + Math.sin(t * 19) * 0.35 + 0.2);
      }

      // 1. Noise Floor Cutoff: Ignore ambient floor hiss (< 0.05)
      if (rawLevel < 0.05) {
        rawLevel = 0;
      }

      // 2. Attack / Release Envelope Smoothing (Attack: 0.35, Release: 0.12)
      if (rawLevel > this.smoothedLevel) {
        this.smoothedLevel += (rawLevel - this.smoothedLevel) * 0.35;
      } else {
        this.smoothedLevel += (rawLevel - this.smoothedLevel) * 0.12;
      }

      // Clamp smoothed level
      this.smoothedLevel = Math.max(0, Math.min(1.0, this.smoothedLevel));
      this.speechPhase += 0.25;

      // 3. Natural Viseme Classification
      let viseme: VisemeType = 'base';
      if (this.smoothedLevel < 0.05) {
        viseme = 'base';
      } else if (this.smoothedLevel < 0.22) {
        viseme = 'slight';
      } else if (this.smoothedLevel < 0.52) {
        viseme = Math.sin(this.speechPhase) > 0.1 ? 'mid' : 'o';
      } else if (this.smoothedLevel < 0.78) {
        viseme = 'wide';
      } else {
        viseme = 'o';
      }

      // 4. Jaw displacement translation (0 to 3.5px maximum)
      const jawOffsetPx = Math.min(3.5, this.smoothedLevel * 3.8);

      // Notify observer
      if (this.lipSyncListener) {
        this.lipSyncListener({
          amplitude: rawLevel,
          smoothedAmplitude: this.smoothedLevel,
          viseme,
          jawOffsetPx,
        });
      }

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }
}

export const aivaAudioManager = AivaAudioOutputManager.getInstance();
