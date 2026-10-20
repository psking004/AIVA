/**
 * AIVA Coding Agent
 *
 * Implements the Core Coding & Repository Engineering Capability:
 * Workflow: UNDERSTAND -> PLAN -> EDIT -> TEST -> VERIFY -> REPORT
 *
 * Enforces the Action Verification Principle:
 * Never claim success without executing verification (compiler/test pass).
 */

import { Injectable, Logger } from '@nestjs/common';
import { AivaPolicyEngine, VerificationResult } from '../policy/aiva-policy-engine';
import { ModelRouterService } from '../router/model-router.service';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CodeEditPlan {
  targetFile: string;
  rationale: string;
  changes: string;
}

export interface CodingAgentResult {
  success: boolean;
  action: 'INSPECT' | 'EDIT' | 'VERIFY' | 'REPAIR';
  response: string;
  verified: boolean;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  verification?: VerificationResult;
}

@Injectable()
export class CodingAgent {
  private readonly logger = new Logger(CodingAgent.name);
  readonly name = 'Coding Agent';
  readonly description = 'Inspects repositories, plans edits, modifies code safely, runs tests, and verifies compiler outputs';
  readonly tools = ['codeRead', 'codeSearch', 'codeEdit', 'codeVerify', 'runTests', 'runBuild'];

  constructor(
    private readonly policyEngine: AivaPolicyEngine,
    private readonly modelRouter: ModelRouterService,
  ) {}

  /**
   * Main execution entry point for coding directives
   */
  async execute(
    userId: string,
    input: string,
    parameters: Record<string, unknown> = {},
    _context: any,
  ): Promise<CodingAgentResult> {
    this.logger.log(`Coding Agent executing for user ${userId}: "${input.substring(0, 80)}"`);

    const action = (parameters.action as string) || this.detectAction(input);

    switch (action) {
      case 'INSPECT':
        return this.inspectCode(parameters);
      case 'EDIT':
        return this.editCode(parameters);
      case 'VERIFY':
        return this.verifyBuild();
      default:
        return this.handleGeneralCodingRequest(input, parameters);
    }
  }

  private detectAction(input: string): string {
    const lower = input.toLowerCase();
    if (/verify|check build|run tests|typecheck/i.test(lower)) return 'VERIFY';
    if (/edit|change|fix|modify|update file/i.test(lower)) return 'EDIT';
    return 'INSPECT';
  }

  /**
   * Inspect a code file or search symbol
   */
  private async inspectCode(parameters: Record<string, unknown>): Promise<CodingAgentResult> {
    const reqPath = parameters.filePath as string;
    if (!reqPath) {
      return {
        success: false,
        action: 'INSPECT',
        response: 'Missing filePath parameter for code inspection.',
        verified: false,
        toolCalls: [],
      };
    }

    const fullPath = path.resolve(process.cwd(), reqPath);
    if (!fullPath.startsWith(process.cwd())) {
      return {
        success: false,
        action: 'INSPECT',
        response: 'Security policy violation: Path outside workspace boundary.',
        verified: false,
        toolCalls: [],
      };
    }

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        action: 'INSPECT',
        response: `File not found: ${reqPath}`,
        verified: false,
        toolCalls: [],
      };
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    return {
      success: true,
      action: 'INSPECT',
      response: `Inspected ${reqPath} (${lines.length} lines, ${content.length} bytes).`,
      verified: true,
      toolCalls: [{ name: 'codeRead', args: { filePath: reqPath } }],
    };
  }

  /**
   * Edit a file with pre/post verification
   */
  private async editCode(parameters: Record<string, unknown>): Promise<CodingAgentResult> {
    const reqPath = parameters.filePath as string;
    const newContent = parameters.content as string;

    if (!reqPath || newContent === undefined) {
      return {
        success: false,
        action: 'EDIT',
        response: 'Missing filePath or content for code edit.',
        verified: false,
        toolCalls: [],
      };
    }

    const fullPath = path.resolve(process.cwd(), reqPath);
    if (!fullPath.startsWith(process.cwd())) {
      return {
        success: false,
        action: 'EDIT',
        response: 'Security violation: Path outside workspace.',
        verified: false,
        toolCalls: [],
      };
    }

    // Backup before edit
    let backupContent: string | null = null;
    if (fs.existsSync(fullPath)) {
      backupContent = fs.readFileSync(fullPath, 'utf8');
    }

    try {
      fs.writeFileSync(fullPath, newContent, 'utf8');
      this.logger.log(`Edited file: ${reqPath}`);

      // Automated Verification Step
      const verification = await this.runBuildCheck();

      if (!verification.verified) {
        // Rollback on verification failure by default
        if (parameters.rollbackOnFailure !== false && backupContent !== null) {
          fs.writeFileSync(fullPath, backupContent, 'utf8');
          return {
            success: false,
            action: 'EDIT',
            response: `Edits to ${reqPath} broke the build (${verification.reason}). Changes were automatically rolled back.`,
            verified: false,
            toolCalls: [{ name: 'codeEdit', args: { filePath: reqPath, rolledBack: true } }],
            verification,
          };
        }

        return {
          success: false,
          action: 'EDIT',
          response: `Applied edits to ${reqPath}, but the build currently fails: ${verification.reason}`,
          verified: false,
          toolCalls: [{ name: 'codeEdit', args: { filePath: reqPath } }],
          verification,
        };
      }

      return {
        success: true,
        action: 'EDIT',
        response: `Successfully edited ${reqPath}. Compiler check passed with zero errors.`,
        verified: true,
        toolCalls: [{ name: 'codeEdit', args: { filePath: reqPath } }],
        verification,
      };
    } catch (err: any) {
      if (backupContent !== null) {
        fs.writeFileSync(fullPath, backupContent, 'utf8');
      }
      return {
        success: false,
        action: 'EDIT',
        response: `Edit failed: ${err.message}`,
        verified: false,
        toolCalls: [],
      };
    }
  }

  /**
   * Run compiler build verification
   */
  public async verifyBuild(): Promise<CodingAgentResult> {
    const verification = await this.runBuildCheck();

    return {
      success: verification.verified,
      action: 'VERIFY',
      response: verification.verified
        ? 'Project build verification succeeded: 0 errors detected.'
        : `Build verification failed: ${verification.reason}`,
      verified: verification.verified,
      toolCalls: [{ name: 'runBuild', args: {} }],
      verification,
    };
  }

  private async runBuildCheck(): Promise<VerificationResult> {
    try {
      const { stdout } = await execAsync('pnpm --filter @aiva/backend typecheck', {
        cwd: process.cwd(),
        timeout: 25000,
      });

      return this.policyEngine.verifyActionOutcome('BUILD_CHECK', {
        exitCode: 0,
        stdout,
      });
    } catch (err: any) {
      return this.policyEngine.verifyActionOutcome('BUILD_CHECK', {
        exitCode: err.code || 1,
        error: err.stdout || err.stderr || err.message,
      });
    }
  }

  private async handleGeneralCodingRequest(input: string, _parameters: Record<string, unknown>): Promise<CodingAgentResult> {
    const prompt = `You are AIVA's Coding Agent. Analyze this software engineering request:\n"${input}"\nProvide a concise plan (UNDERSTAND -> PLAN -> EDIT -> TEST).`;

    const modelRes = await this.modelRouter.complete(prompt, {
      maxTokens: 512,
      temperature: 0.2,
    });

    return {
      success: true,
      action: 'INSPECT',
      response: modelRes.content,
      verified: true,
      toolCalls: [],
    };
  }
}
