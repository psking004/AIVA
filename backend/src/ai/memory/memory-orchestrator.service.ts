/**
 * Memory Retrieval Orchestrator
 *
 * Implements the runtime retrieval flow from the spec:
 *
 * 1. STT → text transcription
 * 2. Query SHORT-TERM memory (in-memory scan)
 * 3. Query SESSION memory (lookup)
 * 4. Query LONG-TERM memory (semantic similarity search)
 * 5. Compose Augmented Prompt
 * 6. LLM generates response
 * 7. TTS speaks response
 * 8. Store interaction → short-term + session
 *
 * Memory Write-Back Rules:
 *   - Every user/assistant turn → Short-term (in-memory)
 *   - Task completion, reminder set → Session memory
 *   - New user preference learned → Long-term
 *   - Session end (summary) → Long-term
 */

import { Injectable, Logger } from '@nestjs/common';
import { ShortTermMemory, ShortTermMessage } from './short-term.memory';
import { SessionMemory } from './session.memory';
import { LongTermMemory, LongTermQueryResult } from './long-term.memory';
import { buildPersonalizedPrompt } from '../personality/aiva-personality';

export interface AugmentedPrompt {
  messages: Array<{ role: string; content: string }>;
  retrievedContext: {
    shortTerm: ShortTermMessage[];
    sessionContext: string;
    longTermMemories: LongTermQueryResult[];
  };
}

export interface MemoryWriteBackEvent {
  type: 'user_turn' | 'assistant_turn' | 'task_completed' | 'reminder_set' | 'preference_learned' | 'session_end';
  userId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MemoryOrchestrator {
  private readonly logger = new Logger(MemoryOrchestrator.name);

  constructor(
    private shortTermMemory: ShortTermMemory,
    private sessionMemory: SessionMemory,
    private longTermMemory: LongTermMemory,
  ) {
    this.logger.log('Memory Orchestrator initialized — 3-layer memory system active');
  }

  /**
   * Build an augmented prompt by querying all three memory layers
   *
   * This is the core retrieval flow:
   *   1. Get short-term history (last ~10 messages)
   *   2. Query session memory for relevant tasks/context
   *   3. Semantic search long-term memory for relevant memories
   *   4. Assemble everything into a prompt with context
   */
  async buildPrompt(
    userId: string,
    userInput: string,
    userName?: string,
    preferences?: Record<string, unknown>,
  ): Promise<AugmentedPrompt> {
    this.logger.debug(`Building augmented prompt for user ${userId}: "${userInput.substring(0, 50)}..."`);

    // ── Step 1: Short-term memory ──────────────────────────────────
    const shortTermMessages = this.shortTermMemory.getAll(userId);
    this.logger.debug(`Short-term: ${shortTermMessages.length} messages in context`);

    // ── Step 2: Session memory ─────────────────────────────────────
    const sessionContext = this.sessionMemory.getContextForPrompt(userId);
    this.logger.debug(`Session context: ${sessionContext ? 'available' : 'empty'}`);

    // ── Step 3: Long-term memory (semantic search) ─────────────────
    const longTermResults = await this.longTermMemory.query(userId, userInput, 3);
    this.logger.debug(`Long-term: ${longTermResults.length} relevant memories found`);

    // ── Step 4: Build context block ────────────────────────────────
    const contextParts: string[] = [];

    if (sessionContext) {
      contextParts.push(sessionContext);
    }

    if (longTermResults.length > 0) {
      contextParts.push(this.longTermMemory.formatForPrompt(longTermResults));
    }

    const contextBlock = contextParts.join('\n\n');

    // ── Step 5: Assemble prompt ────────────────────────────────────
    const systemPrompt = buildPersonalizedPrompt(userName, preferences);

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add context if available
    if (contextBlock) {
      messages.push({
        role: 'system',
        content: `Relevant context:\n${contextBlock}`,
      });
    }

    // Add conversation history from short-term memory
    shortTermMessages.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Add the current user input
    messages.push({
      role: 'user',
      content: userInput,
    });

    return {
      messages,
      retrievedContext: {
        shortTerm: shortTermMessages,
        sessionContext,
        longTermMemories: longTermResults,
      },
    };
  }

  /**
   * Write back to memory after an event
   *
   * Follows the spec's write-back rules:
   *   - Every user/assistant turn → Short-term
   *   - Task completion, reminder set → Session memory
   *   - New user preference → Long-term
   *   - Session end (summary) → Long-term
   */
  async writeBack(event: MemoryWriteBackEvent): Promise<void> {
    switch (event.type) {
      case 'user_turn':
        this.shortTermMemory.append(event.userId, {
          role: 'user',
          content: event.content,
          timestamp: new Date(),
          ...(event.metadata ? { metadata: event.metadata } : {}),
        });
        break;

      case 'assistant_turn':
        this.shortTermMemory.append(event.userId, {
          role: 'assistant',
          content: event.content,
          timestamp: new Date(),
          ...(event.metadata ? { metadata: event.metadata } : {}),
        });
        break;

      case 'task_completed':
        this.sessionMemory.addInteraction(event.userId, {
          type: 'task',
          summary: event.content,
          status: 'done' as const,
          ...(event.metadata ? { metadata: event.metadata } : {}),
        });
        break;

      case 'reminder_set':
        this.sessionMemory.addInteraction(event.userId, {
          type: 'reminder',
          summary: event.content,
          status: 'pending' as const,
          ...(event.metadata ? { metadata: event.metadata } : {}),
        });
        break;

      case 'preference_learned':
        await this.longTermMemory.add(
          event.userId,
          event.content,
          'preference',
          event.metadata,
        );
        this.logger.log(`Preference stored for ${event.userId}: ${event.content.substring(0, 60)}`);
        break;

      case 'session_end': {
        // Summarize session and persist to long-term memory
        const summary = this.sessionMemory.endSession(event.userId);
        if (summary) {
          await this.longTermMemory.add(
            event.userId,
            summary,
            'summary',
            { source: 'session_end' },
          );
          this.logger.log(`Session summary stored in long-term memory for ${event.userId}`);
        }
        // Clear short-term memory
        this.shortTermMemory.clear(event.userId);
        break;
      }
    }
  }

  /**
   * Detect and auto-store user preferences from assistant responses
   */
  async detectAndStorePreferences(
    userId: string,
    userMessage: string,
    _assistantResponse: string,
  ): Promise<void> {
    const preferencePatterns = [
      /i (?:prefer|like|want|always use|need) (.+)/i,
      /(?:set|change|update) (?:my )?(?:preference|setting|default) (?:to|for) (.+)/i,
      /(?:don't|do not|never) (?:show|do|use|send) (.+)/i,
      /(?:call me|my name is) (.+)/i,
    ];

    for (const pattern of preferencePatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        await this.longTermMemory.add(
          userId,
          `User stated: "${userMessage}"`,
          'preference',
          { detectedFrom: 'conversation', pattern: pattern.source },
        );
        this.logger.log(`Auto-detected preference for ${userId}: ${match[0].substring(0, 60)}`);
        break;
      }
    }
  }

  /**
   * Get memory system statistics
   */
  getStats(userId: string) {
    return {
      shortTerm: {
        messageCount: this.shortTermMemory.size(userId),
      },
      session: {
        ...this.sessionMemory.getOrCreateSession(userId),
        // Don't expose internal fields
        interactions: undefined,
        interactionCount: this.sessionMemory.getOrCreateSession(userId).interactions.length,
      },
      longTerm: this.longTermMemory.getStats(userId),
    };
  }
}
