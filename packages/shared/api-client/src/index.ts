/**
 * AIVA API Client
 *
 * TypeScript API client for communicating with AIVA backend
 */

import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  User,
  Task,
  Note,
  Document,
  CalendarEvent,
  Email,
  AutomationRule,
  DashboardData,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ApiResponse,
} from '@aiva/types';

declare const process: any;
declare const Buffer: any;

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
  } catch (_) {}
  return null;
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
  } catch (_) {}
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}

function isJwtExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    if (!base64Url) return true;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let decodedJson = '';
    if (typeof atob === 'function') {
      decodedJson = atob(base64);
    } else if (typeof Buffer !== 'undefined') {
      decodedJson = Buffer.from(base64, 'base64').toString('utf-8');
    } else {
      return false;
    }
    const payload = JSON.parse(decodedJson);
    if (typeof payload.exp !== 'number') return false;
    // Buffer by 30 seconds to refresh early before actual expiration
    return Date.now() >= payload.exp * 1000 - 30000;
  } catch {
    return false;
  }
}

function getTokenExpiry(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let decodedJson = '';
    if (typeof atob === 'function') {
      decodedJson = atob(base64);
    } else if (typeof Buffer !== 'undefined') {
      decodedJson = Buffer.from(base64, 'base64').toString('utf-8');
    } else {
      return null;
    }
    const payload = JSON.parse(decodedJson);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function resolveDefaultBaseURL(provided?: string): string {
  if (provided) return provided.replace(/\/+$/, '');
  if (typeof process !== 'undefined') {
    if (
      process.env?.NEXT_PUBLIC_AIVA_API_URL &&
      !process.env.NEXT_PUBLIC_AIVA_API_URL.includes('localhost:4000')
    ) {
      return process.env.NEXT_PUBLIC_AIVA_API_URL.replace(/\/+$/, '');
    }
    if (process.env?.AIVA_API_URL && !process.env.AIVA_API_URL.includes('localhost:4000')) {
      return process.env.AIVA_API_URL.replace(/\/+$/, '');
    }
  }
  if (typeof window !== 'undefined' && (window as any).__AIVA_API_URL__) {
    return String((window as any).__AIVA_API_URL__).replace(/\/+$/, '');
  }
  return 'https://aiva-yitg.onrender.com';
}

export class AivaClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private deviceId: string = 'web-client-default';
  private baseURL: string;
  private authPromise: Promise<void> | null = null;
  private lastRetryOccurred: boolean = false;

  constructor(baseURL?: string) {
    this.baseURL = resolveDefaultBaseURL(baseURL);
    console.log(`[AIVA API] Base URL: ${this.baseURL}`);

    const storedToken = safeStorageGet('aiva_access_token');
    if (storedToken && !isJwtExpired(storedToken)) {
      this.token = storedToken;
    } else if (storedToken) {
      safeStorageRemove('aiva_access_token');
    }

    const storedDevice = safeStorageGet('aiva_device_id');
    if (storedDevice) this.deviceId = storedDevice;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': this.deviceId,
      },
    });

    // Request interceptor to attach token & device ID
    this.client.interceptors.request.use(async (config) => {
      const url = config.url || '';
      if (!url.includes('/auth/') && !url.includes('/health')) {
        await this.ensureAuthenticated();
      }
      if (this.token && config.headers) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      if (config.headers) {
        config.headers['x-device-id'] = this.deviceId;
      }
      return config;
    });

    // Response interceptor for auth auto-refresh on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/auth/')
        ) {
          originalRequest._retry = true;
          this.lastRetryOccurred = true;
          this.token = null;
          safeStorageRemove('aiva_access_token');
          try {
            console.log('[AIVA API] 401 received, re-authenticating session...');
            await this.ensureAuthenticated();
            if (this.token) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${this.token}`;
              return this.client(originalRequest);
            }
          } catch (retryErr) {
            return Promise.reject(retryErr);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  setDeviceId(id: string) {
    this.deviceId = id;
    safeStorageSet('aiva_device_id', id);
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      safeStorageSet('aiva_access_token', token);
    } else {
      safeStorageRemove('aiva_access_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  // Auth methods
  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    const deviceName =
      (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && navigator.userAgent.trim().length > 0)
        ? navigator.userAgent
        : 'AIVA Desktop Client';
    const payload = {
      ...data,
      device: {
        deviceId: this.deviceId || 'desktop-client-default',
        deviceName,
        platform: 'web',
      },
    };
    const response = await this.client.post('/auth/login', payload);
    const token = response.data.accessToken || response.data.token;
    if (token) {
      this.setToken(token);
    }
    return response.data;
  }

  async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    const deviceName =
      (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && navigator.userAgent.trim().length > 0)
        ? navigator.userAgent
        : 'AIVA Desktop Client';
    const payload = {
      ...data,
      device: {
        deviceId: this.deviceId || 'desktop-client-default',
        deviceName,
        platform: 'web',
      },
    };
    const response = await this.client.post('/auth/register', payload);
    const token = response.data.accessToken || response.data.token;
    if (token) {
      this.setToken(token);
    }
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout', {});
    } finally {
      this.setToken(null);
    }
  }

  async getMe(): Promise<ApiResponse<User>> {
    return this.client.post('/auth/me');
  }

  // Tasks
  async getTasks(filters?: Record<string, string>): Promise<Task[]> {
    const response = await this.client.get('/tasks', { params: filters });
    return response.data;
  }

  async createTask(data: Partial<Task>): Promise<Task> {
    const response = await this.client.post('/tasks', data);
    return response.data;
  }

  async updateTask(id: string, data: Partial<Task>): Promise<Task> {
    const response = await this.client.put(`/tasks/${id}`, data);
    return response.data;
  }

  async deleteTask(id: string): Promise<void> {
    await this.client.delete(`/tasks/${id}`);
  }

  // Projects
  async getProjects(filters?: Record<string, string>): Promise<any[]> {
    const response = await this.client.get('/projects', { params: filters });
    return response.data;
  }

  async createProject(data: Record<string, any>): Promise<any> {
    const response = await this.client.post('/projects', data);
    return response.data;
  }

  async updateProject(id: string, data: Record<string, any>): Promise<any> {
    const response = await this.client.put(`/projects/${id}`, data);
    return response.data;
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.delete(`/projects/${id}`);
  }

  // Notes
  async getNotes(filters?: Record<string, string>): Promise<Note[]> {
    const response = await this.client.get('/notes', { params: filters });
    return response.data;
  }

  async createNote(data: Partial<Note>): Promise<Note> {
    const response = await this.client.post('/notes', data);
    return response.data;
  }

  async updateNote(id: string, data: Partial<Note>): Promise<Note> {
    const response = await this.client.put(`/notes/${id}`, data);
    return response.data;
  }

  async deleteNote(id: string): Promise<void> {
    await this.client.delete(`/notes/${id}`);
  }

  // Documents
  async getDocuments(filters?: Record<string, string>): Promise<Document[]> {
    const response = await this.client.get('/files', { params: filters });
    return response.data;
  }

  async uploadDocument(file: File, metadata?: Record<string, unknown>): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata || {}));
    const response = await this.client.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async deleteDocument(id: string): Promise<void> {
    await this.client.delete(`/files/${id}`);
  }

  // Calendar
  async getEvents(filters?: Record<string, string>): Promise<CalendarEvent[]> {
    const response = await this.client.get('/calendar/events', { params: filters });
    return response.data;
  }

  async createEvent(data: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const response = await this.client.post('/calendar/events', data);
    return response.data;
  }

  async updateEvent(id: string, data: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const response = await this.client.put(`/calendar/events/${id}`, data);
    return response.data;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.client.delete(`/calendar/events/${id}`);
  }

  async getAvailability(date: string, duration: number): Promise<{ start: string; end: string }[]> {
    const response = await this.client.get('/calendar/availability', { params: { date, duration } });
    return response.data;
  }

  // Email
  async connectEmail(data: { email: string; provider: string; accessToken: string }): Promise<void> {
    await this.client.post('/email/connect', data);
  }

  async getEmails(filters?: Record<string, string>): Promise<Email[]> {
    const response = await this.client.get('/email/messages', { params: filters });
    return response.data;
  }

  async markEmailAsRead(id: string): Promise<Email> {
    const response = await this.client.post(`/email/messages/${id}/read`);
    return response.data;
  }

  // Automation
  async getAutomationRules(): Promise<AutomationRule[]> {
    const response = await this.client.get('/automation');
    return response.data;
  }

  async createAutomationRule(data: Partial<AutomationRule>): Promise<AutomationRule> {
    const response = await this.client.post('/automation', data);
    return response.data;
  }

  async triggerAutomationRule(id: string): Promise<void> {
    await this.client.post(`/automation/${id}/trigger`);
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await this.client.delete(`/automation/${id}`);
  }

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    const response = await this.client.get('/analytics/dashboard');
    return response.data;
  }

  async ensureAuthenticated(): Promise<void> {
    if (this.token && !isJwtExpired(this.token)) {
      return;
    }

    // Token is either absent or expired; clear stale token
    this.token = null;
    safeStorageRemove('aiva_access_token');

    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = (async () => {
      try {
        console.log('[AIVA API] Authenticating session...');
        try {
          await this.login({
            email: 'admin@aiva.local',
            password: 'Password123!',
          });
          console.log('[AIVA API] Session authenticated successfully');
          return;
        } catch (firstErr: any) {
          // If network glitch or 503/502 from cold start, wait 1000ms and retry login once
          if (!firstErr.response || firstErr.response.status >= 500) {
            console.log('[AIVA API] Backend warming up, retrying login in 1000ms...');
            await new Promise((r) => setTimeout(r, 1000));
            await this.login({
              email: 'admin@aiva.local',
              password: 'Password123!',
            });
            console.log('[AIVA API] Session authenticated on retry');
            return;
          }
          throw firstErr;
        }
      } catch (loginErr: any) {
        console.warn(
          '[AIVA API] Login failed, attempting owner registration...',
          loginErr?.response?.status || loginErr?.message
        );
        try {
          await this.register({
            email: 'admin@aiva.local',
            password: 'Password123!',
            firstName: 'AIVA',
            lastName: 'Admin',
          });
          console.log('[AIVA API] Owner registration & login successful');
        } catch (regErr: any) {
          // If register failed because user already exists (409), attempt login one last time
          if (regErr?.response?.status === 409) {
            console.log('[AIVA API] User already exists (409), performing final login attempt...');
            await this.login({
              email: 'admin@aiva.local',
              password: 'Password123!',
            });
            return;
          }
          console.error(
            '[AIVA API] Authentication failed (login and register failed):',
            regErr?.response?.status || regErr?.message
          );
          throw loginErr || regErr;
        }
      } finally {
        this.authPromise = null;
      }
    })();

    return this.authPromise;
  }

  setBaseURL(url: string) {
    this.baseURL = url.replace(/\/+$/, '');
    this.client.defaults.baseURL = this.baseURL;
    console.log(`[AIVA API] Base URL: ${this.baseURL}`);
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  // Chat with AIVA (AI endpoint)
  async chat(message: string, conversationId?: string): Promise<{
    conversationId: string;
    response: string;
    agentType: string | null;
    toolCalls?: any[];
  }> {
    const ranEnsureAuth = !this.token || isJwtExpired(this.token);
    await this.ensureAuthenticated();

    console.log('[AIVA API TRACE]');
    console.log(`baseURL: ${this.baseURL}`);
    console.log(`full URL: ${this.baseURL}/ai/chat`);
    console.log(`HTTP method: POST`);
    console.log(`device ID presence: ${Boolean(this.deviceId && this.deviceId.trim().length > 0)}`);
    console.log(`auth token presence: ${Boolean(this.token && this.token.trim().length > 0)}`);
    console.log(`token expiry timestamp only: ${getTokenExpiry(this.token)}`);
    console.log(`whether ensureAuthenticated() ran: ${ranEnsureAuth}`);
    console.log(`whether 401 retry happened: ${this.lastRetryOccurred}`);

    const response = await this.client.post('/ai/chat', { message, conversationId });
    return response.data;
  }

  // Health
  async getHealth(): Promise<{ status: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

// Export singleton instance
export const aivaClient = new AivaClient();
