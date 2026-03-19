/**
 * Memory Service - Manages conversation context and short-term memory
 *
 * Handles:
 * - Conversation history
 * - Working memory
 * - Context retrieval
 * - Message persistence
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../cache/redis.service';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly CONTEXT_WINDOW = 10; // Keep last 10 messages in context

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Get or create a conversation for a user
   */
  async getOrCreateConversation(userId: string): Promise<string> {
    const cacheKey = `conversation:${userId}:latest`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const latest = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (latest) {
      await this.redis.set(cacheKey, latest.id, 3600); // Cache for 1 hour
      return latest.id;
    }

    const newConversation = await this.prisma.conversation.create({
      data: {
        userId,
        title: null,
        metadata: { source: 'aiva' },
      },
    });

    await this.redis.set(cacheKey, newConversation.id, 3600);
    return newConversation.id;
  }

  /**
   * Get conversation context (recent messages)
   */
  async getConversationContext(
    userId: string,
    conversationId?: string,
  ): Promise<ConversationContext> {
    const cid = conversationId || await this.getOrCreateConversation(userId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId: cid },
      orderBy: { createdAt: 'asc' },
      take: this.CONTEXT_WINDOW,
    });

    return {
      messages: messages.map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content,
        metadata: m.metadata,
      })),
      metadata: {},
    };
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(data: {
    userId: string;
    conversationId: string;
    role: string;
    content: string;
    toolCalls?: any[];
    toolResults?: any[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        role: data.role as any,
        content: data.content,
        toolCalls: data.toolCalls,
        toolResults: data.toolResults,
        metadata: data.metadata || {},
      },
    });

    // Invalidate cache to force refresh on next read
    await this.redis.del(`conversation:${data.userId}:latest`);
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string, limit = 20) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  /**
   * Update conversation title based on first message
   */
  async autoTitleConversation(conversationId: string): Promise<void> {
    const firstMessage = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (!firstMessage) return;

    // In production, would use AI to generate a title
    const title = firstMessage.content.substring(0, 50) + '...';

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  /**
   * Clear conversation history
   */
  async clearConversation(userId: string, conversationId: string): Promise<void> {
    await this.prisma.message.deleteMany({
      where: { conversationId },
    });

    await this.redis.del(`conversation:${userId}:latest`);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    await this.prisma.conversation.delete({
      where: { id: conversationId, userId },
    });

    await this.redis.del(`conversation:${userId}:latest`);
  }

  /**
   * Search conversations by content
   */
  async searchConversations(userId: string, query: string) {
    return this.prisma.conversation.findMany({
      where: {
        userId,
        messages: {
          some: {
            content: { contains: query, mode: 'insensitive' },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          where: { content: { contains: query, mode: 'insensitive' } },
          take: 1,
        },
      },
    });
  }
}

export interface ConversationContext {
  messages: Array<{
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
}
