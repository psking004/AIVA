export interface IElectronAPI {
  getVersion: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  platform: string;
  sendNotification: (title: string, body: string) => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
