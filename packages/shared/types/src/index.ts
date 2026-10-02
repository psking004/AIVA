/**
 * AIVA Shared Types
 *
 * Central type definitions shared across all packages
 */

// User types
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  timezone: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

// Task types
export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: Date;
  completedAt?: Date;
  tags: string[];
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BLOCKED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Note types
export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  excerpt?: string;
  tags: string[];
  folderId?: string;
  parentId?: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Document types
export interface Document {
  id: string;
  userId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: bigint;
  storagePath: string;
  mimeType: string;
  isProcessed: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Calendar types
export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  recurrence?: string;
  attendees: string[];
  status: EventStatus;
  visibility: Visibility;
  meetingLink?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type EventStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
export type Visibility = 'PRIVATE' | 'PUBLIC' | 'INTERNAL';

// Email types
export interface Email {
  id: string;
  accountId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  body: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  summary?: string;
  createdAt: Date;
}

// Conversation types
export interface Conversation {
  id: string;
  userId: string;
  title?: string;
  messages: Message[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Automation types
export interface AutomationRule {
  id: string;
  userId: string;
  name: string;
  description?: string;
  trigger: TriggerConfig;
  actions: ActionConfig[];
  conditions?: ConditionConfig;
  isActive: boolean;
  lastTriggered?: Date;
  triggerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerConfig {
  type: string;
  config: Record<string, unknown>;
}

export interface ActionConfig {
  type: string;
  config: Record<string, unknown>;
}

export interface ConditionConfig {
  type: string;
  config: Record<string, unknown>;
}

// AI types
export interface AIConversationResponse {
  conversationId: string;
  response: string;
  agentType: string | null;
  toolCalls: ToolCall[];
  context: ConversationContext;
}

export interface ConversationContext {
  messages: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
}

export interface Intent {
  type: string;
  agentType: string | null;
  confidence: number;
  requiresAgent: boolean;
  parameters: Record<string, unknown>;
}

// Dashboard types
export interface DashboardStats {
  tasks: Record<string, number>;
  totalNotes: number;
  totalDocuments: number;
  totalConversations: number;
  upcomingEvents: number;
}

export interface DashboardData {
  recentTasks: Task[];
  recentNotes: Note[];
  recentDocuments: Document[];
  upcomingEvents: CalendarEvent[];
  recentConversations: Conversation[];
  recentActivity: ActivityLog[];
  stats: DashboardStats;
}

// Activity log types
export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// API response types
export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Auth types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
