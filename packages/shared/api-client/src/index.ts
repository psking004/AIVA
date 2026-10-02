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

export class AivaClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private deviceId: string = 'web-client-default';

  constructor(baseURL: string = 'http://localhost:4000') {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedToken = localStorage.getItem('aiva_access_token');
      if (storedToken) this.token = storedToken;
      const storedDevice = localStorage.getItem('aiva_device_id');
      if (storedDevice) this.deviceId = storedDevice;
    }

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': this.deviceId,
      },
    });

    // Response interceptor for auth
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.token = null;
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem('aiva_access_token');
          }
        }
        return Promise.reject(error);
      },
    );

    // Request interceptor to attach token & device ID
    this.client.interceptors.request.use((config) => {
      if (this.token && config.headers) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      if (config.headers) {
        config.headers['x-device-id'] = this.deviceId;
      }
      return config;
    });
  }

  setDeviceId(id: string) {
    this.deviceId = id;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('aiva_device_id', id);
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        localStorage.setItem('aiva_access_token', token);
      } else {
        localStorage.removeItem('aiva_access_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  // Auth methods
  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    const payload = {
      ...data,
      device: {
        deviceId: this.deviceId,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
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
    const payload = {
      ...data,
      device: {
        deviceId: this.deviceId,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
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

  // Chat with AIVA (AI endpoint)
  async chat(message: string, conversationId?: string): Promise<{
    conversationId: string;
    response: string;
    agentType: string | null;
    toolCalls?: any[];
  }> {
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
