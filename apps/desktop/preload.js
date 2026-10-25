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
  sendChatMessage: (message, conversationId) =>
    ipcRenderer.invoke('send-chat-message', { message, conversationId }),

  // Diagnostics & Logs
  testOllamaPing: () => ipcRenderer.invoke('test-ollama-ping'),
  getDiagnosticsLogs: () => ipcRenderer.invoke('get-diagnostics-logs'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  onLogEntry: (callback) => {
    const handler = (_event, entry) => callback(entry);
    ipcRenderer.on('desktop-log-entry', handler);
    return () => ipcRenderer.removeListener('desktop-log-entry', handler);
  },

  // Window frame controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),

  // Platform
  platform: process.platform,
});
