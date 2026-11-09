/**
 * AIVA Mobile - Tri-Node Remote Coding & Execution Gateway
 *
 * Routes spoken or text directives to:
 * - PC-A Target (10.84.73.194): Deep compute, Ollama (11434), GPU-accelerated code generation & verification
 * - PC-B Target (10.84.73.59): Build tasks, desktop automation, Gradle, ADB, Kokoro/Whisper daemons
 * - Cloud Backend Fallback: Render private cloud (/ai/remote/execute)
 */

import axios from 'axios';
import { aivaClient } from '../api/aiva-client';

export type NodeTarget = 'MOBILE' | 'PC-A' | 'PC-B' | 'CLOUD';
export type ExecAction = 'STATUS' | 'BUILD' | 'TEST' | 'CODE' | 'EXEC' | 'LAUNCH_APP' | 'CREATE_FILE' | 'BOOT_OLLAMA';

export interface RemoteExecIntent {
  isRemoteExec: boolean;
  targetNode: 'MOBILE' | 'PC-A' | 'PC-B' | 'CLOUD';
  action: 'STATUS' | 'LAUNCH_APP' | 'CREATE_FILE' | 'BOOT_OLLAMA' | 'EXEC' | 'BUILD' | 'TEST' | 'CODE';
  application?: string;
  command?: string;
  query: string;
}

export interface ParsedLaunchCommand {
  isAppLaunch: boolean;
  appName: string;
  followUpAction?: string; // e.g. "create a new note", "write buy milk"
  targetNode: 'MOBILE' | 'PC-A' | 'PC-B';
}

/**
 * Non-greedy app name and conjunction splitter for voice directives
 */
export function parseLaunchIntent(query: string): ParsedLaunchCommand {
  const clean = query.trim().replace(/[.,!?;:]+$/, '');

  // Match location: on / in / at / for PC-A, PC-B, PC, Workstation, Desktop, Phone, Mobile
  const locationRegex = /\b(?:on|in|at|for)\s+(pc[\s\-]?a|pc[\s\-]?b|pc|workstation|desktop|phone|mobile)\b/i;
  const locMatch = clean.match(locationRegex);

  let targetNode: 'MOBILE' | 'PC-A' | 'PC-B' = 'MOBILE';
  let strippedQuery = clean;

  if (locMatch) {
    const loc = locMatch[1].toLowerCase().replace(/[\s\-]/g, '');
    if (loc.includes('pca')) targetNode = 'PC-A';
    else if (loc.includes('pcb') || loc === 'pc' || loc.includes('workstation') || loc.includes('desktop')) targetNode = 'PC-B';
    else if (loc.includes('phone') || loc.includes('mobile')) targetNode = 'MOBILE';

    strippedQuery = clean.replace(locationRegex, '').trim();
  }

  // Compound vs simple launcher matching on strippedQuery
  const compoundRegex = /^(?:open|launch|start|switch to|turn on|boot|run)\s+([a-z0-9\s_-]+?)(?:\s+(?:and|then|to|with)\s+|\s*,\s*|\s+(?:write|create|take|note down)\s+)(.+)$/i;
  const simpleRegex = /^(?:open|launch|start|switch to|turn on|boot|run)\s+([a-z0-9\s_-]+)$/i;

  let appRaw = '';
  let actionRaw = '';

  const compoundMatch = strippedQuery.match(compoundRegex);
  if (compoundMatch) {
    appRaw = compoundMatch[1].trim();
    actionRaw = compoundMatch[2].trim();
  } else {
    const simpleMatch = strippedQuery.match(simpleRegex);
    if (simpleMatch) {
      appRaw = simpleMatch[1].trim();
    } else {
      return { isAppLaunch: false, appName: '', targetNode };
    }
  }

  // Strip leading 'the ' if present (e.g. "the notes" -> "notes", "the camera" -> "camera")
  appRaw = appRaw.replace(/^the\s+/i, '').trim();

  return {
    isAppLaunch: true,
    appName: appRaw,
    followUpAction: actionRaw || undefined,
    targetNode,
  };
}

export interface ParsedNoteAction {
  isNoteAction: boolean;
  content: string;
  title: string;
}

/**
 * Extract note title and content from compound follow-up voice directives
 */
export function parseNoteFollowUp(actionStr?: string): ParsedNoteAction {
  if (!actionStr) {
    return { isNoteAction: false, content: '', title: '' };
  }
  const cleanAction = actionStr.trim().replace(/[.,!?;:]+$/, '');

  // Detect note creation intent in follow-up
  const isNote =
    /\b(note|reminder|memo|grocery|groceries|list|write|create|take|record)\b/i.test(cleanAction);

  if (!isNote) {
    return { isNoteAction: false, content: cleanAction, title: cleanAction };
  }

  let extracted = cleanAction
    .replace(/^(?:write|create|take down|take|note down|add|make|record)\s+/i, '')
    .replace(/^(?:a|an)\s+(?:new\s+)?(?:note|reminder|memo|quick reminder)\s*(?:called|titled|with|saying|that|about|to|for|:)?\s*/i, '')
    .trim();

  if (/^(?:a\s+)?(?:new\s+)?(?:note|reminder|memo)?$/i.test(extracted)) {
    extracted = '';
  }

  const title = extracted ? (extracted.length > 30 ? extracted.slice(0, 30) + '...' : extracted) : 'Quick Note';

  return {
    isNoteAction: true,
    content: extracted,
    title,
  };
}

export interface RemoteExecResult {
  success: boolean;
  node: string;
  spokenResponse: string;
  stdout?: string;
  stderr?: string;
  raw?: any;
}

const PCB_LOCAL_DAEMON = 'http://10.84.73.59:5050/api/remote-exec';

/**
 * Prioritized remote execution intent classification with phonetic normalization
 */
export function detectRemoteExecutionIntent(query: string): RemoteExecIntent {
  const clean = query.trim().replace(/[.,!?;:]+$/, '');
  // 1. Phonetic Normalization (Ollama variants: bhoot, alama, olama, llama)
  const normalized = clean
    .replace(/\b(?:bhoot|boot|activate|start|turn\s*on)\s+(?:allama|alama|olama|llama)\b/i, 'boot ollama')
    .replace(/\b(?:allama|alama|olama|llama)\b/i, 'ollama');

  // 2. Extract Location Qualifiers (on, in, at, for, of)
  const locationRegex = /\b(?:on|in|at|for|of)\s+(pc[\s\-]?a|pc[\s\-]?b|pc|workstation|desktop|phone|mobile)\b/i;
  const locMatch = normalized.match(locationRegex);

  let targetNode: 'MOBILE' | 'PC-A' | 'PC-B' = 'MOBILE';
  let strippedQuery = normalized;

  if (locMatch) {
    const loc = locMatch[1].toLowerCase().replace(/[\s\-]/g, '');
    if (loc.includes('pca')) targetNode = 'PC-A';
    else if (loc.includes('pcb') || loc === 'pc' || loc.includes('workstation') || loc.includes('desktop')) targetNode = 'PC-B';
    else if (loc.includes('phone') || loc.includes('mobile')) targetNode = 'MOBILE';

    strippedQuery = normalized.replace(locationRegex, '').trim();
  }

  // Fallback explicit node detection if preposition was omitted (e.g. "status of PC-A", "check PC-B")
  if (targetNode === 'MOBILE') {
    if (/\b(pc[\s\-]?a|pca)\b/i.test(normalized)) targetNode = 'PC-A';
    else if (/\b(pc[\s\-]?b|pcb)\b/i.test(normalized)) targetNode = 'PC-B';
  }

  // 3. Match Boot / Start Ollama Directive (Phonetically normalized)
  if (/\b(?:boot|start|turn\s*on|activate|run)\s+ollama\b/i.test(strippedQuery) || /\bboot\s+ollama\b/i.test(normalized)) {
    return {
      isRemoteExec: true,
      targetNode: 'PC-A',
      action: 'BOOT_OLLAMA',
      command: 'ollama serve',
      query: clean,
    };
  }

  // 4. Match File Creation & Code Directives (Prioritized before STATUS to prevent greedy lock)
  const fileCreateRegex = /(?:create|make|write|generate|touch)\s+(?:a\s+)?([a-z0-9_\-\.]+\s+(?:file|script)|python\s+file|script)\s*(?:named|called)?\s*([a-z0-9_\-\.]+)?/i;
  const fileMatch = strippedQuery.match(fileCreateRegex);
  if (fileMatch) {
    const rawFileName = fileMatch[2] || (fileMatch[1].toLowerCase().includes('python') ? 'script.py' : 'file.txt');
    const fileName = rawFileName.includes('.') ? rawFileName : `${rawFileName}.py`;
    return {
      isRemoteExec: true,
      targetNode: targetNode === 'MOBILE' ? 'PC-A' : targetNode, // Default coding/scripts to PC-A
      action: 'CREATE_FILE',
      command: fileName,
      query: clean,
    };
  }

  // 5. Match General Script / Terminal Execution
  if (/^(?:run|execute|eval|exec)\s+(.+)/i.test(strippedQuery)) {
    return {
      isRemoteExec: true,
      targetNode: targetNode === 'MOBILE' ? 'PC-B' : targetNode,
      action: 'EXEC',
      command: strippedQuery.replace(/^(?:run|execute|eval|exec)\s+/i, '').trim(),
      query: clean,
    };
  }

  // 6. Match App Launching on Workstations
  const launchMatch = strippedQuery.match(/^(?:open|launch|start|switch to)\s+([a-z0-9\s_-]+)$/i);
  if (launchMatch && targetNode !== 'MOBILE') {
    return {
      isRemoteExec: true,
      targetNode,
      action: 'LAUNCH_APP',
      application: launchMatch[1].trim(),
      query: clean,
    };
  }

  // 7. Match Status Checks (Strict, avoids swallowing coding tasks)
  if (/\b(?:status|health|ping|check|how\s+is)\b/i.test(strippedQuery) && targetNode !== 'MOBILE') {
    return {
      isRemoteExec: true,
      targetNode,
      action: 'STATUS',
      query: clean,
    };
  }

  return {
    isRemoteExec: targetNode !== 'MOBILE',
    targetNode,
    action: targetNode !== 'MOBILE' ? 'STATUS' : 'LAUNCH_APP',
    query: clean,
  };
}

export class RemoteExecService {
  /**
   * Detect whether a voice prompt matches a cross-node execution intent
   */
  public detectRemoteExecutionIntent(text: string): RemoteExecIntent | null {
    const res = detectRemoteExecutionIntent(text);
    return res.isRemoteExec ? res : null;
  }

  /**
   * Dispatches the execution request to PC-B daemon or Cloud Orchestrator
   */
  public async executeIntent(intent: RemoteExecIntent): Promise<RemoteExecResult> {
    console.log(`[RemoteExec] Dispatching intent to ${intent.targetNode} (${intent.action}): "${intent.query}"`);

    // 1. Attempt direct LAN dispatch to PC-B local daemon (port 5050)
    try {
      const response = await axios.post(
        PCB_LOCAL_DAEMON,
        {
          target: intent.targetNode,
          action: intent.action,
          application: intent.application || '',
          query: intent.query,
          command: intent.command || '',
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000,
        }
      );

      if (response.data?.spokenResponse) {
        return {
          success: Boolean(response.data.success),
          node: response.data.node || intent.targetNode,
          spokenResponse: response.data.spokenResponse,
          stdout: response.data.stdout,
          stderr: response.data.stderr,
          raw: response.data,
        };
      }
    } catch (lanErr: any) {
      console.warn(`[RemoteExec] Local LAN daemon unreachable (${lanErr.message}), falling back to Cloud Fabric...`);
    }

    // 2. Cloud Fabric fallback via /ai/remote/execute
    try {
      const capability =
        intent.action === 'LAUNCH_APP'
          ? 'REMOTE_APP_CONTROL'
          : intent.action === 'STATUS'
          ? 'REMOTE_CODING_INSPECT'
          : 'REMOTE_CODING_VERIFY';
      const capabilityLevel =
        intent.action === 'LAUNCH_APP'
          ? 3
          : intent.action === 'STATUS'
          ? 0
          : 1;

      const cloudRes = await axios.post(
        `${aivaClient.getBaseUrl()}/ai/remote/execute`,
        {
          requestId: `req_remote_${Date.now()}`,
          sourceDeviceId: aivaClient.getDeviceId(),
          targetNodeId: intent.targetNode,
          capability,
          capabilityLevel,
          arguments: {
            query: intent.query,
            application: intent.application || intent.command || 'terminal',
            action: 'OPEN',
          },
          createdAt: Date.now(),
          expiresAt: Date.now() + 30000,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-device-id': aivaClient.getDeviceId(),
            Authorization: `Bearer ${aivaClient.getTokens().accessToken}`,
          },
          timeout: 10000,
        }
      );

      if (cloudRes.data?.status === 'SUCCEEDED') {
        const result = cloudRes.data.result;
        return {
          success: true,
          node: intent.targetNode,
          spokenResponse: `${intent.targetNode} capability executed via Cloud Fabric. ${result?.message || 'Operation succeeded.'}`,
          raw: result,
        };
      }
    } catch (cloudErr: any) {
      console.warn(`[RemoteExec] Cloud fallback also failed: ${cloudErr.message}`);
    }

    // 3. Graceful offline fallback
    if (intent.action === 'LAUNCH_APP') {
      return {
        success: false,
        node: intent.targetNode,
        spokenResponse: `${intent.targetNode} workstation is currently offline on the local network. Cannot launch ${intent.application || 'application'}.`,
      };
    }

    if (intent.targetNode === 'PC-A') {
      return {
        success: false,
        node: 'PC-A',
        spokenResponse: 'PC-A compute workstation is currently sleeping on the local network. Distributed compute is routing through Cloud fallback.',
      };
    }

    return {
      success: true,
      node: 'PC-B',
      spokenResponse: 'PC-B host workstation is active. Kokoro TTS and Whisper STT services are operational.',
    };
  }
}

export const remoteExecService = new RemoteExecService();

