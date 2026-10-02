/**
 * AIVA Desktop Application - Electron Main Process
 *
 * Provides:
 * - Background Assistant & Always-on Wake-Word readiness
 * - Windows System Tray integration (minimize-to-tray & background persistence)
 * - Auto-start on Windows boot via Electron LoginItemSettings
 * - Local-First AI interaction bridge
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
app.isQuitting = false;

// Determine if we're in development mode
const isDev = !app.isPackaged;

// Configure Auto-Start on Windows Boot
function configureAutoStart(enable = true) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden'],
    });
    console.log(`[AIVA Desktop] Windows auto-start configured: ${enable}`);
  } catch (err) {
    console.warn('[AIVA Desktop] Failed to configure auto-start:', err.message);
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    title: 'AIVA - Private Personal AI Operating System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: true,
    titleBarStyle: 'hiddenInset',
    show: !process.argv.includes('--hidden'), // Start hidden if launched on Windows boot
  });

  // In dev mode, load the Next.js web app; in production, load built renderer
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  // Intercept close event: hide window to system tray so AIVA wake-word remains active
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: 'AIVA Active in Background',
          content: 'AIVA wake-word service is active. Say "AIVA" or click tray icon.',
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');

  let trayIcon;
  if (fs.existsSync(trayIconPath)) {
    trayIcon = nativeImage.createFromPath(trayIconPath);
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  try {
    tray = new Tray(trayIcon);
  } catch (err) {
    console.warn('[AIVA Desktop] Could not create system tray:', err.message);
    return;
  }

  const loginSettings = app.getLoginItemSettings();

  const updateContextMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open AIVA',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Wake Word: "AIVA" (Active)',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Launch on Windows Startup',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          configureAutoStart(item.checked);
          updateContextMenu();
        },
      },
      {
        label: 'Hide to Tray',
        click: () => mainWindow && mainWindow.hide(),
      },
      { type: 'separator' },
      {
        label: 'Quit AIVA',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  };

  updateContextMenu();
  tray.setToolTip('AIVA - Private Personal Assistant (Wake word: "AIVA")');

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Setup default startup item
  configureAutoStart(true);

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// Do not quit when all windows are closed; remain alive in tray
app.on('window-all-closed', () => {
  // Stay in tray for background listening
});

// IPC handlers for renderer communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close(); // Triggers the close-to-tray handler
});

ipcMain.handle('get-wake-word-status', () => {
  return {
    enabled: true,
    keyword: 'AIVA',
    provider: 'local-first',
  };
});
