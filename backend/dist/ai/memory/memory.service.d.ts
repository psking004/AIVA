/**
 * Memory Service - Manages conversation context and short-term memory
 *
 * Handles:
 * - Conversation history
 * - Working memory
 * - Context retrieval
 * - Message persistence
 */
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../cache/redis.service';
export declare class MemoryService {
    private prisma;
    private redis;
    private readonly logger;
    private readonly CONTEXT_WINDOW;
    constructor(prisma: PrismaService, redis: RedisService);
    /**
     * Get or create a conversation for a user
     */
    getOrCreateConversation(userId: string): Promise<string>;
    /**
     * Get conversation context (recent messages)
     */
    getConversationContext(userId: string, conversationId?: string): Promise<ConversationContext>;
    /**
     * Add a message to a conversation
     */
    addMessage(data: {
        userId: string;
        conversationId: string;
        role: string;
        content: string;
        toolCalls?: any[];
        toolResults?: any[];
        metadata?: Record<string, unknown>;
    }): Promise<void>;
    /**
     * Get all conversations for a user
     */
    getUserConversations(userId: string, limit?: number): Promise<any>;
    /**
     * Update conversation title based on first message
     */
    autoTitleConversation(conversationId: string): Promise<void>;
    /**
     * Clear conversation history
     */
    clearConversation(userId: string, conversationId: string): Promise<void>;
    /**
     * Delete a conversation
     */
    deleteConversation(userId: string, conversationId: string): Promise<void>;
    /**
     * Search conversations by content
     */
    searchConversations(userId: string, query: string): Promise<any>;
}
export interface ConversationContext {
    messages: Array<{
        role: string;
        content: string;
        metadata?: Record<string, unknown>;
    }>;
    metadata: Record<string, unknown>;
}
//# sourceMappingURL=memory.service.d.ts.map