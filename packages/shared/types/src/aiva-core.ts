/**
 * AIVA Intelligence 2.0 Core Cognitive Types
 *
 * Defines the foundational structures for:
 * - 3 Cognitive Modes: FAST (<2s), CONTEXTUAL (<3.5s), AGENTIC (<6s)
 * - Multi-tier Intent Routing
 * - Project & Task Awareness Context
 * - Allowlisted Tool Executions & Multi-Step Plans
 * - End-to-End Latency Telemetry Breakdown
 */

import type { AivaOverlayLens } from './aiva-engine';

export type CognitiveMode = 'FAST' | 'CONTEXTUAL' | 'AGENTIC';

export type AivaIntentCategory =
  | 'INTERRUPT_STOP'       // Stop speaking, cancel pending tasks, be quiet
  | 'DISMISS_UI'           // Close overlay, return to dormant
  | 'SUMMON_UI'            // Open a specific lens (tasks, projects, memory, timeline, files)
  | 'TIME_QUERY'           // What time/date is it?
  | 'FAST_FACTUAL'         // Direct factual Q&A, greetings, general definitions
  | 'PROJECT_AWARENESS'    // "What am I working on?", "Show active projects"
  | 'TASK_QUERY'           // "What are my tasks?", "Show high priority items"
  | 'TASK_ACTION'          // "Create a task to ...", "Mark task as done"
  | 'MEMORY_RECALL'        // "What do you remember about ...?", "Search memory"
  | 'CALENDAR_QUERY'       // "What is on my calendar?", "When is my next meeting?"
  | 'AGENTIC_WORKFLOW';    // Multi-step tasks requiring planning and reflection

export interface AivaRouteDecision {
  intent: AivaIntentCategory;
  mode: CognitiveMode;
  targetOverlay: AivaOverlayLens;
  requiresUI: boolean;
  confidence: number;
  extractedParams: {
    query?: string;
    taskTitle?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate?: string;
    projectName?: string;
    searchTerm?: string;
  };
}

export interface AivaContextSnapshot {
  userId: string;
  activeProject?: {
    id: string;
    name: string;
    description?: string;
    taskCount?: number;
  };
  recentTasks?: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate?: string;
  }>;
  recentTurns?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  memorySnippets?: string[];
  activeOverlay: AivaOverlayLens;
}

export interface AivaPlanStep {
  id: string;
  description: string;
  toolName?: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  resultSummary?: string;
}

export interface AivaPlan {
  goal: string;
  steps: AivaPlanStep[];
  reflection?: string;
}

export interface AivaTelemetryBreakdown {
  authMs: number;
  routingMs: number;
  contextMs: number;
  memoryMs: number;
  modelMs: number;
  toolsMs: number;
  formattingMs: number;
  totalMs: number;
}

export interface AivaExecutionResult {
  intent: AivaIntentCategory;
  mode: CognitiveMode;
  spokenResponse: string;       // Crisp 1-2 sentence spoken audio for ElevenLabs TTS
  displayResponse: string;      // Detailed markdown/rich text for overlay display
  targetOverlay: AivaOverlayLens;
  requiresUI: boolean;
  plan?: AivaPlan;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
    status: 'success' | 'failure';
  }>;
  telemetry: AivaTelemetryBreakdown;
}
