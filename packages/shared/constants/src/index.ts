/**
 * AIVA Shared Constants
 */

// API Routes
export const API_ROUTES = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
    REFRESH: '/auth/refresh',
  },
  TASKS: {
    LIST: '/tasks',
    CREATE: '/tasks',
    GET: '/tasks/:id',
    UPDATE: '/tasks/:id',
    DELETE: '/tasks/:id',
  },
  NOTES: {
    LIST: '/notes',
    CREATE: '/notes',
    GET: '/notes/:id',
    UPDATE: '/notes/:id',
    DELETE: '/notes/:id',
  },
  FILES: {
    LIST: '/files',
    UPLOAD: '/files/upload',
    GET: '/files/:id',
    DELETE: '/files/:id',
    SEARCH: '/files/search',
  },
  CALENDAR: {
    EVENTS: '/calendar/events',
    AVAILABILITY: '/calendar/availability',
  },
  EMAIL: {
    CONNECT: '/email/connect',
    MESSAGES: '/email/messages',
    ACCOUNTS: '/email/accounts',
  },
  AI: {
    CHAT: '/ai/chat',
    AGENTS: '/ai/agents',
    TOOLS: '/ai/tools',
  },
  ANALYTICS: {
    DASHBOARD: '/analytics/dashboard',
    ACTIVITY: '/analytics/activity',
    PRODUCTIVITY: '/analytics/productivity',
  },
  AUTOMATION: {
    LIST: '/automation',
    CREATE: '/automation',
    TRIGGER: '/automation/:id/trigger',
    DELETE: '/automation/:id',
  },
};

// Task Status
export const TASK_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  BLOCKED: 'BLOCKED',
} as const;

// Priority Levels
export const PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

// Agent Types
export const AGENT_TYPES = {
  TASK: 'task',
  CALENDAR: 'calendar',
  EMAIL: 'email',
  RESEARCH: 'research',
  AUTOMATION: 'automation',
} as const;

// Message Roles
export const MESSAGE_ROLE = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
  TOOL: 'TOOL',
} as const;

// Event Status
export const EVENT_STATUS = {
  TENTATIVE: 'TENTATIVE',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

// Visibility
export const VISIBILITY = {
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
} as const;

// Default Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1,
};

// Rate Limits
export const RATE_LIMITS = {
  DEFAULT_TTL: 60000, // 1 minute
  DEFAULT_MAX: 100,   // 100 requests
  AUTH_TTL: 3600000,  // 1 hour
  AUTH_MAX: 10,       // 10 attempts
};

// Storage Limits
export const STORAGE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES_PER_USER: 1000,
  MAX_TASKS_PER_USER: 5000,
  MAX_NOTES_PER_USER: 10000,
};

// Cache TTL (seconds)
export const CACHE_TTL = {
  USER: 3600,           // 1 hour
  SESSION: 300,         // 5 minutes
  SEARCH: 300,          // 5 minutes
  DASHBOARD: 60,        // 1 minute
};

// RAG Configuration
export const RAG_CONFIG = {
  CHUNK_SIZE: 500,
  CHUNK_OVERLAP: 50,
  DEFAULT_LIMIT: 10,
  SIMILARITY_THRESHOLD: 0.3,
};

// AI Configuration
export const AI_CONFIG = {
  DEFAULT_MODEL: 'claude-sonnet-4-5-20250929',
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 4096,
  SYSTEM_PROMPT_VERSION: '1.0.0',
};

// Timeouts (ms)
export const TIMEOUTS = {
  API_REQUEST: 30000,      // 30 seconds
  LLM_REQUEST: 60000,      // 60 seconds
  FILE_UPLOAD: 120000,     // 120 seconds
  DB_QUERY: 5000,          // 5 seconds
};

// Error Codes
export const ERROR_CODES = {
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};
