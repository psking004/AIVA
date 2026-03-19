"use strict";
/**
 * Short-Term Memory — Working Context
 *
 * - Storage: In-memory deque (max ~10 messages)
 * - Content: Current conversation turns ({role, content, timestamp})
 * - Lifecycle: Cleared when conversation ends or context window exceeded
 * - Purpose: Provides immediate conversational coherence
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ShortTermMemory_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShortTermMemory = void 0;
const common_1 = require("@nestjs/common");
let ShortTermMemory = ShortTermMemory_1 = class ShortTermMemory {
    logger = new common_1.Logger(ShortTermMemory_1.name);
    MAX_MESSAGES = 10;
    /** Per-user short-term memory buffers */
    buffers = new Map();
    /**
     * Add a message to the user's short-term memory
     */
    append(userId, message) {
        let buffer = this.buffers.get(userId);
        if (!buffer) {
            buffer = [];
            this.buffers.set(userId, buffer);
        }
        buffer.push(message);
        // Enforce max length — deque behavior (remove oldest)
        while (buffer.length > this.MAX_MESSAGES) {
            buffer.shift();
        }
        this.logger.debug(`Short-term memory for ${userId}: ${buffer.length}/${this.MAX_MESSAGES} messages`);
    }
    /**
     * Get all messages in the user's short-term memory
     */
    getAll(userId) {
        return this.buffers.get(userId) || [];
    }
    /**
     * Scan short-term memory for a keyword/topic
     */
    scan(userId, query) {
        const buffer = this.buffers.get(userId) || [];
        const lowerQuery = query.toLowerCase();
        return buffer.filter((msg) => msg.content.toLowerCase().includes(lowerQuery));
    }
    /**
     * Clear the user's short-term memory
     */
    clear(userId) {
        this.buffers.delete(userId);
        this.logger.debug(`Short-term memory cleared for ${userId}`);
    }
    /**
     * Get the most recent N messages
     */
    getRecent(userId, count) {
        const buffer = this.buffers.get(userId) || [];
        return buffer.slice(-count);
    }
    /**
     * Get current buffer size
     */
    size(userId) {
        return (this.buffers.get(userId) || []).length;
    }
};
exports.ShortTermMemory = ShortTermMemory;
exports.ShortTermMemory = ShortTermMemory = ShortTermMemory_1 = __decorate([
    (0, common_1.Injectable)()
], ShortTermMemory);
//# sourceMappingURL=short-term.memory.js.map