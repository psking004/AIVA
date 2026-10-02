/**
 * Session Memory — Episodic Memory
 *
 * - Storage: In-memory Map (can be persisted to SQLite/JSON per session)
 * - Content: Tasks completed, reminders set, errors encountered, user mood signals
 * - Lifecycle: Retained for 24 hours, then summarized → long-term
 * - Purpose: Continuity within a work session
 *
 * Schema per session:
 * {
 *   session_id: "uuid",
 *   started_at: "ISO8601",
 *   interactions: [
 *     { type: "task", summary: "Summarized meeting notes", status: "done" },
 *     { type: "reminder", summary: "Call dentist at 3pm", status: "pending" }
 *   ],
 *   user_state: { mood: "neutral", focus_topic: "project planning" }
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface SessionInteraction {
  id: string;
  type: 'task' | 'reminder' | 'query' | 'command' | 'error' | 'preference';
  summary: string;
  status: 'pending' | 'done' | 'failed' | 'cancelled';
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UserState {
  mood: 'positive' | 'neutral' | 'frustrated' | 'unknown';
  focusTopic: string | null;
  energyLevel: 'high' | 'medium' | 'low' | 'unknown';
}

export interface SessionData {
  sessionId: string;
  userId: string;
  startedAt: Date;
  lastActiveAt: Date;
  interactions: SessionInteraction[];
  userState: UserState;
  metadata: Record<string, unknown>;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class SessionMemory {
  private readonly logger = new Logger(SessionMemory.name);
  private sessions: Map<string, SessionData> = new Map();
  private userSessionMap: Map<string, string> = new Map(); // userId → current sessionId

  /**
   * Get or create the active session for a user
   */
  getOrCreateSession(userId: string): SessionData {
    const existingSessionId = this.userSessionMap.get(userId);

    if (existingSessionId) {
      const session = this.sessions.get(existingSessionId);
      if (session && !this.isSessionExpired(session)) {
        session.lastActiveAt = new Date();
        return session;
      }
      // Session expired — clean up
      this.sessions.delete(existingSessionId);
    }

    // Create new session
    const session: SessionData = {
      sessionId: uuidv4(),
      userId,
      startedAt: new Date(),
      lastActiveAt: new Date(),
      interactions: [],
      userState: {
        mood: 'unknown',
        focusTopic: null,
        energyLevel: 'unknown',
      },
      metadata: {},
    };

    this.sessions.set(session.sessionId, session);
    this.userSessionMap.set(userId, session.sessionId);

    this.logger.log(`New session created: ${session.sessionId} for user ${userId}`);
    return session;
  }

  /**
   * Add an interaction to the current session
   */
  addInteraction(
    userId: string,
    interaction: Omit<SessionInteraction, 'id' | 'timestamp'>,
  ): SessionInteraction {
    const session = this.getOrCreateSession(userId);

    const fullInteraction: SessionInteraction = {
      ...interaction,
      id: uuidv4(),
      timestamp: new Date(),
    };

    session.interactions.push(fullInteraction);
    session.lastActiveAt = new Date();

    this.logger.debug(
      `Interaction added to session ${session.sessionId}: ${interaction.type} — ${interaction.summary.substring(0, 60)}`,
    );

    return fullInteraction;
  }

  /**
   * Update user state (mood, focus topic, energy)
   */
  updateUserState(userId: string, updates: Partial<UserState>): void {
    const session = this.getOrCreateSession(userId);

    session.userState = {
      ...session.userState,
      ...updates,
    };

    this.logger.debug(
      `User state updated for ${userId}: ${JSON.stringify(session.userState)}`,
    );
  }

  /**
   * Query session interactions by topic keyword
   */
  queryByTopic(userId: string, topic: string): SessionInteraction[] {
    const session = this.getOrCreateSession(userId);
    const lowerTopic = topic.toLowerCase();

    return session.interactions.filter((interaction) =>
      interaction.summary.toLowerCase().includes(lowerTopic),
    );
  }

  /**
   * Get all pending interactions (reminders, tasks)
   */
  getPending(userId: string): SessionInteraction[] {
    const session = this.getOrCreateSession(userId);
    return session.interactions.filter((i) => i.status === 'pending');
  }

  /**
   * Mark an interaction as completed
   */
  markCompleted(userId: string, interactionId: string): boolean {
    const session = this.getOrCreateSession(userId);
    const interaction = session.interactions.find((i) => i.id === interactionId);

    if (interaction) {
      interaction.status = 'done';
      return true;
    }

    return false;
  }

  /**
   * Get session summary for long-term memory persistence
   */
  getSessionSummary(userId: string): string {
    const session = this.getOrCreateSession(userId);

    const completedTasks = session.interactions.filter((i) => i.status === 'done');
    const pendingTasks = session.interactions.filter((i) => i.status === 'pending');

    const lines: string[] = [
      `Session started: ${session.startedAt.toISOString()}`,
      `Duration: ${Math.round((Date.now() - session.startedAt.getTime()) / 60000)} minutes`,
      `User mood: ${session.userState.mood}`,
    ];

    if (session.userState.focusTopic) {
      lines.push(`Focus topic: ${session.userState.focusTopic}`);
    }

    if (completedTasks.length > 0) {
      lines.push(`Completed (${completedTasks.length}):`);
      completedTasks.forEach((t) => lines.push(`  - ${t.summary}`));
    }

    if (pendingTasks.length > 0) {
      lines.push(`Pending (${pendingTasks.length}):`);
      pendingTasks.forEach((t) => lines.push(`  - ${t.summary}`));
    }

    return lines.join('\n');
  }

  /**
   * Get interaction context formatted for prompt injection
   */
  getContextForPrompt(userId: string): string {
    const session = this.getOrCreateSession(userId);
    const recentInteractions = session.interactions.slice(-5);

    if (recentInteractions.length === 0) {
      return '';
    }

    const lines = ['Recent session activity:'];
    recentInteractions.forEach((i) => {
      lines.push(`- [${i.type}] ${i.summary} (${i.status})`);
    });

    if (session.userState.mood !== 'unknown') {
      lines.push(`User mood: ${session.userState.mood}`);
    }
    if (session.userState.focusTopic) {
      lines.push(`Current focus: ${session.userState.focusTopic}`);
    }

    return lines.join('\n');
  }

  /**
   * End a session and return summary for long-term storage
   */
  endSession(userId: string): string | null {
    const sessionId = this.userSessionMap.get(userId);
    if (!sessionId) return null;

    const summary = this.getSessionSummary(userId);

    this.sessions.delete(sessionId);
    this.userSessionMap.delete(userId);

    this.logger.log(`Session ended for user ${userId} (${sessionId})`);
    return summary;
  }

  /**
   * Check if session has expired (24 hours)
   */
  private isSessionExpired(session: SessionData): boolean {
    return Date.now() - session.lastActiveAt.getTime() > SESSION_TTL_MS;
  }

  /**
   * Periodic cleanup of expired sessions
   */
  cleanupExpired(): number {
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        this.sessions.delete(sessionId);
        this.userSessionMap.delete(session.userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired sessions`);
    }

    return cleaned;
  }
}
