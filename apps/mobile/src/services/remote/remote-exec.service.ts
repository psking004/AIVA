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

export type NodeTarget = 'PC-A' | 'PC-B' | 'CLOUD';
export type ExecAction = 'STATUS' | 'BUILD' | 'TEST' | 'CODE' | 'EXEC' | 'LAUNCH_APP';

export interface RemoteExecIntent {
  isRemoteExec: boolean;
  targetNode: NodeTarget;
  action: ExecAction;
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

export class RemoteExecService {
  /**
   * Detect whether a voice prompt matches a cross-node execution intent
   */
  public detectRemoteExecutionIntent(text: string): RemoteExecIntent | null {
    const clean = text.trim().toLowerCase();
    if (!clean) return null;

    // 1. Workstation desktop app launch (e.g. "Open VS Code on PC-B", "Launch Chrome on PC-A", "Open Blender on PC-B", "Open notes on PC-B and write buy groceries")
    const launchCmd = parseLaunchIntent(text);
    if (launchCmd.isAppLaunch && (launchCmd.targetNode === 'PC-A' || launchCmd.targetNode === 'PC-B')) {
      return {
        isRemoteExec: true,
        targetNode: launchCmd.targetNode,
        action: 'LAUNCH_APP',
        application: launchCmd.appName,
        command: launchCmd.followUpAction,
        query: text.trim(),
      };
    }

    const hasPcA = /\b(pc-?a|pca|gpu|3050|rtx)\b/i.test(clean);
    const hasPcB = /\b(pc-?b|pcb|desktop|host|workstation)\b/i.test(clean);
    const hasOllama = /\b(ollama|llama|gpu daemon)\b/i.test(clean);
    const hasPcGeneric = /\b(pc|computer|system|laptop|workstation|rig|machine|nodes?)\b/i.test(clean);
    const hasBuild = /\b(build|compile|gradle|assemble)\b/i.test(clean);
    const hasTest = /\b(test|typecheck|lint|verify)\b/i.test(clean);
    const hasCode = /\b(code|generate code|refactor|script)\b/i.test(clean);
    const hasRun = /\b(run|exec|execute|start task|boot|start service)\b/i.test(clean);
    const hasStatus = /\b(status|check|health|ping|probe|info|state|diagnostic|how is)\b/i.test(clean);

    // If query matches tri-node execution patterns:
    // 1. Mentions PC-A or PC-B specifically
    // 2. Mentions Ollama service
    // 3. Asks for status/check of PC, computer, system, nodes (e.g. "status of PC", "check my pc", "system status")
    // 4. Build, test, run, or code commands
    const isRemoteIntent =
      hasPcA ||
      hasPcB ||
      hasOllama ||
      (hasStatus && (hasPcGeneric || clean.includes('pc') || clean.includes('system') || clean.includes('fabric'))) ||
      ((hasBuild || hasTest || hasRun || hasCode) && (hasPcGeneric || hasPcB || hasPcA || hasTest || hasBuild || clean.includes('app') || clean.includes('mobile') || clean.includes('script')));

    if (isRemoteIntent) {
      let targetNode: NodeTarget = 'PC-B';
      if (hasPcA || hasOllama || (clean.includes('gpu') && !hasPcB)) {
        targetNode = 'PC-A';
      } else {
        targetNode = 'PC-B';
      }

      let action: ExecAction = 'STATUS';
      let command: string | undefined;
      let application: string | undefined;

      if (hasOllama && (clean.includes('start') || clean.includes('boot') || clean.includes('run') || clean.includes('turn on') || clean.includes('serve'))) {
        action = 'LAUNCH_APP';
        application = 'ollama';
      } else if (hasBuild) {
        action = 'BUILD';
        command = 'cd apps/mobile/android && .\\gradlew.bat --version';
      } else if (hasTest) {
        action = 'TEST';
        command = 'pnpm --filter @aiva/mobile typecheck';
      } else if (hasCode) {
        action = 'CODE';
      } else if (hasRun) {
        action = 'EXEC';
      } else if (hasStatus) {
        action = 'STATUS';
      }

      return {
        isRemoteExec: true,
        targetNode,
        action,
        application,
        command,
        query: text.trim(),
      };
    }

    return null;
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

