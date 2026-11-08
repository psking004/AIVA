/**
 * AIVA Project Awareness Service
 *
 * Provides deep structural understanding of active workspaces and projects:
 * - Project metadata (name, root path, language, framework, package manager)
 * - Git repository status (active branch, dirty files, remotes)
 * - Build, test, and dev commands
 * - Workspace directory trees and source searching
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectMetadata {
  name: string;
  rootPath: string;
  language: string;
  framework: string;
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  buildCommand: string;
  testCommand: string;
  devCommand: string;
  typecheckCommand: string;
  gitRepo: boolean;
  activeBranch?: string | undefined;
  statusSummary?: string | undefined;
  packages?: string[] | undefined;
}

@Injectable()
export class ProjectAwarenessService {
  private readonly logger = new Logger(ProjectAwarenessService.name);
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = path.resolve(process.cwd());
    // If backend is started from /backend, navigate up to monorepo root if package.json exists there
    if (!fs.existsSync(path.join(this.workspaceRoot, 'pnpm-workspace.yaml')) &&
        fs.existsSync(path.resolve(this.workspaceRoot, '..', 'pnpm-workspace.yaml'))) {
      this.workspaceRoot = path.resolve(this.workspaceRoot, '..');
    }
    this.logger.log(`ProjectAwarenessService initialized with root: ${this.workspaceRoot}`);
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public setWorkspaceRoot(targetPath: string): void {
    if (fs.existsSync(targetPath)) {
      this.workspaceRoot = path.resolve(targetPath);
    }
  }

  /**
   * Introspect current active project and return structured metadata
   */
  public async inspectActiveProject(subPath?: string): Promise<ProjectMetadata> {
    const root = subPath ? path.resolve(this.workspaceRoot, subPath) : this.workspaceRoot;
    let name = path.basename(root);
    let language = 'TypeScript';
    let framework = 'Node.js Monorepo';
    let packageManager: ProjectMetadata['packageManager'] = 'unknown';

    // Package manager detection
    if (fs.existsSync(path.join(root, 'pnpm-lock.yaml')) || fs.existsSync(path.join(this.workspaceRoot, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (fs.existsSync(path.join(root, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (fs.existsSync(path.join(root, 'bun.lockb'))) {
      packageManager = 'bun';
    } else if (fs.existsSync(path.join(root, 'package-lock.json'))) {
      packageManager = 'npm';
    }

    // Read package.json if present
    const pkgJsonPath = path.join(root, 'package.json');
    const packages: string[] = [];
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        if (pkg.name) name = pkg.name;
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        if (deps['@nestjs/core']) {
          framework = 'NestJS';
        } else if (deps['electron']) {
          framework = 'Electron Desktop (React)';
        } else if (deps['next']) {
          framework = 'Next.js';
        } else if (deps['expo'] || deps['react-native']) {
          framework = 'Expo / React Native';
        } else if (fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) {
          framework = 'Turborepo / Monorepo (Next.js, Electron, NestJS, Expo)';
        }
      } catch (err: any) {
        this.logger.warn(`Could not parse package.json: ${err.message}`);
      }
    }

    // Inspect packages directory if monorepo
    const appsDir = path.join(root, 'apps');
    if (fs.existsSync(appsDir)) {
      try {
        const apps = fs.readdirSync(appsDir);
        for (const app of apps) {
          if (fs.statSync(path.join(appsDir, app)).isDirectory()) {
            packages.push(`apps/${app}`);
          }
        }
      } catch {}
    }
    const backendDir = path.join(root, 'backend');
    if (fs.existsSync(backendDir)) {
      packages.push('backend');
    }

    // Git inspection
    let gitRepo = false;
    let activeBranch: string | undefined;
    let statusSummary: string | undefined;
    try {
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: root });
      activeBranch = branchOut.trim();
      gitRepo = true;

      const { stdout: statusOut } = await execAsync('git status --short', { cwd: root });
      const changedFiles = statusOut.trim().split('\n').filter(Boolean).length;
      statusSummary = changedFiles === 0 ? 'Clean working tree' : `${changedFiles} modified file(s)`;
    } catch {
      gitRepo = false;
    }

    return {
      name,
      rootPath: root,
      language,
      framework,
      packageManager,
      buildCommand: packageManager === 'pnpm' ? 'pnpm build' : 'npm run build',
      testCommand: packageManager === 'pnpm' ? 'pnpm test' : 'npm test',
      devCommand: packageManager === 'pnpm' ? 'pnpm dev' : 'npm run dev',
      typecheckCommand: packageManager === 'pnpm' ? 'pnpm --filter @aiva/backend typecheck' : 'npm run typecheck',
      gitRepo,
      activeBranch,
      statusSummary,
      packages: packages.length > 0 ? packages : undefined,
    };
  }

  /**
   * Search files or list directory entries safely within workspace bounds
   */
  public listWorkspaceFiles(subDir: string = '', maxEntries: number = 50): string[] {
    const targetDir = path.resolve(this.workspaceRoot, subDir);
    if (!targetDir.startsWith(this.workspaceRoot) || !fs.existsSync(targetDir)) {
      return [];
    }

    const results: string[] = [];
    const walk = (dir: string) => {
      if (results.length >= maxEntries) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxEntries) break;
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.turbo') {
          continue;
        }
        const rel = path.relative(this.workspaceRoot, path.join(dir, entry.name));
        results.push(rel.replace(/\\/g, '/'));
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name));
        }
      }
    };

    walk(targetDir);
    return results;
  }
}
