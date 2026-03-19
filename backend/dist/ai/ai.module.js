"use strict";
/**
 * AIVA AI Module - Core Intelligence Layer
 *
 * This module is the brain of AIVA, handling:
 * - LLM orchestration (LangChain)
 * - Agent routing
 * - Memory management (3-layer: short-term, session, long-term)
 * - Voice pipeline (wake word → STT → LLM → TTS)
 * - Personality system
 * - Tool execution
 * - RAG pipeline
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const aiva_service_1 = require("./aiva.service");
const orchestrator_1 = require("./agents/orchestrator");
const memory_service_1 = require("./memory/memory.service");
const rag_service_1 = require("./memory/rag.service");
const intent_classifier_1 = require("./tools/intent.classifier");
const registry_1 = require("./tools/registry");
// Three-layer memory system
const short_term_memory_1 = require("./memory/short-term.memory");
const session_memory_1 = require("./memory/session.memory");
const long_term_memory_1 = require("./memory/long-term.memory");
const memory_orchestrator_service_1 = require("./memory/memory-orchestrator.service");
// Voice pipeline
const voice_pipeline_service_1 = require("./voice/voice-pipeline.service");
// Import agents
const task_agent_1 = require("./agents/task.agent");
const calendar_agent_1 = require("./agents/calendar.agent");
const email_agent_1 = require("./agents/email.agent");
const research_agent_1 = require("./agents/research.agent");
const automation_agent_1 = require("./agents/automation.agent");
// Import tools
const task_tool_1 = require("./tools/task.tool");
const calendar_tool_1 = require("./tools/calendar.tool");
const email_tool_1 = require("./tools/email.tool");
const search_tool_1 = require("./tools/search.tool");
const file_tool_1 = require("./tools/file.tool");
let AIModule = class AIModule {
};
exports.AIModule = AIModule;
exports.AIModule = AIModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            // Core AI services
            aiva_service_1.AIVAService,
            orchestrator_1.AgentOrchestrator,
            memory_service_1.MemoryService,
            rag_service_1.RAGService,
            intent_classifier_1.IntentClassifier,
            registry_1.ToolRegistry,
            // Three-layer memory system
            short_term_memory_1.ShortTermMemory,
            session_memory_1.SessionMemory,
            long_term_memory_1.LongTermMemory,
            memory_orchestrator_service_1.MemoryOrchestrator,
            // Voice pipeline
            voice_pipeline_service_1.VoicePipelineService,
            // Agents
            task_agent_1.TaskAgent,
            calendar_agent_1.CalendarAgent,
            email_agent_1.EmailAgent,
            research_agent_1.ResearchAgent,
            automation_agent_1.AutomationAgent,
            // Tools
            task_tool_1.TaskTool,
            calendar_tool_1.CalendarTool,
            email_tool_1.EmailTool,
            search_tool_1.SearchTool,
            file_tool_1.FileTool,
            // LangChain providers
            {
                provide: 'LANGCHAIN_CONFIG',
                useFactory: (configService) => ({
                    apiKey: configService.get('OPENAI_API_KEY') || configService.get('ANTHROPIC_API_KEY'),
                    model: configService.get('AI_MODEL', 'gpt-4-turbo'),
                    temperature: parseFloat(configService.get('AI_TEMPERATURE', '0.7')),
                    maxTokens: parseInt(configService.get('AI_MAX_TOKENS', '4096')),
                }),
                inject: [config_1.ConfigService],
            },
        ],
        exports: [
            aiva_service_1.AIVAService,
            orchestrator_1.AgentOrchestrator,
            memory_service_1.MemoryService,
            rag_service_1.RAGService,
            registry_1.ToolRegistry,
            // New exports
            short_term_memory_1.ShortTermMemory,
            session_memory_1.SessionMemory,
            long_term_memory_1.LongTermMemory,
            memory_orchestrator_service_1.MemoryOrchestrator,
            voice_pipeline_service_1.VoicePipelineService,
        ],
    })
], AIModule);
//# sourceMappingURL=ai.module.js.map