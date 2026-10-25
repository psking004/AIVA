/**
 * AIVA Mobile API Client
 *
 * Communicates ONLY with the user's private AIVA Cloud Backend.
 * Features:
 * - Persistent device identity headers (x-device-id)
 * - Automatic JWT bearer auth and token refresh
 * - Direct authentication and device registration
 * - Strict security: Zero LLM vendor keys exist on client
 */

import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';

declare const process: any;

// Production Render private cloud domain
export const DEFAULT_AIVA_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_AIVA_API_URL) ||
  'https://aiva-yitg.onrender.com';

// Persistent Device Identifier for Android Client (iQOO Neo 10)
export const DEFAULT_DEVICE_ID = 'device_android_iqoo_neo_10';

class AivaApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private deviceId: string = DEFAULT_DEVICE_ID;
  private baseUrl: string = DEFAULT_AIVA_URL;

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
              }
            );

            this.accessToken = refreshRes.data.accessToken;
            if (refreshRes.data.refreshToken) {
              this.refreshToken = refreshRes.data.refreshToken;
            }

            originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
            return this.client(originalRequest);
          } catch (refreshErr) {
            this.accessToken = null;
            this.refreshToken = null;
          }
        }
        return Promise.reject(error);
      }
    );
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.client.defaults.baseURL = this.baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
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
  }

  getDeviceId(): string {
    return this.deviceId;
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
        this.setTokens(response.data.accessToken, response.data.refreshToken);
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
   */
  async sendChatMessage(message: string, conversationId?: string) {
    try {
      const response = await this.client.post('/ai/chat', {
        message,
        conversationId,
      });
      return {
        success: true,
        data: response.data,
        response: response.data?.response || response.data?.message || '',
      };
    } catch (error: any) {
      if (!error.response || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        return {
          success: false,
          offline: true,
          response: "You're offline. Cloud connection to AIVA failed.",
        };
      }
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        response: `Error: ${error.response?.data?.message || error.message}`,
      };
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
}

export const aivaClient = new AivaApiClient();
