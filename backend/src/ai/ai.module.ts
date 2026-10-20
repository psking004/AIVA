/**
 * AIVA AI Module - Core Intelligence Layer
 *
 * This module is the brain of AIVA, handling:
 * - Model Orchestration & Routing (Local Ollama Qwen3 8B + Cloud OpenRouter Qwen + Cloud Google Gemini)
 * - Agent routing
 * - Memory management (3-layer: short-term, session, long-term)
 * - Voice pipeline (wake word → STT → LLM → TTS)
 * - Personality system
 * - Tool execution
 * - RAG pipeline
 */

import { Module, Global } from '@nestjs/common';
import { AIVAService } from './aiva.service';
import { AgentOrchestrator } from './agents/orchestrator';
import { MemoryService } from './memory/memory.service';
import { RAGService } from './memory/rag.service';
import { IntentClassifier } from './tools/intent.classifier';
import { ToolRegistry } from './tools/registry';
import { EmbeddingService } from './memory/embedding.service';
import { AivaPolicyEngine } from './policy/aiva-policy-engine';

// Distributed Compute Fabric & Remote Access
import { ComputeNodeService } from './nodes/compute-node.service';
import { ComputeSchedulerService } from './nodes/compute-scheduler.service';
import { RemoteAgentService } from './nodes/remote-agent.service';

// Model Providers & Router
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ModelRouterService } from './router/model-router.service';

// Three-layer memory system
import { ShortTermMemory } from './memory/short-term.memory';
import { SessionMemory } from './memory/session.memory';
import { LongTermMemory } from './memory/long-term.memory';
import { MemoryOrchestrator } from './memory/memory-orchestrator.service';

// Voice pipeline
import { VoicePipelineService } from './voice/voice-pipeline.service';

// Import agents
import { TaskAgent } from './agents/task.agent';
import { CalendarAgent } from './agents/calendar.agent';
import { EmailAgent } from './agents/email.agent';
import { ResearchAgent } from './agents/research.agent';
import { AutomationAgent } from './agents/automation.agent';
import { CodingAgent } from './agents/coding.agent';

// Import tools
import { TaskTool } from './tools/task.tool';
import { CalendarTool } from './tools/calendar.tool';
import { EmailTool } from './tools/email.tool';
import { SearchTool } from './tools/search.tool';
import { FileTool } from './tools/file.tool';

import { AIController } from './ai.controller';

@Global()
@Module({
  controllers: [AIController],
  providers: [
    // Model Providers & Router
    OllamaProvider,
    OpenRouterProvider,
    GeminiProvider,
    ModelRouterService,

    // Core AI services
    EmbeddingService,
    AIVAService,
    AivaPolicyEngine,
    AgentOrchestrator,
    MemoryService,
    RAGService,
    IntentClassifier,
    ToolRegistry,

    // Three-layer memory system
    ShortTermMemory,
    SessionMemory,
    LongTermMemory,
    MemoryOrchestrator,

    // Voice pipeline
    VoicePipelineService,

    // Agents
    TaskAgent,
    CalendarAgent,
    EmailAgent,
    ResearchAgent,
    AutomationAgent,
    CodingAgent,

    // Distributed Compute Fabric & Remote Access
    ComputeNodeService,
    ComputeSchedulerService,
    RemoteAgentService,

    // Tools
    TaskTool,
    CalendarTool,
    EmailTool,
    SearchTool,
    FileTool,
  ],
  exports: [
    OllamaProvider,
    OpenRouterProvider,
    GeminiProvider,
    ModelRouterService,
    EmbeddingService,
    AIVAService,
    AivaPolicyEngine,
    AgentOrchestrator,
    MemoryService,
    RAGService,
    ToolRegistry,

    // Distributed Compute Fabric & Remote Access
    ComputeNodeService,
    ComputeSchedulerService,
    RemoteAgentService,

    // Memory & Voice exports
    ShortTermMemory,
    SessionMemory,
    LongTermMemory,
    MemoryOrchestrator,
    VoicePipelineService,
  ],
})
export class AIModule {}
