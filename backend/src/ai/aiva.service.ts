/**
 * AIVA Core Service - Central AI Brain & Orchestrator
 *
 * AIVA (Artificial Intelligent Virtual Assistant) is the main interface
 * between the user and all system modules. It handles:
 * - Natural conversation with personality traits
 * - Command interpretation
 * - Agent routing
 * - Context awareness (3-layer memory)
 * - Multi-turn conversations
 * - Multi-provider model orchestration (Local Qwen3 8B via Ollama + Cloud OpenRouter Qwen + Cloud Google Gemini)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryService } from './memory/memory.service';
import { MemoryOrchestrator } from './memory/memory-orchestrator.service';
import { AgentOrchestrator, AgentType } from './agents/orchestrator';
import { ToolRegistry } from './tools/registry';
import { IntentClassifier, ClassifiedIntent } from './tools/intent.classifier';
import { AIVA_SYSTEM_PROMPT } from './personality/aiva-personality';
import { ModelRouterService } from './router/model-router.service';
import { AIMessage } from './providers/ai-provider.interface';

@Injectable()
export class AIVAService {
  private readonly logger = new Logger(AIVAService.name);

  constructor(
    private configService: ConfigService,
    private memoryService: MemoryService,
    private memoryOrchestrator: MemoryOrchestrator,
    private agentOrchestrator: AgentOrchestrator,
    private toolRegistry: ToolRegistry,
    private intentClassifier: IntentClassifier,
    private modelRouter: ModelRouterService,
  ) {
    this.logger.log('AIVA Core Service initialized with Model Router orchestration');
  }

  /**
   * Process a user message and generate response
   * Uses 3-layer memory for context-aware responses
   */
  async chat(
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<AIVAConversationResponse> {
    this.logger.debug(`Processing message from user ${userId}: ${message.substring(0, 50)}...`);

    // Write user turn to memory layers
    await this.memoryOrchestrator.writeBack({
      type: 'user_turn',
      userId,
      content: message,
    });

    // Get conversation context from traditional memory service
    const context = await this.memoryService.getConversationContext(userId, conversationId);

    // Classify intent
    const intent = await this.intentClassifier.classify(message, context);

    this.logger.debug(`Classified intent: ${intent.type}, confidence: ${intent.confidence}`);

    // Route to agent or handle directly
    let response: AIVAConversationResponse;

    if (intent.requiresAgent) {
      response = await this.handleAgentRouting(userId, message, intent, context);
    } else {
      response = await this.handleDirectResponse(userId, message);
    }

    // Write assistant turn to memory layers
    await this.memoryOrchestrator.writeBack({
      type: 'assistant_turn',
      userId,
      content: response.response,
      metadata: {
        agentType: response.agentType,
        toolCalls: response.toolCalls,
      },
    });

    // Auto-detect and store user preferences
    await this.memoryOrchestrator.detectAndStorePreferences(
      userId,
      message,
      response.response,
    );

    return response;
  }

  private async handleAgentRouting(
    userId: string,
    message: string,
    intent: ClassifiedIntent,
    context: ConversationContext,
  ): Promise<AIVAConversationResponse> {
    this.logger.log(`Routing to agent: ${intent.agentType}`);

    // Delegate to agent orchestrator
    const agentResult = await this.agentOrchestrator.execute(
      userId,
      intent.agentType as AgentType,
      message,
      intent.parameters,
      context,
    );

    // Store conversation in persistent DB
    await this.memoryService.addMessage({
      userId,
      conversationId: agentResult.conversationId,
      role: 'user',
      content: message,
    });

    await this.memoryService.addMessage({
      userId,
      conversationId: agentResult.conversationId,
      role: 'assistant',
      content: agentResult.response,
      metadata: {
        agentType: intent.agentType,
        toolCalls: agentResult.toolCalls,
      },
    });

    // Track task completions in session memory
    if (intent.type === 'task' && agentResult.toolCalls?.length > 0) {
      await this.memoryOrchestrator.writeBack({
        type: 'task_completed',
        userId,
        content: `Handled task: ${message.substring(0, 100)}`,
        metadata: { agentType: intent.agentType },
      });
    }

    return {
      conversationId: agentResult.conversationId,
      response: agentResult.response,
      agentType: intent.agentType,
      toolCalls: agentResult.toolCalls,
      context: agentResult.context,
    };
  }

  /**
   * Handle direct LLM response using augmented prompt from 3-layer memory
   * Dispatches to ModelRouterService (Local Ollama / Cloud OpenRouter / Cloud Gemini)
   */
  private async handleDirectResponse(
    userId: string,
    message: string,
  ): Promise<AIVAConversationResponse> {
    // Build augmented prompt with all memory layers
    const augmentedPrompt = await this.memoryOrchestrator.buildPrompt(
      userId,
      message,
    );

    // Convert to AI provider message format
    const messages: AIMessage[] = augmentedPrompt.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Generate response via AIVA Model Router
    const response = await this.modelRouter.chat(messages, {
      temperature: parseFloat(this.configService.get('AI_TEMPERATURE', '0.7')),
      maxTokens: parseInt(this.configService.get('AI_MAX_TOKENS', '4096')),
    });

    // Create conversation if needed
    const conversationId = await this.memoryService.getOrCreateConversation(userId);

    // Store messages in persistent DB
    await this.memoryService.addMessage({
      userId,
      conversationId,
      role: 'user',
      content: message,
    });

    await this.memoryService.addMessage({
      userId,
      conversationId,
      role: 'assistant',
      content: response.content,
      metadata: {
        model: response.model,
        provider: response.provider,
      },
    });

    return {
      conversationId,
      response: response.content,
      agentType: null,
      toolCalls: [],
      context: await this.memoryService.getConversationContext(userId, conversationId),
    };
  }

  /**
   * Execute a tool directly
   */
  async executeTool(userId: string, toolName: string, args: Record<string, unknown>) {
    this.logger.log(`Executing tool: ${toolName}`);
    return this.toolRegistry.execute(userId, toolName, args);
  }

  /**
   * Summarize content using AIVA Model Router
   */
  async summarize(_userId: string, content: string, type: string = 'general'): Promise<string> {
    const prompt = `Summarize the following ${type} concisely:\n\n${content}`;
    const response = await this.modelRouter.complete(prompt, {
      temperature: 0.3,
      maxTokens: 1024,
    });
    return response.content;
  }

  /**
   * Extract tasks from content using AIVA Model Router
   */
  async extractTasks(_userId: string, content: string): Promise<any> {
    const prompt = `Extract actionable tasks from the following content.
Return ONLY a valid JSON array of objects with title, description, priority (LOW, MEDIUM, HIGH), and dueDate (ISO format or null).
Do not include markdown fences or other text.

Content:
${content}`;

    const response = await this.modelRouter.complete(prompt, {
      temperature: 0.2,
      maxTokens: 1500,
    });

    try {
      const cleanContent = response.content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(cleanContent);
    } catch {
      this.logger.warn(`Failed to parse extracted tasks JSON from model response: "${response.content.substring(0, 100)}"`);
      return [
        {
          title: content.substring(0, 80),
          description: content,
          priority: 'MEDIUM',
          dueDate: null,
        },
      ];
    }
  }

  /**
   * End a user's session and persist summary to long-term memory
   */
  async endSession(userId: string): Promise<void> {
    await this.memoryOrchestrator.writeBack({
      type: 'session_end',
      userId,
      content: 'Session ended by user',
    });
    this.logger.log(`Session ended for user ${userId} — summary stored in long-term memory`);
  }

  /**
   * Get memory statistics for a user
   */
  getMemoryStats(userId: string) {
    return this.memoryOrchestrator.getStats(userId);
  }

  /**
   * Get the system prompt (for debugging/inspection)
   */
  getSystemPrompt(): string {
    return AIVA_SYSTEM_PROMPT;
  }

  /**
   * Get model router diagnostic status
   */
  async getModelRouterStatus() {
    return this.modelRouter.getStatus();
  }
}

// Types
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
  agentType: AgentType | null;
  confidence: number;
  requiresAgent: boolean;
  parameters: Record<string, unknown>;
}

export interface ConversationContext {
  messages: Array<{ role: string; content: string }>;
  metadata: Record<string, unknown>;
}
