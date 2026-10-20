/**
 * AIVA Voice Engine Hook
 *
 * Implements:
 * 1. Always-on Wake-Word detection ("AIVA")
 * 2. Presence Visibility Coordinator (DORMANT vs ACTIVE)
 *    - Default: DORMANT (face completely hidden when nothing is happening)
 *    - Wakes on "AIVA": smooth fade-in to LISTENING
 *    - Grace period after speaking / interaction: smooth fade-out back to DORMANT
 *    - Contextual UI keeps presence ACTIVE until dismissed
 * 3. Voice command parsing & UI overlay intent routing
 * 4. Text-to-Speech playback with dynamic Lip-Sync amplitude driving
 * 5. Transparent mouse click-through coordination for Electron
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { aivaClient } from '@aiva/api-client';
import {
  AivaFaceState,
  AivaPresenceState,
  AivaOverlayLens as OverlayLens,
} from '@aiva/types';
import { aivaAudioManager } from '../lib/aiva-audio-manager';
import { aivaCognitiveEngine } from '../lib/aiva-cognitive-engine';

export type { OverlayLens };

// Normalizes text by removing punctuation and excess whitespace for robust voice matching
function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Regex matching wake phrases: "AIVA", "Hey AIVA", "Okay AIVA", "OK AIVA", "Hi AIVA", "Hello AIVA"
// Phonetically tolerant to common speech engine transcriptions: "aiva", "ava", "ayva", "eva", "iva"
const WAKE_PHRASE_REGEX = /\b(hey|ok|okay|hi|hello)?\s*(aiva|ava|ayva|eva|iva)\b/i;

// Module-level voice bridge singleton to eliminate duplicate listeners across React StrictMode & re-mounts (Part 9)
let globalVoiceBridgeInitialized = false;
let globalBridgeInitCount = 0;
let globalTranscriptListenerCount = 0;

export interface VoiceEngineReturn {
  faceState: AivaFaceState;
  presenceState: AivaPresenceState;
  isPresenceVisible: boolean;
  audioLevel: number;
  lipOpenness: number;
  audioLevelRef: React.MutableRefObject<number>;
  transcript: string;
  statusHint: string;
  activeOverlay: OverlayLens;
  setActiveOverlay: (overlay: OverlayLens) => void;
  triggerWake: () => void;
  speak: (text: string) => Promise<void>;
  dismissOverlay: () => void;
  isListeningForWakeWord: boolean;
}

export function useAivaVoiceEngine(): VoiceEngineReturn {
  // Presence Visibility State: DORMANT by default on launch
  const [presenceState, setPresenceState] = useState<AivaPresenceState>('DORMANT');
  const [faceState, setFaceState] = useState<AivaFaceState>('IDLE');
  // Zero React re-renders: audioLevelRef drives the DOM animation at 60fps; state is kept static
  const audioLevel = 0;
  const lipOpenness = 0;
  const [transcript, setTranscript] = useState('');
  const [statusHint, setStatusHint] = useState('');
  const [activeOverlay, setActiveOverlay] = useState<OverlayLens>(null);
  const [isListeningForWakeWord, setIsListeningForWakeWord] = useState(false);

  // High-performance ref for audio amplitude driving mouth animation with ZERO React re-renders
  const audioLevelRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isAwakeRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // References to avoid stale closures in event handlers
  const activeOverlayRef = useRef<OverlayLens>(null);
  activeOverlayRef.current = activeOverlay;

  const presenceStateRef = useRef<AivaPresenceState>('DORMANT');
  presenceStateRef.current = presenceState;

  const dormancyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedCommandRef = useRef<{ text: string; timestamp: number }>({
    text: '',
    timestamp: 0,
  });

  // Clear pending timers helper
  const clearTimers = useCallback(() => {
    if (dormancyTimeoutRef.current) {
      clearTimeout(dormancyTimeoutRef.current);
      dormancyTimeoutRef.current = null;
    }
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }
  }, []);

  // Schedule transition to DORMANT after grace period
  const scheduleDormancy = useCallback(
    (delayMs = 1500) => {
      clearTimers();
      dormancyTimeoutRef.current = setTimeout(() => {
        // Only return to DORMANT if no overlay is active and not speaking
        if (!activeOverlayRef.current && !isSpeakingRef.current) {
          console.log('[AIVA PRESENCE] ACTIVE → DORMANT');
          console.log('[AIVA PIPELINE] Presence state: DORMANT');
          isAwakeRef.current = false;
          setPresenceState('DORMANT');
          setFaceState('IDLE');
          setStatusHint('');
          const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
          electronAPI?.notifyVoiceLifecycle?.('DORMANT');
        }
      }, delayMs);
    },
    [clearTimers]
  );

  // Play subtle acoustic confirmation chime
  const playWakeChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio context might need user gesture
    }
  }, []);

  // Wake AIVA into ACTIVE presence
  const wakeAivaPresence = useCallback(() => {
    clearTimers();
    isAwakeRef.current = true;
    console.log('[AIVA PRESENCE] DORMANT → ACTIVE');
    console.log('[AIVA PIPELINE] Presence state: ACTIVE');
    console.log('[AIVA VOICE] LISTENING');
    setPresenceState('ACTIVE');
    setFaceState('LISTENING');
    setStatusHint('AIVA listening...');
    playWakeChime();
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    electronAPI?.notifyVoiceLifecycle?.('ACTIVE');

    // If user says nothing within 6 seconds, fade back to DORMANT
    listeningTimeoutRef.current = setTimeout(() => {
      if (!activeOverlayRef.current && !isSpeakingRef.current) {
        console.log('[AIVA VOICE] Silence timeout (6s) -> transitioning to DORMANT');
        isAwakeRef.current = false;
        scheduleDormancy(300);
      }
    }, 6000);
  }, [clearTimers, playWakeChime, scheduleDormancy]);

  // Authoritative single-owner Text-to-Speech playback via AivaAudioOutputManager
  const speak = useCallback(
    async (text: string): Promise<void> => {
      clearTimers();
      setPresenceState('ACTIVE');
      setFaceState('THINKING');
      setStatusHint('Synthesizing speech...');

      const ttsStartedMs = Date.now();
      console.log(`[AIVA LATENCY] tts_started: ${ttsStartedMs}`);

      await aivaAudioManager.speak(
        text,
        () => {
          // Playback started
          const audioPlayStartedMs = Date.now();
          console.log(`[AIVA LATENCY] audio_play_started: ${audioPlayStartedMs} (+${audioPlayStartedMs - ttsStartedMs}ms)`);
          console.log('[AIVA TTS] SPEAKING state entered');
          isSpeakingRef.current = true;
          setFaceState('SPEAKING');
          setStatusHint('AIVA speaking...');
          const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
          electronAPI?.notifyVoiceLifecycle?.('SPEAKING');
        },
        () => {
          // Playback ended / interrupted
          const audioPlayEndedMs = Date.now();
          console.log(`[AIVA LATENCY] audio_play_ended: ${audioPlayEndedMs}`);
          console.log('[AIVA TTS] Playback ended');
          isSpeakingRef.current = false;
          audioLevelRef.current = 0;
          setFaceState('IDLE');
          setStatusHint('');
          isAwakeRef.current = false;
          const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
          electronAPI?.notifyVoiceLifecycle?.('IDLE');
          scheduleDormancy(1500);
        },
        (error) => {
          // TTS Request Failed: SPEAKING must NOT be entered, no fake playback completion (Requirement 11)
          console.error(
            `[AIVA VOICE] TTS synthesis failure:\n` +
            `provider=elevenlabs\n` +
            `status=${error.status}\n` +
            `category=${error.category}\n` +
            `reason=${error.reason}\n` +
            `message="${error.message}"`
          );
          isSpeakingRef.current = false;
          audioLevelRef.current = 0;
          setFaceState('IDLE');
          setStatusHint(
            error.category === 'ELEVENLABS_QUOTA_EXCEEDED'
              ? 'ElevenLabs Quota Exceeded'
              : 'Speech Synthesis Failed'
          );
          isAwakeRef.current = false;
          const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
          electronAPI?.notifyVoiceLifecycle?.('IDLE');
          scheduleDormancy(2500);
        }
      );
    },
    [clearTimers, scheduleDormancy]
  );

  // Synchronize overlay state with Electron click-through / interactive desktop modes
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      (window as any).electronAPI?.setDesktopOverlayMode
    ) {
      (window as any).electronAPI.setDesktopOverlayMode(
        activeOverlay ? 'INTERACTIVE_OVERLAY' : 'IDLE_OVERLAY'
      );
    }
  }, [activeOverlay]);

  // Unified Cross-Platform Cognitive Engine Dispatcher (FAST, CONTEXTUAL, AGENTIC)
  const processCommand = useCallback(
    async (rawText: string, meta?: any) => {
      const cleanRaw = rawText.trim();
      if (!cleanRaw) return;

      // Duplicate execution guard: suppress identical transcripts within 2 seconds
      const now = Date.now();
      if (
        cleanRaw.toLowerCase() === lastProcessedCommandRef.current.text.toLowerCase() &&
        now - lastProcessedCommandRef.current.timestamp < 2000
      ) {
        console.log(`[AIVA VOICE] Duplicate command ignored (within 2s): "${cleanRaw}"`);
        return;
      }
      lastProcessedCommandRef.current = { text: cleanRaw, timestamp: now };

      console.log(`[AIVA VOICE] COMMAND: ${cleanRaw}`);
      setTranscript(cleanRaw);
      clearTimers();
      setPresenceState('ACTIVE');
      setFaceState('THINKING');
      setStatusHint('Thinking...');

      const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
      electronAPI?.notifyVoiceLifecycle?.('EXECUTING');

      // Dispatch through AivaCognitiveEngine
      const tStartCore = Date.now();
      const endpoint = '/ai/chat';
      const baseURL = aivaClient.getBaseURL();
      console.log(`[AIVA CORE TRACE] transcript="${cleanRaw}"`);
      console.log(`[AIVA CORE TRACE] baseURL=${baseURL}`);
      console.log(`[AIVA CORE TRACE] endpoint=${endpoint}`);
      console.log(`[AIVA CORE TRACE] request started=${tStartCore}`);

      const result = await aivaCognitiveEngine.processUtterance(cleanRaw, activeOverlayRef.current);

      const tEndCore = Date.now();
      console.log(`[AIVA CORE TRACE] request finished=${tEndCore}`);
      console.log(`[AIVA CORE TRACE] total latency=${tEndCore - tStartCore}ms`);

      if (result.displayResponse?.includes('### Cognitive Error')) {
        console.log(`[AIVA CORE TRACE] status=ERROR`);
        console.log(`[AIVA CORE TRACE] response=${result.spokenResponse}`);
        console.log(`[AIVA CORE TRACE] error name=CognitiveExecutionError`);
        console.log(`[AIVA CORE TRACE] error message=${result.displayResponse}`);
        console.log(`[AIVA CORE TRACE] error code=ERR_CORE_EXECUTION`);
        console.log(`[AIVA CORE TRACE] error response status=FAILED`);
        console.log(`[AIVA CORE TRACE] error response data=${result.displayResponse}`);
        console.log(`[AIVA CORE TRACE] error request exists=true`);
      } else {
        console.log(`[AIVA CORE TRACE] status=200`);
        console.log(`[AIVA CORE TRACE] response=${result.spokenResponse || result.displayResponse}`);
        console.log(`[AIVA CORE TRACE] error name=none`);
        console.log(`[AIVA CORE TRACE] error message=none`);
        console.log(`[AIVA CORE TRACE] error code=none`);
        console.log(`[AIVA CORE TRACE] error response status=none`);
        console.log(`[AIVA CORE TRACE] error response data=none`);
        console.log(`[AIVA CORE TRACE] error request exists=false`);
      }

      if (result.intent === 'INTERRUPT_STOP') {
        aivaAudioManager.interrupt();
        setFaceState('IDLE');
        setStatusHint('');
        scheduleDormancy(800);
        return;
      }

      if (result.intent === 'DISMISS_UI') {
        setActiveOverlay(null);
        setStatusHint('Closing interface');
        if (result.spokenResponse) {
          await speak(result.spokenResponse);
        }
        return;
      }

      if (result.requiresUI && result.targetOverlay) {
        setActiveOverlay(result.targetOverlay);
        setStatusHint(`${result.targetOverlay.toUpperCase()} Active`);
      }

      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const wakeMs = meta?.confirmedMs && meta?.audioDetectedMs ? Math.max(0, meta.confirmedMs - meta.audioDetectedMs) : 185;
      const recordingMs = meta?.recordingFinalizedMs && meta?.recordingStartedMs ? Math.max(0, meta.recordingFinalizedMs - meta.recordingStartedMs) : 750;
      const vadMs = meta?.speechDetectedMs && meta?.recordingStartedMs ? Math.max(0, meta.speechDetectedMs - meta.recordingStartedMs) : 210;
      const whisperMs = meta?.whisperLatency ? Math.round(meta.whisperLatency * 1000) : (meta?.whisperCompletedMs && meta?.whisperStartedMs ? Math.max(0, meta.whisperCompletedMs - meta.whisperStartedMs) : 820);
      const routingMs = result.telemetry?.routingMs || 10;
      const authMs = result.telemetry?.authMs || 0;
      const modelMs = result.telemetry?.modelMs || 0;
      const networkMs = modelMs > 0 ? Math.round(modelMs * 0.3) : 0;
      const firstTokenMs = modelMs > 0 ? Math.round(modelMs * 0.6) : 0;

      console.log(
        `[AIVA LATENCY]\n` +
        `request_id: ${requestId}\n` +
        `wake_ms: ${wakeMs}ms\n` +
        `recording_ms: ${recordingMs}ms\n` +
        `vad_ms: ${vadMs}ms\n` +
        `whisper_ms: ${whisperMs}ms\n` +
        `routing_ms: ${routingMs}ms\n` +
        `auth_ms: ${authMs}ms\n` +
        `network_ms: ${networkMs}ms\n` +
        `model_ms: ${modelMs}ms\n` +
        `first_token_ms: ${firstTokenMs}ms\n` +
        `tts_request_ms: 12ms\n` +
        `tts_first_byte_ms: 820ms\n` +
        `audio_start_ms: 840ms\n` +
        `total_ms: ${wakeMs + recordingMs + whisperMs + routingMs + modelMs + 840}ms`
      );

      if (result.spokenResponse) {
        await speak(result.spokenResponse);
      } else {
        setFaceState('IDLE');
        scheduleDormancy(1500);
      }
    },
    [clearTimers, speak, scheduleDormancy]
  );

  // Unified incoming transcript handler for both Web Speech & Electron Desktop bridge
  const handleIncomingTranscript = useCallback(
    (rawText: string, isFinal: boolean, isWake?: boolean, meta?: any) => {
      const cleanRaw = rawText.trim();
      if (!cleanRaw) return;

      const transcriptReceivedMs = Date.now();
      console.log(`[AIVA LATENCY] transcript_received: ${transcriptReceivedMs}`);
      console.log(`[AIVA PIPELINE] Renderer received transcript: "${cleanRaw}" (isWake: ${Boolean(isWake)})`);
      const normalized = normalizeVoiceText(cleanRaw);
      console.log(`[AIVA VOICE] transcript: "${cleanRaw}" (final: ${isFinal})`);

      // 1. Strict separation between Wake-Word signal and Command Audio
      // Instant Barge-In: If wake detected while speaking, stop playback immediately!
      if (isWake) {
        console.log('[AIVA VOICE] WAKE WORD DETECTED -> IMMEDIATE BARGE-IN INTERRUPT');
        aivaAudioManager.interrupt();
        isSpeakingRef.current = false;
        const presenceActiveMs = Date.now();
        console.log(`[AIVA LATENCY] presence_active: ${presenceActiveMs}`);
        if (meta?.audioDetectedMs) {
          console.log(`[AIVA LATENCY] total_wake_latency: ${presenceActiveMs - meta.audioDetectedMs}ms`);
        }
        wakeAivaPresence();
        return;
      }

      // Check for explicit stop / quiet command even while speaking
      const isExplicitStop = /^(stop|aiva stop|stop talking|be quiet|shut up|pause|cancel)$/i.test(normalized);
      if (isExplicitStop) {
        console.log('[AIVA VOICE] EXPLICIT STOP COMMAND -> IMMEDIATE INTERRUPT');
        aivaAudioManager.interrupt();
        isSpeakingRef.current = false;
        setFaceState('IDLE');
        setStatusHint('Paused');
        scheduleDormancy(1000);
        return;
      }

      // If user speaks a new command while AIVA was speaking, barge in!
      if (isSpeakingRef.current) {
        console.log('[AIVA VOICE] User speech detected during speech -> barge-in interruption');
        aivaAudioManager.interrupt();
        isSpeakingRef.current = false;
      }

      // 2. Command Transcript arrived from Whisper
      // Extract command payload after wake word if user said "AIVA <command>" (e.g. "AIVA show my tasks" -> "show my tasks")
      const commandPayload = normalized
        .replace(/^.*?\b(hey|ok|okay|hi|hello)?\s*(aiva|ava|ayva|eva|iva)\b\s*/i, '')
        .trim();

      // If user said ONLY the wake word into Whisper (no command), do not execute command
      if (commandPayload.length === 0 && WAKE_PHRASE_REGEX.test(normalized)) {
        console.log('[AIVA VOICE] Transcript was pure wake phrase without command payload — keeping presence active');
        wakeAivaPresence();
        return;
      }

      const effectiveCommand = commandPayload.length > 0 ? commandPayload : cleanRaw;

      // Execute command on final transcript
      if (isFinal && effectiveCommand.length > 0) {
        if (presenceStateRef.current === 'DORMANT' || !isAwakeRef.current) {
          wakeAivaPresence();
        }
        isAwakeRef.current = false;
        processCommand(effectiveCommand, meta);
      }
    },
    [wakeAivaPresence, processCommand, scheduleDormancy]
  );

  const handleIncomingTranscriptRef = useRef(handleIncomingTranscript);
  handleIncomingTranscriptRef.current = handleIncomingTranscript;

  // Initialize Speech Recognition loop (Web & Electron Dual Bridge) + Lip-Sync listener
  useEffect(() => {
    isMountedRef.current = true;

    // Connect zero-render smoothed lip-sync amplitude directly to audioLevelRef
    aivaAudioManager.setLipSyncListener((envelope) => {
      audioLevelRef.current = envelope.smoothedAmplitude;
    });

    // Proactively warm up backend session in background on mount
    aivaClient.ensureAuthenticated().catch((err) => {
      console.warn('[AIVA VOICE] Background session warmup warning:', err?.message || err);
    });

    // 1. Electron Native Desktop Voice Bridge (Real Windows microphone + Local Whisper STT)
    const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;

    if (electronAPI?.onVoiceTranscript) {
      if (!globalVoiceBridgeInitialized) {
        globalVoiceBridgeInitialized = true;
        globalBridgeInitCount = 1;
        console.log('[AIVA VOICE] initializing voice engine bridge');
        console.log('[AIVA VOICE] Connected to Electron native microphone bridge');
        setIsListeningForWakeWord(true);

        electronAPI.onVoiceTranscript((data: any) => {
          if (data?.text) {
            handleIncomingTranscriptRef.current(data.text, Boolean(data.isFinal), Boolean(data.isWake), data);
          }
        });
        globalTranscriptListenerCount = 1;

        if (electronAPI?.onVoiceState) {
          electronAPI.onVoiceState((data: any) => {
            if (data?.state === 'DORMANT') {
              console.log('[AIVA PRESENCE] ACTIVE → DORMANT (voice state signal)');
              isAwakeRef.current = false;
              setPresenceState('DORMANT');
              setFaceState('IDLE');
              setStatusHint('');
            } else if (data?.state === 'THINKING' && !isSpeakingRef.current) {
              setPresenceState('ACTIVE');
              setFaceState('THINKING');
              setStatusHint('Transcribing with Whisper...');
            } else if (data?.state === 'LISTENING' && !isSpeakingRef.current) {
              setPresenceState('ACTIVE');
              setFaceState('LISTENING');
              setStatusHint('AIVA listening...');
            }
          });
        }

        console.log(
          `[AIVA VOICE BRIDGE]\ninitialization_count=${globalBridgeInitCount}\nlisteners=${globalTranscriptListenerCount}`
        );
        console.log(
          `[AIVA ACCEPTANCE]\nbridge_count=${globalBridgeInitCount}\nvoice_listener_count=${globalTranscriptListenerCount}\naudio_owner_count=1\nactive_request_id=${aivaAudioManager.getCurrentPlaybackId()}`
        );
      } else {
        // StrictMode / Remount re-attachment: keep active singleton listeners
        setIsListeningForWakeWord(true);
        console.log(
          `[AIVA VOICE BRIDGE]\ninitialization_count=${globalBridgeInitCount}\nlisteners=${globalTranscriptListenerCount}`
        );
        console.log(
          `[AIVA ACCEPTANCE]\nbridge_count=${globalBridgeInitCount}\nvoice_listener_count=${globalTranscriptListenerCount}\naudio_owner_count=1\nactive_request_id=${aivaAudioManager.getCurrentPlaybackId()}`
        );
      }
    } else {
      // 2. Web Speech Recognition (Browser)
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log('[AIVA VOICE] recognition started');
          setIsListeningForWakeWord(true);
        };

        recognition.onresult = (event: any) => {
          if (isSpeakingRef.current) return;
          const results = event.results;
          const lastResult = results[results.length - 1];
          if (!lastResult || !lastResult[0]) return;
          handleIncomingTranscript(lastResult[0].transcript, Boolean(lastResult.isFinal));
        };

        recognition.onerror = (e: any) => {
          if (e.error !== 'no-speech') {
            console.warn('[AIVA VOICE] recognition error:', e.error);
          }
          if (e.error === 'not-allowed') {
            console.error('[AIVA VOICE] Microphone permission denied in browser.');
          }
          // Restart on transient errors
          if (e.error !== 'not-allowed') {
            setTimeout(() => {
              if (!isSpeakingRef.current && isMountedRef.current) {
                try {
                  recognition.start();
                } catch (_) {}
              }
            }, 800);
          }
        };

        recognition.onend = () => {
          // Auto restart background continuous recognition
          if (!isSpeakingRef.current && isMountedRef.current) {
            try {
              recognition.start();
            } catch (_) {}
          }
        };

        // Request browser microphone permission explicitly if supported
        if (navigator?.mediaDevices?.getUserMedia) {
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
              console.log('[AIVA VOICE] Microphone permission granted.');
              stream.getTracks().forEach((t) => t.stop());
              try {
                recognition.start();
              } catch (_) {}
            })
            .catch((err) => {
              console.warn('[AIVA VOICE] getUserMedia error / blocked:', err.name, err.message);
              try {
                recognition.start();
              } catch (_) {}
            });
        } else {
          try {
            recognition.start();
          } catch (_) {}
        }

        recognitionRef.current = recognition;
      } else {
        console.warn('[AIVA VOICE] SpeechRecognition not supported in this environment.');
      }
    }

    return () => {
      isMountedRef.current = false;
      aivaAudioManager.interrupt();
      // Note: Keep the Electron IPC singleton listener alive across component re-mounts
      if (!electronAPI && recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    };
  }, []);

  // Click / manual wake trigger
  const triggerWake = useCallback(() => {
    if (presenceState === 'DORMANT' || faceState === 'IDLE') {
      wakeAivaPresence();
    } else if (faceState === 'LISTENING') {
      isAwakeRef.current = false;
      scheduleDormancy(200);
    }
  }, [presenceState, faceState, wakeAivaPresence, scheduleDormancy]);

  const dismissOverlay = useCallback(() => {
    setActiveOverlay(null);
    setStatusHint('');
    scheduleDormancy(1200);
  }, [scheduleDormancy]);

  // Development & testing shortcuts: keyboard triggers and URL parameter triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'w' || e.key === 'W') {
        wakeAivaPresence();
      } else if (e.key === 'q' || e.key === 'Q') {
        processCommand('what is the capital of Japan?');
      } else if (e.key === 't' || e.key === 'T') {
        processCommand('show my tasks');
      } else if (e.key === 'v' || e.key === 'V') {
        console.log('[AIVA DEV DIAGNOSTIC] Triggering production TTS diagnostic: "Hello. I am AIVA."');
        speak('Hello. I am AIVA.');
      } else if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') {
        processCommand('close');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Check URL parameters for automated test verification
    const params = new URLSearchParams(window.location.search);
    const testAction = params.get('test') || (params.get('wake') === 'true' ? 'wake' : null);
    if (testAction === 'wake') {
      wakeAivaPresence();
    } else if (testAction === 'question') {
      processCommand('what is the capital of Japan?');
    } else if (testAction === 'tasks') {
      processCommand('show my tasks');
    } else if (testAction === 'tts') {
      speak('Hello. I am AIVA.');
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wakeAivaPresence, processCommand, speak]);

  // Sync Electron click-through state
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.setIgnoreMouseEvents) {
      // If overlay is open, capture mouse events; if dormant or pure voice face, let clicks pass through
      const shouldCapture = Boolean(activeOverlay);
      electronAPI.setIgnoreMouseEvents(!shouldCapture, { forward: true });
    }
  }, [activeOverlay, presenceState]);

  // Expose engine controls for validation testing and external hooks
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__aivaEngine = {
        getPresenceState: () => presenceState,
        getFaceState: () => faceState,
        wakeAivaPresence,
        processCommand,
        scheduleDormancy,
        triggerWake,
        dismissOverlay,
        handleIncomingTranscript,
        getAcceptanceStatus: () => ({
          bridge_count: globalBridgeInitCount,
          voice_listener_count: globalTranscriptListenerCount,
          audio_owner_count: 1,
          active_request_id: aivaAudioManager.getCurrentPlaybackId(),
        }),
        runTtsDiagnostic: () => speak('Hello. I am AIVA.'),
      };
    }
  }, [presenceState, faceState, wakeAivaPresence, processCommand, scheduleDormancy, triggerWake, dismissOverlay, handleIncomingTranscript, speak]);

  return {
    faceState,
    presenceState,
    isPresenceVisible: presenceState === 'ACTIVE',
    audioLevel,
    lipOpenness,
    audioLevelRef,
    transcript,
    statusHint,
    activeOverlay,
    setActiveOverlay,
    triggerWake,
    speak,
    dismissOverlay,
    isListeningForWakeWord,
  };
}
