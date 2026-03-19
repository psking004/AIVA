"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MemoryOrchestrator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryOrchestrator = void 0;
const common_1 = require("@nestjs/common");
const short_term_memory_1 = require("./short-term.memory");
const session_memory_1 = require("./session.memory");
const long_term_memory_1 = require("./long-term.memory");
const aiva_personality_1 = require("../personality/aiva-personality");
let MemoryOrchestrator = MemoryOrchestrator_1 = class MemoryOrchestrator {
    shortTermMemory;
    sessionMemory;
    longTermMemory;
    logger = new common_1.Logger(MemoryOrchestrator_1.name);
    constructor(shortTermMemory, sessionMemory, longTermMemory) {
        this.shortTermMemory = shortTermMemory;
        this.sessionMemory = sessionMemory;
        this.longTermMemory = longTermMemory;
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
    async buildPrompt(userId, userInput, userName, preferences) {
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
        const contextParts = [];
        if (sessionContext) {
            contextParts.push(sessionContext);
        }
        if (longTermResults.length > 0) {
            contextParts.push(this.longTermMemory.formatForPrompt(longTermResults));
        }
        const contextBlock = contextParts.join('\n\n');
        // ── Step 5: Assemble prompt ────────────────────────────────────
        const systemPrompt = (0, aiva_personality_1.buildPersonalizedPrompt)(userName, preferences);
        const messages = [
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
    async writeBack(event) {
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
                    status: 'done',
                    ...(event.metadata ? { metadata: event.metadata } : {}),
                });
                break;
            case 'reminder_set':
                this.sessionMemory.addInteraction(event.userId, {
                    type: 'reminder',
                    summary: event.content,
                    status: 'pending',
                    ...(event.metadata ? { metadata: event.metadata } : {}),
                });
                break;
            case 'preference_learned':
                await this.longTermMemory.add(event.userId, event.content, 'preference', event.metadata);
                this.logger.log(`Preference stored for ${event.userId}: ${event.content.substring(0, 60)}`);
                break;
            case 'session_end': {
                // Summarize session and persist to long-term memory
                const summary = this.sessionMemory.endSession(event.userId);
                if (summary) {
                    await this.longTermMemory.add(event.userId, summary, 'summary', { source: 'session_end' });
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
    async detectAndStorePreferences(userId, userMessage, _assistantResponse) {
        const preferencePatterns = [
            /i (?:prefer|like|want|always use|need) (.+)/i,
            /(?:set|change|update) (?:my )?(?:preference|setting|default) (?:to|for) (.+)/i,
            /(?:don't|do not|never) (?:show|do|use|send) (.+)/i,
            /(?:call me|my name is) (.+)/i,
        ];
        for (const pattern of preferencePatterns) {
            const match = userMessage.match(pattern);
            if (match) {
                await this.longTermMemory.add(userId, `User stated: "${userMessage}"`, 'preference', { detectedFrom: 'conversation', pattern: pattern.source });
                this.logger.log(`Auto-detected preference for ${userId}: ${match[0].substring(0, 60)}`);
                break;
            }
        }
    }
    /**
     * Get memory system statistics
     */
    getStats(userId) {
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
};
exports.MemoryOrchestrator = MemoryOrchestrator;
exports.MemoryOrchestrator = MemoryOrchestrator = MemoryOrchestrator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [short_term_memory_1.ShortTermMemory,
        session_memory_1.SessionMemory,
        long_term_memory_1.LongTermMemory])
], MemoryOrchestrator);
//# sourceMappingURL=memory-orchestrator.service.js.map