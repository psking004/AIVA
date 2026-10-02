/**
 * AIVA Mobile API Client
 *
 * Communicates ONLY with the user's private AIVA Cloud Backend.
 * Features:
 * - Device identity headers (x-device-id)
 * - Automatic JWT bearer auth and token refresh
 * - Offline detection & graceful fallback
 * - Strict security: Zero LLM vendor keys exist on client
 */

import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';

declare const process: any;

// In production, set AIVA_API_URL to your Render private cloud domain
export const DEFAULT_AIVA_URL = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_AIVA_API_URL) || 'https://aiva-backend.onrender.com';

class AivaApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private deviceId: string = `android-aiva-${Platform.OS}-${Date.now().toString(36)}`;
  private baseUrl: string = DEFAULT_AIVA_URL;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': this.deviceId,
        'x-client-platform': Platform.OS,
      },
    });

    // Attach Authorization header dynamically
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      config.headers['x-device-id'] = this.deviceId;
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
            const refreshRes = await axios.post(`${this.baseUrl}/auth/refresh`, {
              refreshToken: this.refreshToken,
            }, {
              headers: { 'x-device-id': this.deviceId },
            });

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
      },
    );
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.client.defaults.baseURL = this.baseUrl;
  }

  setTokens(accessToken: string, refreshToken?: string) {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
  }

  setDeviceId(id: string) {
    this.deviceId = id;
    this.client.defaults.headers.common['x-device-id'] = id;
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
      };
    } catch (error: any) {
      if (!error.response || error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        // Offline handling
        return {
          success: false,
          offline: true,
          response: "You're offline. I can still handle local capabilities.",
        };
      }
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Check cloud backend health
   */
  async checkBackendHealth(): Promise<{ isOnline: boolean; latencyMs?: number }> {
    const start = Date.now();
    try {
      await this.client.get('/health', { timeout: 4000 });
      return { isOnline: true, latencyMs: Date.now() - start };
    } catch {
      return { isOnline: false };
    }
  }
}

export const aivaClient = new AivaApiClient();
