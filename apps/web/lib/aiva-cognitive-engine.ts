/**
 * AIVA Intelligence 2.0 Cognitive Engine
 *
 * Implements the 3-Mode Cognitive Architecture:
 * - FAST (<2s): Time, UI navigation, interruptions, direct facts
 * - CONTEXTUAL (<3.5s): Real task queries, project awareness, memory retrieval
 * - AGENTIC (<6s): Real task creation/updates, planning & execution
 *
 * Provides clean separation between:
 * - spokenResponse: 1-2 concise, natural sentences for ElevenLabs TTS
 * - displayResponse: rich markdown / telemetry / cards for contextual UI overlays
 */

import { aivaClient } from '@aiva/api-client';
import {
  routeAivaIntent,
  AivaExecutionResult,
  AivaRouteDecision,
  AivaTelemetryBreakdown,
  AivaOverlayLens,
} from '@aiva/types';

function categorizeCognitiveError(err: any): { category: string; reason: string } {
  if (!err) return { category: 'UNKNOWN', reason: 'No error provided' };
  
  const status = err.response?.status;
  const message = err.message || '';
  const code = err.code || '';

  if (status === 401 || status === 403 || /unauthorized|forbidden|token|device/i.test(message)) {
    return { category: 'AUTH_FAILURE', reason: `Status ${status || 'AUTH'}: ${err.response?.data?.message || message}` };
  }
  if (code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return { category: 'TIMEOUT', reason: message };
  }
  if (/cors|cross-origin/i.test(message)) {
    return { category: 'CORS_FAILURE', reason: message };
  }
  if (status >= 400 && status < 500) {
    return { category: 'SERVER_4XX', reason: `HTTP ${status}: ${err.response?.data?.message || message}` };
  }
  if (status >= 500) {
    return { category: 'SERVER_5XX', reason: `HTTP ${status}: ${err.response?.data?.message || message}` };
  }
  if (code === 'ERR_NETWORK' || /network error/i.test(message)) {
    return { category: 'NETWORK_FAILURE', reason: message };
  }
  if (err.invalidResponse) {
    return { category: 'INVALID_RESPONSE', reason: message };
  }
  return { category: 'UNKNOWN', reason: message };
}

export class AivaCognitiveEngine {
  private static instance: AivaCognitiveEngine | null = null;

  public static getInstance(): AivaCognitiveEngine {
    if (!AivaCognitiveEngine.instance) {
      AivaCognitiveEngine.instance = new AivaCognitiveEngine();
    }
    return AivaCognitiveEngine.instance;
  }

  /**
   * Process incoming user voice utterance through the cognitive pipeline
   */
  public async processUtterance(
    rawText: string,
    currentOverlay: AivaOverlayLens = null
  ): Promise<AivaExecutionResult> {
    const tStart = Date.now();
    let authMs = 0;
    let routingMs = 0;
    let contextMs = 0;
    let memoryMs = 0;
    let modelMs = 0;
    let toolsMs = 0;
    let formattingMs = 0;

    // 1. Intent Routing & Mode Decision
    const tRoute0 = Date.now();
    const route: AivaRouteDecision = routeAivaIntent(rawText);
    routingMs = Date.now() - tRoute0;

    console.log(
      `[AIVA INTELLIGENCE] Route: intent=${route.intent}, mode=${route.mode}, requiresUI=${route.requiresUI}, target=${route.targetOverlay}`
    );

    // 2. Route Dispatcher
    try {
      switch (route.intent) {
        case 'INTERRUPT_STOP': {
          const totalMs = Date.now() - tStart;
          return {
            intent: 'INTERRUPT_STOP',
            mode: 'FAST',
            spokenResponse: '',
            displayResponse: 'Silence engaged.',
            targetOverlay: currentOverlay,
            requiresUI: false,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'DISMISS_UI': {
          const totalMs = Date.now() - tStart;
          return {
            intent: 'DISMISS_UI',
            mode: 'FAST',
            spokenResponse: 'Closing interface.',
            displayResponse: 'Interface dismissed.',
            targetOverlay: null,
            requiresUI: false,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'TIME_QUERY': {
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
          const totalMs = Date.now() - tStart;
          return {
            intent: 'TIME_QUERY',
            mode: 'FAST',
            spokenResponse: `The current time is ${timeStr}.`,
            displayResponse: `Temporal Coordinates: **${timeStr}** (${dateStr})`,
            targetOverlay: null,
            requiresUI: false,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'TASK_ACTION': {
          // AGENTIC Mode: Create or update real task in the database
          const tAuth0 = Date.now();
          await aivaClient.ensureAuthenticated();
          authMs = Date.now() - tAuth0;

          const tTools0 = Date.now();
          const title = route.extractedParams.taskTitle || 'New Action Item';
          const priority = route.extractedParams.priority || 'MEDIUM';
          const dueDateStr = route.extractedParams.dueDate;
          let dueDate: Date | undefined;
          if (dueDateStr === 'tomorrow') {
            dueDate = new Date(Date.now() + 24 * 3600 * 1000);
          } else if (dueDateStr === 'today') {
            dueDate = new Date();
          }

          console.log('[AIVA CREATE TASK PAYLOAD] ' + JSON.stringify({
            title,
            priority,
            dueDate,
            status: 'PENDING',
          }));
          const createdTask = await aivaClient.createTask({
            title,
            priority,
            dueDate,
            status: 'PENDING',
          });
          console.log('[AIVA CREATE TASK SUCCESS] ' + JSON.stringify(createdTask));
          toolsMs = Date.now() - tTools0;

          const spokenResponse = `I've created the task: "${createdTask.title}", prioritized as ${priority.toLowerCase()}.`;
          const displayResponse = `### Task Created\n- **Title:** ${createdTask.title}\n- **Priority:** ${priority}\n- **Status:** PENDING\n- **ID:** \`${createdTask.id}\``;

          const totalMs = Date.now() - tStart;
          this.logTelemetryBreakdown({ authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs });

          return {
            intent: 'TASK_ACTION',
            mode: 'AGENTIC',
            spokenResponse,
            displayResponse,
            targetOverlay: 'tasks',
            requiresUI: true,
            toolCalls: [{ toolName: 'tasks.create', args: { title, priority }, result: createdTask, status: 'success' }],
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'TASK_QUERY': {
          // CONTEXTUAL Mode: Fetch real user tasks from database
          const tAuth0 = Date.now();
          await aivaClient.ensureAuthenticated();
          authMs = Date.now() - tAuth0;

          const tContext0 = Date.now();
          const tasks = await aivaClient.getTasks();
          contextMs = Date.now() - tContext0;

          const pendingTasks = Array.isArray(tasks) ? tasks.filter((t: any) => t.status !== 'COMPLETED') : [];
          let spokenResponse = 'You have no pending tasks on your protocol.';
          let displayResponse = '### Task Protocols\n*No pending tasks found.*';

          if (pendingTasks.length > 0 && pendingTasks[0]) {
            const topTask = pendingTasks[0];
            spokenResponse = `You have ${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}. Primary priority is "${topTask.title}".`;
            displayResponse = `### Active Tasks (${pendingTasks.length})\n` +
              pendingTasks.slice(0, 5).map((t: any) => `- **[${t.priority || 'MED'}]** ${t.title}`).join('\n');
          }

          const totalMs = Date.now() - tStart;
          this.logTelemetryBreakdown({ authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs });

          return {
            intent: 'TASK_QUERY',
            mode: 'CONTEXTUAL',
            spokenResponse,
            displayResponse,
            targetOverlay: 'tasks',
            requiresUI: true,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'PROJECT_AWARENESS': {
          // CONTEXTUAL Mode: Real project tracker integration
          const tAuth0 = Date.now();
          await aivaClient.ensureAuthenticated();
          authMs = Date.now() - tAuth0;

          const tContext0 = Date.now();
          const projects = await aivaClient.getProjects();
          contextMs = Date.now() - tContext0;

          let spokenResponse = 'You currently have no active initiatives registered in your matrix.';
          let displayResponse = '### Initiative Matrix\n*No active projects found.*';

          if (Array.isArray(projects) && projects.length > 0) {
            const activeProjects = projects.filter((p: any) => p.status !== 'COMPLETED' && p.status !== 'ARCHIVED');
            const primary = activeProjects[0] || projects[0];
            spokenResponse = `You have ${projects.length} initiative${projects.length > 1 ? 's' : ''}. Key focus is "${primary.name}".`;
            displayResponse = `### Active Initiatives (${projects.length})\n` +
              projects.slice(0, 4).map((p: any) => `- **${p.name}** — ${p.description || 'Active initiative'}`).join('\n');
          }

          const totalMs = Date.now() - tStart;
          this.logTelemetryBreakdown({ authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs });

          return {
            intent: 'PROJECT_AWARENESS',
            mode: 'CONTEXTUAL',
            spokenResponse,
            displayResponse,
            targetOverlay: 'projects',
            requiresUI: true,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'CALENDAR_QUERY': {
          // CONTEXTUAL Mode: Real calendar lookups
          const tAuth0 = Date.now();
          await aivaClient.ensureAuthenticated();
          authMs = Date.now() - tAuth0;

          const tContext0 = Date.now();
          const events = await aivaClient.getEvents();
          contextMs = Date.now() - tContext0;

          let spokenResponse = 'Your schedule has no upcoming events recorded for today.';
          let displayResponse = '### Temporal Coordinates\n*No scheduled events found.*';

          if (Array.isArray(events) && events.length > 0 && events[0]) {
            const nextEvent = events[0];
            const timeFormatted = nextEvent.startTime ? new Date(nextEvent.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'soon';
            spokenResponse = `You have ${events.length} event${events.length > 1 ? 's' : ''} scheduled. Next is "${nextEvent.title}" at ${timeFormatted}.`;
            displayResponse = `### Upcoming Schedule (${events.length})\n` +
              events.slice(0, 4).map((e: any) => `- **${e.title}** (${new Date(e.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`).join('\n');
          }

          const totalMs = Date.now() - tStart;
          this.logTelemetryBreakdown({ authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs });

          return {
            intent: 'CALENDAR_QUERY',
            mode: 'CONTEXTUAL',
            spokenResponse,
            displayResponse,
            targetOverlay: 'timeline',
            requiresUI: true,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'MEMORY_RECALL': {
          const tAuth0 = Date.now();
          await aivaClient.ensureAuthenticated();
          authMs = Date.now() - tAuth0;

          const tModel0 = Date.now();
          const query = route.extractedParams.searchTerm || rawText;
          const prompt = `Search your personal knowledge memory and answer concisely in 1-2 spoken sentences: ${query}`;
          const aiResponse = await aivaClient.chat(prompt);
          modelMs = Date.now() - tModel0;

          const answer = aiResponse?.response || 'I recall no specific records matching that query.';
          const totalMs = Date.now() - tStart;
          this.logTelemetryBreakdown({ authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs });

          return {
            intent: 'MEMORY_RECALL',
            mode: 'CONTEXTUAL',
            spokenResponse: answer,
            displayResponse: `### Memory Archive Recall\n${answer}`,
            targetOverlay: 'memory',
            requiresUI: true,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'SUMMON_UI': {
          const target = route.targetOverlay;
          const overlayTitles: Record<string, string> = {
            tasks: 'Task Protocols',
            projects: 'Initiative Matrix',
            memory: 'Memory Archive',
            timeline: 'Temporal Coordinates',
            files: 'Data Storage',
            dialogue: 'Executive Dialogue',
            nexus: 'Nexus Overview',
          };
          const friendlyTitle = target ? overlayTitles[target] || target : 'Overlay';
          const totalMs = Date.now() - tStart;

          return {
            intent: 'SUMMON_UI',
            mode: 'FAST',
            spokenResponse: `Opening ${friendlyTitle}.`,
            displayResponse: `Summoned ${friendlyTitle}.`,
            targetOverlay: target,
            requiresUI: true,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }

        case 'FAST_FACTUAL':
        default: {
          // FAST Cognitive Mode: Direct factual inference
          const tAuth0 = Date.now();
          await aivaClient.ensureAuthenticated();
          authMs = Date.now() - tAuth0;

          const tModel0 = Date.now();
          const endpoint = '/ai/chat';
          const baseURL = aivaClient.getBaseURL();
          console.log(`[AIVA CORE TRACE] transcript="${rawText.trim()}"`);
          console.log(`[AIVA CORE TRACE] baseURL=${baseURL}`);
          console.log(`[AIVA CORE TRACE] endpoint=${endpoint}`);
          console.log(`[AIVA CORE TRACE] request started=${tModel0}`);

          let aiResponse: any;
          try {
            // Prompt explicitly instructs 1-2 concise spoken sentences
            const prompt = `${rawText.trim()} (Respond concisely in 1 to 2 clear spoken sentences.)`;
            aiResponse = await aivaClient.chat(prompt);
            const tModelDone = Date.now();
            modelMs = tModelDone - tModel0;
            console.log(`[AIVA CORE TRACE] request finished=${tModelDone}`);
            console.log(`[AIVA CORE TRACE] status=200`);
            console.log(`[AIVA CORE TRACE] response=${aiResponse?.response || 'Acknowledged.'}`);
            console.log(`[AIVA CORE TRACE] error name=none`);
            console.log(`[AIVA CORE TRACE] error message=none`);
            console.log(`[AIVA CORE TRACE] error code=none`);
            console.log(`[AIVA CORE TRACE] error response status=none`);
            console.log(`[AIVA CORE TRACE] error response data=none`);
            console.log(`[AIVA CORE TRACE] error request exists=false`);
            console.log(`[AIVA CORE TRACE] total latency=${modelMs}ms`);
          } catch (chatErr: any) {
            const tModelErr = Date.now();
            modelMs = tModelErr - tModel0;
            console.log(`[AIVA CORE TRACE] request finished=${tModelErr}`);
            console.log(`[AIVA CORE TRACE] status=${chatErr?.response?.status || 'ERROR'}`);
            console.log(`[AIVA CORE TRACE] response=none`);
            console.log(`[AIVA CORE TRACE] error name=${chatErr?.name || 'Error'}`);
            console.log(`[AIVA CORE TRACE] error message=${chatErr?.message || 'Unknown'}`);
            console.log(`[AIVA CORE TRACE] error code=${chatErr?.code || 'none'}`);
            console.log(`[AIVA CORE TRACE] error response status=${chatErr?.response?.status || 'none'}`);
            console.log(`[AIVA CORE TRACE] error response data=${JSON.stringify(chatErr?.response?.data || 'none')}`);
            console.log(`[AIVA CORE TRACE] error request exists=${Boolean(chatErr?.request)}`);
            console.log(`[AIVA CORE TRACE] total latency=${modelMs}ms`);
            throw chatErr;
          }

          const fullText = aiResponse?.response || 'Acknowledged.';

          // Split spoken summary from detailed display if applicable
          const sentences = fullText.split(/(?<=[.?!])\s+/);
          const spokenResponse = sentences.slice(0, 2).join(' ').trim() || fullText;
          const displayResponse = fullText;

          const totalMs = Date.now() - tStart;
          this.logTelemetryBreakdown({ authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs });

          return {
            intent: 'FAST_FACTUAL',
            mode: 'FAST',
            spokenResponse,
            displayResponse,
            targetOverlay: null,
            requiresUI: false,
            telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
          };
        }
      }
    } catch (err: any) {
      console.error('[AIVA COGNITIVE ENGINE ERROR] ' + JSON.stringify({
        message: err?.message,
        url: err?.config ? `${err.config.baseURL || ''}${err.config.url || ''}` : undefined,
        method: err?.config?.method,
        data: err?.config?.data,
        responseStatus: err?.response?.status,
        responseData: err?.response?.data,
      }));
      const { category, reason } = categorizeCognitiveError(err);
      console.error(`[AIVA ERROR CATEGORY] category=${category} reason=${reason}`);
      const totalMs = Date.now() - tStart;
      return {
        intent: 'FAST_FACTUAL',
        mode: 'FAST',
        spokenResponse: 'I encountered an error connecting to the intelligence core.',
        displayResponse: `### Cognitive Error [${category}]\n${reason}`,
        targetOverlay: null,
        requiresUI: false,
        telemetry: { authMs, routingMs, contextMs, memoryMs, modelMs, toolsMs, formattingMs, totalMs },
      };
    }
  }

  private logTelemetryBreakdown(t: AivaTelemetryBreakdown): void {
    console.log(
      `[AIVA INTELLIGENCE BREAKDOWN] auth_ms=${t.authMs} routing_ms=${t.routingMs} context_ms=${t.contextMs} memory_ms=${t.memoryMs} model_ms=${t.modelMs} tools_ms=${t.toolsMs} formatting_ms=${t.formattingMs} total_ms=${t.totalMs}`
    );
  }
}

export const aivaCognitiveEngine = AivaCognitiveEngine.getInstance();
