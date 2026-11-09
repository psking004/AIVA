/**
 * AIVA Mobile API Client
 *
 * Communicates with the user's private AIVA Cloud Backend.
 * Features:
 * - Persistent sandboxed storage (FileSystem.documentDirectory)
 * - Automatic token discovery, loading, and persistence
 * - Automatic JWT bearer auth and proactive token refresh on HTTP 401
 * - Direct authenticated AI route: /ai/chat
 * - Zero LLM vendor keys exist on client
 */

import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { aivaVoiceService } from '../voice/voice.service';

declare const process: any;

// Production Render private cloud domain
export const DEFAULT_AIVA_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_AIVA_API_URL) ||
  'https://aiva-yitg.onrender.com';

// Persistent Device Identifier for Android Client (iQOO Neo 10)
export const DEFAULT_DEVICE_ID = 'device_android_iqoo_neo_10';

export const INITIAL_ACCESS_TOKEN =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_AIVA_ACCESS_TOKEN) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZGFjZmI2YS0wNzQ5LTQxMDAtYjFhMy1iYjIwNTU4ZDI1MjIiLCJlbWFpbCI6ImJoYXJhdGhpcGExOTgxQGdtYWlsLmNvbSIsImRldmljZUlkIjoiZGV2aWNlX2FuZHJvaWRfaXFvb19uZW9fMTAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzk0MDMzMTg4LCJleHAiOjE3OTQwMzY3ODh9.h0g_vHCwF77ZuHHYHuxvEVx1kiWFdj_SLR27kitFG3c';

export const INITIAL_REFRESH_TOKEN =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_AIVA_REFRESH_TOKEN) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZGFjZmI2YS0wNzQ5LTQxMDAtYjFhMy1iYjIwNTU4ZDI1MjIiLCJlbWFpbCI6ImJoYXJhdGhpcGExOTgxQGdtYWlsLmNvbSIsImRldmljZUlkIjoiZGV2aWNlX2FuZHJvaWRfaXFvb19uZW9fMTAiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc5NDAzMzE4OCwiZXhwIjoxNzk2NjI1MTg4fQ.e2-6KVrG-zSKSRyhrzH0RmbKwEG93KW7W7Bh4BDigbI';

class AivaApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = INITIAL_ACCESS_TOKEN;
  private refreshToken: string | null = INITIAL_REFRESH_TOKEN;
  private deviceId: string = DEFAULT_DEVICE_ID;
  private baseUrl: string = DEFAULT_AIVA_URL;
  private isInitialized = false;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': this.deviceId,
        'x-client-platform': 'android',
      },
    });

    // Attach Authorization header dynamically
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      config.headers['x-device-id'] = this.deviceId;
      config.headers['x-client-platform'] = 'android';
      return config;
    });

    // Auto-refresh token on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry && this.refreshToken) {
          originalRequest._retry = true;
          try {
            console.log('[AIVA Client] HTTP 401 received. Attempting automatic token refresh...');
            const refreshRes = await axios.post(
              `${this.baseUrl}/auth/refresh`,
              {
                refreshToken: this.refreshToken,
              },
              {
                headers: {
                  'x-device-id': this.deviceId,
                  'x-client-platform': 'android',
                },
                timeout: 10000,
              }
            );

            if (refreshRes.data?.accessToken) {
              this.accessToken = refreshRes.data.accessToken;
              if (refreshRes.data.refreshToken) {
                this.refreshToken = refreshRes.data.refreshToken;
              }
              await this.persistTokensToDisk();
              console.log('[AIVA Client] Token refreshed & securely stored in app sandbox.');

              originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshErr: any) {
            console.warn('[AIVA Client] Automatic token refresh failed:', refreshErr.message);
          }
        }
        return Promise.reject(error);
      }
    );

    // Initialize stored tokens asynchronously
    this.loadTokensFromDisk().catch(() => {});
  }

  /**
   * Load securely stored tokens from Android private sandbox
   */
  public async loadTokensFromDisk(): Promise<boolean> {
    try {
      const stored = await aivaVoiceService.getStoredTokens();
      if (stored?.accessToken) {
        this.accessToken = stored.accessToken;
        if (stored.refreshToken) this.refreshToken = stored.refreshToken;
        console.log('[AIVA Client] Loaded stored credentials from native sandbox.');
        this.isInitialized = true;
        return true;
      } else if (this.accessToken && this.refreshToken) {
        // First boot: Persist initial seeds into native sandbox
        await this.persistTokensToDisk();
      }
    } catch (err: any) {
      console.warn('[AIVA Client] Error reading tokens from native sandbox:', err.message);
    }
    this.isInitialized = true;
    return false;
  }

  /**
   * Persist active credentials securely into Android private sandbox
   */
  public async persistTokensToDisk(): Promise<void> {
    try {
      if (this.accessToken && this.refreshToken) {
        await aivaVoiceService.saveTokens(this.accessToken, this.refreshToken);
        console.log('[AIVA Client] Tokens persisted into native secure storage.');
      }
    } catch (err: any) {
      console.warn('[AIVA Client] Error persisting tokens to native storage:', err.message);
    }
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.client.defaults.baseURL = this.baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    await this.persistTokensToDisk();
  }

  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken);
  }

  setDeviceId(id: string) {
    this.deviceId = id;
    this.client.defaults.headers.common['x-device-id'] = id;
    this.persistTokensToDisk().catch(() => {});
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * Proactively refresh token
   */
  async refreshTokens(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const res = await axios.post(
        `${this.baseUrl}/auth/refresh`,
        { refreshToken: this.refreshToken },
        {
          headers: {
            'x-device-id': this.deviceId,
            'x-client-platform': 'android',
          },
          timeout: 10000,
        }
      );
      if (res.data?.accessToken) {
        this.accessToken = res.data.accessToken;
        if (res.data.refreshToken) {
          this.refreshToken = res.data.refreshToken;
        }
        await this.persistTokensToDisk();
        return true;
      }
    } catch (e: any) {
      console.warn('[AIVA Client] Proactive refresh error:', e.message);
    }
    return false;
  }

  /**
   * Authenticate mobile client with owner credentials
   */
  async login(email: string, password: string) {
    try {
      const response = await this.client.post('/auth/login', {
        email,
        password,
        device: {
          deviceId: this.deviceId,
          deviceName: 'iQOO Neo 10',
          platform: 'android',
        },
      });

      if (response.data?.accessToken) {
        await this.setTokens(response.data.accessToken, response.data.refreshToken);
        await this.registerDevice();
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Confirm device authorization on backend
   */
  async registerDevice() {
    try {
      await this.client.post('/auth/devices/register', {
        deviceId: this.deviceId,
        deviceName: 'iQOO Neo 10',
        platform: 'android',
      });
      return { success: true };
    } catch (error: any) {
      if (error.response?.status === 409) {
        return { success: true, alreadyRegistered: true };
      }
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /**
   * Send user voice transcript or text query to Private Cloud AIVA Brain
   * Route: POST /ai/chat
   */
  async sendChatMessage(message: string, conversationId?: string) {
    const t0 = Date.now();
    const requestId = `req_mob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      const response = await this.client.post(
        '/ai/chat',
        {
          message,
          conversationId,
        },
        {
          headers: {
            'x-request-id': requestId,
          },
        }
      );
      const latencyMs = Date.now() - t0;
      const responseText =
        response.data?.response ||
        response.data?.message ||
        response.data?.content ||
        '';

      return {
        success: true,
        data: response.data,
        response: responseText,
        latencyMs,
        requestId,
        model: response.data?.model || 'cloud',
        target: response.data?.target || 'Render',
      };
    } catch (error: any) {
      const latencyMs = Date.now() - t0;
      const status = error.response?.status;
      const rawError = error.response?.data?.message || error.message || 'Unknown error';

      console.warn(
        `[AIVA Chat] Request failed (${status || 'Network'}): ${rawError} [Latency: ${latencyMs}ms, ID: ${requestId}]`
      );

      if (!error.response || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        return {
          success: false,
          offline: true,
          status: 0,
          latencyMs,
          requestId,
          response: "You're offline. Cloud connection to AIVA failed.",
        };
      }

      const isTechnicalError =
        (status !== undefined && status >= 500) ||
        status === 429 ||
        status === 402 ||
        /GoogleGenerativeAI|OpenRouter|gemini|qwen|503|502|500|429|402|status|Error:|Exception|credits|timeout|token|fetch failed|AxiosError|ECONNREFUSED/i.test(
          rawError
        );
      const voiceSafeResponse = isTechnicalError
        ? "I'm having temporary trouble reaching the intelligence servers. Please try again in a moment."
        : rawError;

      return {
        success: false,
        error: rawError,
        status,
        latencyMs,
        requestId,
        response: voiceSafeResponse,
      };
    }
  }

  /**
   * Create a personal note in the user's AIVA cloud database
   * Route: POST /notes
   */
  async createNote(note: { title: string; content?: string; tags?: string[] }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.client.post('/notes', {
        title: note.title,
        content: note.content || '',
        tags: note.tags || ['voice-note'],
      });
      return { success: true, data: response.data };
    } catch (error: any) {
      console.warn('[AIVA Client] createNote failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check cloud backend health
   */
  async checkBackendHealth(): Promise<{ isOnline: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.client.get('/health', { timeout: 5000 });
      return { isOnline: true, latencyMs: Date.now() - start };
    } catch {
      return { isOnline: false };
    }
  }

  /**
   * Query all registered compute nodes in the AIVA Fabric
   */
  async getFabricNodes(): Promise<any[]> {
    try {
      const res = await this.client.get('/ai/fabric/nodes', { timeout: 4000 });
      return Array.isArray(res.data) ? res.data : [];
    } catch (e: any) {
      console.warn('[AIVA Client] Failed to fetch fabric nodes:', e.message);
      return [];
    }
  }

  /**
   * Probe a local LAN AIVA node over Wi-Fi
   */
  async probeLanPeer(ip: string, port: number = 10000): Promise<{ isReachable: boolean; latencyMs: number; error?: string }> {
    const t0 = Date.now();
    try {
      await axios.get(`http://${ip}:${port}/ai/fabric/lan/ping`, {
        timeout: 1500,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'x-device-id': this.deviceId,
        },
      });
      return { isReachable: true, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { isReachable: false, latencyMs: Date.now() - t0, error: err.message };
    }
  }
}

export const aivaClient = new AivaApiClient();
