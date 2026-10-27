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
  sendChatMessage: (message: string, conversationId?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  testOllamaPing: () => Promise<{ online: boolean; models?: string[]; error?: string }>;
  getDiagnosticsLogs: () => Promise<string[]>;
  openLogFolder: () => Promise<void>;
  onLogEntry: (callback: (entry: any) => void) => () => void;
  onVoiceTranscript?: (callback: (data: { text: string; confidence?: number; isFinal?: boolean; isWake?: boolean }) => void) => () => void;
  onVoiceState?: (callback: (data: { state: string }) => void) => () => void;
  notifyVoiceLifecycle?: (state: string) => Promise<void>;
  getWakeWordStatus?: () => Promise<{ enabled: boolean; keyword: string; provider: string }>;
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
