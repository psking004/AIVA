/**
 * AIVA Intent Router & Cognitive Mode Classifier
 *
 * Classifies raw voice transcripts into precise intent categories and cognitive modes:
 * - FAST (<2s): Time, UI navigation, interruptions, direct facts
 * - CONTEXTUAL (<3.5s): Tasks query, project awareness, memory recall
 * - AGENTIC (<6s): Task creation, updates, multi-step actions
 */

import type { AivaRouteDecision } from './aiva-core';

export function routeAivaIntent(rawText: string): AivaRouteDecision {
  const text = rawText.toLowerCase().trim();

  // 1. Immediate Interruption / Stop Commands
  if (
    text === 'stop' ||
    text === 'aiva stop' ||
    text === 'stop talking' ||
    text === 'be quiet' ||
    text === 'shut up' ||
    text === 'pause' ||
    text === 'hush' ||
    text === 'cancel' ||
    text.startsWith('stop ') ||
    text.endsWith(' stop')
  ) {
    return {
      intent: 'INTERRUPT_STOP',
      mode: 'FAST',
      targetOverlay: null,
      requiresUI: false,
      confidence: 0.99,
      extractedParams: {},
    };
  }

  // 2. Dismiss / Close Commands
  if (
    text === 'close' ||
    text === 'close this' ||
    text === 'dismiss' ||
    text === 'disappear' ||
    text === 'go home' ||
    text === 'go away' ||
    text === "that's all" ||
    text === 'thats all' ||
    text === 'hide' ||
    text === 'exit' ||
    text.includes('close the window') ||
    text.includes('close overlay')
  ) {
    return {
      intent: 'DISMISS_UI',
      mode: 'FAST',
      targetOverlay: null,
      requiresUI: false,
      confidence: 0.95,
      extractedParams: {},
    };
  }

  // 3. Time Queries (Instant local computation)
  if (
    text.includes('what time') ||
    text.includes('what is the time') ||
    text.includes('tell me the time') ||
    text === 'time' ||
    text.includes('what is today') ||
    text.includes('what date is it')
  ) {
    return {
      intent: 'TIME_QUERY',
      mode: 'FAST',
      targetOverlay: null,
      requiresUI: false,
      confidence: 0.98,
      extractedParams: {},
    };
  }

  // 4. Task Creation / Modification (AGENTIC)
  // e.g. "create a task to review code", "add a task buy groceries", "remind me to call mom"
  const createTaskMatch = text.match(
    /(?:create|add|make|schedule|set up)\s+(?:a\s+)?(?:new\s+)?(?:task|todo|reminder|action item)\s+(?:to\s+|called\s+|for\s+)?(.+)/i
  ) || text.match(
    /remind me to\s+(.+)/i
  );

  if (createTaskMatch) {
    const rawTitle = createTaskMatch && createTaskMatch[1] ? createTaskMatch[1].trim() : 'New Task';
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (/urgent|high priority|asap|critical/i.test(text)) priority = 'HIGH';
    if (/low priority|minor/i.test(text)) priority = 'LOW';

    let dueDate: string | undefined;
    if (/tomorrow/i.test(text)) dueDate = 'tomorrow';
    else if (/today/i.test(text)) dueDate = 'today';
    else if (/next week/i.test(text)) dueDate = 'next_week';

    return {
      intent: 'TASK_ACTION',
      mode: 'AGENTIC',
      targetOverlay: 'tasks',
      requiresUI: true,
      confidence: 0.92,
      extractedParams: {
        taskTitle: rawTitle,
        priority,
        dueDate,
      },
    };
  }

  // 5. Task Queries (CONTEXTUAL - fetches real tasks from DB)
  // "what are my tasks", "what do I need to do", "list my tasks", "show my tasks"
  if (
    text.includes('what are my tasks') ||
    text.includes('what do i have to do') ||
    text.includes('what do i need to do') ||
    text.includes('list my tasks') ||
    text.includes('show my tasks') ||
    text.includes('show tasks') ||
    text.includes('pending tasks') ||
    text.includes('todo list') ||
    text.includes('my tasks')
  ) {
    return {
      intent: 'TASK_QUERY',
      mode: 'CONTEXTUAL',
      targetOverlay: 'tasks',
      requiresUI: true,
      confidence: 0.90,
      extractedParams: {
        query: text,
      },
    };
  }

  // 6. Project Awareness (CONTEXTUAL)
  // "what am I working on?", "what is my current project?", "show my projects"
  if (
    text.includes('what am i working on') ||
    text.includes('what is my project') ||
    text.includes('what are my projects') ||
    text.includes('show my projects') ||
    text.includes('open projects') ||
    text.includes('open my projects') ||
    text.includes('project status') ||
    text.includes('active project') ||
    text.includes('my initiatives')
  ) {
    return {
      intent: 'PROJECT_AWARENESS',
      mode: 'CONTEXTUAL',
      targetOverlay: 'projects',
      requiresUI: true,
      confidence: 0.90,
      extractedParams: {
        query: text,
      },
    };
  }

  // 7. Memory Recall (CONTEXTUAL)
  // "what do you remember?", "search memory for ...", "what did I say about ..."
  if (
    text.includes('what do you remember') ||
    text.includes('recall') ||
    text.includes('search memory') ||
    text.includes('show memory') ||
    text.includes('open memory') ||
    text.includes('what did i say about')
  ) {
    return {
      intent: 'MEMORY_RECALL',
      mode: 'CONTEXTUAL',
      targetOverlay: 'memory',
      requiresUI: true,
      confidence: 0.88,
      extractedParams: {
        searchTerm: text.replace(/search memory for|what do you remember about|what did i say about/i, '').trim(),
      },
    };
  }

  // 8. Calendar / Schedule Query (CONTEXTUAL)
  if (
    text.includes('calendar') ||
    text.includes('schedule') ||
    text.includes('timeline') ||
    text.includes('what do i have today') ||
    text.includes('upcoming meetings') ||
    text.includes('am i free')
  ) {
    return {
      intent: 'CALENDAR_QUERY',
      mode: 'CONTEXTUAL',
      targetOverlay: 'timeline',
      requiresUI: true,
      confidence: 0.88,
      extractedParams: {
        query: text,
      },
    };
  }

  // 9. Pure UI Lens Summons (FAST)
  if (text.includes('open files') || text.includes('show files') || text.includes('data storage')) {
    return {
      intent: 'SUMMON_UI',
      mode: 'FAST',
      targetOverlay: 'files',
      requiresUI: true,
      confidence: 0.85,
      extractedParams: {},
    };
  }
  if (text.includes('open dialogue') || text.includes('show dialogue')) {
    return {
      intent: 'SUMMON_UI',
      mode: 'FAST',
      targetOverlay: 'dialogue',
      requiresUI: true,
      confidence: 0.85,
      extractedParams: {},
    };
  }
  if (text.includes('open nexus') || text.includes('system overview')) {
    return {
      intent: 'SUMMON_UI',
      mode: 'FAST',
      targetOverlay: 'nexus',
      requiresUI: true,
      confidence: 0.85,
      extractedParams: {},
    };
  }

  // 10. Default: Fast Factual Query (FAST mode, direct cloud LLM acceleration)
  return {
    intent: 'FAST_FACTUAL',
    mode: 'FAST',
    targetOverlay: null,
    requiresUI: false,
    confidence: 0.75,
    extractedParams: {
      query: rawText,
    },
  };
}
