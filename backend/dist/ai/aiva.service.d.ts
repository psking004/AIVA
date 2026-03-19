/**
 * AIVA Core Service - Central AI Brain
 *
 * AIVA (Artificial Intelligent Virtual Assistant) is the main interface
 * between the user and all system modules. It handles:
 * - Natural conversation with personality traits
 * - Command interpretation
 * - Agent routing
 * - Context awareness (3-layer memory)
 * - Multi-turn conversations
 * - Voice interaction support
 */
import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory/memory.service';
import { MemoryOrchestrator } from './memory/memory-orchestrator.service';
import { AgentOrchestrator } from './agents/orchestrator';
import { ToolRegistry } from './tools/registry';
import { IntentClassifier } from './tools/intent.classifier';
export declare class AIVAService {
    private configService;
    private memoryService;
    private memoryOrchestrator;
    private agentOrchestrator;
    private toolRegistry;
    private intentClassifier;
    private readonly logger;
    private llm;
    constructor(configService: ConfigService, memoryService: MemoryService, memoryOrchestrator: MemoryOrchestrator, agentOrchestrator: AgentOrchestrator, toolRegistry: ToolRegistry, intentClassifier: IntentClassifier);
    private initializeLLM;
    /**
     * Process a user message and generate response
     * Uses 3-layer memory for context-aware responses
     */
    chat(userId: string, message: string, conversationId?: string): Promise<AIVAConversationResponse>;
    private handleAgentRouting;
    /**
     * Handle direct LLM response using augmented prompt from 3-layer memory
     */
    private handleDirectResponse;
    /**
     * Execute a tool directly
     */
    executeTool(userId: string, toolName: string, args: Record<string, unknown>): Promise<any>;
    /**
     * Summarize content using AI
     */
    summarize(_userId: string, content: string, type?: string): Promise<string>;
    /**
     * Extract tasks from content
     */
    extractTasks(_userId: string, content: string): Promise<any>;
    /**
     * End a user's session and persist summary to long-term memory
     */
    endSession(userId: string): Promise<void>;
    /**
     * Get memory statistics for a user
     */
    getMemoryStats(userId: string): {
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
            userState: import("./memory/session.memory").UserState;
            metadata: Record<string, unknown>;
        };
        longTerm: {
            totalMemories: number;
            byType: Record<string, number>;
        };
    };
    /**
     * Get the system prompt (for debugging/inspection)
     */
    getSystemPrompt(): string;
}
export interface AIVAConversationResponse {
    conversationId: string;
    response: string;
    agentType: string | null;
    toolCalls: ToolCall[];
    context: ConversationContext;
}
export interface ToolCall {
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
}
export interface Intent {
    type: string;
    agentType: string | null;
    confidence: number;
    requiresAgent: boolean;
    parameters: Record<string, unknown>;
}
export interface ConversationContext {
    messages: Array<{
        role: string;
        content: string;
    }>;
    metadata: Record<string, unknown>;
}
//# sourceMappingURL=aiva.service.d.ts.map