"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AIVAService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIVAService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const anthropic_1 = require("@langchain/anthropic");
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const memory_service_1 = require("./memory/memory.service");
const memory_orchestrator_service_1 = require("./memory/memory-orchestrator.service");
const orchestrator_1 = require("./agents/orchestrator");
const registry_1 = require("./tools/registry");
const intent_classifier_1 = require("./tools/intent.classifier");
const aiva_personality_1 = require("./personality/aiva-personality");
let AIVAService = AIVAService_1 = class AIVAService {
    configService;
    memoryService;
    memoryOrchestrator;
    agentOrchestrator;
    toolRegistry;
    intentClassifier;
    logger = new common_1.Logger(AIVAService_1.name);
    llm;
    constructor(configService, memoryService, memoryOrchestrator, agentOrchestrator, toolRegistry, intentClassifier) {
        this.configService = configService;
        this.memoryService = memoryService;
        this.memoryOrchestrator = memoryOrchestrator;
        this.agentOrchestrator = agentOrchestrator;
        this.toolRegistry = toolRegistry;
        this.intentClassifier = intentClassifier;
        this.initializeLLM();
    }
    initializeLLM() {
        const provider = this.configService.get('AI_PROVIDER', 'anthropic');
        const apiKey = this.configService.get('ANTHROPIC_API_KEY') || this.configService.get('OPENAI_API_KEY');
        const model = this.configService.get('AI_MODEL', 'claude-sonnet-4-5-20250929');
        if (provider === 'openai' || !apiKey) {
            this.llm = new openai_1.ChatOpenAI({
                apiKey: this.configService.get('OPENAI_API_KEY'),
                model: model,
                temperature: parseFloat(this.configService.get('AI_TEMPERATURE', '0.7')),
                maxTokens: parseInt(this.configService.get('AI_MAX_TOKENS', '4096')),
                streaming: true,
            });
        }
        else {
            this.llm = new anthropic_1.ChatAnthropic({
                apiKey: apiKey,
                model: model,
                temperature: parseFloat(this.configService.get('AI_TEMPERATURE', '0.7')),
                maxTokens: parseInt(this.configService.get('AI_MAX_TOKENS', '4096')),
                streaming: true,
            });
        }
        this.logger.log(`AIVA initialized with ${provider} provider using model: ${model}`);
    }
    /**
     * Process a user message and generate response
     * Uses 3-layer memory for context-aware responses
     */
    async chat(userId, message, conversationId) {
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
        let response;
        if (intent.requiresAgent) {
            response = await this.handleAgentRouting(userId, message, intent, context);
        }
        else {
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
        await this.memoryOrchestrator.detectAndStorePreferences(userId, message, response.response);
        return response;
    }
    async handleAgentRouting(userId, message, intent, context) {
        this.logger.log(`Routing to agent: ${intent.agentType}`);
        // Delegate to agent orchestrator
        const agentResult = await this.agentOrchestrator.execute(userId, intent.agentType, message, intent.parameters, context);
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
     */
    async handleDirectResponse(userId, message) {
        // Build augmented prompt with all memory layers
        const augmentedPrompt = await this.memoryOrchestrator.buildPrompt(userId, message);
        // Convert to LangChain message format
        const messages = augmentedPrompt.messages.map((m) => {
            if (m.role === 'user')
                return new messages_1.HumanMessage(m.content);
            if (m.role === 'assistant')
                return new messages_1.AIMessage(m.content);
            return new messages_1.SystemMessage(m.content);
        });
        // Generate response
        const response = await this.llm.invoke(messages);
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
    async executeTool(userId, toolName, args) {
        this.logger.log(`Executing tool: ${toolName}`);
        return this.toolRegistry.execute(userId, toolName, args);
    }
    /**
     * Summarize content using AI
     */
    async summarize(_userId, content, type = 'general') {
        const prompt = `Summarize the following ${type} concisely:\n\n${content}`;
        const response = await this.llm.invoke([new messages_1.HumanMessage(prompt)]);
        return response.content;
    }
    /**
     * Extract tasks from content
     */
    async extractTasks(_userId, content) {
        const prompt = `Extract actionable tasks from the following content.
    Return as JSON array with title, description, priority, and dueDate if mentioned:

    ${content}`;
        const response = await this.llm.invoke([new messages_1.HumanMessage(prompt)]);
        return JSON.parse(response.content);
    }
    /**
     * End a user's session and persist summary to long-term memory
     */
    async endSession(userId) {
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
    getMemoryStats(userId) {
        return this.memoryOrchestrator.getStats(userId);
    }
    /**
     * Get the system prompt (for debugging/inspection)
     */
    getSystemPrompt() {
        return aiva_personality_1.AIVA_SYSTEM_PROMPT;
    }
};
exports.AIVAService = AIVAService;
exports.AIVAService = AIVAService = AIVAService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        memory_service_1.MemoryService,
        memory_orchestrator_service_1.MemoryOrchestrator,
        orchestrator_1.AgentOrchestrator,
        registry_1.ToolRegistry,
        intent_classifier_1.IntentClassifier])
], AIVAService);
//# sourceMappingURL=aiva.service.js.map