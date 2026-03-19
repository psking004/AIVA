"use strict";
/**
 * Memory Service - Manages conversation context and short-term memory
 *
 * Handles:
 * - Conversation history
 * - Working memory
 * - Context retrieval
 * - Message persistence
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MemoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const redis_service_1 = require("../../cache/redis.service");
let MemoryService = MemoryService_1 = class MemoryService {
    prisma;
    redis;
    logger = new common_1.Logger(MemoryService_1.name);
    CONTEXT_WINDOW = 10; // Keep last 10 messages in context
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    /**
     * Get or create a conversation for a user
     */
    async getOrCreateConversation(userId) {
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
    async getConversationContext(userId, conversationId) {
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
    async addMessage(data) {
        await this.prisma.message.create({
            data: {
                conversationId: data.conversationId,
                role: data.role,
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
    async getUserConversations(userId, limit = 20) {
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
    async autoTitleConversation(conversationId) {
        const firstMessage = await this.prisma.message.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
        if (!firstMessage)
            return;
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
    async clearConversation(userId, conversationId) {
        await this.prisma.message.deleteMany({
            where: { conversationId },
        });
        await this.redis.del(`conversation:${userId}:latest`);
    }
    /**
     * Delete a conversation
     */
    async deleteConversation(userId, conversationId) {
        await this.prisma.conversation.delete({
            where: { id: conversationId, userId },
        });
        await this.redis.del(`conversation:${userId}:latest`);
    }
    /**
     * Search conversations by content
     */
    async searchConversations(userId, query) {
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
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = MemoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], MemoryService);
//# sourceMappingURL=memory.service.js.map