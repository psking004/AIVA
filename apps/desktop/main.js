/**
 * AIVA Desktop Application - Electron Main Process
 * Unified Production Desktop Client for PC-A & PC-B
 *
 * Implements:
 * 1. Dynamic Hardware Discovery (RTX 3050 CUDA AI_POWER_NODE vs Intel CPU_LOCAL_NODE)
 * 2. Ollama Local Model Auto-Discovery
 * 3. Persistent Device Identity & Secure Local Token Storage
 * 4. Automatic Device Registration & Fabric Node Registration
 * 5. Resilient Heartbeat Loop with Auto-Recovery
 * 6. Background Worker Service (executes local Ollama inference, polls & completes tasks)
 * 7. System Tray Integration (window closes to tray, worker stays alive in background)
 * 8. Auto-Start on Windows Boot (via LoginItemSettings)
 * 9. Local Diagnostic Logging with Token Redaction
 * 10. Voice Wake-Word & STT Bridge (optional local modules)
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// Determine paths & persistence directories
const USER_DATA_DIR = path.join(app.getPath('userData') || path.join(process.env.APPDATA || os.homedir(), 'AIVA'));
const LOG_DIR = path.join(USER_DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'aiva-desktop.log');
const IDENTITY_FILE = path.join(USER_DATA_DIR, 'device_identity.json');
const TOKEN_FILE = path.join(USER_DATA_DIR, 'tokens.json');

// Workspace root fallbacks (for development or pre-existing credentials)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const FALLBACK_PC_B_IDENTITY = path.join(WORKSPACE_ROOT, '.aiva_pc_b_identity.json');
const FALLBACK_PC_A_IDENTITY = path.join(WORKSPACE_ROOT, '.aiva_node_identity.json');
const FALLBACK_TOKENS = path.join(WORKSPACE_ROOT, '.aiva_pc_b_tokens.json');

// Ensure directories exist
if (!fs.existsSync(USER_DATA_DIR)) {
  try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
}

// Global logger with strict token redaction
function logEvent(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let dataStr = '';
  if (data) {
    try {
      const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
        if (/token|password|secret|authorization/i.test(key) && typeof value === 'string') {
          return value.slice(0, 8) + '...[REDACTED]';
        }
        return value;
      }));
      dataStr = ' ' + JSON.stringify(sanitized);
    } catch (_) {
      dataStr = ' [Data serialization error]';
    }
  }
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
  console.log(line);

  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {}

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-log-entry', {
      timestamp,
      level,
      message,
      data,
    });
  }
}

// Configuration
const BACKEND_URL = process.env.AIVA_BACKEND_URL || 'https://aiva-yitg.onrender.com';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

let mainWindow = null;
let tray = null;
app.isQuitting = false;

// Active state
let hardwareInfo = null;
let deviceIdentity = null;
let authTokens = null;
let isFabricOnline = false;
let lastHeartbeatTime = null;
let heartbeatIntervalTimer = null;
let workerPollingActive = false;
let workerIntervalTimer = null;
let workerStats = {
  tasksAssigned: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  lastTaskLatencyMs: 0,
  lastCompletedRequestId: null,
};

// Voice state variables & daemons
let speechProcess = null;
let whisperProcess = null;
let kokoroProcess = null;
let isWhisperReady = false;
let isKokoroReady = false;
let voiceSessionActive = false;
let voiceState = 'DORMANT';
let sessionWatchdogTimer = null;

function resetVoiceSession(reason = '') {
  voiceSessionActive = false;
  voiceState = 'DORMANT';
  if (sessionWatchdogTimer) {
    clearTimeout(sessionWatchdogTimer);
    sessionWatchdogTimer = null;
  }
  if (reason) {
    logEvent('info', `Voice session reset: ${reason}`);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-voice-state', { state: 'DORMANT' });
  }
}

// 1. DYNAMIC HARDWARE & CAPABILITY DETECTION (NO HARDCODED HOSTNAMES)
function detectHardware() {
  const totalRamGb = Number((os.totalmem() / (1024 ** 3)).toFixed(2));
  const freeRamGb = Number((os.freemem() / (1024 ** 3)).toFixed(2));
  const cpus = os.cpus();
  let gpuName = 'Intel Iris Xe Graphics';
  let hasCuda = false;
  let vramGb = 0;

  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json"',
      { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString();
    const parsed = JSON.parse(out);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const name = item.Name || '';
      if (/NVIDIA|GeForce|RTX/i.test(name)) {
        hasCuda = true;
        gpuName = name;
        const ram = Number(item.AdapterRAM) || 0;
        vramGb = ram > 0 ? Number((ram / (1024 ** 3)).toFixed(1)) : 8;
        break;
      } else if (name && gpuName === 'Intel Iris Xe Graphics') {
        gpuName = name;
      }
    }
  } catch (e) {
    logEvent('warn', 'GPU CimInstance query warning: ' + e.message);
  }

  const role = hasCuda ? 'AI_POWER_NODE' : 'CPU_LOCAL_NODE';
  const capabilities = hasCuda
    ? ['LOCAL_LLM', 'GPU_INFERENCE', 'CUDA', 'REMOTE_CODING', 'GENERAL_COMPUTE']
    : ['LOCAL_LLM', 'CPU_INFERENCE', 'REMOTE_CODING', 'GENERAL_COMPUTE'];

  return {
    hostname: os.hostname(),
    nodeRole: role,
    capabilities,
    cpu: {
      model: cpus[0]?.model || 'Intel Core i5',
      cores: cpus.length,
      utilizationPercent: 0,
    },
    memory: {
      totalGb: totalRamGb,
      availableGb: freeRamGb,
      ramUsedGb: Number((totalRamGb - freeRamGb).toFixed(2)),
    },
    gpu: {
      available: hasCuda,
      hasCuda,
      vendor: hasCuda ? 'NVIDIA' : 'Intel',
      model: gpuName,
      deviceName: gpuName,
      vramGb,
      vramMb: Math.round(vramGb * 1024),
      utilizationPercent: 0,
    },
  };
}

// Probe local Ollama for installed models
async function detectOllamaModels() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
      logEvent('info', `Local Ollama detected at ${OLLAMA_BASE_URL} with models:`, models);
      return models;
    }
  } catch (err) {
    logEvent('warn', `Ollama not reachable at ${OLLAMA_BASE_URL}: ${err.message}`);
  }
  return [];
}

// 2. DEVICE IDENTITY MANAGEMENT
function loadOrCreateDeviceIdentity(hardware) {
  // Check persistent user data path first
  if (fs.existsSync(IDENTITY_FILE)) {
    try {
      const id = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
      logEvent('info', 'Loaded persistent AIVA device identity from AppData', { deviceId: id.device_id, nodeId: id.node_id });
      return id;
    } catch (_) {}
  }

  // Check workspace fallback files
  if (hardware.nodeRole === 'CPU_LOCAL_NODE' && fs.existsSync(FALLBACK_PC_B_IDENTITY)) {
    try {
      const id = JSON.parse(fs.readFileSync(FALLBACK_PC_B_IDENTITY, 'utf8'));
      fs.writeFileSync(IDENTITY_FILE, JSON.stringify(id, null, 2), 'utf8');
      logEvent('info', 'Imported PC-B identity into AppData', { deviceId: id.device_id, nodeId: id.node_id });
      return id;
    } catch (_) {}
  }

  if (hardware.nodeRole === 'AI_POWER_NODE' && fs.existsSync(FALLBACK_PC_A_IDENTITY)) {
    try {
      const id = JSON.parse(fs.readFileSync(FALLBACK_PC_A_IDENTITY, 'utf8'));
      fs.writeFileSync(IDENTITY_FILE, JSON.stringify(id, null, 2), 'utf8');
      logEvent('info', 'Imported PC-A identity into AppData', { deviceId: id.device_id, nodeId: id.node_id });
      return id;
    } catch (_) {}
  }

  // Generate clean persistent identity
  const hex = crypto.randomBytes(6).toString('hex');
  const defaultNodeId = hardware.nodeRole === 'AI_POWER_NODE' ? 'PC-A' : 'PC-B';
  const newIdentity = {
    device_id: `device_win_${hex}`,
    node_id: defaultNodeId,
    node_role: hardware.nodeRole,
    hostname: hardware.hostname,
    created_at: Math.floor(Date.now() / 1000),
  };

  try {
    fs.writeFileSync(IDENTITY_FILE, JSON.stringify(newIdentity, null, 2), 'utf8');
    logEvent('info', 'Created new persistent AIVA device identity', { deviceId: newIdentity.device_id, nodeId: newIdentity.node_id });
  } catch (err) {
    logEvent('error', 'Failed to save identity file: ' + err.message);
  }

  return newIdentity;
}

// 3. SECURE LOCAL TOKEN STORAGE
function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch (_) {}
  }
  if (fs.existsSync(FALLBACK_TOKENS)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(FALLBACK_TOKENS, 'utf8'));
      saveTokens(tokens);
      return tokens;
    } catch (_) {}
  }
  return null;
}

function saveTokens(tokens) {
  authTokens = tokens;
  try {
    fs.writeFileSync(
      TOKEN_FILE,
      JSON.stringify(
        {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          savedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
    logEvent('info', 'AIVA credentials securely persisted to AppData');
  } catch (err) {
    logEvent('error', 'Failed to write token file: ' + err.message);
  }
}

// 4. BACKEND API CLIENT WITH AUTO-REFRESH
async function apiRequest(endpoint, options = {}) {
  const url = `${BACKEND_URL.replace(/\/$/, '')}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'x-device-id': deviceIdentity ? deviceIdentity.device_id : 'device_win_client',
    'x-client-platform': 'windows',
    ...(options.headers || {}),
  };

  if (authTokens?.accessToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${authTokens.accessToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }

  // Handle Token Refresh on 401
  if (res.status === 401 && authTokens?.refreshToken && !options._isRetry) {
    logEvent('warn', 'Access token expired. Refreshing token...');
    const refreshed = await refreshToken();
    if (refreshed) {
      return apiRequest(endpoint, { ...options, _isRetry: true });
    }
  }

  if (!res.ok) {
    const errorMsg = body?.message || body?.error || `HTTP ${res.status}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

async function refreshToken() {
  if (!authTokens?.refreshToken) return false;
  try {
    const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceIdentity.device_id,
        'x-client-platform': 'windows',
      },
      body: JSON.stringify({ refreshToken: authTokens.refreshToken }),
    });
    if (res.ok) {
      const data = await res.json();
      saveTokens(data);
      logEvent('info', 'Access token refreshed successfully');
      return true;
    }
  } catch (err) {
    logEvent('error', 'Token refresh failed: ' + err.message);
  }
  return false;
}

// 5. FABRIC REGISTRATION & HEARTBEAT
async function registerDeviceAndFabric() {
  if (!authTokens?.accessToken) {
    logEvent('warn', 'Cannot register fabric node: Owner authentication required');
    return false;
  }

  try {
    // 1. Authorize device
    try {
      await apiRequest('/auth/devices/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: deviceIdentity.device_id,
          deviceName: deviceIdentity.hostname || os.hostname(),
          platform: 'windows',
        }),
      });
      logEvent('info', 'Windows device registration confirmed on backend');
    } catch (e) {
      if (e.status === 409 || e.status === 400) {
        logEvent('info', 'Windows device already registered');
      } else {
        throw e;
      }
    }

    // 2. Discover local models
    const localModels = await detectOllamaModels();
    const effectiveModels = localModels.length > 0
      ? localModels
      : (hardwareInfo.nodeRole === 'AI_POWER_NODE' ? ['qwen3.5:latest'] : ['qwen3:4b']);

    // 3. Register Compute Node with Fabric
    const totalRamGb = hardwareInfo.memory.totalGb;
    const freeRamGb = hardwareInfo.memory.availableGb;

    const payload = {
      deviceId: deviceIdentity.device_id,
      deviceName: deviceIdentity.hostname || os.hostname(),
      nodeId: deviceIdentity.node_id,
      nodeRole: hardwareInfo.nodeRole,
      cpu: hardwareInfo.cpu,
      memory: {
        totalGb: totalRamGb,
        availableGb: freeRamGb,
        ramUsedGb: Number((totalRamGb - freeRamGb).toFixed(2)),
      },
      gpu: hardwareInfo.gpu,
      models: effectiveModels,
      ttsEngines: [],
      capabilities: hardwareInfo.capabilities,
      status: 'ONLINE',
      activeWorkloadCount: 0,
      pluggedIn: true,
    };

    await apiRequest('/ai/fabric/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    isFabricOnline = true;
    lastHeartbeatTime = Date.now();
    logEvent('info', `Node ${deviceIdentity.node_id} successfully registered with AIVA Fabric`, {
      role: hardwareInfo.nodeRole,
      models: effectiveModels,
    });

    broadcastFabricStatus();
    startHeartbeatTimer();
    startWorkerService();
    return true;
  } catch (err) {
    isFabricOnline = false;
    logEvent('error', 'Fabric registration error: ' + err.message);
    broadcastFabricStatus();
    return false;
  }
}

// Heartbeat Loop (every 15s)
function startHeartbeatTimer() {
  if (heartbeatIntervalTimer) clearInterval(heartbeatIntervalTimer);

  heartbeatIntervalTimer = setInterval(async () => {
    if (!authTokens?.accessToken || !deviceIdentity) return;
    try {
      await apiRequest('/ai/fabric/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ deviceId: deviceIdentity.device_id }),
      });
      isFabricOnline = true;
      lastHeartbeatTime = Date.now();
      broadcastFabricStatus();
    } catch (err) {
      logEvent('warn', 'Heartbeat missed: ' + err.message + '. Re-registering node...');
      isFabricOnline = false;
      broadcastFabricStatus();
      registerDeviceAndFabric().catch(() => {});
    }
  }, 15000);
}

// 6. BACKGROUND WORKER SERVICE (POLLS & EXECUTES LOCAL INFERENCE)
function startWorkerService() {
  if (workerIntervalTimer) clearInterval(workerIntervalTimer);

  workerIntervalTimer = setInterval(async () => {
    if (workerPollingActive || !authTokens?.accessToken || !deviceIdentity) return;

    workerPollingActive = true;
    try {
      const pollRes = await apiRequest('/ai/fabric/work/poll', {
        method: 'POST',
        body: JSON.stringify({ nodeId: deviceIdentity.node_id }),
      });

      const work = pollRes?.work;
      if (work && work.requestId) {
        workerStats.tasksAssigned++;
        logEvent('info', `[WORKER] Assigned work item ${work.requestId} (${work.type}/${work.capability})`);

        try {
          const startedAt = Date.now();
          const execution = await executeOllamaInference(work);
          const latencyMs = Date.now() - startedAt;

          await apiRequest('/ai/fabric/work/complete', {
            method: 'POST',
            body: JSON.stringify({
              requestId: work.requestId,
              result: {
                content: execution.content,
                model: execution.model,
                provider: 'ollama',
                target: deviceIdentity.node_id,
                latencyMs,
              },
            }),
          });

          workerStats.tasksCompleted++;
          workerStats.lastTaskLatencyMs = latencyMs;
          workerStats.lastCompletedRequestId = work.requestId;
          logEvent('info', `[WORKER] Completed task ${work.requestId} in ${latencyMs}ms`);
          broadcastFabricStatus();
        } catch (workErr) {
          workerStats.tasksFailed++;
          logEvent('error', `[WORKER] Failed execution for ${work.requestId}: ${workErr.message}`);
          broadcastFabricStatus();
        }
      }
    } catch (err) {
      // Poll errors handled gracefully
    } finally {
      workerPollingActive = false;
    }
  }, 2500);
}

// Execute assigned work item on local Ollama
async function executeOllamaInference(work) {
  const model = work.payload?.model || (hardwareInfo.nodeRole === 'AI_POWER_NODE' ? 'qwen3.5:latest' : 'qwen3:4b');
  const messages = Array.isArray(work.payload?.messages) ? work.payload.messages : [];
  const temperature = typeof work.payload?.temperature === 'number' ? work.payload.temperature : 0.2;
  // Bound maxTokens for CPU nodes to prevent long turnaround
  const maxTokens = hardwareInfo.nodeRole === 'CPU_LOCAL_NODE'
    ? Math.min(work.payload?.maxTokens || 256, 256)
    : (work.payload?.maxTokens || 2048);

  const res = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${errorText.slice(0, 500)}`);
  }

  const data = await res.json();
  const content =
    (data?.message?.content && data.message.content.trim().length > 0)
      ? data.message.content.trim()
      : (data?.message?.thinking?.trim() || data?.response?.trim() || '');

  if (!content) {
    throw new Error('Ollama returned an empty response');
  }

  return {
    content,
    model: data?.model || model,
  };
}

// Broadcast fabric status to renderer
function broadcastFabricStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-fabric-state', getFabricStatusPayload());
  }
}

function getFabricStatusPayload() {
  return {
    isOnline: isFabricOnline,
    backendUrl: BACKEND_URL,
    lastHeartbeatTime,
    deviceIdentity,
    hardwareInfo,
    workerStats,
    isAuthenticated: Boolean(authTokens?.accessToken),
  };
}

// Helper to locate unpacked script files in both dev and packaged .asar
function getScriptPath(filename) {
  // 1. Unpacked ASAR path (packaged production)
  const unpackedPath = path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), filename);
  if (fs.existsSync(unpackedPath)) return unpackedPath;

  // 2. Resources app.asar.unpacked
  if (process.resourcesPath) {
    const resUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked', filename);
    if (fs.existsSync(resUnpacked)) return resUnpacked;
    const directRes = path.join(process.resourcesPath, filename);
    if (fs.existsSync(directRes)) return directRes;
  }

  // 3. Current dirname (dev mode)
  const dirPath = path.join(__dirname, filename);
  if (fs.existsSync(dirPath)) return dirPath;

  // 4. Workspace desktop root
  const wsPath = path.join(WORKSPACE_ROOT, 'apps', 'desktop', filename);
  if (fs.existsSync(wsPath)) return wsPath;

  return dirPath;
}

// 6b. VOICE SUBSYSTEMS (NATIVE WAKE-WORD, WHISPER STT, KOKORO TTS)
function startSpeechRecognition() {
  const scriptPath = getScriptPath('speech-listener.ps1');
  if (!fs.existsSync(scriptPath)) {
    logEvent('warn', 'Speech listener script not found: ' + scriptPath);
    return;
  }

  logEvent('info', 'Initializing native Windows wake-word listener (AIVA)...');
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
          logEvent('info', 'Native wake-word listener ready: ' + parsed.status);
        } else if (parsed.type === 'wake') {
          if (voiceState === 'RECORDING_COMMAND' || voiceState === 'TRANSCRIBING') {
            continue;
          }

          const wakeIpcMs = Date.now();
          const audioDetectedMs = parsed.audioDetectedMs || parsed.confirmedMs || wakeIpcMs;
          const confirmedMs = parsed.confirmedMs || wakeIpcMs;
          const totalWakeLatency = wakeIpcMs - audioDetectedMs;

          logEvent('info', `Wake word "AIVA" detected (confidence: ${parsed.confidence}, latency: ${totalWakeLatency}ms)`);

          voiceSessionActive = true;
          voiceState = 'LISTENING';

          if (sessionWatchdogTimer) {
            clearTimeout(sessionWatchdogTimer);
            sessionWatchdogTimer = null;
          }
          sessionWatchdogTimer = setTimeout(() => {
            if (voiceSessionActive && (voiceState === 'LISTENING' || voiceState === 'RECORDING_COMMAND')) {
              logEvent('warn', `Voice watchdog timeout (${voiceState}) — resetting to DORMANT`);
              resetVoiceSession('watchdog timeout');
            }
          }, 30000);

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

          if (whisperProcess && whisperProcess.stdin.writable) {
            whisperProcess.stdin.write(JSON.stringify({ command: 'record_and_transcribe' }) + '\n');
          }
        } else if (parsed.type === 'error') {
          logEvent('warn', 'Speech listener error: ' + parsed.message);
        }
      } catch (_) {}
    }
  });

  speechProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) logEvent('warn', 'Speech listener stderr: ' + msg);
  });

  speechProcess.on('close', (code) => {
    logEvent('info', `Speech listener exited with code ${code}`);
    speechProcess = null;
    if (!app.isQuitting) {
      setTimeout(startSpeechRecognition, 3000);
    }
  });
}

function startWhisperSTT() {
  const scriptPath = getScriptPath('whisper-service.py');
  if (!fs.existsSync(scriptPath)) {
    logEvent('warn', 'whisper-service.py not found: ' + scriptPath);
    return;
  }

  const pythonExec = fs.existsSync('C:\\Python312\\python.exe')
    ? 'C:\\Python312\\python.exe'
    : 'python';

  logEvent('info', 'Initializing local Whisper STT daemon...');
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
          logEvent('info', `Whisper engine ready (model: ${parsed.model}, device: ${parsed.device}, compute: ${parsed.compute_type})`);
        } else if (parsed.type === 'stt_recording_started') {
          voiceState = 'RECORDING_COMMAND';
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-voice-state', { state: 'LISTENING' });
          }
        } else if (parsed.type === 'no_speech') {
          resetVoiceSession('no speech detected');
        } else if (parsed.type === 'stt_transcribing') {
          voiceState = 'TRANSCRIBING';
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('desktop-voice-state', { state: 'THINKING' });
          }
        } else if (parsed.type === 'transcript') {
          logEvent('info', `Whisper transcript: "${parsed.text}"`);
          if (!parsed.text || !parsed.text.trim()) {
            resetVoiceSession('empty transcript');
          } else {
            voiceState = 'COMMAND_RECEIVED';
            if (sessionWatchdogTimer) {
              clearTimeout(sessionWatchdogTimer);
              sessionWatchdogTimer = null;
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('desktop-voice-transcript', {
                text: parsed.text,
                confidence: parsed.confidence || 0.98,
                isFinal: true,
                isWake: false,
                latency: parsed.latency,
              });
            }
          }
        } else if (parsed.type === 'error') {
          logEvent('warn', 'Whisper engine error: ' + parsed.message);
          resetVoiceSession('whisper engine error');
        }
      } catch (_) {}
    }
  });

  whisperProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log('[WHISPER STDERR]', msg);
  });

  whisperProcess.on('close', (code) => {
    logEvent('info', `Whisper process exited with code ${code}`);
    whisperProcess = null;
    isWhisperReady = false;
    resetVoiceSession('whisper process exited');
    if (!app.isQuitting) {
      setTimeout(startWhisperSTT, 5000);
    }
  });
}

function startKokoroTTS() {
  const scriptPath = getScriptPath('kokoro-service.py');
  if (!fs.existsSync(scriptPath)) {
    logEvent('warn', 'kokoro-service.py not found: ' + scriptPath);
    return;
  }

  const pythonExec = fs.existsSync('C:\\Python312\\python.exe')
    ? 'C:\\Python312\\python.exe'
    : 'python';

  logEvent('info', 'Initializing local Kokoro TTS daemon on port 5050...');
  kokoroProcess = spawn(pythonExec, ['-u', scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.resolve(__dirname, '..', '..'),
  });

  kokoroProcess.stdout.on('data', (data) => {
    const raw = data.toString().trim();
    if (raw) {
      if (raw.includes('Kokoro TTS Daemon running')) {
        isKokoroReady = true;
        logEvent('info', 'Kokoro TTS daemon active on http://127.0.0.1:5050');
      }
    }
  });

  kokoroProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log('[KOKORO STDERR]', msg);
  });

  kokoroProcess.on('close', (code) => {
    logEvent('info', `Kokoro process exited with code ${code}`);
    kokoroProcess = null;
    isKokoroReady = false;
    if (!app.isQuitting) {
      setTimeout(startKokoroTTS, 5000);
    }
  });
}

// 7. WINDOW LIFECYCLE & SYSTEM TRAY
function configureAutoStart(enable = true) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden'],
    });
    logEvent('info', `Windows auto-start configured: ${enable}`);
  } catch (err) {
    logEvent('warn', 'Failed to configure auto-start: ' + err.message);
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height, x, y } = primaryDisplay.workArea;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    movable: false,
    focusable: true,
    title: 'AIVA - Holographic Assistant',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: !process.argv.includes('--hidden'),
  });

  // Default to click-through overlay so desktop interaction passes through
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[RENDERER] ${message}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    broadcastFabricStatus();
  });

  const devUrl = process.env.AIVA_URL || 'http://localhost:5173';
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html')).catch((err) => {
      console.warn('Could not load renderer index.html:', err.message);
    });
  }

  // Intercept close: HIDE TO TRAY so background worker and heartbeat continue running!
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: 'AIVA Active in Background',
          content: `AIVA Fabric Node (${deviceIdentity?.node_id || 'PC'}) is active and processing compute work in the background.`,
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else if (fs.existsSync(pngIconPath)) {
    trayIcon = nativeImage.createFromPath(pngIconPath);
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  try {
    tray = new Tray(trayIcon);
  } catch (err) {
    logEvent('warn', 'Could not create system tray: ' + err.message);
    return;
  }

  const updateContextMenu = () => {
    const role = hardwareInfo?.nodeRole || 'COMPUTE_NODE';
    const statusText = isFabricOnline ? `ONLINE (${deviceIdentity?.node_id || 'Node'})` : 'CONNECTING...';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '✦ Wake AIVA (Hologram)',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('desktop-voice-state', { state: 'LISTENING' });
            mainWindow.webContents.send('desktop-voice-transcript', { isWake: true });
          }
        },
      },
      {
        label: 'Dismiss AIVA',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('desktop-voice-state', { state: 'DORMANT' });
          }
        },
      },
      { type: 'separator' },
      {
        label: `AIVA Fabric Node: ${statusText}`,
        enabled: false,
      },
      {
        label: `Role: ${role}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Toggle Diagnostics & Logs',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('toggle-diagnostics');
          }
        },
      },
      {
        label: 'Re-register Node with Fabric',
        click: () => {
          registerDeviceAndFabric();
        },
      },
      {
        label: 'View Local Diagnostics Log',
        click: () => {
          shell.openPath(LOG_FILE);
        },
      },
      { type: 'separator' },
      {
        label: 'Run on Windows Startup',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          configureAutoStart(item.checked);
          updateContextMenu();
        },
      },
      {
        label: 'Hide to System Tray',
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
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('desktop-voice-state', { state: 'LISTENING' });
      mainWindow.webContents.send('desktop-voice-transcript', { isWake: true });
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('desktop-voice-state', { state: 'LISTENING' });
      mainWindow.webContents.send('desktop-voice-transcript', { isWake: true });
    }
  });
}

// 8. IPC HANDLERS
ipcMain.handle('get-fabric-state', () => {
  return getFabricStatusPayload();
});

ipcMain.handle('login-user', async (_event, { email, password }) => {
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        device: {
          deviceId: deviceIdentity.device_id,
          deviceName: deviceIdentity.hostname || os.hostname(),
          platform: 'windows',
        },
      }),
    });

    if (res.accessToken && res.refreshToken) {
      saveTokens(res);
      await registerDeviceAndFabric();
      return { success: true, user: res.user };
    }
    throw new Error('No tokens returned from login');
  } catch (err) {
    logEvent('error', 'Login error: ' + err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('re-register-node', async () => {
  const success = await registerDeviceAndFabric();
  return { success, isOnline: isFabricOnline };
});

ipcMain.handle('send-chat-message', async (_event, { message, conversationId }) => {
  try {
    const res = await apiRequest('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
    });
    return { success: true, data: res };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('test-ollama-ping', async () => {
  try {
    const models = await detectOllamaModels();
    return { online: models.length > 0, models };
  } catch (e) {
    return { online: false, error: e.message };
  }
});

ipcMain.handle('get-diagnostics-logs', () => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.trim().split(/\r?\n/).slice(-150);
      return lines;
    }
  } catch (_) {}
  return [];
});

ipcMain.handle('open-log-folder', () => {
  shell.showItemInFolder(LOG_FILE);
});

// Window & Voice IPC Handlers
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close(); // Triggers close-to-tray
});
ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

// Voice session state & overlay controls
ipcMain.handle('set-voice-session-state', (_event, state) => {
  voiceState = state;
  logEvent('debug', `Presence voice state updated: ${state}`);
  if (state === 'THINKING' || state === 'EXECUTING' || state === 'SPEAKING') {
    if (sessionWatchdogTimer) {
      clearTimeout(sessionWatchdogTimer);
      sessionWatchdogTimer = null;
    }
  } else if (state === 'DORMANT') {
    resetVoiceSession('renderer entered dormant');
  }
});

ipcMain.handle('get-wake-word-status', () => {
  return {
    enabled: true,
    keyword: 'AIVA',
    provider: 'local-first',
    speechActive: Boolean(speechProcess),
    whisperActive: Boolean(whisperProcess && isWhisperReady),
    kokoroActive: Boolean(kokoroProcess && isKokoroReady),
  };
});

ipcMain.handle('set-ignore-mouse-events', (_event, ignore, options) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
  }
});

ipcMain.handle('set-desktop-overlay-mode', (_event, mode) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mode === 'IDLE_OVERLAY') {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      mainWindow.setIgnoreMouseEvents(false);
    }
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// App Lifecycle
app.whenReady().then(async () => {
  logEvent('info', '=== AIVA Desktop Application Starting ===');

  // 1. Detect hardware
  hardwareInfo = detectHardware();
  logEvent('info', `Hardware detected: ${hardwareInfo.cpu.model} (${hardwareInfo.cpu.cores} cores), RAM: ${hardwareInfo.memory.totalGb}GB, GPU: ${hardwareInfo.gpu.model} (CUDA: ${hardwareInfo.gpu.hasCuda})`);
  logEvent('info', `Determined node role: ${hardwareInfo.nodeRole}`);

  // 2. Load persistent identity
  deviceIdentity = loadOrCreateDeviceIdentity(hardwareInfo);

  // 3. Load tokens
  authTokens = loadTokens();
  if (authTokens) {
    logEvent('info', 'Found existing AIVA authorization tokens in local store');
  } else {
    logEvent('warn', 'No stored authorization tokens found. User login required.');
  }

  // 4. Configure auto-start
  configureAutoStart(true);

  // 5. Create UI & Tray
  createWindow();
  createTray();

  // 6. Connect & Register with backend
  if (authTokens?.accessToken) {
    await registerDeviceAndFabric();
  }

  // 7. Start local voice & wake-word daemons
  try {
    startSpeechRecognition();
    startWhisperSTT();
    startKokoroTTS();
  } catch (voiceErr) {
    logEvent('warn', 'Voice daemons initialization notice: ' + voiceErr.message);
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (heartbeatIntervalTimer) clearInterval(heartbeatIntervalTimer);
  if (workerIntervalTimer) clearInterval(workerIntervalTimer);
  if (speechProcess) { try { speechProcess.kill(); } catch (_) {} }
  if (whisperProcess) { try { whisperProcess.kill(); } catch (_) {} }
  if (kokoroProcess) { try { kokoroProcess.kill(); } catch (_) {} }
  logEvent('info', 'AIVA Desktop gracefully shutting down');
});

app.on('window-all-closed', () => {
  // Stay running in system tray
});
