/**
 * AIVA Project Scaffolder Service
 *
 * Implements safe, autonomous project template generation and verification:
 * - Frameworks supported: Vite React, Next.js, FastAPI, Node.js
 * - Project name validation and directory traversal prevention
 * - Overwrite collision detection
 * - Atomic file creation across directory hierarchies
 * - Dependency installation via ControlledCommandExecutor / PackageManagerService
 * - Compiler / build verification post-scaffolding
 */

import { Injectable, Logger } from '@nestjs/common';
import { ControlledCommandExecutor } from './command-executor.service';
import { ProjectAwarenessService } from '../kernel/project-awareness.service';
import * as fs from 'fs';
import * as path from 'path';

export type SupportedFramework = 'react' | 'vite-react' | 'nextjs' | 'next' | 'fastapi' | 'python' | 'nodejs' | 'node';

export interface ScaffoldProjectOptions {
  projectName: string;
  framework: SupportedFramework;
  heading?: string | undefined;
  baseDir?: string | undefined;
  targetDir?: string | undefined;
  installDependencies?: boolean | undefined;
  verifyBuild?: boolean | undefined;
  runBuild?: boolean | undefined;
  packageManager?: 'pnpm' | 'npm' | undefined;
}

export interface ScaffoldResult {
  success: boolean;
  projectName: string;
  projectPath: string;
  framework: string;
  filesCreated: string[];
  dependenciesInstalled: boolean;
  stage?: string | undefined;
  error?: string | undefined;
  recoverable?: boolean | undefined;
  verification: {
    filesVerified: boolean;
    buildPassed?: boolean | undefined;
    testsPassed?: boolean | undefined;
    details?: string | undefined;
  };
}

@Injectable()
export class ScaffolderService {
  private readonly logger = new Logger(ScaffolderService.name);

  // Reserved names across Windows and POSIX
  private readonly RESERVED_NAMES = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
    'node_modules', 'dist', 'build', 'public', '.git',
  ]);

  constructor(
    private readonly commandExecutor: ControlledCommandExecutor,
    private readonly projectAwareness: ProjectAwarenessService,
  ) {
    this.logger.log('ScaffolderService initialized with multi-framework templates');
  }

  /**
   * Validate project name for safety and compatibility
   */
  public validateProjectName(name: string): { valid: boolean; reason?: string } {
    if (!name || typeof name !== 'string') {
      return { valid: false, reason: 'Project name must be a non-empty string.' };
    }

    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      return { valid: false, reason: 'Project name must be between 1 and 50 characters long.' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return { valid: false, reason: `Project name "${name}" rejected: only alphanumeric characters, dashes (-), and underscores (_) are allowed.` };
    }

    if (this.RESERVED_NAMES.has(trimmed.toLowerCase())) {
      return { valid: false, reason: `Project name "${name}" is a reserved system identifier.` };
    }

    return { valid: true };
  }

  /**
   * Resolve safe target directory within approved workspace or custom base directory
   */
  public resolveTargetDirectory(
    projectName: string,
    customBaseDir?: string,
  ): { targetDir: string; safe: boolean; reason?: string | undefined } {
    const workspaceRoot = path.resolve(this.projectAwareness.getWorkspaceRoot());
    const baseDir = customBaseDir ? path.resolve(customBaseDir) : path.join(workspaceRoot, 'projects');

    // Security check on baseDir
    const dirCheck = this.commandExecutor.isApprovedDirectory(baseDir);
    if (!dirCheck.approved) {
      return { targetDir: '', safe: false, reason: dirCheck.reason || 'Directory not approved' };
    }

    const targetDir = path.join(baseDir, projectName);

    // Collision check: prevent unexpected overwrite
    if (fs.existsSync(targetDir)) {
      return {
        targetDir,
        safe: false,
        reason: `Target directory already exists: "${targetDir}". Aborting to prevent accidental overwrite.`,
      };
    }

    return { targetDir, safe: true };
  }

  /**
   * Normalize framework identifier
   */
  public normalizeFramework(framework: string): 'react' | 'nextjs' | 'fastapi' | 'nodejs' {
    const lower = (framework || '').toLowerCase().trim();
    if (/react|vite/i.test(lower)) return 'react';
    if (/next/i.test(lower)) return 'nextjs';
    if (/fastapi|python/i.test(lower)) return 'fastapi';
    return 'nodejs';
  }

  /**
   * Scaffold an autonomous project
   */
  public async scaffold(options: ScaffoldProjectOptions): Promise<ScaffoldResult> {
    const {
      projectName,
      framework: rawFramework,
      baseDir,
      targetDir,
      installDependencies = false,
      verifyBuild = false,
      runBuild = false,
      packageManager = 'pnpm',
    } = options;
    const effectiveBaseDir = targetDir || baseDir;
    const shouldVerifyBuild = verifyBuild || runBuild;
    const normFramework = this.normalizeFramework(rawFramework);

    // 1. Validate project name
    const nameCheck = this.validateProjectName(projectName);
    if (!nameCheck.valid) {
      return {
        success: false,
        projectName,
        projectPath: '',
        framework: normFramework,
        filesCreated: [],
        dependenciesInstalled: false,
        stage: 'VALIDATE_NAME',
        error: nameCheck.reason || 'Invalid project name',
        recoverable: true,
        verification: { filesVerified: false },
      };
    }

    // 2. Resolve safe target directory
    const dirRes = this.resolveTargetDirectory(projectName, effectiveBaseDir);
    if (!dirRes.safe) {
      return {
        success: false,
        projectName,
        projectPath: dirRes.targetDir,
        framework: normFramework,
        filesCreated: [],
        dependenciesInstalled: false,
        stage: 'RESOLVE_DIRECTORY',
        error: dirRes.reason || 'Unsafe target directory',
        recoverable: true,
        verification: { filesVerified: false },
      };
    }

    const projectPath = dirRes.targetDir;
    this.logger.log(`[SCAFFOLD] Creating ${normFramework} project "${projectName}" at: ${projectPath}`);

    // 3. Generate file map based on framework
    const files = this.getTemplateFiles(projectName, normFramework, { heading: options.heading });
    const filesCreated: string[] = [];

    try {
      // Ensure project root exists
      fs.mkdirSync(projectPath, { recursive: true });

      for (const [relPath, content] of Object.entries(files)) {
        const fullFilePath = path.join(projectPath, relPath);
        const fileDir = path.dirname(fullFilePath);

        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        fs.writeFileSync(fullFilePath, content.trim() + '\n', 'utf8');
        filesCreated.push(relPath);
      }
    } catch (createErr: any) {
      this.logger.error(`Error writing project files for ${projectName}: ${createErr.message}`);
      return {
        success: false,
        projectName,
        projectPath,
        framework: normFramework,
        filesCreated,
        dependenciesInstalled: false,
        stage: 'FILE_CREATION',
        error: createErr.message,
        recoverable: false,
        verification: { filesVerified: false },
      };
    }

    // 4. Verify all files created on disk
    let allFilesExist = true;
    for (const relPath of filesCreated) {
      if (!fs.existsSync(path.join(projectPath, relPath))) {
        allFilesExist = false;
        break;
      }
    }

    if (!allFilesExist) {
      return {
        success: false,
        projectName,
        projectPath,
        framework: normFramework,
        filesCreated,
        dependenciesInstalled: false,
        stage: 'FILE_VERIFICATION',
        error: 'Integrity check failed: Not all generated files exist on disk.',
        recoverable: false,
        verification: { filesVerified: false },
      };
    }

    let depsInstalled = false;
    let buildPassed = undefined;

    // 5. Install dependencies if requested
    if (installDependencies && (normFramework === 'react' || normFramework === 'nextjs' || normFramework === 'nodejs')) {
      this.logger.log(`Installing dependencies for ${projectName} via ${packageManager}...`);
      const installArgs = packageManager === 'pnpm' ? ['install', '--ignore-workspace'] : ['install'];
      const installRes = await this.commandExecutor.execute({
        operation: 'PACKAGE_INSTALL',
        binary: packageManager,
        args: installArgs,
        cwd: projectPath,
        timeoutMs: 120000,
      });

      depsInstalled = installRes.success;

      if (!depsInstalled) {
        return {
          success: false,
          projectName,
          projectPath,
          framework: normFramework,
          filesCreated,
          dependenciesInstalled: false,
          stage: 'DEPENDENCY_INSTALLATION',
          error: installRes.error || installRes.stderr || 'Dependency installation failed.',
          recoverable: true,
          verification: { filesVerified: true, buildPassed: false },
        };
      }
    }

    // 6. Build verification if requested and dependencies installed
    if (shouldVerifyBuild && depsInstalled) {
      this.logger.log(`Running build verification for ${projectName}...`);
      const buildRes = await this.commandExecutor.execute({
        operation: 'PROJECT_BUILD',
        binary: packageManager,
        args: ['run', 'build'],
        cwd: projectPath,
        timeoutMs: 60000,
      });
      buildPassed = buildRes.success;
    }

    this.logger.log(`Project "${projectName}" scaffolded successfully (${filesCreated.length} files created)`);

    return {
      success: true,
      projectName,
      projectPath,
      framework: normFramework,
      filesCreated,
      dependenciesInstalled: depsInstalled,
      verification: {
        filesVerified: true,
        buildPassed: buildPassed ?? undefined,
        details: `Successfully generated ${normFramework} project with ${filesCreated.length} verified files.`,
      },
    };
  }

  /**
   * Alias for compatibility
   */
  public async scaffoldProject(options: ScaffoldProjectOptions): Promise<ScaffoldResult> {
    return this.scaffold(options);
  }

  /**
   * Template file definitions for supported frameworks
   */
  private getTemplateFiles(
    projectName: string,
    framework: 'react' | 'nextjs' | 'fastapi' | 'nodejs',
    options?: { heading?: string | undefined },
  ): Record<string, string> {
    const heading = options?.heading || 'Hello from AIVA';
    switch (framework) {
      case 'react':
        return {
          'package.json': JSON.stringify({
            name: projectName,
            private: true,
            version: '0.1.0',
            type: 'module',
            scripts: {
              dev: 'vite',
              build: 'tsc && vite build',
              preview: 'vite preview',
            },
            dependencies: {
              react: '^18.3.1',
              'react-dom': '^18.3.1',
            },
            devDependencies: {
              '@types/react': '^18.3.12',
              '@types/react-dom': '^18.3.1',
              '@vitejs/plugin-react': '^4.3.4',
              typescript: '^5.6.3',
              vite: '^6.0.1',
            },
          }, null, 2),
          'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              useDefineForClassFields: true,
              lib: ['ES2020', 'DOM', 'DOM.Iterable'],
              module: 'ESNext',
              skipLibCheck: true,
              moduleResolution: 'bundler',
              allowImportingTsExtensions: false,
              resolveJsonModule: true,
              isolatedModules: true,
              noEmit: true,
              jsx: 'react-jsx',
              strict: true,
              noUnusedLocals: false,
              noUnusedParameters: false,
              noFallthroughCasesInSwitch: true,
            },
            include: ['src'],
          }, null, 2),
          'index.html': `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
          'src/main.tsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n);\n`,
          'src/components/Counter.tsx': `import { useState } from 'react';\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div className="card counter-component" style={{ margin: '1.5rem 0' }}>\n      <button\n        data-testid="counter-button"\n        onClick={() => setCount((c) => c + 1)}\n        style={{ padding: '0.6rem 1.2rem', fontSize: '1rem', cursor: 'pointer' }}\n      >\n        Count is: {count}\n      </button>\n    </div>\n  );\n}\n`,
          'src/App.tsx': `import { Counter } from './components/Counter';\n\nexport default function App() {\n  return (\n    <main className="app-container" style={{ padding: '2rem', textAlign: 'center' }}>\n      <h1>${heading}</h1>\n      <p>Created autonomously by AIVA Personal AI Operating System.</p>\n      <Counter />\n    </main>\n  );\n}\n`,
          'src/index.css': `:root {\n  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;\n  line-height: 1.5;\n  color-scheme: light dark;\n}\n\nbody {\n  margin: 0;\n  display: flex;\n  place-items: center;\n  min-width: 320px;\n  min-height: 100vh;\n  justify-content: center;\n}\n\n.app-container {\n  text-align: center;\n}\n`,
          'README.md': `# ${projectName}\n\nA React application scaffolded by AIVA.\n\n## Getting Started\n\n\`\`\`bash\npnpm install\npnpm dev\n\`\`\`\n`,
        };

      case 'nextjs':
        return {
          'package.json': JSON.stringify({
            name: projectName,
            version: '0.1.0',
            private: true,
            scripts: {
              dev: 'next dev',
              build: 'next build',
              start: 'next start',
            },
            dependencies: {
              next: '^14.2.18',
              react: '^18.3.1',
              'react-dom': '^18.3.1',
            },
            devDependencies: {
              '@types/node': '^20.17.6',
              '@types/react': '^18.3.12',
              '@types/react-dom': '^18.3.1',
              typescript: '^5.6.3',
            },
          }, null, 2),
          'next.config.mjs': `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'es5',
              lib: ['dom', 'dom.iterable', 'esnext'],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: 'esnext',
              moduleResolution: 'bundler',
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: 'preserve',
              incremental: true,
            },
            include: ['app/**/*', '.next/types/**/*.ts'],
            exclude: ['node_modules'],
          }, null, 2),
          'app/layout.tsx': `import React from 'react';\nimport './globals.css';\n\nexport const metadata = {\n  title: '${projectName}',\n  description: 'Generated by AIVA',\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
          'app/page.tsx': `import React from 'react';\n\nexport default function Page() {\n  return (\n    <main style={{ padding: '2rem', textAlign: 'center' }}>\n      <h1>${projectName}</h1>\n      <p>Next.js App Router application scaffolded by AIVA.</p>\n    </main>\n  );\n}\n`,
          'app/globals.css': `body { margin: 0; font-family: system-ui, sans-serif; }\n`,
          'README.md': `# ${projectName}\n\nNext.js project scaffolded by AIVA.\n`,
        };

      case 'fastapi':
        return {
          'requirements.txt': `fastapi>=0.115.0\nuvicorn[standard]>=0.32.0\npydantic>=2.9.2\npytest>=8.3.3\nhttpx>=0.27.2\n`,
          'app/__init__.py': `"""${projectName} Package"""\n`,
          'app/main.py': `from fastapi import FastAPI\n\napp = FastAPI(title="${projectName}")\n\n@app.get("/")\ndef read_root():\n    return {"message": "Welcome to ${projectName}", "status": "online"}\n\n@app.get("/health")\ndef health_check():\n    return {"status": "healthy"}\n`,
          'tests/__init__.py': ``,
          'tests/test_main.py': `from fastapi.testclient import TestClient\nfrom app.main import app\n\nclient = TestClient(app)\n\ndef test_read_root():\n    response = client.get("/")\n    assert response.status_code == 200\n    assert response.json()["status"] == "online"\n`,
          'README.md': `# ${projectName}\n\nFastAPI project scaffolded by AIVA.\n\n## Run\n\`\`\`bash\nuvicorn app.main:app --reload\n\`\`\`\n`,
        };

      case 'nodejs':
      default:
        return {
          'package.json': JSON.stringify({
            name: projectName,
            version: '0.1.0',
            private: true,
            main: 'dist/index.js',
            scripts: {
              build: 'tsc',
              start: 'node dist/index.js',
              test: 'node --test',
            },
            devDependencies: {
              '@types/node': '^20.17.6',
              typescript: '^5.6.3',
            },
          }, null, 2),
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'CommonJS',
              outDir: './dist',
              rootDir: './src',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
            },
            include: ['src/**/*'],
          }, null, 2),
          'src/index.ts': `console.log("Hello from ${projectName}!");\nexport const add = (a: number, b: number) => a + b;\n`,
          'tests/index.test.ts': `import assert from 'node:assert';\nimport test from 'node:test';\nimport { add } from '../src/index';\n\ntest('adds numbers correctly', () => {\n  assert.strictEqual(add(2, 3), 5);\n});\n`,
          'README.md': `# ${projectName}\n\nNode.js TypeScript application scaffolded by AIVA.\n`,
        };
    }
  }
}
