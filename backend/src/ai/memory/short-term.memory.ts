/**
 * Short-Term Memory — Working Context
 *
 * - Storage: In-memory deque (max ~10 messages)
 * - Content: Current conversation turns ({role, content, timestamp})
 * - Lifecycle: Cleared when conversation ends or context window exceeded
 * - Purpose: Provides immediate conversational coherence
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ShortTermMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ShortTermMemory {
  private readonly logger = new Logger(ShortTermMemory.name);
  private readonly MAX_MESSAGES = 10;

  /** Per-user short-term memory buffers */
  private buffers: Map<string, ShortTermMessage[]> = new Map();

  /**
   * Add a message to the user's short-term memory
   */
  append(userId: string, message: ShortTermMessage): void {
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

    this.logger.debug(
      `Short-term memory for ${userId}: ${buffer.length}/${this.MAX_MESSAGES} messages`,
    );
  }

  /**
   * Get all messages in the user's short-term memory
   */
  getAll(userId: string): ShortTermMessage[] {
    return this.buffers.get(userId) || [];
  }

  /**
   * Scan short-term memory for a keyword/topic
   */
  scan(userId: string, query: string): ShortTermMessage[] {
    const buffer = this.buffers.get(userId) || [];
    const lowerQuery = query.toLowerCase();

    return buffer.filter((msg) =>
      msg.content.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Clear the user's short-term memory
   */
  clear(userId: string): void {
    this.buffers.delete(userId);
    this.logger.debug(`Short-term memory cleared for ${userId}`);
  }

  /**
   * Get the most recent N messages
   */
  getRecent(userId: string, count: number): ShortTermMessage[] {
    const buffer = this.buffers.get(userId) || [];
    return buffer.slice(-count);
  }

  /**
   * Get current buffer size
   */
  size(userId: string): number {
    return (this.buffers.get(userId) || []).length;
  }
}
