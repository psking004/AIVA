/**
 * AIVA Desktop Application - Electron Main Process
 *
 * Provides:
 * - Background Assistant & Always-on Wake-Word readiness
 * - Windows System Tray integration (minimize-to-tray & background persistence)
 * - Auto-start on Windows boot via Electron LoginItemSettings
 * - Local-First AI interaction bridge
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let tray = null;
let speechProcess = null;
let whisperProcess = null;
let isWhisperReady = false;
app.isQuitting = false;

// Strict Voice State Machine & Concurrency Lock
let voiceSessionActive = false;
let voiceState = 'DORMANT'; // 'DORMANT' | 'LISTENING' | 'RECORDING_COMMAND' | 'TRANSCRIBING' | 'COMMAND_RECEIVED' | 'THINKING' | 'EXECUTING' | 'SPEAKING'
let sessionWatchdogTimer = null;

function resetVoiceSession(reason = '') {
  voiceSessionActive = false;
  voiceState = 'DORMANT';
  if (sessionWatchdogTimer) {
    clearTimeout(sessionWatchdogTimer);
    sessionWatchdogTimer = null;
    console.log('[AIVA WATCHDOG] cancelled');
  }
  if (reason) {
    console.log(`[AIVA PIPELINE] Voice session reset: ${reason}`);
  }
  console.log('[AIVA PIPELINE] Voice session finished');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-voice-state', { state: 'DORMANT' });
  }
}

// Determine if we're in development mode
const isDev = !app.isPackaged;

// Ensure audio can play without requiring prior user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// 1. Local Whisper Speech-to-Text Engine Spawner
function startWhisperSTT() {
  const scriptPath = path.join(__dirname, 'whisper-service.py');
  if (!fs.existsSync(scriptPath)) {
    console.warn('[AIVA LOCAL WHISPER] whisper-service.py not found:', scriptPath);
    return;
  }

  const pythonExec = fs.existsSync('C:\\Python312\\python.exe')
    ? 'C:\\Python312\\python.exe'
    : 'python';

  console.log('[AIVA LOCAL WHISPER] Initializing local Whisper STT daemon...');
  whisperProcess = spawn(pythonExec, ['-u', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  whisperProcess.stdout.on('data', (data) => {
    const raw = data.toString().trim();
    if (!raw) return;

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'ready') {
          isWhisperReady = true;
          console.log(
            `[AIVA LOCAL WHISPER] Engine ready: model=${parsed.model}, device=${parsed.device}, compute=${parsed.compute_type}`
          );
        } else if (parsed.type === 'stt_recording_started') {
          voiceState = 'RECORDING_COMMAND';
          console.log(`[AIVA LATENCY] recording_started: ${parsed.recordingStartedMs || Date.now()}`);
          console.log('[AIVA PIPELINE] Recording started');
          console.log('[AIVA STT] Recording command audio...');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-voice-state', { state: 'LISTENING' });
          }
        } else if (parsed.type === 'stt_recording_stopped') {
          console.log(`[AIVA LATENCY] speech_detected: ${parsed.speechDetectedMs || 'none'}`);
          console.log(`[AIVA LATENCY] speech_ended: ${parsed.speechEndedMs || Date.now()}`);
          console.log(`[AIVA LATENCY] recording_finalized: ${parsed.recordingFinalizedMs || Date.now()}`);
          console.log('[AIVA PIPELINE] Recording finished');
          console.log(`[AIVA PIPELINE] Speech detected: ${Boolean(parsed.hasSpoken)}`);
          console.log(
            `[AIVA STT] Recording stopped. Duration: ${parsed.duration}s (speech: ${parsed.hasSpoken})`
          );
        } else if (parsed.type === 'no_speech') {
          console.log('[AIVA STT] No speech detected — discarding command audio.');
          resetVoiceSession('no speech detected');
        } else if (parsed.type === 'stt_transcribing') {
          voiceState = 'TRANSCRIBING';
          console.log(`[AIVA LATENCY] whisper_started: ${parsed.whisperStartedMs || Date.now()}`);
          console.log('[AIVA STT] Transcribing audio with local Whisper...');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-voice-state', { state: 'THINKING' });
          }
        } else if (parsed.type === 'transcript') {
          console.log(`[AIVA LATENCY] whisper_completed: ${parsed.whisperCompletedMs || Date.now()}`);
          console.log(`[AIVA PIPELINE] Whisper transcript: "${parsed.text}"`);
          console.log(
            `[AIVA STT] Transcript: "${parsed.text}" (latency: ${parsed.latency}s, duration: ${parsed.duration}s)`
          );
          if (!parsed.text || !parsed.text.trim()) {
            console.log('[AIVA STT] Empty transcript — returning to DORMANT.');
            resetVoiceSession('empty transcript');
          } else {
            voiceState = 'COMMAND_RECEIVED';
            if (sessionWatchdogTimer) {
              clearTimeout(sessionWatchdogTimer);
              sessionWatchdogTimer = null;
              console.log('[AIVA WATCHDOG] cancelled');
            }
            console.log(`[AIVA PIPELINE] Dispatching transcript to renderer: "${parsed.text}"`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('desktop-voice-transcript', {
                text: parsed.text,
                confidence: parsed.confidence || 0.98,
                isFinal: true,
                isWake: false,
                recordingStartedMs: parsed.recordingStartedMs,
                speechDetectedMs: parsed.speechDetectedMs,
                speechEndedMs: parsed.speechEndedMs,
                recordingFinalizedMs: parsed.recordingFinalizedMs,
                whisperStartedMs: parsed.whisperStartedMs,
                whisperCompletedMs: parsed.whisperCompletedMs,
                whisperLatency: parsed.latency,
              });
            }
          }
        } else if (parsed.type === 'error') {
          console.warn('[AIVA STT] Whisper engine error:', parsed.message);
          resetVoiceSession('whisper engine error');
        }
      } catch (_) {}
    }
  });

  whisperProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(msg);
  });

  whisperProcess.on('close', (code) => {
    console.log(`[AIVA LOCAL WHISPER] Process exited with code ${code}`);
    whisperProcess = null;
    isWhisperReady = false;
    resetVoiceSession('whisper process exited');
    if (!app.isQuitting) {
      setTimeout(startWhisperSTT, 3000);
    }
  });
}

// 2. Native Windows Speech Recognition Service Spawner (Wake-Word Spotter)
function startSpeechRecognition() {
  const scriptPath = path.join(__dirname, 'speech-listener.ps1');
  if (!fs.existsSync(scriptPath)) {
    console.warn('[AIVA DESKTOP VOICE] Speech listener script not found:', scriptPath);
    return;
  }

  console.log('[AIVA DESKTOP VOICE] Initializing native Windows wake-word listener...');
  speechProcess = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
  ]);

  speechProcess.stdout.on('data', (data) => {
    const raw = data.toString().trim();
    if (!raw) return;

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'ready') {
          console.log('[AIVA DESKTOP VOICE] Native wake-word listener ready:', parsed.status);
        } else if (parsed.type === 'wake') {
          // Requirement 1: WAKE-WORD LOCK - Ignore additional wake-words while session is active
          if (voiceSessionActive) {
            console.log(
              `[AIVA PIPELINE] Wake word "${parsed.text}" ignored — voice session already active (${voiceState})`
            );
            continue;
          }

          const wakeIpcMs = Date.now();
          const audioDetectedMs = parsed.audioDetectedMs || parsed.confirmedMs || wakeIpcMs;
          const confirmedMs = parsed.confirmedMs || wakeIpcMs;
          const totalWakeLatency = wakeIpcMs - audioDetectedMs;

          console.log(`[AIVA WAKE]\nlatency=${totalWakeLatency}ms`);
          console.log(`[AIVA LATENCY] wake_audio_detected: ${audioDetectedMs}`);
          console.log(`[AIVA LATENCY] wake_word_confirmed: ${confirmedMs}`);
          console.log(`[AIVA LATENCY] wake_ipc_received: ${wakeIpcMs}`);
          console.log(`[AIVA LATENCY] total_wake_latency: ${totalWakeLatency}ms`);

          voiceSessionActive = true;
          voiceState = 'LISTENING';
          console.log('[AIVA PIPELINE] Wake word accepted');
          console.log('[AIVA PIPELINE] Voice session started');
          console.log(
            `[AIVA DESKTOP VOICE] Wake word detected: "${parsed.text}" (confidence: ${parsed.confidence})`
          );

          // Arm safety watchdog timer (state-aware: only aborts stalled recording/listening)
          if (sessionWatchdogTimer) {
            clearTimeout(sessionWatchdogTimer);
            sessionWatchdogTimer = null;
            console.log('[AIVA WATCHDOG] cancelled');
          }
          console.log('[AIVA WATCHDOG] created');
          sessionWatchdogTimer = setTimeout(() => {
            if (voiceSessionActive) {
              if (voiceState === 'THINKING' || voiceState === 'EXECUTING' || voiceState === 'SPEAKING' || voiceState === 'COMMAND_RECEIVED') {
                console.log(`[AIVA WATCHDOG] ignored_due_to_state (${voiceState})`);
                return;
              }
              console.warn(`[AIVA WATCHDOG] fired (${voiceState}) — resetting to DORMANT`);
              resetVoiceSession('watchdog timeout');
            }
          }, 30000);

          // 1. Wake up the AIVA presence immediately in renderer (shows face, plays chime, enters LISTENING)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-voice-state', { state: 'LISTENING' });
            mainWindow.webContents.send('desktop-voice-transcript', {
              text: 'AIVA',
              confidence: parsed.confidence || 1.0,
              isFinal: true,
              isWake: true,
              audioDetectedMs,
              confirmedMs,
              wakeIpcMs,
            });
          }

          // 2. Trigger local Whisper recording & transcription
          if (whisperProcess && whisperProcess.stdin.writable) {
            whisperProcess.stdin.write(JSON.stringify({ command: 'record_and_transcribe' }) + '\n');
          }
        } else if (parsed.type === 'error') {
          console.warn('[AIVA DESKTOP VOICE] Recognition engine error:', parsed.message);
        }
      } catch (_) {
        // Non-JSON logging
      }
    }
  });

  speechProcess.stderr.on('data', (data) => {
    console.warn('[AIVA DESKTOP VOICE] stderr:', data.toString().trim());
  });

  speechProcess.on('close', (code) => {
    console.log(`[AIVA DESKTOP VOICE] Process exited with code ${code}`);
    speechProcess = null;
    if (!app.isQuitting) {
      setTimeout(startSpeechRecognition, 2000);
    }
  });
}

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

// Create main window as a transparent desktop overlay
function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(width, 1600),
    height: Math.min(height, 1000),
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    title: 'AIVA - Personal AI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: !process.argv.includes('--hidden'), // Start hidden if launched on Windows boot
  });

  // Grant microphone & media permissions to renderer
  if (mainWindow.webContents.session) {
    mainWindow.webContents.session.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        if (permission === 'media') return callback(true);
        callback(true);
      }
    );
    mainWindow.webContents.session.setPermissionCheckHandler(() => true);
  }

  // Forward renderer console logs to Electron terminal for diagnostics
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[RENDERER FAIL LOAD] ${errorCode}: ${errorDescription} (${validatedURL})`);
  });

  // In dev mode, load the Next.js web app (default port 3000 or custom AIVA_URL); in production, load built renderer
  const devUrl = process.env.AIVA_URL || 'http://localhost:3000';
  if (isDev) {
    console.log(`[AIVA Desktop] Loading development URL: ${devUrl}`);
    mainWindow.loadURL(devUrl).catch((err) => {
      console.warn(`[AIVA Desktop] Could not connect to ${devUrl}, fallback to built renderer:`, err.message);
      mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  // Initialize in IDLE_OVERLAY mode: click-through transparent desktop assistant
  mainWindow.webContents.on('did-finish-load', async () => {
    console.log('[RENDERER FINISH LOAD] WebContents loaded successfully');
    await mainWindow.webContents.executeJavaScript('console.log("HELLO FROM INSIDE WEBCONTENTS CONSOLE LOG!")');
    try {
      const hasAPI = await mainWindow.webContents.executeJavaScript('Boolean(window.electronAPI)');
      console.log('[RENDERER DIAGNOSTIC] window.electronAPI exists:', hasAPI);
      const htmlClass = await mainWindow.webContents.executeJavaScript('document.documentElement.className');
      const bodyClass = await mainWindow.webContents.executeJavaScript('document.body.className');
      const bodyBg = await mainWindow.webContents.executeJavaScript('window.getComputedStyle(document.body).backgroundColor');
      const htmlBg = await mainWindow.webContents.executeJavaScript('window.getComputedStyle(document.documentElement).backgroundColor');
      console.log(`[RENDERER DIAGNOSTIC] html class: "${htmlClass}" (bg: ${htmlBg})`);
      console.log(`[RENDERER DIAGNOSTIC] body class: "${bodyClass}" (bg: ${bodyBg})`);
      const faceEl = await mainWindow.webContents.executeJavaScript('Boolean(document.querySelector("[aria-label*=\'AIVA\']"))');
      console.log('[RENDERER DIAGNOSTIC] AivaFace element in DOM:', faceEl);

      let attempts = 0;
      const pollAcceptance = setInterval(async () => {
        attempts++;
        if (!mainWindow || mainWindow.isDestroyed() || attempts > 20) {
          clearInterval(pollAcceptance);
          return;
        }
        try {
          const acceptance = await mainWindow.webContents.executeJavaScript(
            'window.__aivaEngine?.getAcceptanceStatus ? window.__aivaEngine.getAcceptanceStatus() : null'
          );
          if (acceptance) {
            console.log(
              `[AIVA ACCEPTANCE]\nbridge_count=${acceptance.bridge_count}\nvoice_listener_count=${acceptance.voice_listener_count}\naudio_owner_count=${acceptance.audio_owner_count}\nactive_request_id=${acceptance.active_request_id}`
            );
            clearInterval(pollAcceptance);
          }
        } catch (_) {}
      }, 1000);

      if (process.argv.includes('--test-intelligence-voice')) {
        console.log('[AIVA TEST RUNNER] --test-intelligence-voice flag detected. Scheduling real pipeline tests...');
        setTimeout(async () => {
          try {
            console.log('[AIVA TEST RUNNER] === TEST 1: Cold start voice query ("What is the capital of India?") ===');
            const wakeIpcMs = Date.now();
            mainWindow.webContents.send('desktop-voice-transcript', {
              text: 'AIVA',
              confidence: 0.99,
              isFinal: true,
              isWake: true,
              audioDetectedMs: wakeIpcMs,
              wakeIpcMs,
            });

            await new Promise((r) => setTimeout(r, 800));

            const recordingStartedMs = Date.now();
            const whisperCompletedMs = Date.now() + 1100;
            mainWindow.webContents.send('desktop-voice-transcript', {
              text: 'What is the capital of India?',
              confidence: 0.99,
              isFinal: true,
              isWake: false,
              recordingStartedMs,
              speechDetectedMs: recordingStartedMs + 100,
              speechEndedMs: recordingStartedMs + 900,
              recordingFinalizedMs: recordingStartedMs + 950,
              whisperStartedMs: recordingStartedMs + 960,
              whisperCompletedMs,
              whisperLatency: 0.14,
            });

            // Wait 12 seconds for query, TTS and playback to finish
            await new Promise((r) => setTimeout(r, 12000));

            console.log('[AIVA TEST RUNNER] === TEST 2: Warm voice query ("What is the capital of India?") ===');
            const warmStart = Date.now();
            mainWindow.webContents.send('desktop-voice-transcript', {
              text: 'What is the capital of India?',
              confidence: 0.99,
              isFinal: true,
              isWake: false,
              recordingStartedMs: warmStart,
              whisperStartedMs: warmStart + 800,
              whisperCompletedMs: warmStart + 900,
              whisperLatency: 0.1,
            });

            await new Promise((r) => setTimeout(r, 10000));

            console.log('[AIVA TEST RUNNER] === TEST 3: Query tasks ("What are my tasks?") ===');
            mainWindow.webContents.send('desktop-voice-transcript', {
              text: 'What are my tasks?',
              confidence: 0.99,
              isFinal: true,
              isWake: false,
            });

            await new Promise((r) => setTimeout(r, 10000));

            console.log('[AIVA TEST RUNNER] === TEST 4: Create task ("Create a task called test intelligence connection") ===');
            mainWindow.webContents.send('desktop-voice-transcript', {
              text: 'Create a task called test intelligence connection',
              confidence: 0.99,
              isFinal: true,
              isWake: false,
            });

            await new Promise((r) => setTimeout(r, 12000));
            console.log('[AIVA TEST RUNNER] === ALL TESTS COMPLETED IN RUNNING ELECTRON RENDERER ===');
          } catch (testErr) {
            console.error('[AIVA TEST RUNNER ERROR]:', testErr);
          }
        }, 4000);
      }
    } catch (err) {
      console.error('[RENDERER DIAGNOSTIC ERROR]:', err.message);
    }
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  });


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
  startWhisperSTT();
  startSpeechRecognition();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (speechProcess) {
    try {
      speechProcess.kill();
    } catch (_) {}
  }
  if (whisperProcess) {
    try {
      whisperProcess.kill();
    } catch (_) {}
  }
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

ipcMain.handle('set-ignore-mouse-events', (_event, ignore, options) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
  }
});

// Dual-mode desktop overlay coordinator
ipcMain.handle('set-desktop-overlay-mode', (_event, mode) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mode === 'IDLE_OVERLAY') {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
    }
  }
});

// Synchronize voice lifecycle state from renderer
ipcMain.handle('set-voice-session-state', (_event, state) => {
  voiceState = state;
  console.log(`[AIVA PIPELINE] Presence state: ${state}`);
  if (state === 'THINKING' || state === 'EXECUTING' || state === 'SPEAKING' || state === 'ACTIVE') {
    // State-aware protection: clear watchdog so intelligence/TTS request owns the lifecycle
    if (sessionWatchdogTimer) {
      clearTimeout(sessionWatchdogTimer);
      sessionWatchdogTimer = null;
      console.log('[AIVA WATCHDOG] cancelled');
    }
  } else if (state === 'DORMANT') {
    voiceSessionActive = false;
    if (sessionWatchdogTimer) {
      clearTimeout(sessionWatchdogTimer);
      sessionWatchdogTimer = null;
      console.log('[AIVA WATCHDOG] cancelled');
    }
    console.log('[AIVA PIPELINE] Voice session finished');
  }
});

