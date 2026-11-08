/**
 * AIVA Desktop - Electron Preload Script
 * Securely exposes Electron APIs to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Fabric state & telemetry
  getFabricState: () => ipcRenderer.invoke('get-fabric-state'),
  onFabricUpdate: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('desktop-fabric-state', handler);
    return () => ipcRenderer.removeListener('desktop-fabric-state', handler);
  },

  // Authentication & Node control
  loginUser: (email, password) => ipcRenderer.invoke('login-user', { email, password }),
  reRegisterNode: () => ipcRenderer.invoke('re-register-node'),

  // Chat message dispatch
  sendChatMessage: (message, conversationId, turnId) =>
    ipcRenderer.invoke('send-chat-message', { message, conversationId, turnId }),
  dispatchVoiceTurn: (query, turnId) =>
    ipcRenderer.invoke('dispatch-voice-turn', { query, turnId }),

  // Diagnostics & Logs
  testOllamaPing: () => ipcRenderer.invoke('test-ollama-ping'),
  getDiagnosticsLogs: () => ipcRenderer.invoke('get-diagnostics-logs'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  onLogEntry: (callback) => {
    const handler = (_event, entry) => callback(entry);
    ipcRenderer.on('desktop-log-entry', handler);
    return () => ipcRenderer.removeListener('desktop-log-entry', handler);
  },

  // Voice & Wake-word IPC
  speechWake: () => ipcRenderer.invoke('speech:wake'),
  speechSttChunk: (chunk) => ipcRenderer.invoke('speech:stt-chunk', chunk),
  speechTtsSpeak: (text) => ipcRenderer.invoke('speech:tts-speak', text),
  voiceBargeIn: () => ipcRenderer.invoke('voice:barge-in'),
  onWakeDetected: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('aiva-wake-detected', handler);
    return () => ipcRenderer.removeListener('aiva-wake-detected', handler);
  },
  startWakeListener: () => ipcRenderer.invoke('start-wake-listener'),
  stopWakeListener: () => ipcRenderer.invoke('stop-wake-listener'),
  startWhisper: () => ipcRenderer.invoke('start-whisper'),
  stopWhisper: () => ipcRenderer.invoke('stop-whisper'),
  startKokoro: () => ipcRenderer.invoke('start-kokoro'),
  stopKokoro: () => ipcRenderer.invoke('stop-kokoro'),
  onVoiceTranscript: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-voice-transcript', handler);
    return () => ipcRenderer.removeListener('desktop-voice-transcript', handler);
  },
  onVoiceState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-voice-state', handler);
    return () => ipcRenderer.removeListener('desktop-voice-state', handler);
  },
  onAiResponse: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-ai-response', handler);
    return () => ipcRenderer.removeListener('desktop-ai-response', handler);
  },
  onVoiceInterrupted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-voice-interrupted', handler);
    return () => ipcRenderer.removeListener('desktop-voice-interrupted', handler);
  },
  notifyVoiceLifecycle: (state) => ipcRenderer.invoke('set-voice-session-state', state),
  getWakeWordStatus: () => ipcRenderer.invoke('get-wake-word-status'),
  getWakeTelemetry: () => ipcRenderer.invoke('get-wake-telemetry'),
  getPrecachedAudio: (text) => ipcRenderer.invoke('get-precached-audio', text),

  // Desktop overlay & Mouse passthrough
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
  setDesktopOverlayMode: (mode) =>
    ipcRenderer.invoke('set-desktop-overlay-mode', mode),

  // Model selection & Routing
  getSelectedModel: () => ipcRenderer.invoke('get-selected-model'),
  setSelectedModel: (provider, model) =>
    ipcRenderer.invoke('set-selected-model', { provider, model }),
  getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
  getDiagnosticStatus: () => ipcRenderer.invoke('get-diagnostic-status'),
  onModelChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-model-changed', handler);
    return () => ipcRenderer.removeListener('desktop-model-changed', handler);
  },

  // Version
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Window frame controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // Platform
  platform: process.platform,
});
