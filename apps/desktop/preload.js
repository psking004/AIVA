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

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Platform info
  platform: process.platform,

  // Notifications
  sendNotification: (title, body) => {
    new Notification(title, { body });
  },
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});
