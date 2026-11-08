/// <reference types="vite/client" />

declare module '*.png' {
  const content: string;
  export default content;
}

export interface FabricState {
  isOnline: boolean;
  backendUrl: string;
  lastHeartbeatTime: number | null;
  deviceIdentity: {
    device_id: string;
    node_id: string;
    node_role: string;
    hostname: string;
    created_at: number;
  } | null;
  hardwareInfo: {
    hostname: string;
    nodeRole: string;
    capabilities: string[];
    cpu: {
      model: string;
      cores: number;
      utilizationPercent: number;
    };
    memory: {
      totalGb: number;
      availableGb: number;
      ramUsedGb: number;
    };
    gpu: {
      available: boolean;
      hasCuda: boolean;
      vendor: string;
      model: string;
      deviceName: string;
      vramGb: number;
      vramMb: number;
      utilizationPercent: number;
    };
  } | null;
  workerStats: {
    tasksAssigned: number;
    tasksCompleted: number;
    tasksFailed: number;
    lastTaskLatencyMs: number;
    lastCompletedRequestId: string | null;
  };
  isAuthenticated: boolean;
}

export interface IElectronAPI {
  getFabricState: () => Promise<FabricState>;
  onFabricUpdate: (callback: (state: FabricState) => void) => () => void;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; user?: any; error?: string }>;
  reRegisterNode: () => Promise<{ success: boolean; isOnline: boolean }>;
  sendChatMessage: (message: string, conversationId?: string, turnId?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  testOllamaPing: () => Promise<{ online: boolean; models?: string[]; error?: string }>;
  getDiagnosticsLogs: () => Promise<string[]>;
  openLogFolder: () => Promise<void>;
  onLogEntry: (callback: (entry: any) => void) => () => void;
  speechWake?: () => Promise<{ status: string }>;
  speechSttChunk?: (chunk: any) => Promise<{ queued: boolean; reason?: string }>;
  speechTtsSpeak?: (text: string) => Promise<{ success: boolean; size?: number; buffer?: string; error?: string }>;
  voiceBargeIn?: () => Promise<{ interrupted: boolean }>;
  onWakeDetected?: (callback: (data: { type: string; keyword: string }) => void) => () => void;
  startWakeListener?: () => Promise<{ active: boolean }>;
  stopWakeListener?: () => Promise<{ active: boolean }>;
  startWhisper?: () => Promise<{ active: boolean }>;
  stopWhisper?: () => Promise<{ active: boolean }>;
  startKokoro?: () => Promise<{ active: boolean }>;
  stopKokoro?: () => Promise<{ active: boolean }>;
  onVoiceTranscript?: (callback: (data: { turnId?: string; text: string; confidence?: number; isFinal?: boolean; isWake?: boolean }) => void) => () => void;
  onVoiceState?: (callback: (data: { turnId?: string; state: string; interrupted?: boolean; text?: string; responseHash?: string }) => void) => () => void;
  onAiResponse?: (callback: (data: { turnId?: string; responseHash?: string; response: string; target?: string; model?: string; latencyMs?: number }) => void) => () => void;
  onVoiceInterrupted?: (callback: () => void) => () => void;
  notifyVoiceLifecycle?: (state: string) => Promise<void>;
  getWakeWordStatus?: () => Promise<{ enabled: boolean; keyword: string; allowedPhrases?: string[]; provider: string; speechActive?: boolean; whisperActive?: boolean; kokoroActive?: boolean; telemetry?: Record<string, any> }>;
  getWakeTelemetry?: () => Promise<Record<string, any>>;
  getPrecachedAudio?: (text: string) => Promise<string | null>;
  setIgnoreMouseEvents?: (ignore: boolean, options?: { forward: boolean }) => Promise<void>;
  setDesktopOverlayMode?: (mode: string) => Promise<void>;
  getSelectedModel?: () => Promise<{ provider: string; model: string }>;
  setSelectedModel?: (provider: string, model: string) => Promise<{ success: boolean; provider: string; model: string }>;
  getAvailableModels?: () => Promise<{ local: string[]; cloud: Array<{ provider: string; model: string; label: string }> }>;
  getDiagnosticStatus?: () => Promise<Record<string, any>>;
  onModelChanged?: (callback: (data: { provider: string; model: string }) => void) => () => void;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}

declare module '*.png' {
  const value: string;
  export default value;
}
