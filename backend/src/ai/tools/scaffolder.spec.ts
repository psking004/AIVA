/**
 * AIVA Scaffolder Service Specification Test Suite
 * Validates autonomous scaffolding for Vite React, Next.js, FastAPI, Node.js.
 */

import { ScaffolderService } from './scaffolder.service';
import { ControlledCommandExecutor } from './command-executor.service';
import { AivaPolicyEngine } from '../policy/aiva-policy-engine';
import { ProjectAwarenessService } from '../kernel/project-awareness.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runScaffolderTestSuite() {
  console.log('\n============================================================');
  console.log('AIVA AUTONOMOUS PROJECT SCAFFOLDER TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`PASS [${total}] ${name}`);
    } catch (err: any) {
      console.error(`FAIL [${total}] ${name}: ${err.message}`);
    }
  }

  const policyEngine = new AivaPolicyEngine();
  const projectAwareness = new ProjectAwarenessService();
  const commandExecutor = new ControlledCommandExecutor(policyEngine, projectAwareness);
  const scaffolder = new ScaffolderService(commandExecutor, projectAwareness);

  const testBaseDir = path.join(os.tmpdir(), 'aiva_scaffolder_spec_tmp_' + Date.now());
  if (!fs.existsSync(testBaseDir)) {
    fs.mkdirSync(testBaseDir, { recursive: true });
  }

  try {
    // 1. Project Name Validation
    await test('Project Name: Valid alphanumeric names accepted', () => {
      assert(scaffolder.validateProjectName('nova').valid, 'nova should be valid');
      assert(scaffolder.validateProjectName('dashboard-v2').valid, 'dashboard-v2 should be valid');
      assert(scaffolder.validateProjectName('backend_api_3').valid, 'backend_api_3 should be valid');
    });

    await test('Project Name: Rejects special characters and command injections', () => {
      assert(!scaffolder.validateProjectName('nova; rm -rf /').valid, 'Command injection should be rejected');
      assert(!scaffolder.validateProjectName('project/../../evil').valid, 'Path traversal in name should be rejected');
      assert(!scaffolder.validateProjectName('app with spaces').valid, 'Spaces in name should be rejected');
      assert(!scaffolder.validateProjectName('').valid, 'Empty name should be rejected');
    });

    await test('Project Name: Rejects reserved system names', () => {
      assert(!scaffolder.validateProjectName('con').valid, 'Windows reserved "con" should be rejected');
      assert(!scaffolder.validateProjectName('aux').valid, 'Windows reserved "aux" should be rejected');
      assert(!scaffolder.validateProjectName('nul').valid, 'Windows reserved "nul" should be rejected');
      assert(!scaffolder.validateProjectName('node_modules').valid, 'node_modules should be rejected');
    });

    // 2. Framework Normalization
    await test('Framework Normalization: Recognizes supported frameworks', () => {
      assert(scaffolder.normalizeFramework('react') === 'react', 'react -> react');
      assert(scaffolder.normalizeFramework('Vite React') === 'react', 'Vite React -> react');
      assert(scaffolder.normalizeFramework('nextjs') === 'nextjs', 'nextjs -> nextjs');
      assert(scaffolder.normalizeFramework('Next.js') === 'nextjs', 'Next.js -> nextjs');
      assert(scaffolder.normalizeFramework('fastapi') === 'fastapi', 'fastapi -> fastapi');
      assert(scaffolder.normalizeFramework('python') === 'fastapi', 'python -> fastapi');
      assert(scaffolder.normalizeFramework('nodejs') === 'nodejs', 'nodejs -> nodejs');
    });

    // 3. Target Directory Resolution & Collision Prevention
    await test('Directory Resolution: Resolves safe target directory', () => {
      const res = scaffolder.resolveTargetDirectory('fresh-app', testBaseDir);
      assert(res.safe, 'Fresh project directory should be safe');
      assert(res.targetDir.includes('fresh-app'), 'Target path should include fresh-app');
    });

    await test('Collision Prevention: Rejects overwrite when directory exists', () => {
      const collDir = path.join(testBaseDir, 'existing-app');
      fs.mkdirSync(collDir, { recursive: true });
      fs.writeFileSync(path.join(collDir, 'package.json'), '{}', 'utf8');

      const res = scaffolder.resolveTargetDirectory('existing-app', testBaseDir);
      assert(!res.safe, 'Existing directory must be rejected');
      assert(Boolean(res.reason?.includes('already exists')), 'Reason should mention already exists');
    });

    // 4. Autonomous Template Generation: Vite React
    await test('Scaffold: React Vite project generates valid files on disk', async () => {
      const res = await scaffolder.scaffold({
        projectName: 'nova-react',
        framework: 'react',
        baseDir: testBaseDir,
        installDependencies: false,
        verifyBuild: false,
      });

      assert(res.success, `Scaffolding should succeed: ${res.error}`);
      assert(res.framework === 'react', 'Framework should be react');
      assert(fs.existsSync(path.join(res.projectPath, 'package.json')), 'package.json must exist');
      assert(fs.existsSync(path.join(res.projectPath, 'src', 'App.tsx')), 'src/App.tsx must exist');
      assert(fs.existsSync(path.join(res.projectPath, 'vite.config.ts')), 'vite.config.ts must exist');
      assert(res.verification.filesVerified === true, 'filesVerified must be true');

      const pkg = JSON.parse(fs.readFileSync(path.join(res.projectPath, 'package.json'), 'utf8'));
      assert(pkg.name === 'nova-react', 'package.json name must match');
      assert(pkg.dependencies.react !== undefined, 'react must be in dependencies');
    });

    // 5. Autonomous Template Generation: FastAPI
    await test('Scaffold: FastAPI project generates valid structure', async () => {
      const res = await scaffolder.scaffold({
        projectName: 'backend-api',
        framework: 'fastapi',
        baseDir: testBaseDir,
        installDependencies: false,
        verifyBuild: false,
      });

      assert(res.success, `Scaffolding should succeed: ${res.error}`);
      assert(res.framework === 'fastapi', 'Framework should be fastapi');
      assert(fs.existsSync(path.join(res.projectPath, 'app', 'main.py')), 'app/main.py must exist');
      assert(fs.existsSync(path.join(res.projectPath, 'requirements.txt')), 'requirements.txt must exist');
      assert(fs.existsSync(path.join(res.projectPath, 'tests', 'test_main.py')), 'tests/test_main.py must exist');
    });

    // 6. Autonomous Template Generation: Next.js
    await test('Scaffold: Next.js project generates pages and config', async () => {
      const res = await scaffolder.scaffold({
        projectName: 'dashboard-next',
        framework: 'nextjs',
        baseDir: testBaseDir,
        installDependencies: false,
        verifyBuild: false,
      });

      assert(res.success, `Scaffolding should succeed: ${res.error}`);
      assert(res.framework === 'nextjs', 'Framework should be nextjs');
      assert(fs.existsSync(path.join(res.projectPath, 'app', 'page.tsx')), 'app/page.tsx must exist');
      assert(fs.existsSync(path.join(res.projectPath, 'next.config.mjs')), 'next.config.mjs must exist');
    });

    // 7. Structured Failure Handling
    await test('Failure Handling: Returns structured error on invalid name', async () => {
      const res = await scaffolder.scaffold({
        projectName: 'bad name!',
        framework: 'react',
        baseDir: testBaseDir,
      });

      assert(!res.success, 'Invalid name should fail');
      assert(res.stage === 'VALIDATE_NAME', 'Stage must be VALIDATE_NAME');
      assert(res.recoverable === true, 'Should be marked recoverable');
      assert(Boolean(res.error), 'Error message must be present');
    });

  } finally {
    // Cleanup temporary test directory
    try {
      if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }

  console.log(`\n============================================================`);
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runScaffolderTestSuite().catch((err) => {
  console.error('Fatal error in scaffolder test suite:', err);
  process.exit(1);
});
