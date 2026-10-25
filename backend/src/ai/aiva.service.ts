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
import { ComputeSchedulerService } from './nodes/compute-scheduler.service';
import { FabricDispatchService } from './nodes/fabric-dispatch.service';
import { AIMessage } from './providers/ai-provider.interface';
import {
  AivaBackendTrace,
  createDefaultTrace,
  printAivaBackendTrace,
} from './ai-backend-trace';

export class FabricNodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FabricNodeUnavailableError';
  }
}

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
    private computeScheduler: ComputeSchedulerService,
    private fabricDispatch: FabricDispatchService,

  ) {
    this.logger.log('AIVA Core Service initialized with Model Router orchestration');
  }

  /**
   * Process a user message and generate response
   * Uses 3-layer memory for context-aware responses
   */
  /**
   * Execute chat inference on an independent AIVA compute node.
   *
   * The scheduler decides the node.
   * FabricDispatchService transports the work.
   * The node worker performs the actual local inference.
   */
  private async executeFabricChat(
    userId: string,
    message: string,
    metadata?: {
      clientPlatform?: string;
      mode?: string;
      sourceDeviceId?: string;
      privacyLevel?: string;
    },
  ): Promise<{
    content: string;
    provider: string;
    model: string;
    targetNode: string;
    targetDeviceId: string;
    latencyMs?: number;
  }> {
    const sourceDeviceId =
      metadata?.sourceDeviceId && metadata.sourceDeviceId !== 'none'
        ? metadata.sourceDeviceId
        : `aiva-${userId}`;

    const sourceDeviceType:
      'android' | 'desktop' | 'web' =
      metadata?.clientPlatform === 'android'
        ? 'android'
        : metadata?.clientPlatform === 'web'
          ? 'web'
          : 'desktop';

    const privacyLevel:
      'PUBLIC' | 'STANDARD' | 'PRIVATE' =
      metadata?.privacyLevel === 'PRIVATE'
        ? 'PRIVATE'
        : metadata?.privacyLevel === 'PUBLIC'
          ? 'PUBLIC'
          : 'STANDARD';

    const decision =
      this.computeScheduler.schedule({
        type: 'AI_INFERENCE',
        sourceDeviceId,
        sourceDeviceType,
        privacyLevel,
        requiredCapability: 'LOCAL_LLM',
      });

    this.logger.log(
      `[FABRIC] ${sourceDeviceId} -> ${decision.targetNode} (${decision.routingReason})`,
    );

    if (
      decision.targetNode === 'CLOUD' ||
      decision.targetNode === 'LOCAL_STANDALONE'
    ) {
      throw new FabricNodeUnavailableError(
        `No independent fabric node available for local inference: ${decision.targetNode}`,
      );
    }

    if (
      !decision.targetDeviceId ||
      !decision.targetNode
    ) {
      throw new Error(
        'Fabric scheduler returned an invalid target',
      );
    }

    const requestId =
      `fabric-chat-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const work =
      this.fabricDispatch.createWork({
        requestId,
        sourceDeviceId,
        targetNodeId:
          decision.targetNode as
            | 'PC-A'
            | 'PC-B'
            | 'ANDROID'
            | 'CLOUD',
        targetDeviceId:
          decision.targetDeviceId,
        type: 'AI_INFERENCE',
        capability: 'LOCAL_LLM',
        capabilityLevel: 1,
        payload: {
          model: decision.model,
          messages: [
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.7,
          maxTokens: 2048,
        },
        ttlMs: 120_000,
      });

    this.logger.log(
      `[FABRIC] Work queued: ${work.requestId} -> ${work.targetNodeId}`,
    );

    const completed =
      await this.fabricDispatch.waitForCompletion(
        requestId,
        120_000,
      );

    if (completed.status !== 'COMPLETED') {
      throw new Error(
        completed.error ||
          `Fabric inference ended with status ${completed.status}`,
      );
    }

    const result = completed.result;

    if (!result?.content) {
      throw new Error(
        'Fabric worker completed without response content',
      );
    }

    const response: {
      content: string;
      provider: string;
      model: string;
      targetNode: string;
      targetDeviceId: string;
      latencyMs?: number;
    } = {
      content: String(result.content),
      provider:
        result.provider ||
        decision.provider ||
        'ollama',
      model:
        result.model ||
        decision.model ||
        'unknown',
      targetNode:
        decision.targetNode,
      targetDeviceId:
        decision.targetDeviceId,
    };

    if (typeof result.latencyMs === 'number') {
      response.latencyMs = result.latencyMs;
    }

    return response;
  }
  async chat(
    userId: string,
    message: string,
    conversationId?: string,
    metadata?: {
      requestId?: string;
      authenticated?: boolean;
      deviceAuthorized?: boolean;
      route?: string;
      mode?: string;
      clientPlatform?: string;
      sourceDeviceId?: string;
    },
  ): Promise<AIVAConversationResponse> {
    const startTime = Date.now();
    const trace = createDefaultTrace(metadata?.requestId || `req_${Date.now()}`);
    trace.authenticated = metadata?.authenticated ?? true;
    trace.deviceAuthorized = metadata?.deviceAuthorized ?? true;
    trace.route = metadata?.route || '/ai/chat';
    trace.mode = metadata?.mode || 'default';

    this.logger.debug(
      `Processing message from user ${userId} [${trace.requestId}]: ${message.substring(0, 50)}...`,
    );

    try {
      // 1. Write user turn to memory layers
      trace.failure_stage = 'memory_write_user_turn';
      try {
        await this.memoryOrchestrator.writeBack({
          type: 'user_turn',
          userId,
          content: message,
        });
      } catch (memErr: any) {
        this.logger.warn(`Failed writing user turn to memory: ${memErr.message}`);
      }

      // 2. Get conversation context from memory service
      trace.failure_stage = 'memory_get_context';
      const context = await this.memoryService.getConversationContext(userId, conversationId);

      // 3. Classify intent
      trace.failure_stage = 'intent_classification';
      const intent = await this.intentClassifier.classify(message, context);
      trace.messageCategory = intent.type || 'general';

      this.logger.debug(`Classified intent: ${intent.type}, confidence: ${intent.confidence}`);

      // 4. Route to agent or handle directly
      let response: AIVAConversationResponse;

      if (intent.requiresAgent) {
        trace.tool_selected = intent.agentType || 'none';
        trace.failure_stage = `agent_${intent.agentType}`;
        response = await this.handleAgentRouting(userId, message, intent, context, trace);
        trace.tool_execution = response.toolCalls?.length > 0 ? 'executed' : 'completed';
      } else {
        trace.failure_stage = 'direct_model_inference';
        response = await this.handleDirectResponse(
          userId,
          message,
          trace,
          metadata?.clientPlatform,
          metadata?.mode,
          metadata?.sourceDeviceId,
        );
      }

      // 5. Write assistant turn to memory layers
      trace.failure_stage = 'memory_write_assistant_turn';
      try {
        await this.memoryOrchestrator.writeBack({
          type: 'assistant_turn',
          userId,
          content: response.response,
          metadata: {
            agentType: response.agentType,
            toolCalls: response.toolCalls,
          },
        });
      } catch (memErr: any) {
        this.logger.warn(`Failed writing assistant turn to memory: ${memErr.message}`);
      }

      // 6. Auto-detect and store user preferences
      try {
        await this.memoryOrchestrator.detectAndStorePreferences(
          userId,
          message,
          response.response,
        );
      } catch (prefErr: any) {
        this.logger.warn(`Preference detection warning: ${prefErr.message}`);
      }

      trace.final_response_generated = true;
      trace.total_latency = Date.now() - startTime;
      trace.failure_stage = 'none';
      trace.failure_type = 'none';
      trace.failure_message = 'none';

      printAivaBackendTrace(trace);
      return response;
    } catch (error: any) {
      trace.final_response_generated = false;
      trace.total_latency = Date.now() - startTime;
      trace.failure_type = error.name || 'Error';
      trace.failure_message = error.message || 'Unknown error';

      printAivaBackendTrace(trace);
      console.error(`[AIVA BACKEND EXCEPTION] Error in chat processing: ${error.message}`);
      if (error.stack) {
        console.error(`[AIVA BACKEND STACK TRACE]\n${error.stack}`);
      }
      throw error;
    }
  }

  private async handleAgentRouting(
    userId: string,
    message: string,
    intent: ClassifiedIntent,
    context: ConversationContext,
    _trace?: AivaBackendTrace,
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
    const cid =
      agentResult.conversationId ||
      (await this.memoryService.getOrCreateConversation(userId));

    await this.memoryService.addMessage({
      userId,
      conversationId: cid,
      role: 'user',
      content: message,
    });

    await this.memoryService.addMessage({
      userId,
      conversationId: cid,
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
      conversationId: cid,
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
    trace?: AivaBackendTrace,
    clientPlatform?: string,
    mode?: string,
    sourceDeviceId?: string,
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
    let response: {
      content: string;
      model: string;
      provider: string;
      latencyMs?: number;
    };

    const requestedMode = mode || 'default';

    // Distributed fabric is authoritative for explicit local execution.
    // For local-first/auto, use fabric when a local node is available,
    // otherwise preserve the existing ModelRouter cloud fallback.
    const shouldTryFabric =
      requestedMode === 'local-first' ||
      requestedMode === 'auto' ||
      requestedMode === 'local-only';

    if (shouldTryFabric) {
      try {
        const fabricResponse = await this.executeFabricChat(
          userId,
          message,
          {
            ...(clientPlatform ? { clientPlatform } : {}),
            mode: requestedMode,
            sourceDeviceId: sourceDeviceId || `aiva-${userId}`,
          },
        );

        if (fabricResponse) {
          response = fabricResponse;
          if (trace) {
            trace.provider_selected = response.provider;
            trace.model_selected = response.model;
            trace.provider_latency = response.latencyMs || 0;
            trace.provider_response_valid = true;
          }
        } else {
          if (requestedMode === 'local-only') {
            throw new Error(
              'LOCAL_ONLY requested but no local fabric node was available.',
            );
          }

          response = await this.modelRouter.chat(
            messages,
            {
              temperature: parseFloat(this.configService.get('AI_TEMPERATURE', '0.7')),
              maxTokens: parseInt(this.configService.get('AI_MAX_TOKENS', '4096')),
              clientPlatform,
              strategy: mode as any,
            },
            trace,
          );
        }
      } catch (fabricError: any) {
        if (requestedMode === 'local-only') {
          throw fabricError;
        }

        const isUnavailable = fabricError instanceof FabricNodeUnavailableError;
        if (!isUnavailable) {
          this.logger.error(
            `[FABRIC ERROR] Execution failed on assigned node: ${fabricError?.message || fabricError}`,
            fabricError?.stack,
          );
          throw fabricError;
        }

        this.logger.warn(
          `[FABRIC UNAVAILABLE] Local nodes offline or unavailable; falling back to ModelRouter: ${fabricError?.message || fabricError}`,
        );

        response = await this.modelRouter.chat(
          messages,
          {
            temperature: parseFloat(this.configService.get('AI_TEMPERATURE', '0.7')),
            maxTokens: parseInt(this.configService.get('AI_MAX_TOKENS', '4096')),
            clientPlatform,
            strategy: mode as any,
          },
          trace,
        );
      }
    } else {
      response = await this.modelRouter.chat(
        messages,
        {
          temperature: parseFloat(this.configService.get('AI_TEMPERATURE', '0.7')),
          maxTokens: parseInt(this.configService.get('AI_MAX_TOKENS', '4096')),
          clientPlatform,
          strategy: mode as any,
        },
        trace,
      );
    }

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
      model: response.model,
      provider: response.provider,
      target: (response as any).targetNode || (response as any).target || undefined,
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
    this.logger.log(`Session ended for user ${userId} â€” summary stored in long-term memory`);
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
  model?: string;
  provider?: string;
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
