/**
 * AIVA Intelligence Kernel
 *
 * Central orchestration, intent classification, tool dispatch, and structured context engine.
 * Upgrades AIVA from a voice chatbot into a genuine Personal AI Operating System.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SystemContextProvider, SystemContext } from './system-context.provider';
import { WeatherService } from './weather.service';
import { WebSearchService } from './web-search.service';
import { ProjectAwarenessService } from './project-awareness.service';

export type AivaIntent =
  | 'GENERAL_CHAT'
  | 'TIME'
  | 'DATE'
  | 'WEATHER'
  | 'LOCATION'
  | 'WEB_SEARCH'
  | 'NEWS'
  | 'KNOWLEDGE'
  | 'MEMORY_READ'
  | 'MEMORY_WRITE'
  | 'FILE_SEARCH'
  | 'PROJECT_INSPECTION'
  | 'PROJECT_SCAFFOLD'
  | 'SECURITY_BLOCKED'
  | 'CODE_GENERATION'
  | 'CODE_EDIT'
  | 'CODE_DEBUG'
  | 'CODE_TEST'
  | 'PROJECT_BUILD'
  | 'SYSTEM_ACTION'
  | 'APP_CONTROL'
  | 'DEVICE_STATUS'
  | 'MODEL_SWITCH'
  | 'FABRIC_STATUS'
  | 'EXPLANATION'
  | 'TASK_PLANNING';

export type ActionCategory = 'DIRECT_ANSWER' | 'TOOL_CALL' | 'AUTONOMOUS_TASK';

export interface KernelClassification {
  intent: AivaIntent;
  confidence: number;
  category: ActionCategory;
  toolName?: string;
  parameters: Record<string, unknown>;
  requiresAgent: boolean;
}

export interface StructuredContext {
  system: SystemContext;
  currentDevice: {
    deviceId: string;
    nodeId: string;
    role: string;
    isOnline: boolean;
  };
  aiConfig: {
    provider: string;
    model: string;
  };
  activeProject?: {
    name: string;
    rootPath: string;
    framework: string;
    packageManager: string;
    branch: string;
  };
  availableNodes: string[];
  recentTurns?: Array<{ role: string; content: string }>;
}

export interface KernelExecutionResult {
  intent: AivaIntent;
  handledDirectly: boolean;
  response?: string;
  data?: unknown;
  toolCalled?: string;
  structuredContext: StructuredContext;
}

@Injectable()
export class IntelligenceKernel {
  private readonly logger = new Logger(IntelligenceKernel.name);

  constructor(
    private readonly systemContext: SystemContextProvider,
    private readonly weatherService: WeatherService,
    private readonly searchService: WebSearchService,
    private readonly projectAwareness?: ProjectAwarenessService,
  ) {
    this.logger.log('IntelligenceKernel initialized with 24-intent classifier and capability router');
  }

  /**
   * Classify user input into one of the 24 explicit intent categories
   */
  public classify(message: string): KernelClassification {
    const raw = (message || '').trim();
    const lower = raw.toLowerCase();

    // 1. TIME intent
    if (/what time is it|current time|tell me the time|what is the time|clock/i.test(lower)) {
      return {
        intent: 'TIME',
        confidence: 0.98,
        category: 'TOOL_CALL',
        toolName: 'systemTime',
        parameters: {},
        requiresAgent: false,
      };
    }

    // 2. DATE intent
    if (/what (date|day) is today|current date|today's date|what is today's date|which day is it/i.test(lower)) {
      return {
        intent: 'DATE',
        confidence: 0.98,
        category: 'TOOL_CALL',
        toolName: 'systemDate',
        parameters: {},
        requiresAgent: false,
      };
    }

    // 3. WEATHER intent
    if (/weather|temperature|forecast|how cold|how hot|is it raining|will it rain/i.test(lower)) {
      // Extract location if present (e.g. "weather in Chennai", "weather in London")
      let loc = '';
      const inMatch = lower.match(/(?:weather|temperature|forecast)\s+(?:in|for|at)\s+([a-zA-Z\s]+)/i);
      if (inMatch && inMatch[1]) {
        loc = inMatch[1].replace(/\b(now|today|currently|right now)\b/gi, '').trim();
      }
      return {
        intent: 'WEATHER',
        confidence: 0.95,
        category: 'TOOL_CALL',
        toolName: 'weatherService',
        parameters: { location: loc || undefined },
        requiresAgent: false,
      };
    }

    // 4. MODEL_SWITCH intent
    if (/(switch (model )?(to )?|use )(gemini|openrouter|ollama|local model|local qwen|qwen|llama)/i.test(lower)) {
      let prov = 'ollama';
      let mdl = 'qwen3:4b';
      if (/gemini|google/i.test(lower)) {
        prov = 'gemini';
        mdl = 'gemini-3.5-flash';
      } else if (/openrouter|qwen 72b/i.test(lower)) {
        prov = 'openrouter';
        mdl = 'qwen/qwen-2.5-72b-instruct';
      } else if (/llama/i.test(lower)) {
        prov = 'ollama';
        mdl = 'llama3:latest';
      }
      return {
        intent: 'MODEL_SWITCH',
        confidence: 0.95,
        category: 'TOOL_CALL',
        toolName: 'modelSwitch',
        parameters: { provider: prov, model: mdl },
        requiresAgent: false,
      };
    }

    // 5. DEVICE_STATUS / FABRIC_STATUS intent
    if (/devices (are |that are )?(connected|online)|which devices|connected devices|fabric nodes|device status/i.test(lower)) {
      return {
        intent: 'DEVICE_STATUS',
        confidence: 0.95,
        category: 'TOOL_CALL',
        toolName: 'devicePresence',
        parameters: {},
        requiresAgent: false,
      };
    }

    if (/fabric status|network status|peer nodes|cluster status/i.test(lower)) {
      return {
        intent: 'FABRIC_STATUS',
        confidence: 0.95,
        category: 'TOOL_CALL',
        toolName: 'fabricStatus',
        parameters: {},
        requiresAgent: false,
      };
    }

    // 6. SAFETY & POLICY INTERCEPTION
    if (
      /delete.*(drive|system|all|entire)|format\s+[a-z]:|wipe|rm\s+-rf|del\s+\/[sfq]/i.test(lower) ||
      /git\s+push\s+.*--force|git\s+push\s+.*-f|git\s+reset\s+--hard/i.test(lower) ||
      /password|credential|id_rsa|id_ed25519|shadow|\.env/i.test(lower)
    ) {
      return {
        intent: 'SECURITY_BLOCKED',
        confidence: 0.99,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'BLOCKED', prompt: raw },
        requiresAgent: true,
      };
    }

    // 7. CODING AGENT & PROJECT INTENTS
    if (
      /create\s+(?:a\s+)?(?:new\s+)?(?:simple\s+)?(?:react|next|fastapi|python|node|vite)?\s*project|scaffold|bootstrap/i.test(lower) ||
      /create\s+(?:a\s+)?(?:simple\s+)?react\s+project/i.test(lower)
    ) {
      return {
        intent: 'PROJECT_SCAFFOLD',
        confidence: 0.95,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'SCAFFOLD', prompt: raw },
        requiresAgent: true,
      };
    }

    if (/inspect\s+(my\s+)?(aiva\s+)?(project|repo|repository)|show project structure|list project files/i.test(lower)) {
      return {
        intent: 'PROJECT_INSPECTION',
        confidence: 0.92,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'INSPECT_PROJECT' },
        requiresAgent: true,
      };
    }

    if (
      /find\s+(?:and\s+fix|the)?\s*(?:typescript|compiler|type|lint)?\s*(?:error|issue|bug|problem)/i.test(lower) ||
      /check for (lint|type|compiler) errors|typecheck|check errors/i.test(lower)
    ) {
      return {
        intent: 'CODE_DEBUG',
        confidence: 0.95,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'AUTO_DEBUG', prompt: raw },
        requiresAgent: true,
      };
    }

    if (/build (the )?(project|app|android|desktop|backend)|run build/i.test(lower)) {
      return {
        intent: 'PROJECT_BUILD',
        confidence: 0.92,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'RUN_BUILD' },
        requiresAgent: true,
      };
    }

    if (/run tests?|run unit tests?|test the project/i.test(lower)) {
      return {
        intent: 'CODE_TEST',
        confidence: 0.92,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'RUN_TESTS' },
        requiresAgent: true,
      };
    }

    if (
      /add\s+(?:a\s+)?(?:login|auth|dashboard|counter|nav|header|page|component|dark[- ]?mode|toggle|theme)/i.test(lower) ||
      /dark[- ]?mode\s+toggle/i.test(lower) ||
      /fix\s+(?:the\s+|this\s+|an\s+|my\s+)?(.*?)(bug|error|issue)|create a (component|function|page|class)|edit file|modify code/i.test(lower)
    ) {
      return {
        intent: 'CODE_EDIT',
        confidence: 0.92,
        category: 'AUTONOMOUS_TASK',
        toolName: 'codingAgent',
        parameters: { action: 'EDIT_CODE', prompt: raw },
        requiresAgent: true,
      };
    }

    // 7. WEB_SEARCH / NEWS intent
    if (/search (the web|for|online)|google|look up online|latest news|news about/i.test(lower)) {
      const q = raw.replace(/search (the web|for|online)|look up online|latest news about|news about/i, '').trim();
      return {
        intent: lower.includes('news') ? 'NEWS' : 'WEB_SEARCH',
        confidence: 0.90,
        category: 'TOOL_CALL',
        toolName: 'webSearch',
        parameters: { query: q || raw },
        requiresAgent: false,
      };
    }

    // 8. TASK & SYSTEM PLANNING
    if (/plan task|create a plan|task breakdown/i.test(lower)) {
      return {
        intent: 'TASK_PLANNING',
        confidence: 0.85,
        category: 'AUTONOMOUS_TASK',
        parameters: { prompt: raw },
        requiresAgent: true,
      };
    }

    // 9. EXPLANATION intent (e.g. "explain what a CPU is")
    if (/explain (what|how|why)|tell me about|how does/i.test(lower)) {
      return {
        intent: 'EXPLANATION',
        confidence: 0.80,
        category: 'DIRECT_ANSWER',
        parameters: { prompt: raw },
        requiresAgent: false,
      };
    }

    // Default: GENERAL_CHAT
    return {
      intent: 'GENERAL_CHAT',
      confidence: 0.70,
      category: 'DIRECT_ANSWER',
      parameters: { prompt: raw },
      requiresAgent: false,
    };
  }

  /**
   * Execute deterministic fast-path capabilities or return null to proceed to LLM
   */
  public async executeCapability(
    classification: KernelClassification,
    activeProvider = 'ollama',
    activeModel = 'qwen3:4b',
  ): Promise<KernelExecutionResult | null> {
    const ctx = this.buildStructuredContext(activeProvider, activeModel);

    // 1. Live TIME
    if (classification.intent === 'TIME') {
      const sys = this.systemContext.getContext();
      const response = `The current time is ${sys.time} on ${sys.weekday}, ${sys.date}.`;
      return {
        intent: 'TIME',
        handledDirectly: true,
        response,
        toolCalled: 'systemTime',
        structuredContext: ctx,
      };
    }

    // 2. Live DATE
    if (classification.intent === 'DATE') {
      const sys = this.systemContext.getContext();
      const response = `Today is ${sys.weekday}, ${sys.date}.`;
      return {
        intent: 'DATE',
        handledDirectly: true,
        response,
        toolCalled: 'systemDate',
        structuredContext: ctx,
      };
    }

    // 3. Live WEATHER
    if (classification.intent === 'WEATHER') {
      const location = classification.parameters.location as string | undefined;
      try {
        const w = await this.weatherService.getWeather(location);
        return {
          intent: 'WEATHER',
          handledDirectly: true,
          response: w.summary,
          data: w,
          toolCalled: 'weatherService',
          structuredContext: ctx,
        };
      } catch (err: any) {
        return {
          intent: 'WEATHER',
          handledDirectly: true,
          response: `I could not retrieve weather data at this moment: ${err.message}.`,
          toolCalled: 'weatherService',
          structuredContext: ctx,
        };
      }
    }

    // 4. Live WEB SEARCH
    if (classification.intent === 'WEB_SEARCH' || classification.intent === 'NEWS') {
      const q = (classification.parameters.query as string) || '';
      try {
        const searchRes = await this.searchService.search(q);
        const reply = searchRes.results.length > 0
          ? `Here is the current information retrieved for "${q}":\n\n${searchRes.summary}`
          : `I searched for "${q}", but no current results were returned.`;
        return {
          intent: classification.intent,
          handledDirectly: true,
          response: reply,
          data: searchRes,
          toolCalled: 'webSearch',
          structuredContext: ctx,
        };
      } catch (sErr: any) {
        return {
          intent: classification.intent,
          handledDirectly: true,
          response: `Web search could not be completed: ${sErr.message}.`,
          toolCalled: 'webSearch',
          structuredContext: ctx,
        };
      }
    }

    // Non-direct capabilities require model/agent execution
    return null;
  }

  /**
   * Build structured system & environmental context
   */
  public buildStructuredContext(provider = 'ollama', model = 'qwen3:4b'): StructuredContext {
    const sys = this.systemContext.getContext();
    const root = this.projectAwareness ? this.projectAwareness.getWorkspaceRoot() : process.cwd();
    return {
      system: sys,
      currentDevice: {
        deviceId: 'device_pc_b',
        nodeId: 'PC-B',
        role: 'CPU_LOCAL_NODE',
        isOnline: true,
      },
      aiConfig: {
        provider,
        model,
      },
      activeProject: {
        name: 'AIVA',
        rootPath: root,
        framework: 'NestJS + React/Electron + Expo',
        packageManager: 'pnpm',
        branch: 'main',
      },
      availableNodes: ['PC-B'],
    };
  }

  /**
   * Format context for LLM prompt prefix
   */
  public formatSystemPromptHeader(ctx: StructuredContext): string {
    return (
      `=== AIVA OPERATING SYSTEM CONTEXT ===\n` +
      `Live Date/Time: ${ctx.system.weekday}, ${ctx.system.date} ${ctx.system.time} (${ctx.system.timezone})\n` +
      `Active Workstation: ${ctx.currentDevice.nodeId} (${ctx.currentDevice.role})\n` +
      `Active Project: ${ctx.activeProject?.name} at ${ctx.activeProject?.rootPath} (${ctx.activeProject?.framework})\n` +
      `AI Engine: ${ctx.aiConfig.provider}:${ctx.aiConfig.model}\n` +
      `======================================\n`
    );
  }
}
