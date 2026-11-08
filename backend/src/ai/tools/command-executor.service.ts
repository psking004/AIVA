/**
 * AIVA Controlled Command Executor
 *
 * Implements safe, auditable command execution for autonomous operations:
 * - PROJECT_CREATE, PACKAGE_INSTALL, PROJECT_BUILD, PROJECT_TEST, DEV_SERVER_START, GIT_OPERATION
 * - Whitelisted binary commands only
 * - Workspace and approved directory boundary confinement
 * - Command injection, shell chaining, and path traversal rejection
 * - Strict block on destructive operations (rm -rf, format, force push, credential access)
 * - Structured stdout, stderr, exit code, and timeout handling
 */

import { Injectable, Logger } from '@nestjs/common';
import { AivaPolicyEngine, VerificationResult } from '../policy/aiva-policy-engine';
import { ProjectAwarenessService } from '../kernel/project-awareness.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';

export type ControlledOperationType =
  | 'PROJECT_CREATE'
  | 'PACKAGE_INSTALL'
  | 'PROJECT_BUILD'
  | 'PROJECT_TEST'
  | 'DEV_SERVER_START'
  | 'GIT_OPERATION';

export interface CommandExecutionRequest {
  operation: ControlledOperationType;
  binary?: 'pnpm' | 'npm' | 'git' | 'node' | 'python' | 'pytest' | undefined;
  command?: string | undefined;
  args: string[];
  cwd: string;
  timeoutMs?: number | undefined;
  env?: Record<string, string> | undefined;
}

export interface CommandExecutionResult {
  success: boolean;
  operation: ControlledOperationType;
  binary: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string | undefined;
  verification: VerificationResult;
}

@Injectable()
export class ControlledCommandExecutor {
  private readonly logger = new Logger(ControlledCommandExecutor.name);

  // Strictly whitelisted binaries
  private readonly ALLOWED_BINARIES = new Set(['pnpm', 'npm', 'git', 'node', 'python', 'pytest']);

  // Disallowed dangerous argument substrings / patterns
  private readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf/i,
    /del\s+\/[sfq]/i,
    /format\s+[a-z]:/i,
    /mkfs/i,
    /fdisk/i,
    /diskpart/i,
    /drop\s+database/i,
    /--force/i,
    /-[a-z]*f[a-z]*/i, // covers -f, -fdx, -rf
    /clean\s+-[a-z]+/i,
    /reset\s+--hard/i,
    /\.env/i,
    /id_rsa/i,
    /id_ed25519/i,
    /credentials/i,
    /shadow/i,
    /system32/i,
    /[;&|`$<>]/, // shell injection / chaining characters
  ];

  constructor(
    private readonly policyEngine: AivaPolicyEngine,
    private readonly projectAwareness: ProjectAwarenessService,
  ) {
    this.logger.log('ControlledCommandExecutor active with strict command boundaries');
  }

  /**
   * Validate that the requested working directory is inside an approved workspace or system temp directory
   */
  public isApprovedDirectory(targetDir: string): { approved: boolean; reason?: string } {
    if (!targetDir || typeof targetDir !== 'string') {
      return { approved: false, reason: 'Invalid directory path.' };
    }

    const resolved = path.resolve(targetDir);
    const workspaceRoot = path.resolve(this.projectAwareness.getWorkspaceRoot());
    const tempRoot = path.resolve(os.tmpdir());

    // Check directory traversal
    if (targetDir.includes('..')) {
      const normalized = path.normalize(targetDir);
      if (!normalized.startsWith(workspaceRoot) && !normalized.startsWith(tempRoot)) {
        return { approved: false, reason: 'Directory traversal escaping approved roots is strictly rejected.' };
      }
    }

    // Must be inside workspaceRoot or tempRoot
    const insideWorkspace = resolved.toLowerCase().startsWith(workspaceRoot.toLowerCase());
    const insideTemp = resolved.toLowerCase().startsWith(tempRoot.toLowerCase());

    if (!insideWorkspace && !insideTemp) {
      return {
        approved: false,
        reason: `Working directory "${resolved}" is outside approved workspace and temporary directories.`,
      };
    }

    return { approved: true };
  }

  /**
   * Validate command arguments against injection, chaining, and destructive commands
   */
  public validateCommandSafety(binary: string, args: string[]): { safe: boolean; reason?: string } {
    if (!this.ALLOWED_BINARIES.has(binary.toLowerCase())) {
      return { safe: false, reason: `Binary "${binary}" is not in the approved execution whitelist.` };
    }

    for (const arg of args) {
      for (const pattern of this.DANGEROUS_PATTERNS) {
        if (pattern.test(arg)) {
          return {
            safe: false,
            reason: `Argument "${arg}" rejected: contains forbidden or dangerous pattern (${pattern}).`,
          };
        }
      }
    }

    return { safe: true };
  }

  /**
   * Execute a controlled command within approved workspace boundaries
   */
  public async execute(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
    const startedAt = Date.now();
    const timeoutMs = request.timeoutMs || 45000;
    const rawBinary = (request.binary || request.command || '').trim().toLowerCase();
    const binary = rawBinary as 'pnpm' | 'npm' | 'git' | 'node' | 'python' | 'pytest';

    // 1. Directory safety verification
    const dirCheck = this.isApprovedDirectory(request.cwd);
    if (!dirCheck.approved) {
      this.logger.warn(`[COMMAND SECURITY REJECTION] ${dirCheck.reason}`);
      const verification = this.policyEngine.verifyActionOutcome('CONTROLLED_COMMAND', {
        exitCode: 1,
        error: dirCheck.reason,
      });
      return {
        success: false,
        operation: request.operation,
        binary,
        args: request.args,
        cwd: request.cwd,
        exitCode: 1,
        stdout: '',
        stderr: dirCheck.reason || 'Directory rejected',
        durationMs: Date.now() - startedAt,
        timedOut: false,
        error: dirCheck.reason,
        verification,
      };
    }

    // 2. Command safety verification
    const safetyCheck = this.validateCommandSafety(binary, request.args);
    if (!safetyCheck.safe) {
      this.logger.warn(`[COMMAND SECURITY REJECTION] ${safetyCheck.reason}`);
      const verification = this.policyEngine.verifyActionOutcome('CONTROLLED_COMMAND', {
        exitCode: 1,
        error: safetyCheck.reason,
      });
      return {
        success: false,
        operation: request.operation,
        binary,
        args: request.args,
        cwd: request.cwd,
        exitCode: 1,
        stdout: '',
        stderr: safetyCheck.reason || 'Command rejected',
        durationMs: Date.now() - startedAt,
        timedOut: false,
        error: safetyCheck.reason,
        verification,
      };
    }

    // 3. Ensure target directory exists on disk
    if (!fs.existsSync(request.cwd)) {
      try {
        fs.mkdirSync(request.cwd, { recursive: true });
      } catch (err: any) {
        return {
          success: false,
          operation: request.operation,
          binary,
          args: request.args,
          cwd: request.cwd,
          exitCode: 1,
          stdout: '',
          stderr: `Failed to create working directory: ${err.message}`,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          error: err.message,
          verification: { status: 'FAILED', verified: false, reason: err.message },
        };
      }
    }

    // Resolve binary path on Windows (e.g. pnpm.cmd, npm.cmd)
    const isWindows = process.platform === 'win32';
    let execBinary = binary;
    let useShell = false;
    if (isWindows && (binary === 'pnpm' || binary === 'npm')) {
      execBinary = `${binary}.cmd` as any;
      useShell = true; // On Windows, .cmd batch files must be spawned with shell
    }

    this.logger.log(`[CONTROLLED EXEC] ${request.operation}: ${execBinary} ${request.args.join(' ')} (cwd: ${request.cwd})`);

    return new Promise<CommandExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(execBinary, request.args, {
        cwd: request.cwd,
        env: {
          ...process.env,
          ...(request.env || {}),
          CI: 'true',
        },
        shell: useShell,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        this.logger.warn(`Command timed out after ${timeoutMs}ms: ${execBinary} ${request.args.join(' ')}`);
        try {
          child.kill('SIGKILL');
        } catch (_) {}
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        const verification = this.policyEngine.verifyActionOutcome(request.operation, {
          exitCode: 1,
          error: err.message,
        });
        resolve({
          success: false,
          operation: request.operation,
          binary,
          args: request.args,
          cwd: request.cwd,
          exitCode: 1,
          stdout,
          stderr: stderr ? `${stderr}\n${err.message}` : err.message,
          durationMs,
          timedOut,
          error: err.message,
          verification,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        const exitCode = timedOut ? 124 : (code ?? 0);
        const isSuccess = exitCode === 0 && !timedOut;

        const verification = this.policyEngine.verifyActionOutcome(request.operation, {
          exitCode,
          stdout,
          error: isSuccess ? undefined : (stderr || `Process exited with code ${exitCode}`),
        });

        resolve({
          success: isSuccess,
          operation: request.operation,
          binary,
          args: request.args,
          cwd: request.cwd,
          exitCode,
          stdout,
          stderr,
          durationMs,
          timedOut,
          error: isSuccess ? undefined : (stderr || `Exited with code ${exitCode}`),
          verification,
        });
      });
    });
  }
}
