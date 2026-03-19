/**
 * AIVA Desktop Application - Electron Main Process
 */

const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'AIVA - Personal AI Operating System',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: true,
    titleBarStyle: 'hiddenInset',
  });

  // Load the web app (in production, load built files)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open AIVA', click: () => mainWindow.show() },
    { label: 'Minimize to Tray', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: 'Quit AIVA', click: () => app.quit() },
  ]);

  tray.setToolTip('AIVA - Personal AI Assistant');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for renderer communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});

// Hide to tray on close (optional behavior)
mainWindow?.on('close', (e) => {
  if (process.platform === 'darwin' && !app.isQuiting) {
    e.preventDefault();
    mainWindow.hide();
  }
});
