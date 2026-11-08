/**
 * AIVA AI Module - Core Intelligence Layer
 *
 * This module is the brain of AIVA, handling:
 * - Model Orchestration & Routing (Local Ollama Qwen3 8B + Cloud OpenRouter Qwen + Cloud Google Gemini)
 * - Agent routing
 * - Memory management (3-layer: short-term, session, long-term)
 * - Voice pipeline (wake word â†’ STT â†’ LLM â†’ TTS)
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
import { FabricDispatchService } from './nodes/fabric-dispatch.service';
import { LanDiscoveryService } from './nodes/lan-discovery.service';

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
import { MemoryTool } from './tools/memory.tool';
import { LocalCalendarProvider } from './tools/calendar/local-calendar.provider';
import { GoogleCalendarProvider } from './tools/calendar/google-calendar.provider';
import { LocalEmailProvider } from './tools/email/local-email.provider';
import { GmailProvider } from './tools/email/gmail.provider';

import { AIController } from './ai.controller';

// Intelligence Kernel & Capabilities
import { SystemContextProvider } from './kernel/system-context.provider';
import { WeatherService } from './kernel/weather.service';
import { WebSearchService } from './kernel/web-search.service';
import { ProjectAwarenessService } from './kernel/project-awareness.service';
import { IntelligenceKernel } from './kernel/intelligence-kernel';
import { FastPathEngine } from './kernel/fast-path.engine';

// Autonomous Action Engine (P0)
import { ControlledCommandExecutor } from './tools/command-executor.service';
import { PackageManagerService } from './tools/package-manager.service';
import { PatchEngineService } from './tools/patch-engine.service';
import { ScaffolderService } from './tools/scaffolder.service';

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

    // Intelligence Kernel & Capabilities
    SystemContextProvider,
    WeatherService,
    WebSearchService,
    ProjectAwarenessService,
    IntelligenceKernel,
    FastPathEngine,

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
    FabricDispatchService,
    LanDiscoveryService,

    // Tools & Integrations
    TaskTool,
    LocalCalendarProvider,
    GoogleCalendarProvider,
    CalendarTool,
    LocalEmailProvider,
    GmailProvider,
    EmailTool,
    SearchTool,
    FileTool,
    MemoryTool,

    // Autonomous Action Engine (P0)
    ControlledCommandExecutor,
    PackageManagerService,
    PatchEngineService,
    ScaffolderService,
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
    SystemContextProvider,
    WeatherService,
    WebSearchService,
    ProjectAwarenessService,
    IntelligenceKernel,
    FastPathEngine,

    // Autonomous Action Engine (P0)
    ControlledCommandExecutor,
    PackageManagerService,
    PatchEngineService,
    ScaffolderService,

    // Distributed Compute Fabric & Remote Access
    ComputeNodeService,
    ComputeSchedulerService,
    RemoteAgentService,
    FabricDispatchService,
    LanDiscoveryService,

    // Tools & Integrations
    TaskTool,
    LocalCalendarProvider,
    GoogleCalendarProvider,
    CalendarTool,
    LocalEmailProvider,
    GmailProvider,
    EmailTool,
    MemoryTool,

    // Memory & Voice exports
    ShortTermMemory,
    SessionMemory,
    LongTermMemory,
    MemoryOrchestrator,
    VoicePipelineService,
  ],
})
export class AIModule {}
