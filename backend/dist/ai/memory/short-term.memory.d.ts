/**
 * Short-Term Memory — Working Context
 *
 * - Storage: In-memory deque (max ~10 messages)
 * - Content: Current conversation turns ({role, content, timestamp})
 * - Lifecycle: Cleared when conversation ends or context window exceeded
 * - Purpose: Provides immediate conversational coherence
 */
export interface ShortTermMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export declare class ShortTermMemory {
    private readonly logger;
    private readonly MAX_MESSAGES;
    /** Per-user short-term memory buffers */
    private buffers;
    /**
     * Add a message to the user's short-term memory
     */
    append(userId: string, message: ShortTermMessage): void;
    /**
     * Get all messages in the user's short-term memory
     */
    getAll(userId: string): ShortTermMessage[];
    /**
     * Scan short-term memory for a keyword/topic
     */
    scan(userId: string, query: string): ShortTermMessage[];
    /**
     * Clear the user's short-term memory
     */
    clear(userId: string): void;
    /**
     * Get the most recent N messages
     */
    getRecent(userId: string, count: number): ShortTermMessage[];
    /**
     * Get current buffer size
     */
    size(userId: string): number;
}
//# sourceMappingURL=short-term.memory.d.ts.map