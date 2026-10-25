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
  const [activeTab, setActiveTab] = useState<'chat' | 'fabric' | 'worker' | 'logs' | 'settings'>('chat');
  const [fabricState, setFabricState] = useState<FabricState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'aiva',
      content: 'AIVA Distributed Fabric active. Hardware auto-configured. How can I assist you?',
      timestamp: new Date().toLocaleTimeString(),
      target: 'Local',
      model: 'Distributed Core',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Poll / Listen to fabric state
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

      return () => {
        unsubState?.();
        unsubLogs?.();
      };
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      content: inputText.trim(),
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    const messageToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      if (window.electronAPI) {
        const start = Date.now();
        const res = await window.electronAPI.sendChatMessage(messageToSend);
        const elapsed = Date.now() - start;

        if (res.success && res.data) {
          const data = res.data;
          const aivaMsg: ChatMessage = {
            id: `aiva_${Date.now()}`,
            sender: 'aiva',
            content: data.response || data.message || 'Directive executed.',
            timestamp: new Date().toLocaleTimeString(),
            model: data.model || data.routing?.model || 'AIVA',
            target: data.target || data.routing?.target || 'Fabric',
            latencyMs: data.latencyMs || elapsed,
          };
          setMessages((prev) => [...prev, aivaMsg]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              sender: 'aiva',
              content: `Execution error: ${res.error || 'Network error'}`,
              timestamp: new Date().toLocaleTimeString(),
              target: 'Error',
            },
          ]);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'aiva',
          content: `Failed to dispatch message: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
          target: 'Error',
        },
      ]);
    } finally {
      setIsSending(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0a0d14', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif', userSelect: 'none' }}>
      {/* 1. Custom Frameless Titlebar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '42px', background: '#07090e', borderBottom: '1px solid #1e2638', padding: '0 12px', WebkitAppRegion: 'drag' } as any}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isOnline ? '#10b981' : '#f59e0b', boxShadow: isOnline ? '0 0 8px #10b981' : '0 0 8px #f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '1px', color: '#38bdf8' }}>AIVA</span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>· DISTRIBUTED FABRIC</span>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: nodeRole === 'AI_POWER_NODE' ? '#1e1b4b' : '#1e293b', color: nodeRole === 'AI_POWER_NODE' ? '#a5b4fc' : '#94a3b8', border: '1px solid #334155' }}>
            {nodeId} ({nodeRole})
          </span>
        </div>

        {/* Window Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI?.minimizeWindow()}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '14px', borderRadius: '4px' }}
            title="Minimize"
          >
            _
          </button>
          <button
            onClick={() => window.electronAPI?.maximizeWindow()}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '13px', borderRadius: '4px' }}
            title="Maximize"
          >
            [ ]
          </button>
          <button
            onClick={() => window.electronAPI?.closeWindow()}
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px 8px', fontSize: '15px', borderRadius: '4px' }}
            title="Minimize to Tray (Keeps background worker running)"
          >
            ×
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0e131f', padding: '8px 14px', borderBottom: '1px solid #1e2638' }}>
        {[
          { id: 'chat', label: 'Chat & Reasoning' },
          { id: 'fabric', label: 'Fabric & Hardware' },
          { id: 'worker', label: `Worker Telemetry (${fabricState?.workerStats?.tasksCompleted || 0})` },
          { id: 'logs', label: 'Diagnostics & Logs' },
          { id: 'settings', label: 'Settings' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: activeTab === tab.id ? '1px solid #38bdf8' : '1px solid transparent',
              background: activeTab === tab.id ? '#1e293b' : 'transparent',
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
          <span style={{ fontSize: '11px', color: isOnline ? '#10b981' : '#f59e0b' }}>
            {isOnline ? 'Fabric Online' : 'Connecting to Render...'}
          </span>
        </div>
      </div>

      {/* 3. Main Workspace Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* TAB: CHAT */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '16px', gap: '12px', height: '100%', boxSizing: 'border-box' }}>
            {/* Messages Scroll Area */}
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

            {/* Input Bar */}
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

        {/* TAB: FABRIC & HARDWARE */}
        {activeTab === 'fabric' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {/* Device Identity */}
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

            {/* Hardware Profile */}
            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#38bdf8', fontWeight: 700 }}>Hardware Specs</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div><strong>CPU:</strong> {cpu?.model || 'Intel Core i5'} ({cpu?.cores || 12} cores)</div>
                <div><strong>Memory Total:</strong> {memory?.totalGb || 16} GB (Available: {memory?.availableGb || 4} GB)</div>
                <div><strong>GPU:</strong> {gpu?.model || 'Intel Iris Xe'}</div>
                <div><strong>CUDA Acceleration:</strong> <span style={{ color: gpu?.hasCuda ? '#10b981' : '#94a3b8' }}>{gpu?.hasCuda ? 'Active (NVIDIA)' : 'Disabled (CPU Node)'}</span></div>
                <div><strong>Capabilities:</strong> {fabricState?.hardwareInfo?.capabilities?.join(', ') || 'LOCAL_LLM, CPU_INFERENCE'}</div>
              </div>
            </div>

            {/* Ollama & Local AI */}
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

            {/* Fabric Node Registration Actions */}
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

        {/* TAB: WORKER TELEMETRY */}
        {activeTab === 'worker' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tasks Assigned</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
                  {fabricState?.workerStats?.tasksAssigned || 0}
                </div>
              </div>
              <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tasks Completed</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
                  {fabricState?.workerStats?.tasksCompleted || 0}
                </div>
              </div>
              <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Last Execution Latency</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#a78bfa', marginTop: '4px' }}>
                  {fabricState?.workerStats?.lastTaskLatencyMs ? `${fabricState.workerStats.lastTaskLatencyMs}ms` : '—'}
                </div>
              </div>
              <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Worker Status</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginTop: '8px' }}>
                  Active (Polling)
                </div>
              </div>
            </div>

            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '10px', padding: '16px', flex: 1 }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#38bdf8' }}>Background Worker Details</h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                The AIVA worker continuously polls the Render distributed coordinator for compute tasks assigned to <strong>{nodeId}</strong>.
                When assigned an inference task, it executes locally against Ollama (model: {nodeRole === 'AI_POWER_NODE' ? 'qwen3.5:latest' : 'qwen3:4b'}) and returns results with sub-second telemetry.
                When the application window is closed, this worker remains running inside the Windows system tray.
              </p>
            </div>
          </div>
        )}

        {/* TAB: DIAGNOSTICS & LOGS */}
        {activeTab === 'logs' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>Local Diagnostic Log Stream</span>
              <button
                onClick={() => window.electronAPI?.openLogFolder()}
                style={{ padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
              >
                Open Log Directory
              </button>
            </div>
            <div style={{ flex: 1, background: '#05070a', border: '1px solid #1e2638', borderRadius: '8px', padding: '12px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8', userSelect: 'text' }}>
              {logs.map((line, idx) => (
                <div key={idx} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* TAB: SETTINGS & AUTH */}
        {activeTab === 'settings' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: '600px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#38bdf8' }}>Node Settings & Owner Authentication</h3>

            {fabricState?.isAuthenticated ? (
              <div style={{ background: '#0e131f', border: '1px solid #10b981', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ color: '#10b981', fontWeight: 600, fontSize: '13px' }}>Node Authenticated with AIVA Cloud</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Device is registered and authorized on Render backend. Heartbeat and worker loops are operating normally.
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Owner Authentication Required</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Log in once to pair this Windows PC with your distributed fabric cluster.
                </div>
                {authError && <div style={{ color: '#f87171', fontSize: '12px' }}>{authError}</div>}
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Owner Email"
                  style={{ background: '#111827', border: '1px solid #334155', borderRadius: '6px', padding: '8px 12px', color: '#f8fafc', fontSize: '12px' }}
                />
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Owner Password"
                  style={{ background: '#111827', border: '1px solid #334155', borderRadius: '6px', padding: '8px 12px', color: '#f8fafc', fontSize: '12px' }}
                />
                <button
                  type="submit"
                  disabled={authLoading}
                  style={{ padding: '8px 14px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
                >
                  {authLoading ? 'Connecting...' : 'Authorize Node'}
                </button>
              </form>
            )}

            <div style={{ background: '#0e131f', border: '1px solid #1e2638', borderRadius: '8px', padding: '16px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div><strong>Backend Domain:</strong> https://aiva-yitg.onrender.com</div>
              <div><strong>System Tray Persistence:</strong> Enabled (close minimizes to tray)</div>
              <div><strong>Windows Auto-Start:</strong> Enabled (launches hidden on boot)</div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Status Bar Footer */}
      <div style={{ height: '26px', background: '#07090e', borderTop: '1px solid #1e2638', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: '11px', color: '#64748b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>Status: <strong style={{ color: isOnline ? '#10b981' : '#f59e0b' }}>{isOnline ? 'ONLINE' : 'CONNECTING'}</strong></span>
          <span>Node: <strong>{nodeId}</strong></span>
          <span>Role: <strong>{nodeRole}</strong></span>
        </div>
        <div>
          <span>AIVA v0.1.0 · Render Coordinator</span>
        </div>
      </div>
    </div>
  );
}
