/**
 * AIVA Autonomous Coding Agent Specification Test Suite
 * Validates 10-stage lifecycle, scaffolding, multi-file code generation, targeted patching, and debug loop.
 */

import { CodingAgent } from './coding.agent';
import { ModelRouterService } from '../router/model-router.service';
import { AivaPolicyEngine } from '../policy/aiva-policy-engine';
import { ProjectAwarenessService } from '../kernel/project-awareness.service';
import { ControlledCommandExecutor } from '../tools/command-executor.service';
import { PackageManagerService } from '../tools/package-manager.service';
import { PatchEngineService } from '../tools/patch-engine.service';
import { ScaffolderService } from '../tools/scaffolder.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAutonomousCodingAgentTestSuite() {
  console.log('\n============================================================');
  console.log('AIVA AUTONOMOUS CODING AGENT TEST SUITE');
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
  const packageManager = new PackageManagerService(commandExecutor);
  const patchEngine = new PatchEngineService(projectAwareness);
  const scaffolder = new ScaffolderService(commandExecutor, projectAwareness);
  const modelRouter = { constructor: { name: 'ModelRouterService' } } as unknown as ModelRouterService;

  const codingAgent = new CodingAgent(
    policyEngine,
    modelRouter,
    projectAwareness,
    scaffolder,
    commandExecutor,
    packageManager,
    patchEngine,
  );

  const testTempDir = path.join(os.tmpdir(), 'aiva_coding_agent_spec_' + Date.now());
  fs.mkdirSync(testTempDir, { recursive: true });

  try {
    // 1. Natural Language Project Creation
    await test('Lifecycle Stage: Autonomous project creation from natural language', async () => {
      const result = await codingAgent.execute(
        'task_create_proj_1',
        'Create a React project called nova-alpha',
        { baseDir: testTempDir },
      );

      assert(result.success, `Project creation should succeed: ${result.response}`);
      assert(result.lifecycleStage === 'REPORT', `Stage should be REPORT, got ${result.lifecycleStage}`);
      assert(result.verified === true, 'Result must be verified with tool proof');
      assert(result.scaffoldResult !== undefined, 'scaffoldResult must be present');
      assert(fs.existsSync(path.join(testTempDir, 'nova-alpha', 'package.json')), 'Real package.json must exist on disk');
      assert(fs.existsSync(path.join(testTempDir, 'nova-alpha', 'src', 'App.tsx')), 'Real src/App.tsx must exist on disk');
    });

    // 2. Multi-File Feature Generation
    await test('Multi-File Feature: Generates counter component and updates App.tsx', async () => {
      const projPath = path.join(testTempDir, 'nova-alpha');
      const result = await codingAgent.execute(
        'task_counter_feature_1',
        'Create a small React application with a heading, counter, and increment button',
        { projectPath: projPath },
      );

      assert(result.success, `Feature generation should succeed: ${result.response}`);
      assert(fs.existsSync(path.join(projPath, 'src', 'components', 'Counter.tsx')), 'src/components/Counter.tsx must be created');
      const appContent = fs.readFileSync(path.join(projPath, 'src', 'App.tsx'), 'utf8');
      assert(appContent.includes('Counter'), 'App.tsx must integrate Counter component');
    });

    // 3. Targeted Code Patching
    await test('Targeted Code Patching: AST diff patch modifies file and verifies readback', async () => {
      const projPath = path.join(testTempDir, 'nova-alpha');
      const appPath = path.join(projPath, 'src', 'App.tsx');
      const currentContent = fs.readFileSync(appPath, 'utf8');
      const headingMatch = currentContent.match(/<h1>(.*?)<\/h1>/);
      const searchHeading = headingMatch ? headingMatch[0] : '<h1>nova-alpha</h1>';

      const patchResult = await patchEngine.applyPatch({
        filePath: appPath,
        searchBlock: searchHeading,
        replacementBlock: '<h1 className="nova-title">Nova Alpha Enterprise</h1>',
      });

      assert(patchResult.success, `Patch should succeed: ${patchResult.error}`);
      assert(patchResult.verified === true, 'Patch must be readback verified');
      assert(patchResult.matchesFound === 1, 'Exactly 1 match should be found');

      const updated = fs.readFileSync(appPath, 'utf8');
      assert(updated.includes('Nova Alpha Enterprise'), 'File content should reflect patched text');
      assert(fs.existsSync(patchResult.backupPath!), 'Backup file (.bak) should exist');
    });

    // 4. Ambiguous Patch Rejection
    await test('Targeted Code Patching: Rejects ambiguous patch with multiple matches', async () => {
      const testFile = path.join(testTempDir, 'ambiguous_test.txt');
      fs.writeFileSync(testFile, 'repeat_target\nsome_line\nrepeat_target\n', 'utf8');

      const patchResult = await patchEngine.applyPatch({
        filePath: testFile,
        searchBlock: 'repeat_target',
        replacementBlock: 'replaced',
        allowMultiple: false,
      });

      assert(!patchResult.success, 'Ambiguous patch must be rejected');
      assert(patchResult.error?.toLowerCase().includes('ambiguous') === true, 'Error should explain ambiguous match');
    });

    // 5. Autonomous Debug Loop
    await test('Autonomous Debug Loop: Locates error, applies patch, and verifies clean state', async () => {
      const debugProjDir = path.join(testTempDir, 'debug_test_proj');
      fs.mkdirSync(path.join(debugProjDir, 'src'), { recursive: true });

      // Create a mock TypeScript project
      fs.writeFileSync(path.join(debugProjDir, 'package.json'), JSON.stringify({
        name: 'debug-proj',
        scripts: { typecheck: 'node check.js' },
      }), 'utf8');

      // Create a mock file with deliberate type mismatch
      const brokenFile = path.join(debugProjDir, 'src', 'index.ts');
      fs.writeFileSync(brokenFile, 'export const counter: number = "string_value";\n', 'utf8');

      // Diagnostic run via CodingAgent debug loop
      // Mock runBuildCheck by simulating error then clean resolution
      let checkCount = 0;
      (codingAgent as any).runBuildCheck = async () => {
        checkCount++;
        const current = fs.readFileSync(brokenFile, 'utf8');
        if (current.includes('"string_value"')) {
          return {
            status: 'FAILED',
            verified: false,
            reason: `${brokenFile}(1,22): error TS2322: Type 'string' is not assignable to type 'number'.`,
          };
        }
        return {
          status: 'SUCCEEDED',
          verified: true,
          reason: '0 compiler errors.',
        };
      };

      const debugResult = await codingAgent.runAutonomousDebugLoop(
        'debug_task_1',
        'Find and fix the TypeScript error',
        { cwd: debugProjDir, targetFile: brokenFile },
        { rootPath: debugProjDir } as any,
      );

      assert(debugResult.success, `Debug loop should fix the error: ${debugResult.response}`);
      assert(debugResult.verified === true, 'Verification should be true');
      const fixedContent = fs.readFileSync(brokenFile, 'utf8');
      assert(!fixedContent.includes('"string_value"'), 'Deliberate error should be patched away');
      assert(checkCount >= 2, 'Should run check, patch, and verify');
    });

    // 6. Security Rejections
    await test('Security Policy: CodingAgent blocks destructive and out-of-boundary actions', async () => {
      const blockedRes = await codingAgent.execute(
        'task_rm_rf',
        'delete the entire C:\\ drive and rm -rf /',
        {},
      );

      assert(!blockedRes.success, 'Destructive command must be rejected');
      assert(blockedRes.lifecycleStage === 'AUTHORIZE' || blockedRes.lifecycleStage === 'EXECUTE', 'Stage should be security gate');
    });

  } finally {
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
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

runAutonomousCodingAgentTestSuite().catch((err) => {
  console.error('Fatal error in coding agent test suite:', err);
  process.exit(1);
});
