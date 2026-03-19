/**
 * AIVA API Client
 *
 * TypeScript API client for communicating with AIVA backend
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  User,
  Task,
  Note,
  Document,
  CalendarEvent,
  Email,
  Conversation,
  Message,
  AutomationRule,
  DashboardData,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ApiResponse,
  PaginatedResponse,
} from '@aiva/types';

export class AivaClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string = 'http://localhost:4000') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for auth
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.token = null;
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await this.client.post('/auth/login', data);
    this.token = response.data.token;
    return response.data;
  }

  async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await this.client.post('/auth/register', data);
    this.token = response.data.token;
    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
    this.token = null;
  }

  async getMe(): Promise<ApiResponse<User>> {
    return this.client.get('/auth/me');
  }

  // Tasks
  async getTasks(filters?: Record<string, string>): Promise<PaginatedResponse<Task>> {
    return this.client.get('/tasks', { params: filters });
  }

  async createTask(data: Partial<Task>): Promise<ApiResponse<Task>> {
    return this.client.post('/tasks', data);
  }

  async updateTask(id: string, data: Partial<Task>): Promise<ApiResponse<Task>> {
    return this.client.put(`/tasks/${id}`, data);
  }

  async deleteTask(id: string): Promise<void> {
    return this.client.delete(`/tasks/${id}`);
  }

  // Notes
  async getNotes(filters?: Record<string, string>): Promise<PaginatedResponse<Note>> {
    return this.client.get('/notes', { params: filters });
  }

  async createNote(data: Partial<Note>): Promise<ApiResponse<Note>> {
    return this.client.post('/notes', data);
  }

  async updateNote(id: string, data: Partial<Note>): Promise<ApiResponse<Note>> {
    return this.client.put(`/notes/${id}`, data);
  }

  async deleteNote(id: string): Promise<void> {
    return this.client.delete(`/notes/${id}`);
  }

  // Documents
  async getDocuments(filters?: Record<string, string>): Promise<PaginatedResponse<Document>> {
    return this.client.get('/files', { params: filters });
  }

  async uploadDocument(file: File, metadata?: Record<string, unknown>): Promise<ApiResponse<Document>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata || {}));
    return this.client.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async deleteDocument(id: string): Promise<void> {
    return this.client.delete(`/files/${id}`);
  }

  // Calendar
  async getEvents(filters?: Record<string, string>): Promise<PaginatedResponse<CalendarEvent>> {
    return this.client.get('/calendar/events', { params: filters });
  }

  async createEvent(data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
    return this.client.post('/calendar/events', data);
  }

  async updateEvent(id: string, data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
    return this.client.put(`/calendar/events/${id}`, data);
  }

  async deleteEvent(id: string): Promise<void> {
    return this.client.delete(`/calendar/events/${id}`);
  }

  async getAvailability(date: string, duration: number): Promise<ApiResponse<{ start: string; end: string }[]>> {
    return this.client.get('/calendar/availability', { params: { date, duration } });
  }

  // Email
  async connectEmail(data: { email: string; provider: string; accessToken: string }): Promise<ApiResponse<void>> {
    return this.client.post('/email/connect', data);
  }

  async getEmails(filters?: Record<string, string>): Promise<PaginatedResponse<Email>> {
    return this.client.get('/email/messages', { params: filters });
  }

  async markEmailAsRead(id: string): Promise<ApiResponse<Email>> {
    return this.client.post(`/email/messages/${id}/read`);
  }

  // Conversations (Chat with AIVA)
  async sendMessage(conversationId: string, content: string): Promise<ApiResponse<Message>> {
    return this.client.post('/chat/messages', { conversationId, content });
  }

  async getConversation(id: string): Promise<ApiResponse<Conversation>> {
    return this.client.get(`/chat/conversations/${id}`);
  }

  async getConversations(): Promise<PaginatedResponse<Conversation>> {
    return this.client.get('/chat/conversations');
  }

  // Automation
  async getAutomationRules(): Promise<ApiResponse<AutomationRule[]>> {
    return this.client.get('/automation');
  }

  async createAutomationRule(data: Partial<AutomationRule>): Promise<ApiResponse<AutomationRule>> {
    return this.client.post('/automation', data);
  }

  async triggerAutomationRule(id: string): Promise<ApiResponse<void>> {
    return this.client.post(`/automation/${id}/trigger`);
  }

  async deleteAutomationRule(id: string): Promise<void> {
    return this.client.delete(`/automation/${id}`);
  }

  // Dashboard
  async getDashboard(): Promise<ApiResponse<DashboardData>> {
    return this.client.get('/analytics/dashboard');
  }

  // Chat with AIVA (AI endpoint)
  async chat(message: string, conversationId?: string): Promise<ApiResponse<{
    conversationId: string;
    response: string;
    agentType: string | null;
  }>> {
    return this.client.post('/ai/chat', { message, conversationId });
  }

  // Private methods
  private setAuthHeader() {
    if (this.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  }
}

// Export singleton instance
export const aivaClient = new AivaClient();
