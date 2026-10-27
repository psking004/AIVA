import React, { useState, useEffect, useRef } from 'react';
import { FabricState } from './types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'aiva';
  content: string;
  timestamp: string;
  model?: string;
  target?: string;
  latencyMs?: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'assistant' | 'chat' | 'fabric' | 'worker' | 'logs' | 'settings'>('assistant');
  const [fabricState, setFabricState] = useState<FabricState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'aiva',
      content: 'AIVA Personal AI OS active. Distributed fabric connected. Voice wake-word "AIVA" listening.',
      timestamp: new Date().toLocaleTimeString(),
      target: 'Local',
      model: 'Distributed Core',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [voiceState, setVoiceState] = useState<'DORMANT' | 'LISTENING' | 'THINKING' | 'SPEAKING'>('DORMANT');
  const [assistantHint, setAssistantHint] = useState<string>('Say "AIVA" or tap microphone');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [isListeningManual, setIsListeningManual] = useState<boolean>(false);
  const [activeLens, setActiveLens] = useState<'tasks' | 'projects' | 'memory' | null>(null);

  // Auth form
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Play audio response via Kokoro local TTS daemon (port 5050) with Web Speech API fallback
  const playAudioTTS = async (text: string) => {
    if (!text || !audioEnabled) return;
    setVoiceState('SPEAKING');

    // 1. Try local Kokoro TTS engine on port 5050
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
        audio.onended = () => {
          setVoiceState('DORMANT');
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setVoiceState('DORMANT');
          URL.revokeObjectURL(audioUrl);
        };
        await audio.play();
        return;
      }
    } catch (_) {
      // Kokoro offline or timed out -> smooth fallback to Web Speech
    }

    // 2. Web Speech API fallback
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.onend = () => setVoiceState('DORMANT');
        utterance.onerror = () => setVoiceState('DORMANT');
        window.speechSynthesis.speak(utterance);
      } catch (_) {
        setVoiceState('DORMANT');
      }
    } else {
      setVoiceState('DORMANT');
    }
  };

  // Poll & listen to fabric state and voice events
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getFabricState().then((state) => {
        setFabricState(state);
      });

      const unsubState = window.electronAPI.onFabricUpdate((state) => {
        setFabricState(state);
      });

      window.electronAPI.getDiagnosticsLogs().then((l) => setLogs(l));

      const unsubLogs = window.electronAPI.onLogEntry((entry) => {
        const line = `[${entry.timestamp}] [${entry.level?.toUpperCase()}] ${entry.message}`;
        setLogs((prev) => [...prev.slice(-150), line]);
      });

      // Voice transcript listener
      let unsubTranscript: (() => void) | undefined;
      if (window.electronAPI.onVoiceTranscript) {
        unsubTranscript = window.electronAPI.onVoiceTranscript((data) => {
          if (data.isWake) {
            setVoiceState('LISTENING');
            setAssistantHint('Listening for directive...');
          } else if (data.text && data.text.trim()) {
            setVoiceState('THINKING');
            setAssistantHint(`"${data.text}"`);
            executeCommand(data.text.trim());
          }
        });
      }

      // Voice state listener
      let unsubVoiceState: (() => void) | undefined;
      if (window.electronAPI.onVoiceState) {
        unsubVoiceState = window.electronAPI.onVoiceState((data) => {
          if (data.state) {
            setVoiceState(data.state as any);
          }
        });
      }

      return () => {
        unsubState?.();
        unsubLogs?.();
        unsubTranscript?.();
        unsubVoiceState?.();
      };
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Execute directive
  const executeCommand = async (command: string) => {
    if (!command.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: command.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);
    setVoiceState('THINKING');
    setAssistantHint('Reasoning through distributed fabric...');

    try {
      if (window.electronAPI) {
        const start = Date.now();
        const res = await window.electronAPI.sendChatMessage(command.trim());
        const elapsed = Date.now() - start;

        if (res.success && res.data) {
          const data = res.data;
          const replyText = data.response || data.message || 'Directive executed.';
          const aivaMsg: ChatMessage = {
            id: `aiva_${Date.now()}`,
            sender: 'aiva',
            content: replyText,
            timestamp: new Date().toLocaleTimeString(),
            model: data.model || data.routing?.model || 'AIVA',
            target: data.target || data.routing?.target || (fabricState?.hardwareInfo?.nodeRole === 'AI_POWER_NODE' ? 'PC-A (CUDA)' : 'PC-B (CPU)'),
            latencyMs: data.latencyMs || elapsed,
          };
          setMessages((prev) => [...prev, aivaMsg]);
          setAssistantHint(`Answered via ${aivaMsg.target} (${aivaMsg.latencyMs}ms)`);
          playAudioTTS(replyText);
        } else {
          const errorMsg = res.error || 'Network communication error';
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              sender: 'aiva',
              content: `Execution error: ${errorMsg}`,
              timestamp: new Date().toLocaleTimeString(),
              target: 'Error',
            },
          ]);
          setVoiceState('DORMANT');
          setAssistantHint('Execution error. Please try again.');
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'aiva',
          content: `Failed to dispatch: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
          target: 'Error',
        },
      ]);
      setVoiceState('DORMANT');
      setAssistantHint('Directive failed.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;
    const msg = inputText.trim();
    setInputText('');
    await executeCommand(msg);
  };

  const toggleManualMic = () => {
    if (isListeningManual) {
      setIsListeningManual(false);
      setVoiceState('DORMANT');
      setAssistantHint('Say "AIVA" or tap microphone');
    } else {
      setIsListeningManual(true);
      setVoiceState('LISTENING');
      setAssistantHint('Listening... Speak now');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError('Email and password required');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.loginUser(authEmail, authPassword);
        if (res.success) {
          setAuthPassword('');
          const updated = await window.electronAPI.getFabricState();
          setFabricState(updated);
        } else {
          setAuthError(res.error || 'Authentication failed');
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const isOnline = fabricState?.isOnline;
  const nodeRole = fabricState?.hardwareInfo?.nodeRole || 'COMPUTE_NODE';
  const nodeId = fabricState?.deviceIdentity?.node_id || 'PC';
  const gpu = fabricState?.hardwareInfo?.gpu;
  const cpu = fabricState?.hardwareInfo?.cpu;
  const memory = fabricState?.hardwareInfo?.memory;

  const latestAivaMsg = [...messages].reverse().find((m) => m.sender === 'aiva');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#07090e', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', userSelect: 'none' }}>
      {/* 1. Custom Frameless Titlebar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '42px', background: '#05070a', borderBottom: '1px solid #172033', padding: '0 12px', WebkitAppRegion: 'drag' } as any}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b', boxShadow: isOnline ? '0 0 10px #10b981' : '0 0 10px #f59e0b' }} />
          <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '1.5px', color: '#38bdf8' }}>AIVA</span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>· PERSONAL AI OS</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: nodeRole === 'AI_POWER_NODE' ? '#1e1b4b' : '#1e293b', color: nodeRole === 'AI_POWER_NODE' ? '#a5b4fc' : '#94a3b8', border: '1px solid #334155' }}>
            {nodeId} ({nodeRole})
          </span>
          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            🎙️ Wake: "AIVA" Active
          </span>
        </div>

        {/* Window Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI?.minimizeWindow()}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '13px', borderRadius: '4px' }}
            title="Minimize"
          >
            _
          </button>
          <button
            onClick={() => window.electronAPI?.maximizeWindow()}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', borderRadius: '4px' }}
            title="Maximize"
          >
            [ ]
          </button>
          <button
            onClick={() => window.electronAPI?.closeWindow()}
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px 8px', fontSize: '15px', borderRadius: '4px' }}
            title="Minimize to Tray (Keeps background worker active)"
          >
            ×
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0a0d14', padding: '8px 14px', borderBottom: '1px solid #172033' }}>
        {[
          { id: 'assistant', label: '✨ AIVA Assistant' },
          { id: 'chat', label: '💬 Chat Stream' },
          { id: 'fabric', label: '⚡ Distributed Fabric' },
          { id: 'worker', label: `⚙️ Worker Telemetry (${fabricState?.workerStats?.tasksCompleted || 0})` },
          { id: 'logs', label: '📜 Diagnostics & Logs' },
          { id: 'settings', label: '🔒 Settings & Identity' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: activeTab === tab.id ? '1px solid #38bdf8' : '1px solid transparent',
              background: activeTab === tab.id ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
              color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '3px 8px',
              color: audioEnabled ? '#38bdf8' : '#64748b',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            title={audioEnabled ? 'Voice output enabled' : 'Voice output muted'}
          >
            {audioEnabled ? '🔊 Voice On' : '🔇 Muted'}
          </button>
          <span style={{ fontSize: '11px', color: isOnline ? '#10b981' : '#f59e0b' }}>
            {isOnline ? 'Fabric Online' : 'Connecting to Fabric...'}
          </span>
        </div>
      </div>

      {/* 3. Main Stage Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ======================================================== */}
        {/* TAB 1: INTENDED USER-FACING AIVA ASSISTANT EXPERIENCE   */}
        {/* ======================================================== */}
        {activeTab === 'assistant' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', gap: '20px', alignItems: 'center', justifyContent: 'space-between', boxSizing: 'border-box', overflowY: 'auto' }}>
            {/* Top Assistant Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #1e293b', padding: '6px 16px', borderRadius: '20px' }}>
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: voiceState === 'LISTENING' ? '#38bdf8' : voiceState === 'THINKING' ? '#c084fc' : voiceState === 'SPEAKING' ? '#10b981' : '#64748b',
                  boxShadow: voiceState !== 'DORMANT' ? '0 0 12px currentColor' : 'none',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', letterSpacing: '0.5px' }}>
                {voiceState === 'LISTENING' ? '✦ LISTENING TO VOICE...' : voiceState === 'THINKING' ? '✦ REASONING & ROUTING...' : voiceState === 'SPEAKING' ? '✦ SPEAKING...' : '✦ AIVA READY'}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>|</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>{assistantHint}</span>
            </div>

            {/* Central Holographic Neural Presence */}
            <div
              onClick={toggleManualMic}
              style={{
                position: 'relative',
                width: '180px',
                height: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                margin: '10px 0',
              }}
              title="Click to toggle voice listening"
            >
              {/* Outer Orbital Ring 1 */}
              <div
                style={{
                  position: 'absolute',
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  border: '1px dashed rgba(56, 189, 248, 0.35)',
                  boxShadow: voiceState === 'LISTENING' ? '0 0 25px rgba(56, 189, 248, 0.4)' : 'none',
                  animation: 'spin 12s linear infinite',
                  transition: 'all 0.3s ease',
                }}
              />

              {/* Middle Orbital Ring 2 */}
              <div
                style={{
                  position: 'absolute',
                  width: '140px',
                  height: '140px',
                  borderRadius: '50%',
                  border: '1px solid rgba(192, 132, 252, 0.4)',
                  boxShadow: voiceState === 'THINKING' ? '0 0 30px rgba(192, 132, 252, 0.5)' : 'none',
                  transform: 'rotate(45deg)',
                  transition: 'all 0.3s ease',
                }}
              />

              {/* Inner Glowing Plasma Core */}
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: voiceState === 'LISTENING'
                    ? 'radial-gradient(circle, #38bdf8 0%, #1e40af 100%)'
                    : voiceState === 'THINKING'
                    ? 'radial-gradient(circle, #c084fc 0%, #4c1d95 100%)'
                    : voiceState === 'SPEAKING'
                    ? 'radial-gradient(circle, #34d399 0%, #065f46 100%)'
                    : 'radial-gradient(circle, #0284c7 0%, #0f172a 100%)',
                  boxShadow: voiceState === 'LISTENING'
                    ? '0 0 40px #38bdf8'
                    : voiceState === 'THINKING'
                    ? '0 0 50px #c084fc'
                    : voiceState === 'SPEAKING'
                    ? '0 0 45px #34d399'
                    : '0 0 25px rgba(2, 132, 199, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.35s ease',
                  transform: voiceState !== 'DORMANT' ? 'scale(1.08)' : 'scale(1.0)',
                }}
              >
                <span style={{ fontSize: '24px' }}>
                  {voiceState === 'LISTENING' ? '🎙️' : voiceState === 'THINKING' ? '⚡' : voiceState === 'SPEAKING' ? '🔊' : '✨'}
                </span>
              </div>
            </div>

            {/* Latest Assistant Response Card */}
            <div style={{ width: '100%', maxWidth: '780px', background: '#0e131f', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px 22px', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '1px' }}>AIVA INTELLIGENCE</span>
                {latestAivaMsg && (
                  <div style={{ display: 'flex', gap: '8px', fontSize: '10px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#1e293b', color: '#94a3b8' }}>
                      Node: <strong style={{ color: '#38bdf8' }}>{latestAivaMsg.target || 'Fabric'}</strong>
                    </span>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#1e293b', color: '#94a3b8' }}>
                      Model: <strong style={{ color: '#a78bfa' }}>{latestAivaMsg.model || 'AIVA'}</strong>
                    </span>
                    {latestAivaMsg.latencyMs && (
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#1e293b', color: '#10b981' }}>
                        {latestAivaMsg.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#f1f5f9', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                {latestAivaMsg?.content || 'AIVA is online and standing by. You can speak commands using "AIVA", tap the neural core to listen, or enter text below.'}
              </div>
            </div>

            {/* Quick Contextual Lens Shortcuts */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { id: 'tasks', label: '📋 Task Protocols' },
                { id: 'projects', label: '🎯 Initiative Matrix' },
                { id: 'memory', label: '🧠 Cognitive Memory' },
                { id: 'fabric', label: '⚡ Compute Nodes' },
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => {
                    if (chip.id === 'fabric') setActiveTab('fabric');
                    else setActiveLens(chip.id as any);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    background: 'rgba(30, 41, 59, 0.7)',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Active Lens Overlay Modal */}
            {activeLens && (
              <div style={{ position: 'fixed', top: '100px', left: '50%', transform: 'translateX(-50%)', width: '550px', background: '#0e131f', border: '1px solid #38bdf8', borderRadius: '12px', padding: '20px', zIndex: 100, boxShadow: '0 12px 40px rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', color: '#38bdf8' }}>
                    {activeLens === 'tasks' ? '📋 Task Protocols' : activeLens === 'projects' ? '🎯 Initiative Matrix' : '🧠 Cognitive Memory Archive'}
                  </h3>
                  <button onClick={() => setActiveLens(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
                <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#cbd5e1' }}>
                  {activeLens === 'tasks' && <p>• Distributed execution active across PC-A (CUDA GPU) and PC-B (Intel CPU)<br />• Automatic failure recovery and cloud fallback verified<br />• Capability scheduler continuously evaluates local queue</p>}
                  {activeLens === 'projects' && <p>• AIVA Personal AI OS - Unified Multi-Platform System<br />• Autonomous Local-First Architecture with Cloud Fallback<br />• Independent Node Operation for PC-A, PC-B, and Android Client</p>}
                  {activeLens === 'memory' && <p>• Persistent Device Identity stored locally<br />• Authentication tokens stored securely in OS UserData<br />• Single-owner isolation enforced across API boundaries</p>}
                </div>
              </div>
            )}

            {/* Command Conduit Bar */}
            <form onSubmit={handleSendMessage} style={{ width: '100%', maxWidth: '780px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={toggleManualMic}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: isListeningManual ? '#ef4444' : '#1e293b',
                  border: isListeningManual ? '2px solid #f87171' : '1px solid #334155',
                  color: '#ffffff',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
                title={isListeningManual ? 'Click to stop listening' : 'Click to speak'}
              >
                🎙️
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask AIVA anything or say 'AIVA' to speak..."
                disabled={isSending}
                style={{
                  flex: 1,
                  background: '#0e131f',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '12px 18px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />

              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                style={{
                  padding: '12px 22px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isSending || !inputText.trim() ? '#334155' : '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isSending || !inputText.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isSending ? 'Routing...' : 'Send'}
              </button>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: CHAT STREAM & HISTORY                             */}
        {/* ======================================================== */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '16px', gap: '12px', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px' }}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    background: m.sender === 'user' ? '#1e3a8a' : '#111827',
                    border: m.sender === 'user' ? '1px solid #2563eb' : '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: '#f1f5f9', userSelect: 'text' }}>
                    {m.content}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '10px', color: '#94a3b8' }}>
                    <span>{m.timestamp}</span>
                    {m.target && <span style={{ color: '#38bdf8' }}>Node: {m.target}</span>}
                    {m.model && <span style={{ color: '#a78bfa' }}>Model: {m.model}</span>}
                    {m.latencyMs && <span>{m.latencyMs}ms</span>}
                  </div>
                </div>
              ))}
              {isSending && (
                <div style={{ alignSelf: 'flex-start', background: '#111827', border: '1px solid #1f2937', borderRadius: '10px', padding: '10px 14px', color: '#38bdf8', fontSize: '12px' }}>
                  AIVA reasoning through distributed fabric...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px', borderTop: '1px solid #1e2638', paddingTop: '12px' }}>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask AIVA anything (executes local-first or cloud fallback)..."
                disabled={isSending}
                style={{
                  flex: 1,
                  background: '#111827',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={isSending || !inputText.trim()}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSending || !inputText.trim() ? '#334155' : '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isSending || !inputText.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: FABRIC & HARDWARE DIAGNOSTICS                     */}
        {/* ======================================================== */}
        {activeTab === 'fabric' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>Device Identity & Node</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div><strong>Node ID:</strong> {nodeId}</div>
                <div><strong>Role:</strong> {nodeRole}</div>
                <div><strong>Device ID:</strong> {fabricState?.deviceIdentity?.device_id || 'Loading...'}</div>
                <div><strong>Hostname:</strong> {fabricState?.hardwareInfo?.hostname || 'Windows Device'}</div>
                <div><strong>Backend URL:</strong> {fabricState?.backendUrl}</div>
                <div><strong>Fabric Status:</strong> <span style={{ color: isOnline ? '#10b981' : '#f59e0b' }}>{isOnline ? 'ONLINE' : 'CONNECTING'}</span></div>
              </div>
            </div>

            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>Hardware Specs</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div><strong>CPU:</strong> {cpu?.model || 'Intel Core'} ({cpu?.cores || 8} cores)</div>
                <div><strong>Memory Total:</strong> {memory?.totalGb || 16} GB (Available: {memory?.availableGb || 4} GB)</div>
                <div><strong>GPU:</strong> {gpu?.model || 'Intel Iris Xe'}</div>
                <div><strong>CUDA Acceleration:</strong> <span style={{ color: gpu?.hasCuda ? '#10b981' : '#94a3b8' }}>{gpu?.hasCuda ? 'Active (NVIDIA)' : 'Disabled (CPU Node)'}</span></div>
                <div><strong>Capabilities:</strong> {fabricState?.hardwareInfo?.capabilities?.join(', ') || 'LOCAL_LLM, CPU_INFERENCE'}</div>
              </div>
            </div>

            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>Local AI Engine (Ollama)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div><strong>Endpoint:</strong> http://127.0.0.1:11434</div>
                <div><strong>Active Model:</strong> {nodeRole === 'AI_POWER_NODE' ? 'qwen3.5:latest' : 'qwen3:4b'}</div>
                <button
                  onClick={async () => {
                    const res = await window.electronAPI?.testOllamaPing();
                    alert(res?.online ? `Ollama Online! Models: ${res.models?.join(', ')}` : `Ollama unreachable: ${res?.error}`);
                  }}
                  style={{ marginTop: '8px', padding: '6px 12px', background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', alignSelf: 'flex-start' }}
                >
                  Ping Local Ollama
                </button>
              </div>
            </div>

            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>Node Management</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div><strong>Last Heartbeat:</strong> {fabricState?.lastHeartbeatTime ? new Date(fabricState.lastHeartbeatTime).toLocaleTimeString() : 'Pending'}</div>
                <button
                  onClick={async () => {
                    const res = await window.electronAPI?.reRegisterNode();
                    alert(res?.success ? 'Node re-registered successfully!' : 'Re-registration failed');
                  }}
                  style={{ marginTop: '8px', padding: '6px 12px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', alignSelf: 'flex-start' }}
                >
                  Re-register with AIVA Fabric
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: WORKER TELEMETRY                                  */}
        {/* ======================================================== */}
        {activeTab === 'worker' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>Background Worker Service</h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                This node continuously claims and executes distributed inference workloads dispatched across the AIVA compute fabric.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div style={{ background: '#111827', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#38bdf8' }}>{fabricState?.workerStats?.tasksAssigned || 0}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Tasks Claimed</div>
                </div>
                <div style={{ background: '#111827', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{fabricState?.workerStats?.tasksCompleted || 0}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Completed</div>
                </div>
                <div style={{ background: '#111827', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#ef4444' }}>{fabricState?.workerStats?.tasksFailed || 0}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Failed</div>
                </div>
                <div style={{ background: '#111827', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#a78bfa' }}>{fabricState?.workerStats?.lastTaskLatencyMs || 0}ms</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Last Latency</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: SYSTEM LOGS & DIAGNOSTICS                         */}
        {/* ======================================================== */}
        {activeTab === 'logs' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: '10px', height: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Live System Diagnostic Log Stream (Token-Redacted)</span>
              <button
                onClick={() => window.electronAPI?.openLogFolder()}
                style={{ padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}
              >
                Open Log Folder
              </button>
            </div>
            <div style={{ flex: 1, background: '#05070a', border: '1px solid #1e2638', borderRadius: '8px', padding: '12px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {logs.map((line, idx) => (
                <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: SETTINGS & IDENTITY                               */}
        {/* ======================================================== */}
        {activeTab === 'settings' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '600px' }}>
            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>AIVA Owner Authentication</h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                Authenticate this node with your AIVA central account to enable authenticated peer communication and compute synchronization.
              </p>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Owner Email</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="owner@aiva.local"
                    style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #334155', borderRadius: '6px', padding: '8px 12px', color: '#f8fafc', fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Password</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••••••"
                    style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #334155', borderRadius: '6px', padding: '8px 12px', color: '#f8fafc', fontSize: '12px' }}
                  />
                </div>
                {authError && <div style={{ color: '#ef4444', fontSize: '11px' }}>{authError}</div>}
                <button
                  type="submit"
                  disabled={authLoading}
                  style={{ marginTop: '8px', padding: '10px', background: '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 600, fontSize: '12px', cursor: authLoading ? 'not-allowed' : 'pointer' }}
                >
                  {authLoading ? 'Authenticating...' : 'Authenticate & Link Node'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
