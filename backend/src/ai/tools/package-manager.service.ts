/**
 * AIVA Controlled Package Manager Service
 *
 * Implements structured package management within approved project directories:
 * - pnpm install / add / remove
 * - npm install / add / remove
 * - Strict package name validation (no shell injection, flags, or command chaining)
 * - package.json verification post-installation
 */

import { Injectable, Logger } from '@nestjs/common';
import { ControlledCommandExecutor, CommandExecutionResult } from './command-executor.service';
import * as fs from 'fs';
import * as path from 'path';

export type PackageOperation = 'install' | 'add' | 'remove';

export interface PackageManagerRequest {
  manager?: 'pnpm' | 'npm' | undefined;
  operation: PackageOperation;
  packages?: string[] | undefined;
  cwd: string;
  isDev?: boolean | undefined;
}

export interface PackageManagerResult {
  success: boolean;
  manager: 'pnpm' | 'npm';
  operation: PackageOperation;
  packages: string[];
  cwd: string;
  commandResult: CommandExecutionResult;
  verified: boolean;
  error?: string | undefined;
  packageJsonChanges?: {
    added?: string[] | undefined;
    removed?: string[] | undefined;
  } | undefined;
}

@Injectable()
export class PackageManagerService {
  private readonly logger = new Logger(PackageManagerService.name);

  // Strict npm package name regex (supports scoped packages and version specifiers)
  // e.g. "react", "@types/node", "react-router-dom@^6.0.0", "lodash-es"
  private readonly SAFE_PACKAGE_REGEX = /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(@[a-z0-9^~><=.-]+)?$/i;

  constructor(private readonly commandExecutor: ControlledCommandExecutor) {
    this.logger.log('PackageManagerService initialized with structured package validation');
  }

  /**
   * Validate individual package names against injection and illicit flags
   */
  public validatePackageName(pkg: string): { valid: boolean; reason?: string } {
    if (!pkg || typeof pkg !== 'string') {
      return { valid: false, reason: 'Package name must be a non-empty string.' };
    }

    const trimmed = pkg.trim();
    if (trimmed.startsWith('-')) {
      return { valid: false, reason: `Package name "${pkg}" rejected: flags are not permitted.` };
    }

    if (!this.SAFE_PACKAGE_REGEX.test(trimmed)) {
      return { valid: false, reason: `Package name "${pkg}" rejected: contains invalid characters.` };
    }

    return { valid: true };
  }

  /**
   * Execute controlled package manager operation
   */
  public async execute(request: PackageManagerRequest): Promise<PackageManagerResult> {
    const manager = request.manager || 'pnpm';
    const packages = (request.packages || []).map((p) => p.trim()).filter(Boolean);
    const cwd = path.resolve(request.cwd);

    // 1. Verify working directory has package.json (unless installing initial dependencies)
    const pkgJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      } catch (_) {}
    } else if (request.operation !== 'install') {
      return {
        success: false,
        manager,
        operation: request.operation,
        packages,
        cwd,
        commandResult: {
          success: false,
          operation: 'PACKAGE_INSTALL',
          binary: manager,
          args: [],
          cwd,
          exitCode: 1,
          stdout: '',
          stderr: `package.json not found in ${cwd}`,
          durationMs: 0,
          timedOut: false,
          error: `package.json not found in ${cwd}`,
          verification: { status: 'FAILED', verified: false, reason: 'Missing package.json' },
        },
        verified: false,
        error: `Working directory does not contain package.json: ${cwd}`,
      };
    }

    // 2. Validate all package names
    for (const pkg of packages) {
      const val = this.validatePackageName(pkg);
      if (!val.valid) {
        this.logger.warn(`[PACKAGE MANAGER SECURITY] ${val.reason}`);
        return {
          success: false,
          manager,
          operation: request.operation,
          packages,
          cwd,
          commandResult: {
            success: false,
            operation: 'PACKAGE_INSTALL',
            binary: manager,
            args: [],
            cwd,
            exitCode: 1,
            stdout: '',
            stderr: val.reason || 'Invalid package name',
            durationMs: 0,
            timedOut: false,
            error: val.reason,
            verification: { status: 'FAILED', verified: false, reason: val.reason },
          },
          verified: false,
          error: val.reason,
        };
      }
    }

    // 3. Assemble command args
    const args: string[] = [];
    if (request.operation === 'install') {
      args.push('install');
      if (manager === 'pnpm') {
        args.push('--ignore-workspace');
      }
    } else if (request.operation === 'add') {
      args.push(manager === 'pnpm' ? 'add' : 'install');
      if (request.isDev) {
        args.push(manager === 'pnpm' ? '-D' : '--save-dev');
      }
      args.push(...packages);
    } else if (request.operation === 'remove') {
      args.push(manager === 'pnpm' ? 'remove' : 'uninstall');
      args.push(...packages);
    }

    // 4. Execute via ControlledCommandExecutor
    this.logger.log(`Executing ${manager} ${args.join(' ')} in ${cwd}`);
    const commandResult = await this.commandExecutor.execute({
      operation: 'PACKAGE_INSTALL',
      binary: manager,
      args,
      cwd,
      timeoutMs: 90000, // 90s for network downloads
    });

    if (!commandResult.success) {
      return {
        success: false,
        manager,
        operation: request.operation,
        packages,
        cwd,
        commandResult,
        verified: false,
        error: commandResult.error || 'Package manager command exited with error',
      };
    }

    // 5. Post-execution verification on package.json
    let verified = false;
    const packageJsonChanges: { added?: string[]; removed?: string[] } = {};

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const postPkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const allDeps = {
          ...(postPkgJson.dependencies || {}),
          ...(postPkgJson.devDependencies || {}),
        };

        if (request.operation === 'add') {
          // Check that added packages are present in dependencies or devDependencies
          const addedList: string[] = [];
          for (const rawPkg of packages) {
            // Strip version specifier if present (e.g. "lodash@^4" -> "lodash")
            const baseName = (rawPkg.startsWith('@')
              ? `@${rawPkg.slice(1).split('@')[0] || ''}`
              : (rawPkg.split('@')[0] || rawPkg)) as string;
            if (baseName && (allDeps as Record<string, string>)[baseName]) {
              addedList.push(baseName);
            }
          }
          packageJsonChanges.added = addedList;
          verified = addedList.length === packages.length;
        } else if (request.operation === 'remove') {
          const removedList: string[] = [];
          for (const rawPkg of packages) {
            const baseName = (rawPkg.startsWith('@')
              ? `@${rawPkg.slice(1).split('@')[0] || ''}`
              : (rawPkg.split('@')[0] || rawPkg)) as string;
            if (baseName && !(allDeps as Record<string, string>)[baseName]) {
              removedList.push(baseName);
            }
          }
          packageJsonChanges.removed = removedList;
          verified = removedList.length === packages.length;
        } else {
          // 'install': verified if command exitCode === 0 and package.json is valid
          verified = true;
        }
      } catch (err: any) {
        this.logger.warn(`Error verifying package.json: ${err.message}`);
        verified = false;
      }
    } else {
      verified = commandResult.success;
    }

    return {
      success: commandResult.success && verified,
      manager,
      operation: request.operation,
      packages,
      cwd,
      commandResult,
      verified,
      packageJsonChanges,
    };
  }

  /**
   * Alias for backwards compatibility
   */
  public async executeOperation(request: PackageManagerRequest): Promise<PackageManagerResult> {
    return this.execute(request);
  }
}
