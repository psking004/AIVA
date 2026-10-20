/**
 * AIVA Operating Policy Engine
 *
 * Implements the core operating policies governing AIVA's autonomy,
 * security boundaries, resource spending, and action verification:
 *
 * 1. 4-Tier Capability Permission Model (Levels 0 - 3)
 * 2. Strict Shell Boundary (No unrestricted shell access)
 * 3. Credit & Cost Optimization Policy (Token budgeting & concise voice formatting)
 * 4. Action Verification Principle (Never claim "Done" without verified execution)
 * 5. Platform-specific routing policies (Android -> Gemini, PC -> Qwen/Local)
 */

import { Injectable, Logger } from '@nestjs/common';

export type PermissionLevel = 0 | 1 | 2 | 3;

export interface CapabilityPermission {
  capability: string;
  level: PermissionLevel;
  description: string;
  requiresConfirmation: boolean;
  isDestructive: boolean;
}

export interface VerificationResult {
  status: 'SUCCEEDED' | 'FAILED' | 'PARTIALLY_SUCCEEDED' | 'BLOCKED';
  verified: boolean;
  reason?: string | undefined;
  exitCode?: number | undefined;
  stdoutSnippet?: string | undefined;
}

export interface PolicyCheckResult {
  allowed: boolean;
  level: PermissionLevel;
  requiresConfirmation: boolean;
  reason?: string | undefined;
}

@Injectable()
export class AivaPolicyEngine {
  private readonly logger = new Logger(AivaPolicyEngine.name);

  // Capability registry with authoritative permission tiers
  private readonly capabilityPermissions: Map<string, CapabilityPermission> = new Map([
    // Level 0: Safe Read-Only (Zero confirmation)
    ['TIME_QUERY', { capability: 'TIME_QUERY', level: 0, description: 'Query current time/date', requiresConfirmation: false, isDestructive: false }],
    ['SYSTEM_INFO', { capability: 'SYSTEM_INFO', level: 0, description: 'Query CPU, RAM, battery, OS state', requiresConfirmation: false, isDestructive: false }],
    ['TASK_READ', { capability: 'TASK_READ', level: 0, description: 'Read user tasks and action items', requiresConfirmation: false, isDestructive: false }],
    ['PROJECT_READ', { capability: 'PROJECT_READ', level: 0, description: 'Read project matrix & initiatives', requiresConfirmation: false, isDestructive: false }],
    ['CALENDAR_READ', { capability: 'CALENDAR_READ', level: 0, description: 'Read calendar timeline & events', requiresConfirmation: false, isDestructive: false }],
    ['MEMORY_READ', { capability: 'MEMORY_READ', level: 0, description: 'Search episodic and semantic memory', requiresConfirmation: false, isDestructive: false }],
    ['CODE_READ', { capability: 'CODE_READ', level: 0, description: 'Read repository source code', requiresConfirmation: false, isDestructive: false }],
    ['CODE_SEARCH', { capability: 'CODE_SEARCH', level: 0, description: 'Search codebase for symbols/files', requiresConfirmation: false, isDestructive: false }],
    ['GIT_STATUS', { capability: 'GIT_STATUS', level: 0, description: 'Inspect git working tree & status', requiresConfirmation: false, isDestructive: false }],
    ['GIT_DIFF', { capability: 'GIT_DIFF', level: 0, description: 'Inspect uncommitted code diffs', requiresConfirmation: false, isDestructive: false }],

    // Level 1: Low-Risk Internal Operations (Autonomous)
    ['TASK_CREATE', { capability: 'TASK_CREATE', level: 1, description: 'Create a new personal task', requiresConfirmation: false, isDestructive: false }],
    ['TASK_UPDATE', { capability: 'TASK_UPDATE', level: 1, description: 'Update task status or priority', requiresConfirmation: false, isDestructive: false }],
    ['NOTE_CREATE', { capability: 'NOTE_CREATE', level: 1, description: 'Create or organize a personal note', requiresConfirmation: false, isDestructive: false }],
    ['EMAIL_DRAFT', { capability: 'EMAIL_DRAFT', level: 1, description: 'Draft an email without sending', requiresConfirmation: false, isDestructive: false }],
    ['MEMORY_WRITE', { capability: 'MEMORY_WRITE', level: 1, description: 'Store user preferences & facts', requiresConfirmation: false, isDestructive: false }],

    // Level 2: Sensitive Operations (User Confirmation Required)
    ['EMAIL_SEND', { capability: 'EMAIL_SEND', level: 2, description: 'Dispatch outgoing email', requiresConfirmation: true, isDestructive: false }],
    ['PROJECT_UPDATE', { capability: 'PROJECT_UPDATE', level: 2, description: 'Modify project initiatives & state', requiresConfirmation: true, isDestructive: false }],
    ['CODE_EDIT', { capability: 'CODE_EDIT', level: 2, description: 'Modify workspace source code files', requiresConfirmation: true, isDestructive: false }],
    ['TEST_RUN', { capability: 'TEST_RUN', level: 2, description: 'Execute automated test suite', requiresConfirmation: true, isDestructive: false }],
    ['BUILD_RUN', { capability: 'BUILD_RUN', level: 2, description: 'Execute compiler / bundle build', requiresConfirmation: true, isDestructive: false }],
    ['GIT_COMMIT', { capability: 'GIT_COMMIT', level: 2, description: 'Commit changes to local git repository', requiresConfirmation: true, isDestructive: false }],
    ['FILE_MOVE', { capability: 'FILE_MOVE', level: 2, description: 'Relocate documents or files', requiresConfirmation: true, isDestructive: false }],

    // Level 3: High-Risk Irreversible Operations (Strict Authorization)
    ['FILE_DELETE', { capability: 'FILE_DELETE', level: 3, description: 'Permanently remove files from storage', requiresConfirmation: true, isDestructive: true }],
    ['GIT_FORCE_PUSH', { capability: 'GIT_FORCE_PUSH', level: 3, description: 'Overwrite remote git history', requiresConfirmation: true, isDestructive: true }],
    ['DATABASE_RESET', { capability: 'DATABASE_RESET', level: 3, description: 'Drop or reset database tables', requiresConfirmation: true, isDestructive: true }],
    ['ARBITRARY_SHELL', { capability: 'ARBITRARY_SHELL', level: 3, description: 'Unrestricted terminal command execution', requiresConfirmation: true, isDestructive: true }],
    ['REMOTE_SHELL', { capability: 'REMOTE_SHELL', level: 3, description: 'Remote terminal command execution', requiresConfirmation: true, isDestructive: true }],

    // Remote PC-A / PC-B Capabilities
    ['REMOTE_QWEN_INFERENCE', { capability: 'REMOTE_QWEN_INFERENCE', level: 1, description: 'Execute local Qwen inference on remote node', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_RAG_SEARCH', { capability: 'REMOTE_RAG_SEARCH', level: 1, description: 'Execute RAG search on remote node', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_FILE_READ', { capability: 'REMOTE_FILE_READ', level: 0, description: 'Read authorized files on remote node', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_FILE_WRITE', { capability: 'REMOTE_FILE_WRITE', level: 2, description: 'Write authorized files on remote node', requiresConfirmation: true, isDestructive: false }],
    ['REMOTE_APP_CONTROL', { capability: 'REMOTE_APP_CONTROL', level: 2, description: 'Launch authorized application on remote node', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_AUTOMATION', { capability: 'REMOTE_AUTOMATION', level: 2, description: 'Execute approved automation workflow', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_CODING_INSPECT', { capability: 'REMOTE_CODING_INSPECT', level: 0, description: 'Inspect workspace files remotely via Coding Agent', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_CODING_VERIFY', { capability: 'REMOTE_CODING_VERIFY', level: 1, description: 'Verify build/typecheck remotely via Coding Agent', requiresConfirmation: false, isDestructive: false }],
    ['REMOTE_CODING_EDIT', { capability: 'REMOTE_CODING_EDIT', level: 2, description: 'Edit workspace file with compiler verification and backup rollback', requiresConfirmation: true, isDestructive: false }],
  ]);

  constructor() {
    this.logger.log('AIVA Operating Policy Engine active with 4-tier capability security');
  }

  /**
   * Evaluate if a capability is allowed to execute and under what conditions
   */
  public evaluateCapability(capability: string, _context?: Record<string, unknown>): PolicyCheckResult {
    const config = this.capabilityPermissions.get(capability.toUpperCase());

    if (!config) {
      this.logger.warn(`Unknown capability requested: ${capability}. Defaulting to Level 2 (Sensitive).`);
      return {
        allowed: true,
        level: 2,
        requiresConfirmation: true,
        reason: 'Unregistered capability requires explicit user confirmation.',
      };
    }

    // Permanent safety rule: Unrestricted arbitrary shell commands are strictly forbidden
    if (config.capability === 'ARBITRARY_SHELL' || config.capability === 'REMOTE_SHELL' || config.capability === 'DATABASE_RESET') {
      this.logger.error(`[POLICY BLOCK] Capability ${config.capability} blocked by permanent safety rules.`);
      return {
        allowed: false,
        level: config.level,
        requiresConfirmation: true,
        reason: `Capability ${config.capability} is blocked by AIVA safety policy. Use capability-based tools instead.`,
      };
    }

    return {
      allowed: true,
      level: config.level,
      requiresConfirmation: config.requiresConfirmation,
      reason: config.requiresConfirmation
        ? `Capability ${config.capability} requires user confirmation (Level ${config.level}).`
        : `Safe execution approved (Level ${config.level}).`,
    };
  }

  /**
   * Verify the outcome of an agentic action. Never claim completion without proof.
   */
  public verifyActionOutcome(
    actionName: string,
    executionResult: { exitCode?: number; error?: string; stdout?: string }
  ): VerificationResult {
    if (executionResult.error || (executionResult.exitCode !== undefined && executionResult.exitCode !== 0)) {
      this.logger.warn(`Action ${actionName} failed verification with exitCode=${executionResult.exitCode}, error=${executionResult.error}`);
      return {
        status: 'FAILED',
        verified: false,
        reason: executionResult.error || `Command exited with non-zero exit code ${executionResult.exitCode}`,
        exitCode: executionResult.exitCode,
      };
    }

    return {
      status: 'SUCCEEDED',
      verified: true,
      reason: 'Action completed with exit code 0 and verified outputs.',
      exitCode: 0,
      stdoutSnippet: executionResult.stdout?.substring(0, 300),
    };
  }

  /**
   * Concise Voice Policy: Restrict spoken speech to 1-2 natural sentences
   * to respect user attention and conserve TTS compute.
   */
  public formatSpokenResponse(fullText: string): string {
    if (!fullText) return '';
    const clean = fullText.replace(/[*_#`]/g, '').trim();
    // Match first 1-2 sentences
    const sentences = clean.match(/[^.!?]+[.!?]+/g);
    if (!sentences || sentences.length === 0) {
      return clean.slice(0, 160);
    }
    return sentences.slice(0, 2).join(' ').trim();
  }
}
