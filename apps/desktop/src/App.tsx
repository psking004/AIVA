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
  | 'DISMISSING';

export type AivaVisemeKey = 'base' | 'slight' | 'mid' | 'wide' | 'o';

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

  // Background fabric & telemetry state
  const [fabricState, setFabricState] = useState<FabricState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Timers and refs
  const dormancyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const activeAudioElRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInputFocusedRef = useRef(false);

  // Mouse ignore control
  const handleMouseEnterInteractive = () => {
    window.electronAPI?.setIgnoreMouseEvents?.(false);
  };

  const handleMouseLeaveInteractive = () => {
    if (visualState === 'DORMANT' && !showDiagnostics && !isInputFocusedRef.current) {
      window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  };

  // Schedule automatic return to DORMANT after idle
  const resetDormancyTimer = (delayMs = 12000) => {
    if (dormancyTimerRef.current) {
      clearTimeout(dormancyTimerRef.current);
    }
    dormancyTimerRef.current = setTimeout(() => {
      if (!isInputFocusedRef.current && visualState !== 'THINKING' && visualState !== 'SPEAKING') {
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
    // Cancel any ongoing audio if barging in
    if (activeAudioElRef.current) {
      activeAudioElRef.current.pause();
      activeAudioElRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    window.electronAPI?.setIgnoreMouseEvents?.(false);
    setVisualState('MATERIALIZING');

    setTimeout(() => {
      setVisualState('LISTENING');
      window.electronAPI?.notifyVoiceLifecycle?.('LISTENING');
      setTimeout(() => inputRef.current?.focus(), 100);
      resetDormancyTimer(14000);
    }, 280);

    if (initialQuery.trim()) {
      executeCommand(initialQuery.trim());
    }
  };

  // Dismiss AIVA back to DORMANT transparent desktop
  const dismissAiva = () => {
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

    setVisualState('DISMISSING');
    window.electronAPI?.notifyVoiceLifecycle?.('DORMANT');

    setTimeout(() => {
      setVisualState('DORMANT');
      setLatestResponse(null);
      if (!showDiagnostics) {
        window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
      }
    }, 380);
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

  // Audio Playback with real-time lip-sync driving
  const playAudioTTS = async (text: string) => {
    if (!text || !audioEnabled) {
      setVisualState('LISTENING');
      resetDormancyTimer(8000);
      return;
    }

    setVisualState('SPEAKING');
    window.electronAPI?.notifyVoiceLifecycle?.('SPEAKING');

    // 1. Attempt Kokoro local TTS daemon on port 5050
    try {
      const kokoroRes = await fetch('http://127.0.0.1:5050/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'af_bella', speed: 1.0 }),
        signal: AbortSignal.timeout(3500),
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
          setVisualState('LISTENING');
          resetDormancyTimer(10000);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          activeAudioElRef.current = null;
          setAudioLevel(0);
          setActiveViseme('base');
          setVisualState('LISTENING');
          resetDormancyTimer(8000);
        };

        await audio.play();
        return;
      }
    } catch (_) {
      // Fallback to Web Speech API
    }

    // 2. Web Speech API fallback
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
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
          setVisualState('LISTENING');
          resetDormancyTimer(10000);
        };

        utterance.onerror = () => {
          clearInterval(intervalId);
          setAudioLevel(0);
          setActiveViseme('base');
          setVisualState('LISTENING');
          resetDormancyTimer(8000);
        };

        window.speechSynthesis.speak(utterance);
      } catch (_) {
        setVisualState('LISTENING');
        resetDormancyTimer(8000);
      }
    } else {
      setVisualState('LISTENING');
      resetDormancyTimer(8000);
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
        const res = await window.electronAPI.sendChatMessage(command.trim());
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
          playAudioTTS(replyText);
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

  // Keyboard shortcut listener (Escape to dismiss, Ctrl+Shift+D for diagnostics)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiagnostics) {
          setShowDiagnostics(false);
        } else if (visualState !== 'DORMANT') {
          dismissAiva();
        }
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDiagnostics((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visualState, showDiagnostics]);

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

    // Voice transcript listener from native wake-word & whisper daemon
    let unsubTranscript: (() => void) | undefined;
    if (window.electronAPI.onVoiceTranscript) {
      unsubTranscript = window.electronAPI.onVoiceTranscript((data) => {
        if (data.isWake) {
          wakeAiva();
        } else if (data.text && data.text.trim()) {
          wakeAiva(data.text.trim());
        }
      });
    }

    // Voice state listener from main process
    let unsubVoiceState: (() => void) | undefined;
    if (window.electronAPI.onVoiceState) {
      unsubVoiceState = window.electronAPI.onVoiceState((data) => {
        if (data.state === 'LISTENING') wakeAiva();
        else if (data.state === 'DORMANT') dismissAiva();
      });
    }

    return () => {
      unsubFabric?.();
      unsubLogs?.();
      unsubTranscript?.();
      unsubVoiceState?.();
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

  return (
    <div className="w-screen h-screen overflow-hidden select-none pointer-events-none relative flex flex-col items-center justify-center font-sans">
      {/* 0. DORMANT PRESENCE ORB (Inconspicuous subtle floating spark to wake on tap) */}
      {isDormant && (
        <div
          className="pointer-events-auto absolute top-6 flex flex-col items-center cursor-pointer transition-all duration-500 hover:scale-125 opacity-40 hover:opacity-100 group"
          onClick={() => wakeAiva()}
          onMouseEnter={handleMouseEnterInteractive}
          onMouseLeave={handleMouseLeaveInteractive}
          title="Click to summon AIVA"
        >
          <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_15px_#2DB7F2,0_0_30px_#818CF8] animate-pulse" />
          <span className="text-[10px] tracking-widest text-cyan-300 uppercase mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-[0_0_8px_rgba(45,183,242,0.8)]">
            AIVA • Say "AIVA" or Tap
          </span>
        </div>
      )}

      {/* 1. DISCREET DIAGNOSTICS & SETTINGS TRIGGER (Top Right) */}
      <div
        className="pointer-events-auto absolute top-5 right-6 z-50 flex items-center gap-3 transition-opacity duration-300 opacity-20 hover:opacity-100"
        onMouseEnter={handleMouseEnterInteractive}
        onMouseLeave={handleMouseLeaveInteractive}
      >
        <button
          onClick={() => setShowDiagnostics((prev) => !prev)}
          className="px-2.5 py-1 rounded-full text-[11px] font-mono tracking-wider bg-slate-900/60 backdrop-blur-md border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,0,0,0.5)]"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${fabricState?.isOnline ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]' : 'bg-amber-400'}`} />
          {fabricState?.deviceIdentity?.node_id || 'NODE'} • {fabricState?.deviceIdentity?.node_role || 'FABRIC'}
        </button>
      </div>

      {/* 2. MAIN HOLOGRAPHIC CONTAINER (Floating Transparent Digital Human) */}
      {!isDormant && (
        <div
          className={`pointer-events-auto relative flex flex-col items-center justify-center transition-all duration-500 ${
            visualState === 'MATERIALIZING'
              ? 'animate-materialize'
              : isDismissing
              ? 'animate-dismiss'
              : 'opacity-100 scale-100'
          }`}
          onMouseEnter={handleMouseEnterInteractive}
          onMouseLeave={handleMouseLeaveInteractive}
        >
          {/* Hologram Stage Area */}
          <div className="relative flex items-center justify-center w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] lg:w-[420px] lg:h-[420px] animate-holo-float">
            {/* A. Atmospheric Presence Aura Glow */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none transition-all duration-700 ease-out"
              style={auraGlowStyle}
            />

            {/* B. 3D Luminous Orbital Energy Rings (Matching Reference Image) */}
            <div className="absolute inset-0 pointer-events-none perspective-1000 flex items-center justify-center">
              {/* Ring 1 (Tilted ~25° Cyan-Violet) */}
              <div
                className={`absolute w-[112%] h-[112%] rounded-full border border-cyan-400/40 shadow-[0_0_20px_rgba(45,183,242,0.4)] ${
                  visualState === 'THINKING' ? 'animate-orbit-1-fast border-violet-400/70 shadow-[0_0_30px_#818CF8]' : 'animate-orbit-1'
                }`}
                style={{
                  background: 'linear-gradient(135deg, rgba(45,183,242,0.25) 0%, rgba(139,92,246,0.15) 50%, transparent 80%)',
                }}
              >
                {/* Orbital energy particle nodes */}
                <div className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#38BDF8,0_0_24px_#2DB7F2]" />
                <div className="absolute -bottom-1 left-1/4 w-1.5 h-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_#818CF8]" />
              </div>

              {/* Ring 2 (Tilted ~-38° Magenta-Electric Blue) */}
              <div
                className={`absolute w-[118%] h-[118%] rounded-full border border-pink-400/35 shadow-[0_0_22px_rgba(236,72,153,0.35)] ${
                  visualState === 'THINKING' ? 'animate-orbit-2-fast border-cyan-400/70 shadow-[0_0_32px_#2DB7F2]' : 'animate-orbit-2'
                }`}
                style={{
                  background: 'linear-gradient(225deg, rgba(236,72,153,0.2) 0%, rgba(56,189,248,0.15) 50%, transparent 80%)',
                }}
              >
                <div className="absolute top-1/3 -right-1 w-2 h-2 rounded-full bg-pink-300 shadow-[0_0_12px_#F472B6,0_0_20px_#EC4899]" />
                <div className="absolute bottom-1/4 -left-1 w-1.5 h-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_#38BDF8]" />
              </div>

              {/* Ring 3 (Horizontal Crown Halo) */}
              <div className="absolute w-[95%] h-[95%] rounded-full border border-sky-300/25 animate-orbit-halo">
                <div className="absolute top-1/2 -left-1 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_#FFF]" />
                <div className="absolute top-1/2 -right-1 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_#FFF]" />
              </div>
            </div>

            {/* C. Digital Human Face Base Asset */}
            <div className="relative w-[86%] h-[86%] flex items-center justify-center">
              <img
                src={faceBase}
                alt="AIVA Holographic Intelligence"
                className="w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_0_24px_rgba(45,183,242,0.45)]"
                draggable={false}
              />

              {/* D. Natural Eyelid Blinking Layer */}
              <img
                src={eyelidsImg}
                alt=""
                className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-100 ease-in-out ${
                  isBlinking ? 'opacity-100' : 'opacity-0'
                }`}
                draggable={false}
              />

              {/* E. Viseme Lip-Sync Layer (Only during speech) */}
              {visualState === 'SPEAKING' && (
                <>
                  <img
                    src={mouthSlight}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150 ${
                      activeViseme === 'slight' ? 'opacity-100' : 'opacity-0'
                    }`}
                    draggable={false}
                  />
                  <img
                    src={mouthMid}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150 ${
                      activeViseme === 'mid' ? 'opacity-100' : 'opacity-0'
                    }`}
                    draggable={false}
                  />
                  <img
                    src={mouthWide}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150 ${
                      activeViseme === 'wide' ? 'opacity-100' : 'opacity-0'
                    }`}
                    draggable={false}
                  />
                  <img
                    src={mouthO}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150 ${
                      activeViseme === 'o' ? 'opacity-100' : 'opacity-0'
                    }`}
                    draggable={false}
                  />
                </>
              )}
            </div>

            {/* F. Floating Ethereal Particle Embers */}
            <div className="absolute inset-0 pointer-events-none overflow-visible">
              <span className="absolute top-[12%] left-[18%] w-1.5 h-1.5 rounded-full bg-cyan-300 opacity-80 blur-[0.5px] animate-pulse" />
              <span className="absolute top-[28%] right-[10%] w-1 h-1 rounded-full bg-pink-300 opacity-70 blur-[0.5px] animate-ping" />
              <span className="absolute bottom-[20%] left-[14%] w-1.5 h-1.5 rounded-full bg-violet-300 opacity-75 blur-[0.5px] animate-pulse" />
              <span className="absolute bottom-[15%] right-[22%] w-1 h-1 rounded-full bg-cyan-200 opacity-85 blur-[0.5px]" />
            </div>
          </div>

          {/* 3. LATEST RESPONSE MESSAGE (Floating Holographic Dialogue Bubble) */}
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

          {/* 4. HOLOGRAPHIC COMMAND CONDUIT (Futuristic Glass Textbox) */}
          <div className="w-[90vw] max-w-[540px] rounded-2xl bg-slate-950/70 backdrop-blur-2xl border border-cyan-500/40 p-2 px-3 shadow-[0_0_35px_rgba(45,183,242,0.22),0_10px_40px_rgba(0,0,0,0.7)] animate-conduit-glow flex items-center gap-3">
            {/* Status Indicator Pill */}
            <div
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-widest font-bold uppercase border shadow-sm transition-all duration-300 flex items-center gap-1.5 ${statusColor}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {statusLabel}
            </div>

            {/* Input Field */}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                resetDormancyTimer(20000);
              }}
              onFocus={() => {
                isInputFocusedRef.current = true;
                if (dormancyTimerRef.current) clearTimeout(dormancyTimerRef.current);
              }}
              onBlur={() => {
                isInputFocusedRef.current = false;
                resetDormancyTimer(10000);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSending) {
                  e.preventDefault();
                  executeCommand(inputText);
                }
              }}
              placeholder="Ask AIVA anything (or speak hands-free)..."
              disabled={isSending}
              className="flex-1 bg-transparent border-0 outline-none text-slate-100 placeholder-slate-400 text-sm font-medium tracking-wide"
            />

            {/* Audio Wave / Microphone Status */}
            <div className="flex items-center gap-2">
              {visualState === 'SPEAKING' || visualState === 'LISTENING' ? (
                <div className="flex items-center gap-0.5 h-5 px-1">
                  <span className="w-1 bg-cyan-400 rounded-full animate-wave-bar" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 bg-violet-400 rounded-full animate-wave-bar" style={{ animationDelay: '200ms' }} />
                  <span className="w-1 bg-pink-400 rounded-full animate-wave-bar" style={{ animationDelay: '400ms' }} />
                </div>
              ) : null}

              {/* Send / Mic Button */}
              <button
                onClick={() => {
                  if (inputText.trim()) executeCommand(inputText);
                }}
                disabled={isSending || !inputText.trim()}
                className={`p-2 rounded-xl transition-all ${
                  inputText.trim() && !isSending
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_15px_#2DB7F2]'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
                }`}
                title="Send directive (Enter)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>

              {/* Dismiss Button */}
              <button
                onClick={() => dismissAiva()}
                className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                title="Dismiss AIVA (Esc)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Discreet Hint */}
          <div className="mt-2 text-[11px] font-mono text-cyan-300/60 tracking-wider flex items-center gap-3">
            <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-900/60 border border-slate-700/60 text-slate-300">Enter</kbd> to submit</span>
            <span>•</span>
            <span><kbd className="px-1 py-0.5 rounded bg-slate-900/60 border border-slate-700/60 text-slate-300">Esc</kbd> to dismiss</span>
          </div>
        </div>
      )}

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
