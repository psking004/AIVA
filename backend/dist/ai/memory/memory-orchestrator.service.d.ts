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
import { ShortTermMemory, ShortTermMessage } from './short-term.memory';
import { SessionMemory } from './session.memory';
import { LongTermMemory, LongTermQueryResult } from './long-term.memory';
export interface AugmentedPrompt {
    messages: Array<{
        role: string;
        content: string;
    }>;
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
export declare class MemoryOrchestrator {
    private shortTermMemory;
    private sessionMemory;
    private longTermMemory;
    private readonly logger;
    constructor(shortTermMemory: ShortTermMemory, sessionMemory: SessionMemory, longTermMemory: LongTermMemory);
    /**
     * Build an augmented prompt by querying all three memory layers
     *
     * This is the core retrieval flow:
     *   1. Get short-term history (last ~10 messages)
     *   2. Query session memory for relevant tasks/context
     *   3. Semantic search long-term memory for relevant memories
     *   4. Assemble everything into a prompt with context
     */
    buildPrompt(userId: string, userInput: string, userName?: string, preferences?: Record<string, unknown>): Promise<AugmentedPrompt>;
    /**
     * Write back to memory after an event
     *
     * Follows the spec's write-back rules:
     *   - Every user/assistant turn → Short-term
     *   - Task completion, reminder set → Session memory
     *   - New user preference → Long-term
     *   - Session end (summary) → Long-term
     */
    writeBack(event: MemoryWriteBackEvent): Promise<void>;
    /**
     * Detect and auto-store user preferences from assistant responses
     */
    detectAndStorePreferences(userId: string, userMessage: string, _assistantResponse: string): Promise<void>;
    /**
     * Get memory system statistics
     */
    getStats(userId: string): {
        shortTerm: {
            messageCount: number;
        };
        session: {
            interactions: undefined;
            interactionCount: number;
            sessionId: string;
            userId: string;
            startedAt: Date;
            lastActiveAt: Date;
            userState: import("./session.memory").UserState;
            metadata: Record<string, unknown>;
        };
        longTerm: {
            totalMemories: number;
            byType: Record<string, number>;
        };
    };
}
//# sourceMappingURL=memory-orchestrator.service.d.ts.map