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
export declare class SessionMemory {
    private readonly logger;
    private sessions;
    private userSessionMap;
    /**
     * Get or create the active session for a user
     */
    getOrCreateSession(userId: string): SessionData;
    /**
     * Add an interaction to the current session
     */
    addInteraction(userId: string, interaction: Omit<SessionInteraction, 'id' | 'timestamp'>): SessionInteraction;
    /**
     * Update user state (mood, focus topic, energy)
     */
    updateUserState(userId: string, updates: Partial<UserState>): void;
    /**
     * Query session interactions by topic keyword
     */
    queryByTopic(userId: string, topic: string): SessionInteraction[];
    /**
     * Get all pending interactions (reminders, tasks)
     */
    getPending(userId: string): SessionInteraction[];
    /**
     * Mark an interaction as completed
     */
    markCompleted(userId: string, interactionId: string): boolean;
    /**
     * Get session summary for long-term memory persistence
     */
    getSessionSummary(userId: string): string;
    /**
     * Get interaction context formatted for prompt injection
     */
    getContextForPrompt(userId: string): string;
    /**
     * End a session and return summary for long-term storage
     */
    endSession(userId: string): string | null;
    /**
     * Check if session has expired (24 hours)
     */
    private isSessionExpired;
    /**
     * Periodic cleanup of expired sessions
     */
    cleanupExpired(): number;
}
//# sourceMappingURL=session.memory.d.ts.map