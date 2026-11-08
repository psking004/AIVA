import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FabricState } from './types';
import faceBase from '../assets/aiva_face_base.png';
import eyelidsImg from '../assets/aiva_eyelids.png';
import mouthSlight from '../assets/aiva_face_mouth_slight.png';
import mouthMid from '../assets/aiva_face_mouth_mid.png';
import mouthWide from '../assets/aiva_face_mouth_wide.png';
import mouthO from '../assets/aiva_face_mouth_o.png';

export type AIVAVisualState =
  | 'DORMANT'
  | 'MATERIALIZING'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'EXECUTING'
  | 'COOLDOWN'
  | 'DISMISSING';

export type AivaVisemeKey = 'base' | 'slight' | 'mid' | 'wide' | 'o';

const PARTICLE_COUNT = 1200;

interface OrbitalParticle {
  angle: number;
  radius: number;
  speed: number;
  tilt: number;
  color: string;
  size: number;
  baseAlpha: number;
}

function OrbitalParticleCanvas({ visualState, audioLevel }: { visualState: AIVAVisualState; audioLevel: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<OrbitalParticle[]>([]);

  useEffect(() => {
    // Generate >= 1200 orbital particles with cyan, magenta, violet, and electric blue hues
    const colors = ['#00f0ff', '#ff007f', '#8b5cf6', '#38bdf8', '#00f0ff', '#ff007f'];
    const pts: OrbitalParticle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pts.push({
        angle: Math.random() * Math.PI * 2,
        radius: 95 + Math.random() * 145,
        speed: 0.003 + Math.random() * 0.006,
        tilt: (Math.random() - 0.5) * 0.85,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 0.8 + Math.random() * 1.8,
        baseAlpha: 0.35 + Math.random() * 0.65,
      });
    }
    particlesRef.current = pts;
  }, []);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      let speedMult = 1.0;
      let globalAlpha = 0.85;

      if (visualState === 'DORMANT') {
        speedMult = 0.35;
        globalAlpha = 0.20;
      } else if (visualState === 'MATERIALIZING') {
        speedMult = 1.6;
        globalAlpha = 0.9;
      } else if (visualState === 'THINKING') {
        speedMult = 2.5; // 2.5x speedup during THINKING per specification
        globalAlpha = 1.0;
      } else if (visualState === 'SPEAKING') {
        speedMult = 1.25;
        globalAlpha = 0.95;
      } else if (visualState === 'EXECUTING') {
        speedMult = 1.8;
        globalAlpha = 0.9;
      }

      const pulseOffset = visualState === 'SPEAKING' ? audioLevel * 20 : 0;

      for (const p of particlesRef.current) {
        p.angle += p.speed * speedMult;
        const currentRadius = p.radius + pulseOffset;
        const x = cx + Math.cos(p.angle) * currentRadius;
        const y = cy + Math.sin(p.angle) * (currentRadius * 0.72) + Math.sin(p.angle) * p.tilt * 28;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.baseAlpha * globalAlpha;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [visualState, audioLevel]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={480}
      className="absolute inset-0 pointer-events-none w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}

interface ChatResponseMeta {
  content: string;
  target?: string;
  model?: string;
  latencyMs?: number;
}

export default function App() {
  const [visualState, setVisualState] = useState<AIVAVisualState>('DORMANT');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [activeViseme, setActiveViseme] = useState<AivaVisemeKey>('base');
  const [isBlinking, setIsBlinking] = useState(false);
  const [latestResponse, setLatestResponse] = useState<ChatResponseMeta | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showTypingFallback, setShowTypingFallback] = useState(false);

  // Background fabric & telemetry state
  const [fabricState, setFabricState] = useState<FabricState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Model Selection & Fabric Presence State
  const [selectedModel, setSelectedModel] = useState<string>('qwen3:4b');
  const [selectedProvider, setSelectedProvider] = useState<string>('ollama');
  const [nodePresence, setNodePresence] = useState<{
    pcB: { status: 'ONLINE' | 'OFFLINE'; role: string };
    pcA: { status: 'ONLINE' | 'OFFLINE'; role: string };
    android: { status: 'ONLINE' | 'OFFLINE'; role: string };
  }>({
    pcB: { status: 'ONLINE', role: 'CPU_LOCAL_NODE' },
    pcA: { status: 'OFFLINE', role: 'AI_POWER_NODE' },
    android: { status: 'OFFLINE', role: 'MOBILE_CLIENT' },
  });

  // Timers and refs
  const dormancyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInputFocusedRef = useRef(false);
  const lastPlayedTtsKeyRef = useRef<string | null>(null);

  // Mouse ignore control
  const handleMouseEnterInteractive = () => {
    window.electronAPI?.setIgnoreMouseEvents?.(false);
  };

  const handleMouseLeaveInteractive = () => {
    if ((visualState === 'DORMANT' || !showTypingFallback) && !showDiagnostics && !isInputFocusedRef.current) {
      window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  };

  // Schedule automatic return to DORMANT after idle (Default: 8s per specification)
  const resetDormancyTimer = (delayMs = 8000) => {
    if (dormancyTimerRef.current) {
      clearTimeout(dormancyTimerRef.current);
    }
    dormancyTimerRef.current = setTimeout(() => {
      // Remain visible while executing coding tasks, thinking, or speaking
      if (!isInputFocusedRef.current && visualState !== 'THINKING' && visualState !== 'SPEAKING' && visualState !== 'EXECUTING') {
        dismissAiva();
      }
    }, delayMs);
  };

  // Wake AIVA into interactive presence
  const wakeAiva = (initialQuery = '') => {
    if (dormancyTimerRef.current) {
      clearTimeout(dormancyTimerRef.current);
      dormancyTimerRef.current = null;
    }
    // Instant Barge-In: Cancel ongoing audio & reset visemes
    if (activeAudioElRef.current) {
      activeAudioElRef.current.pause();
      activeAudioElRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setAudioLevel(0);
    setActiveViseme('base');

    const query = initialQuery.trim();
    if (query) {
      setVisualState('THINKING');
      executeCommand(query);
      return;
    }

    if (visualState === 'DORMANT' || visualState === 'DISMISSING') {
      setVisualState('MATERIALIZING');
      setTimeout(() => {
        setVisualState('LISTENING');
        resetDormancyTimer(8000);
      }, 300);
    } else {
      setVisualState('LISTENING');
      resetDormancyTimer(8000);
    }
  };

  // Dismiss AIVA back to DORMANT transparent desktop (Fade-out: 750ms, within 600-900ms requirement)
  const dismissAiva = () => {
    if (visualState === 'DORMANT' || visualState === 'DISMISSING') {
      return; // Prevent duplicate DORMANT transitions
    }
    if (dormancyTimerRef.current) {
      clearTimeout(dormancyTimerRef.current);
      dormancyTimerRef.current = null;
    }
    if (activeAudioElRef.current) {
      activeAudioElRef.current.pause();
      activeAudioElRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setAudioLevel(0);
    setActiveViseme('base');
    setShowTypingFallback(false);

    setVisualState('DISMISSING');
    window.electronAPI?.notifyVoiceLifecycle?.('DORMANT');

    setTimeout(() => {
      setVisualState('DORMANT');
      setLatestResponse(null);
      if (!showDiagnostics) {
        window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
      }
    }, 750);
  };

  // Natural eyelid blinking cycle (every 3.6s to 6.2s) when not dormant
  useEffect(() => {
    if (visualState === 'DORMANT') {
      setIsBlinking(false);
      return;
    }

    let isMounted = true;
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextBlink = () => {
      if (!isMounted) return;
      const delay = 3500 + Math.random() * 2700;
      blinkTimer = setTimeout(() => {
        if (!isMounted) return;
        setIsBlinking(true);
        closeTimer = setTimeout(() => {
          if (!isMounted) return;
          setIsBlinking(false);
          scheduleNextBlink();
        }, 130);
      }, delay);
    };

    scheduleNextBlink();

    return () => {
      isMounted = false;
      if (blinkTimer) clearTimeout(blinkTimer);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [visualState]);

  // Audio Playback with real-time lip-sync driving (Kokoro af_heart)
  const playAudioTTS = async (text: string, turnId?: string, responseHash?: string) => {
    const cleanText = (text || '').trim();
    if (!cleanText || !audioEnabled) {
      setTimeout(() => dismissAiva(), 1200);
      return;
    }

    // Idempotency: Ignore duplicate TTS request for the same turn and content
    const ttsKey = (turnId && responseHash) ? `${turnId}_${responseHash}` : `${cleanText.slice(0, 60)}_${cleanText.length}`;
    if (lastPlayedTtsKeyRef.current === ttsKey) {
      console.log(`[TTS] Duplicate playback blocked for key: ${ttsKey}`);
      return;
    }
    lastPlayedTtsKeyRef.current = ttsKey;

    // Immediately stop and cancel any active audio before starting new playback
    if (activeAudioElRef.current) {
      activeAudioElRef.current.pause();
      activeAudioElRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setVisualState('SPEAKING');

    // 0. Check pre-cached audio for instant <5ms playback (Section 9)
    try {
      const cachedUri = await window.electronAPI?.getPrecachedAudio?.(cleanText);
      if (cachedUri) {
        console.log(`[TTS] Instant playback from pre-cached audio for: "${cleanText}"`);
        const audio = new Audio(cachedUri);
        activeAudioElRef.current = audio;

        let phase = 0;
        const tickLipSync = () => {
          if (!audio.paused && !audio.ended) {
            phase += 0.22;
            const simulatedLevel = 0.2 + Math.abs(Math.sin(phase)) * 0.65;
            setAudioLevel(simulatedLevel);

            if (simulatedLevel < 0.25) setActiveViseme('slight');
            else if (simulatedLevel < 0.52) setActiveViseme('mid');
            else if (simulatedLevel < 0.78) setActiveViseme('wide');
            else setActiveViseme('o');

            audioAnimationRef.current = requestAnimationFrame(tickLipSync);
          } else {
            setAudioLevel(0);
            setActiveViseme('base');
          }
        };

        audio.onplay = () => {
          audioAnimationRef.current = requestAnimationFrame(tickLipSync);
        };

        audio.onended = () => {
          activeAudioElRef.current = null;
          setAudioLevel(0);
          setActiveViseme('base');
          setVisualState('COOLDOWN');
          setTimeout(() => dismissAiva(), 1000);
        };

        audio.onerror = () => {
          activeAudioElRef.current = null;
          setAudioLevel(0);
          setActiveViseme('base');
          setVisualState('COOLDOWN');
          setTimeout(() => dismissAiva(), 800);
        };

        await audio.play();
        return;
      }
    } catch (_) {}

    // 1. Attempt Kokoro local TTS daemon on port 5050
    try {
      const kokoroRes = await fetch('http://127.0.0.1:5050/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice: 'af_heart', speed: 1.0 }),
        signal: AbortSignal.timeout(35000),
      });

      if (kokoroRes.ok) {
        const blob = await kokoroRes.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        activeAudioElRef.current = audio;

        // Drive visemes from audio playback
        let phase = 0;
        const tickLipSync = () => {
          if (!audio.paused && !audio.ended) {
            phase += 0.22;
            const simulatedLevel = 0.2 + Math.abs(Math.sin(phase)) * 0.65;
            setAudioLevel(simulatedLevel);

            if (simulatedLevel < 0.25) setActiveViseme('slight');
            else if (simulatedLevel < 0.52) setActiveViseme('mid');
            else if (simulatedLevel < 0.78) setActiveViseme('wide');
            else setActiveViseme('o');

            audioAnimationRef.current = requestAnimationFrame(tickLipSync);
          } else {
            setAudioLevel(0);
            setActiveViseme('base');
          }
        };

        audio.onplay = () => {
          audioAnimationRef.current = requestAnimationFrame(tickLipSync);
        };

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          activeAudioElRef.current = null;
          setAudioLevel(0);
          setActiveViseme('base');
          setVisualState('COOLDOWN');
          setTimeout(() => dismissAiva(), 1000);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          activeAudioElRef.current = null;
          setAudioLevel(0);
          setActiveViseme('base');
          setVisualState('COOLDOWN');
          setTimeout(() => dismissAiva(), 800);
        };

        await audio.play();
        return;
      }
    } catch (_) {
      // Local TTS connection notice
    }

    // 2. Web Speech API fallback
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        let phase = 0;
        const intervalId = setInterval(() => {
          phase += 0.28;
          const level = 0.2 + Math.abs(Math.sin(phase)) * 0.6;
          setAudioLevel(level);
          if (level < 0.25) setActiveViseme('slight');
          else if (level < 0.55) setActiveViseme('mid');
          else setActiveViseme('wide');
        }, 120);

        utterance.onend = () => {
          clearInterval(intervalId);
          setAudioLevel(0);
          setActiveViseme('base');
          setTimeout(() => dismissAiva(), 1000);
        };

        utterance.onerror = () => {
          clearInterval(intervalId);
          setAudioLevel(0);
          setActiveViseme('base');
          setTimeout(() => dismissAiva(), 800);
        };

        window.speechSynthesis.speak(utterance);
      } catch (_) {
        setTimeout(() => dismissAiva(), 800);
      }
    } else {
      setTimeout(() => dismissAiva(), 800);
    }
  };

  // Execute directive via distributed fabric
  const executeCommand = async (command: string) => {
    if (!command.trim() || isSending) return;

    setIsSending(true);
    setVisualState('THINKING');
    window.electronAPI?.notifyVoiceLifecycle?.('THINKING');

    const startTime = Date.now();

    try {
      if (window.electronAPI) {
        const clientTurnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const res = await window.electronAPI.sendChatMessage(command.trim(), undefined, clientTurnId);
        const latencyMs = Date.now() - startTime;

        if (res.success && res.data) {
          const data = res.data;
          const replyText = data.response || data.message || 'Directive executed.';
          const meta: ChatResponseMeta = {
            content: replyText,
            target: data.target || data.node || 'Distributed Fabric',
            model: data.model || 'AIVA Core',
            latencyMs: data.latencyMs || latencyMs,
          };

          setLatestResponse(meta);
          playAudioTTS(replyText, data.turnId || clientTurnId, data.responseHash);
        } else {
          const errText = res.error || 'Failed to process directive.';
          setLatestResponse({
            content: errText,
            target: 'Error',
            model: 'Fabric Node',
            latencyMs: Date.now() - startTime,
          });
          setVisualState('LISTENING');
          resetDormancyTimer(8000);
        }
      }
    } catch (err: any) {
      setLatestResponse({
        content: err.message || 'Network communication fault.',
        target: 'Fault',
        model: 'Client',
        latencyMs: Date.now() - startTime,
      });
      setVisualState('LISTENING');
      resetDormancyTimer(8000);
    } finally {
      setIsSending(false);
      setInputText('');
    }
  };

  // Keyboard shortcut listener (Escape to dismiss, Spacebar to barge-in, Ctrl+T for typing fallback, Ctrl+Shift+D for diagnostics)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTypingFallback) {
          setShowTypingFallback(false);
        } else if (showDiagnostics) {
          setShowDiagnostics(false);
        } else if (visualState !== 'DORMANT') {
          dismissAiva();
        }
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Spacebar barge-in interruption terminates speech playback immediately
        if (visualState === 'SPEAKING') {
          e.preventDefault();
          dismissAiva();
        }
      } else if (e.ctrlKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setShowTypingFallback((prev) => {
          const next = !prev;
          if (next) {
            window.electronAPI?.setIgnoreMouseEvents?.(false);
            setTimeout(() => inputRef.current?.focus(), 80);
          }
          return next;
        });
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDiagnostics((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visualState, showDiagnostics, showTypingFallback]);

  // IPC Event Wire-up
  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.getFabricState().then((state) => setFabricState(state));
    const unsubFabric = window.electronAPI.onFabricUpdate((state) => setFabricState(state));

    window.electronAPI.getDiagnosticsLogs().then((l) => setLogs(l));
    const unsubLogs = window.electronAPI.onLogEntry((entry) => {
      const line = `[${entry.timestamp}] [${entry.level?.toUpperCase()}] ${entry.message}`;
      setLogs((prev) => [...prev.slice(-120), line]);
    });

    // Native wake word listener
    let unsubWake: (() => void) | undefined;
    if (window.electronAPI.onWakeDetected) {
      unsubWake = window.electronAPI.onWakeDetected(() => {
        wakeAiva();
      });
    }

    // Voice transcript listener from native wake-word & whisper daemon
    let unsubTranscript: (() => void) | undefined;
    if (window.electronAPI.onVoiceTranscript) {
      unsubTranscript = window.electronAPI.onVoiceTranscript((data) => {
        if (!data.isWake && data.text && data.text.trim()) {
          setVisualState('THINKING');
        }
      });
    }

    // Voice state listener from main process
    let unsubVoiceState: (() => void) | undefined;
    if (window.electronAPI.onVoiceState) {
      unsubVoiceState = window.electronAPI.onVoiceState((data: any) => {
        if (data.state === 'MATERIALIZING') {
          setVisualState('MATERIALIZING');
        } else if (data.state === 'LISTENING') {
          setVisualState('LISTENING');
        } else if (data.state === 'THINKING') {
          setVisualState('THINKING');
        } else if (data.state === 'SPEAKING') {
          setVisualState('SPEAKING');
        } else if (data.state === 'EXECUTING') {
          setVisualState('EXECUTING');
        } else if (data.state === 'COOLDOWN') {
          setVisualState('COOLDOWN');
        } else if (data.state === 'DORMANT') {
          if (visualState !== 'DORMANT' && visualState !== 'DISMISSING') {
            dismissAiva();
          }
        }
      });
    }

    // AI Response listener from main process orchestrator
    let unsubAiResponse: (() => void) | undefined;
    if (window.electronAPI.onAiResponse) {
      unsubAiResponse = window.electronAPI.onAiResponse((data: any) => {
        const replyText = data.response || 'Directive executed.';
        setLatestResponse({
          content: replyText,
          target: data.target || 'PC Local',
          model: data.model || 'AIVA Core',
          latencyMs: data.latencyMs || 0,
        });
        playAudioTTS(replyText, data.turnId, data.responseHash);
      });
    }

    // Voice barge-in interrupt listener
    let unsubInterrupted: (() => void) | undefined;
    if (window.electronAPI.onVoiceInterrupted) {
      unsubInterrupted = window.electronAPI.onVoiceInterrupted(() => {
        if (activeAudioElRef.current) {
          activeAudioElRef.current.pause();
          activeAudioElRef.current = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        setAudioLevel(0);
        setActiveViseme('base');
        dismissAiva();
      });
    }

    // Active model listener
    window.electronAPI?.getSelectedModel?.().then((res) => {
      if (res) {
        setSelectedProvider(res.provider);
        setSelectedModel(res.model);
      }
    });

    const unsubModel = window.electronAPI?.onModelChanged?.((data) => {
      setSelectedProvider(data.provider);
      setSelectedModel(data.model);
    });

    const updatePresence = () => {
      window.electronAPI?.getDiagnosticStatus?.().then((diag) => {
        if (diag) {
          const isPcaOnline = diag.onlineDevices?.includes('PC-A') ?? false;
          const isAndroidOnline = diag.onlineDevices?.includes('Android') ?? false;
          setNodePresence({
            pcB: { status: 'ONLINE', role: diag.currentNodeRole || 'CPU_LOCAL_NODE' },
            pcA: { status: isPcaOnline ? 'ONLINE' : 'OFFLINE', role: 'AI_POWER_NODE' },
            android: { status: isAndroidOnline ? 'ONLINE' : 'OFFLINE', role: 'MOBILE_CLIENT' },
          });
        }
      }).catch(() => {});
    };

    updatePresence();
    const presenceTimer = setInterval(updatePresence, 10000);

    return () => {
      unsubFabric?.();
      unsubLogs?.();
      unsubTranscript?.();
      unsubVoiceState?.();
      unsubAiResponse?.();
      unsubInterrupted?.();
      unsubModel?.();
      clearInterval(presenceTimer);
    };
  }, []);

  // Compute presence aura colors based on visual state
  const auraGlowStyle = useMemo(() => {
    switch (visualState) {
      case 'LISTENING':
        return {
          background:
            'radial-gradient(circle at 50% 50%, rgba(45, 183, 242, 0.48) 0%, rgba(99, 102, 241, 0.28) 45%, rgba(236, 72, 153, 0.12) 68%, transparent 80%)',
          filter: 'blur(36px)',
          transform: 'scale(1.08)',
        };
      case 'THINKING':
        return {
          background:
            'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.55) 0%, rgba(56, 189, 248, 0.35) 45%, rgba(217, 70, 239, 0.18) 70%, transparent 82%)',
          filter: 'blur(42px)',
          transform: 'scale(1.14)',
        };
      case 'SPEAKING':
        return {
          background:
            'radial-gradient(circle at 50% 50%, rgba(244, 114, 182, 0.45) 0%, rgba(56, 189, 248, 0.32) 48%, rgba(139, 92, 246, 0.18) 68%, transparent 82%)',
          filter: 'blur(38px)',
          transform: `scale(${1.05 + audioLevel * 0.12})`,
        };
      case 'EXECUTING':
        return {
          background:
            'radial-gradient(circle at 50% 50%, rgba(52, 211, 153, 0.5) 0%, rgba(45, 183, 242, 0.3) 48%, transparent 75%)',
          filter: 'blur(36px)',
          transform: 'scale(1.1)',
        };
      default:
        return {
          background:
            'radial-gradient(circle at 50% 50%, rgba(45, 183, 242, 0.2) 0%, rgba(139, 92, 246, 0.1) 50%, transparent 70%)',
          filter: 'blur(30px)',
          transform: 'scale(1)',
        };
    }
  }, [visualState, audioLevel]);

  const statusLabel = useMemo(() => {
    switch (visualState) {
      case 'LISTENING':
        return 'LISTENING';
      case 'THINKING':
        return 'THINKING';
      case 'SPEAKING':
        return 'SPEAKING';
      case 'EXECUTING':
        return 'EXECUTING';
      default:
        return 'AIVA';
    }
  }, [visualState]);

  const statusColor = useMemo(() => {
    switch (visualState) {
      case 'LISTENING':
        return 'bg-cyan-500 text-cyan-200 border-cyan-400/50 shadow-cyan-500/50';
      case 'THINKING':
        return 'bg-violet-500 text-violet-200 border-violet-400/50 shadow-violet-500/50';
      case 'SPEAKING':
        return 'bg-pink-500 text-pink-200 border-pink-400/50 shadow-pink-500/50';
      case 'EXECUTING':
        return 'bg-emerald-500 text-emerald-200 border-emerald-400/50 shadow-emerald-500/50';
      default:
        return 'bg-cyan-500/80 text-cyan-200 border-cyan-400/30';
    }
  }, [visualState]);

  const isDormant = visualState === 'DORMANT';
  const isDismissing = visualState === 'DISMISSING';

  const handleFaceClick = () => {
    if (visualState === 'SPEAKING') {
      dismissAiva();
    } else if (visualState === 'DORMANT') {
      wakeAiva();
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden select-none pointer-events-none relative flex flex-col items-center justify-center font-sans">
      {/* 2. MAIN HOLOGRAPHIC CONTAINER (Floating Transparent Digital Human) */}
      <div
        className={`relative flex flex-col items-center justify-center transition-all duration-500 ${
          isDormant
            ? 'pointer-events-none animate-resting-breathe'
            : visualState === 'MATERIALIZING'
            ? 'pointer-events-auto animate-materialize'
            : isDismissing
            ? 'pointer-events-auto animate-dismiss'
            : 'pointer-events-auto opacity-100 scale-100'
        }`}
        onMouseEnter={isDormant ? undefined : handleMouseEnterInteractive}
        onMouseLeave={isDormant ? undefined : handleMouseLeaveInteractive}
      >
        {/* Hologram Stage Area */}
        <div
          className={`holo-face-stage animate-holo-float cursor-pointer ${
            visualState === 'SPEAKING' ? 'hover:scale-[1.02]' : ''
          }`}
          onClick={handleFaceClick}
          title={visualState === 'SPEAKING' ? 'Click to interrupt (Barge-in)' : undefined}
        >
          {/* Orbital Particle Field (>= 1200 Orbiting Particles) */}
          <OrbitalParticleCanvas visualState={visualState} audioLevel={audioLevel} />

          {/* A. Atmospheric Presence Aura Glow with Emissive Rim Lighting */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none transition-all duration-700 ease-out holo-rim-glow"
            style={auraGlowStyle}
          />

          {/* B. 3D Luminous Orbital Energy Rings (Matching Reference Image) */}
          <div className="absolute inset-0 pointer-events-none perspective-1000 flex items-center justify-center">
            {/* Ring 1 (Tilted ~25° Cyan-Violet) */}
            <div
              className={`absolute w-[114%] h-[114%] rounded-full border border-cyan-400/40 shadow-[0_0_20px_rgba(45,183,242,0.4)] ${
                visualState === 'THINKING' ? 'animate-orbit-1-fast border-violet-400/70 shadow-[0_0_30px_#818CF8]' : 'animate-orbit-1'
              }`}
              style={{
                background: 'linear-gradient(135deg, rgba(45,183,242,0.22) 0%, rgba(139,92,246,0.12) 50%, transparent 80%)',
              }}
            >
              {/* Orbital energy particle nodes */}
              <div className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#38BDF8,0_0_24px_#2DB7F2]" />
              <div className="absolute -bottom-1 left-1/4 w-1.5 h-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_#818CF8]" />
            </div>

            {/* Ring 2 (Tilted ~-38° Magenta-Electric Blue) */}
            <div
              className={`absolute w-[120%] h-[120%] rounded-full border border-pink-400/35 shadow-[0_0_22px_rgba(236,72,153,0.35)] ${
                visualState === 'THINKING' ? 'animate-orbit-2-fast border-cyan-400/70 shadow-[0_0_32px_#2DB7F2]' : 'animate-orbit-2'
              }`}
              style={{
                background: 'linear-gradient(225deg, rgba(236,72,153,0.18) 0%, rgba(56,189,248,0.12) 50%, transparent 80%)',
              }}
            >
              <div className="absolute top-1/3 -right-1 w-2 h-2 rounded-full bg-pink-300 shadow-[0_0_12px_#F472B6,0_0_20px_#EC4899]" />
              <div className="absolute bottom-1/4 -left-1 w-1.5 h-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_#38BDF8]" />
            </div>

            {/* Ring 3 (Horizontal Crown Halo) */}
            <div className="absolute w-[98%] h-[98%] rounded-full border border-sky-300/25 animate-orbit-halo">
              <div className="absolute top-1/2 -left-1 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_#FFF]" />
              <div className="absolute top-1/2 -right-1 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_#FFF]" />
            </div>
          </div>

          {/* C. Synchronized Holographic Face Composite (Strict Shared 512x512 Coordinate System) */}
          <div className="holo-face-stack drop-shadow-[0_0_24px_rgba(0,240,255,0.6)] drop-shadow-[0_0_36px_rgba(255,0,127,0.45)]">
            {/* Base Face (always present, subtle resting lips in DORMANT state) */}
            <img
              src={faceBase}
              alt="AIVA Holographic Intelligence"
              className="holo-face-layer"
              draggable={false}
            />

            {/* Viseme Lip-Sync Layers (Overlay when speaking) */}
            {visualState === 'SPEAKING' && (
              <>
                <img
                  src={mouthSlight}
                  alt=""
                  className={`holo-face-layer transition-opacity duration-150 ${
                    activeViseme === 'slight' ? 'opacity-100' : 'opacity-0'
                  }`}
                  draggable={false}
                />
                <img
                  src={mouthMid}
                  alt=""
                  className={`holo-face-layer transition-opacity duration-150 ${
                    activeViseme === 'mid' ? 'opacity-100' : 'opacity-0'
                  }`}
                  draggable={false}
                />
                <img
                  src={mouthWide}
                  alt=""
                  className={`holo-face-layer transition-opacity duration-150 ${
                    activeViseme === 'wide' ? 'opacity-100' : 'opacity-0'
                  }`}
                  draggable={false}
                />
                <img
                  src={mouthO}
                  alt=""
                  className={`holo-face-layer transition-opacity duration-150 ${
                    activeViseme === 'o' ? 'opacity-100' : 'opacity-0'
                  }`}
                  draggable={false}
                />
              </>
            )}

            {/* Natural Eyelids Blinking Layer (Top layer, exact coordinate alignment) */}
            <img
              src={eyelidsImg}
              alt=""
              className={`holo-face-layer transition-opacity duration-100 ease-in-out ${
                isBlinking ? 'opacity-100' : 'opacity-0'
              }`}
              draggable={false}
            />
          </div>

          {/* D. Floating Ethereal Particle Embers */}
          <div className="absolute inset-0 pointer-events-none overflow-visible">
            <span className="absolute top-[12%] left-[18%] w-1.5 h-1.5 rounded-full bg-cyan-300 opacity-80 blur-[0.5px] animate-pulse" />
            <span className="absolute top-[28%] right-[10%] w-1 h-1 rounded-full bg-pink-300 opacity-70 blur-[0.5px] animate-ping" />
            <span className="absolute bottom-[20%] left-[14%] w-1.5 h-1.5 rounded-full bg-violet-300 opacity-75 blur-[0.5px] animate-pulse" />
            <span className="absolute bottom-[15%] right-[22%] w-1 h-1 rounded-full bg-cyan-200 opacity-85 blur-[0.5px]" />
          </div>
        </div>

        {/* 3. ACTIVE STATE OVERLAYS (Rendered only when awake, !isDormant) */}
        {!isDormant && (
          <>
            {/* LATEST RESPONSE MESSAGE (Floating Holographic Dialogue Bubble) */}
            {latestResponse && (
              <div className="mt-2 mb-3 max-w-[560px] w-[90vw] p-4 rounded-2xl bg-slate-950/75 backdrop-blur-2xl border border-cyan-500/30 shadow-[0_0_35px_rgba(45,183,242,0.2),0_10px_35px_rgba(0,0,0,0.6)] text-slate-100 text-sm leading-relaxed relative animate-materialize">
                <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-cyan-500/20 text-[11px] font-mono">
                  <span className="flex items-center gap-1.5 text-cyan-300 font-semibold tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#2DB7F2]" />
                    AIVA INTELLIGENCE
                  </span>
                  <span className="text-slate-400">
                    {latestResponse.target} • {latestResponse.model} • {latestResponse.latencyMs}ms
                  </span>
                </div>
                <p className="font-normal text-slate-100 select-text cursor-text">{latestResponse.content}</p>
              </div>
            )}

            {/* SUBTLE STATE VISUALIZATION & OPTIONAL TYPING TRIGGER */}
            <div className="flex items-center gap-2 mt-3 animate-materialize">
              {/* Status Indicator Pill */}
              <div
                className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest font-bold uppercase border shadow-sm transition-all duration-300 flex items-center gap-1.5 ${statusColor}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {statusLabel}
              </div>

              {/* Audio Wave Bar during speaking or listening */}
              {(visualState === 'SPEAKING' || visualState === 'LISTENING') && (
                <div className="flex items-center gap-0.5 h-5 px-1.5 bg-slate-950/60 rounded-full border border-cyan-500/20">
                  <span className="w-1 bg-cyan-400 rounded-full animate-wave-bar" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 bg-violet-400 rounded-full animate-wave-bar" style={{ animationDelay: '200ms' }} />
                  <span className="w-1 bg-pink-400 rounded-full animate-wave-bar" style={{ animationDelay: '400ms' }} />
                </div>
              )}

              {/* Discreet Typing Fallback Action Button */}
              <button
                onClick={() => {
                  setShowTypingFallback((prev) => !prev);
                  window.electronAPI?.setIgnoreMouseEvents?.(false);
                  setTimeout(() => inputRef.current?.focus(), 80);
                }}
                className="p-1.5 px-2.5 rounded-full bg-slate-950/60 border border-slate-700/60 hover:border-cyan-400/60 text-slate-400 hover:text-cyan-300 transition-all text-[10px] font-mono flex items-center gap-1"
                title="Type directive (Ctrl+T)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5h18M3 19h18M5 10h2M9 10h2M13 10h2M17 10h2M7 15h10" />
                </svg>
                <span>Type</span>
              </button>

              {/* Dismiss Action Button */}
              <button
                onClick={() => dismissAiva()}
                className="p-1.5 rounded-full bg-slate-950/60 border border-slate-700/60 hover:border-rose-400/60 text-slate-400 hover:text-rose-300 transition-all"
                title="Dismiss AIVA (Esc)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </>
        )}

          {/* 5. EXPLICIT TYPING FALLBACK MODAL (ONLY appears on explicit user request) */}
          {showTypingFallback && (
            <div
              className="mt-3 w-[90vw] max-w-[500px] rounded-2xl bg-slate-950/85 backdrop-blur-2xl border border-cyan-500/50 p-2 px-3 shadow-[0_0_35px_rgba(45,183,242,0.3),0_10px_40px_rgba(0,0,0,0.8)] flex items-center gap-2 animate-materialize"
              onMouseEnter={handleMouseEnterInteractive}
              onMouseLeave={handleMouseLeaveInteractive}
            >
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSending && inputText.trim()) {
                    e.preventDefault();
                    executeCommand(inputText.trim());
                    setShowTypingFallback(false);
                  } else if (e.key === 'Escape') {
                    setShowTypingFallback(false);
                  }
                }}
                placeholder="Type your directive (Enter to send)..."
                disabled={isSending}
                className="flex-1 bg-transparent border-0 outline-none text-slate-100 placeholder-slate-400 text-sm font-medium tracking-wide"
                autoFocus
              />
              <button
                onClick={() => {
                  if (inputText.trim()) {
                    executeCommand(inputText.trim());
                    setShowTypingFallback(false);
                  }
                }}
                disabled={isSending || !inputText.trim()}
                className={`p-2 rounded-xl transition-all ${
                  inputText.trim() && !isSending
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_#2DB7F2]'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
                title="Send directive"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
              <button
                onClick={() => setShowTypingFallback(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200"
                title="Close typing input (Esc)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

      {/* 5. SLIDE-OVER TELEMETRY & DIAGNOSTICS DRAWER (Secondary Interface) */}
      {showDiagnostics && (
        <div
          className="pointer-events-auto absolute inset-y-0 right-0 w-[420px] max-w-full bg-slate-950/85 backdrop-blur-2xl border-l border-cyan-500/30 p-6 flex flex-col z-50 shadow-[-10px_0_40px_rgba(0,0,0,0.8)] animate-materialize font-mono text-xs"
          onMouseEnter={handleMouseEnterInteractive}
          onMouseLeave={handleMouseLeaveInteractive}
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${fabricState?.isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]' : 'bg-rose-400'}`} />
              <h2 className="text-sm font-semibold text-slate-100 tracking-wider uppercase">Fabric Telemetry</h2>
            </div>
            <button
              onClick={() => setShowDiagnostics(false)}
              className="text-slate-400 hover:text-slate-200 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 text-slate-300">
            {/* Identity Card */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest">Node Identity</div>
              <div className="text-slate-200 font-bold">{fabricState?.deviceIdentity?.node_id || 'PC-B'} ({fabricState?.deviceIdentity?.node_role || 'CPU_LOCAL_NODE'})</div>
              <div className="text-[11px] text-slate-400 truncate">ID: {fabricState?.deviceIdentity?.device_id || 'unregistered'}</div>
              <div className="text-[11px] text-slate-400">Host: {fabricState?.hardwareInfo?.hostname || 'Cosmic_004'}</div>
            </div>

            {/* Active AI Model Selector Card */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-cyan-400 uppercase tracking-widest">
                <span>Active AI Model</span>
                <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 text-[9px] uppercase font-bold">
                  {selectedProvider}
                </span>
              </div>
              <select
                value={`${selectedProvider}|${selectedModel}`}
                onChange={(e) => {
                  const [prov, mdl] = e.target.value.split('|');
                  if (prov && mdl) {
                    setSelectedProvider(prov);
                    setSelectedModel(mdl);
                    window.electronAPI?.setSelectedModel?.(prov, mdl);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-400 font-mono"
              >
                <optgroup label="Local Inference (Zero Cloud Dependency)">
                  <option value="ollama|qwen3:4b">Ollama: qwen3:4b (Fast CPU Node)</option>
                  <option value="ollama|llama3:latest">Ollama: llama3:latest</option>
                  <option value="ollama|qwen3:8b">Ollama: qwen3:8b</option>
                  <option value="ollama|qwen3.5:latest">Ollama: qwen3.5:latest</option>
                </optgroup>
                <optgroup label="Cloud Inference">
                  <option value="openrouter|qwen/qwen-2.5-72b-instruct">OpenRouter: Qwen 2.5 72B Instruct</option>
                  <option value="gemini|gemini-3.5-flash">Google Gemini: 3.5 Flash</option>
                </optgroup>
              </select>
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Routing: {selectedProvider === 'ollama' ? 'PC-B Local Ollama' : 'Cloud Direct'}</span>
                <span className="text-emerald-400 font-semibold">Ready</span>
              </div>
            </div>

            {/* Fabric Node Network Presence Card */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest flex items-center justify-between">
                <span>Fabric Presence (TTL: 60s)</span>
                <span className="text-[9px] text-slate-500">Autonomous Node</span>
              </div>
              <div className="space-y-1.5">
                {/* PC-B (Self) */}
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34D399]" />
                    <span className="font-semibold text-slate-200">PC-B (Current Node)</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                    ONLINE
                  </span>
                </div>

                {/* PC-A */}
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${nodePresence.pcA.status === 'ONLINE' ? 'bg-emerald-400 shadow-[0_0_6px_#34D399]' : 'bg-slate-600'}`} />
                    <span className="text-slate-300">PC-A (AI Power Node)</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${nodePresence.pcA.status === 'ONLINE' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'}`}>
                    {nodePresence.pcA.status}
                  </span>
                </div>

                {/* Android */}
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${nodePresence.android.status === 'ONLINE' ? 'bg-emerald-400 shadow-[0_0_6px_#34D399]' : 'bg-slate-600'}`} />
                    <span className="text-slate-300">Android (Mobile Node)</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${nodePresence.android.status === 'ONLINE' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'}`}>
                    {nodePresence.android.status}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 italic pt-0.5">
                Autonomous: PC-B operates without waiting for peer nodes.
              </div>
            </div>

            {/* Hardware Telemetry */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
              <div className="text-[10px] text-cyan-400 uppercase tracking-widest">Hardware Compute</div>
              <div className="text-slate-300">CPU: {fabricState?.hardwareInfo?.cpu?.model || 'Intel Core i5'} ({fabricState?.hardwareInfo?.cpu?.cores || 12} cores)</div>
              <div className="text-slate-300">RAM: {fabricState?.hardwareInfo?.memory?.ramUsedGb || 0}GB / {fabricState?.hardwareInfo?.memory?.totalGb || 16}GB</div>
              <div className="text-slate-300">GPU: {fabricState?.hardwareInfo?.gpu?.model || 'Intel Iris Xe'} (CUDA: {String(fabricState?.hardwareInfo?.gpu?.hasCuda || false)})</div>
            </div>

            {/* Diagnostics Log Stream */}
            <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-cyan-400 uppercase tracking-widest">
                <span>Local Diagnostics Log</span>
                <button
                  onClick={() => window.electronAPI?.openLogFolder()}
                  className="text-cyan-400 hover:underline"
                >
                  Open File
                </button>
              </div>
              <div className="h-44 overflow-y-auto bg-black/60 p-2 rounded-lg text-[10px] space-y-1 text-slate-400 font-mono">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic">No log entries recorded.</div>
                ) : (
                  logs.slice(-35).map((l, i) => (
                    <div key={i} className="truncate hover:text-slate-200">{l}</div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={() => window.electronAPI?.reRegisterNode()}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 text-[11px]"
            >
              Re-register Node
            </button>
            <button
              onClick={() => {
                setAudioEnabled((p) => !p);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-[11px]"
            >
              Audio: {audioEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
