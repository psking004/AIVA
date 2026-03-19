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

import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIVAService } from './aiva.service';
import { AgentOrchestrator } from './agents/orchestrator';
import { MemoryService } from './memory/memory.service';
import { RAGService } from './memory/rag.service';
import { IntentClassifier } from './tools/intent.classifier';
import { ToolRegistry } from './tools/registry';

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

// Import tools
import { TaskTool } from './tools/task.tool';
import { CalendarTool } from './tools/calendar.tool';
import { EmailTool } from './tools/email.tool';
import { SearchTool } from './tools/search.tool';
import { FileTool } from './tools/file.tool';

@Global()
@Module({
  providers: [
    // Core AI services
    AIVAService,
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

    // Tools
    TaskTool,
    CalendarTool,
    EmailTool,
    SearchTool,
    FileTool,

    // LangChain providers
    {
      provide: 'LANGCHAIN_CONFIG',
      useFactory: (configService: ConfigService) => ({
        apiKey: configService.get('OPENAI_API_KEY') || configService.get('ANTHROPIC_API_KEY'),
        model: configService.get('AI_MODEL', 'gpt-4-turbo'),
        temperature: parseFloat(configService.get('AI_TEMPERATURE', '0.7')),
        maxTokens: parseInt(configService.get('AI_MAX_TOKENS', '4096')),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [
    AIVAService,
    AgentOrchestrator,
    MemoryService,
    RAGService,
    ToolRegistry,

    // New exports
    ShortTermMemory,
    SessionMemory,
    LongTermMemory,
    MemoryOrchestrator,
    VoicePipelineService,
  ],
})
export class AIModule {}
