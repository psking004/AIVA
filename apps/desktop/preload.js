/**
 * AIVA Desktop - Electron Preload Script
 *
 * Securely exposes Electron APIs to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
  setDesktopOverlayMode: (mode) =>
    ipcRenderer.invoke('set-desktop-overlay-mode', mode),

  // Platform info
  platform: process.platform,

  // Native desktop voice stream listener (singleton registration)
  onVoiceTranscript: (callback) => {
    ipcRenderer.removeAllListeners('desktop-voice-transcript');
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-voice-transcript', handler);
    return () => {
      ipcRenderer.removeListener('desktop-voice-transcript', handler);
    };
  },

  // Native desktop voice state listener (singleton registration)
  onVoiceState: (callback) => {
    ipcRenderer.removeAllListeners('desktop-voice-state');
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('desktop-voice-state', handler);
    return () => {
      ipcRenderer.removeListener('desktop-voice-state', handler);
    };
  },

  // Notify main process of voice session lifecycle changes (ACTIVE / DORMANT)
  notifyVoiceLifecycle: (state) => {
    return ipcRenderer.invoke('set-voice-session-state', state);
  },

  // Notifications
  sendNotification: (title, body) => {
    new Notification(title, { body });
  },
});

// Global error interceptor to surface all renderer exceptions
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[UNCAUGHT RENDERER ERROR]', event.message, 'at', event.filename + ':' + event.lineno);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[UNHANDLED PROMISE REJECTION]', event.reason);
  });
}

