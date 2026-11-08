/**
 * AIVA Controlled Command Executor Specification Test Suite
 * Validates safe command execution boundaries, injection prevention, and security gating.
 */

import { ControlledCommandExecutor } from './command-executor.service';
import { AivaPolicyEngine } from '../policy/aiva-policy-engine';
import { ProjectAwarenessService } from '../kernel/project-awareness.service';
import * as path from 'path';
import * as os from 'os';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCommandExecutorTestSuite() {
  console.log('\n============================================================');
  console.log('AIVA CONTROLLED COMMAND EXECUTOR TEST SUITE');
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
  const executor = new ControlledCommandExecutor(policyEngine, projectAwareness);

  const workspaceRoot = projectAwareness.getWorkspaceRoot();
  const tempRoot = os.tmpdir();

  // 1. Whitelisted Binaries
  await test('Allowed Binaries: Permits whitelisted tools (node, pnpm, npm, git, python, pytest)', () => {
    assert(executor.validateCommandSafety('node', ['-v']).safe, 'node should be allowed');
    assert(executor.validateCommandSafety('pnpm', ['--version']).safe, 'pnpm should be allowed');
    assert(executor.validateCommandSafety('npm', ['--version']).safe, 'npm should be allowed');
    assert(executor.validateCommandSafety('git', ['status']).safe, 'git should be allowed');
    assert(executor.validateCommandSafety('python', ['--version']).safe, 'python should be allowed');
  });

  await test('Disallowed Binaries: Strictly blocks arbitrary shell commands', () => {
    assert(!executor.validateCommandSafety('bash' as any, ['-c', 'ls']).safe, 'bash must be blocked');
    assert(!executor.validateCommandSafety('cmd' as any, ['/c', 'dir']).safe, 'cmd must be blocked');
    assert(!executor.validateCommandSafety('powershell' as any, ['-Command', 'ls']).safe, 'powershell must be blocked');
    assert(!executor.validateCommandSafety('curl' as any, ['http://evil.com']).safe, 'curl must be blocked');
    assert(!executor.validateCommandSafety('rm' as any, ['-rf', '/']).safe, 'rm must be blocked');
  });

  // 2. Dangerous Arguments & Patterns
  await test('Dangerous Patterns: Rejects rm -rf, format, and destructive commands', () => {
    assert(!executor.validateCommandSafety('node', ['-e', 'rm -rf /']).safe, 'rm -rf must be blocked');
    assert(!executor.validateCommandSafety('node', ['format c:']).safe, 'format must be blocked');
    assert(!executor.validateCommandSafety('node', ['fdisk']).safe, 'fdisk must be blocked');
    assert(!executor.validateCommandSafety('node', ['mkfs']).safe, 'mkfs must be blocked');
  });

  await test('Dangerous Git Operations: Rejects git push --force and force resets', () => {
    assert(!executor.validateCommandSafety('git', ['push', '--force']).safe, 'git push --force must be blocked');
    assert(!executor.validateCommandSafety('git', ['push', '-f', 'origin', 'main']).safe, 'git push -f must be blocked');
    assert(!executor.validateCommandSafety('git', ['clean', '-fdx']).safe, 'git clean -fdx must be blocked');
  });

  await test('Credential & Secret Access: Rejects access to sensitive credential stores', () => {
    assert(!executor.validateCommandSafety('node', ['read', '.env']).safe, '.env access must be blocked');
    assert(!executor.validateCommandSafety('node', ['cat', 'id_rsa']).safe, 'id_rsa access must be blocked');
    assert(!executor.validateCommandSafety('node', ['dump', 'credentials']).safe, 'credentials access must be blocked');
    assert(!executor.validateCommandSafety('node', ['dump', 'shadow']).safe, 'shadow access must be blocked');
  });

  await test('Shell Injection: Rejects command chaining and pipe characters', () => {
    assert(!executor.validateCommandSafety('node', ['index.js; evil']).safe, 'Semicolon chaining must be blocked');
    assert(!executor.validateCommandSafety('node', ['index.js', '&&', 'evil']).safe, 'Ampersand chaining must be blocked');
    assert(!executor.validateCommandSafety('node', ['index.js', '|', 'cat']).safe, 'Pipe chaining must be blocked');
  });

  // 3. Directory Boundary Enforcement
  await test('Directory Boundary: Approves paths inside workspace root or OS temp', () => {
    assert(executor.isApprovedDirectory(workspaceRoot).approved, 'Workspace root must be approved');
    assert(executor.isApprovedDirectory(path.join(workspaceRoot, 'backend')).approved, 'Subdir of workspace must be approved');
    assert(executor.isApprovedDirectory(tempRoot).approved, 'Temp directory must be approved');
  });

  await test('Directory Boundary: Rejects paths outside approved workspaces (C:\\Windows, system dirs)', () => {
    assert(!executor.isApprovedDirectory('C:\\Windows').approved, 'C:\\Windows must be rejected');
    assert(!executor.isApprovedDirectory('C:\\Program Files').approved, 'C:\\Program Files must be rejected');
    assert(!executor.isApprovedDirectory(path.resolve(workspaceRoot, '..', '..', 'SecretFolder')).approved, 'Path traversal outside workspace must be rejected');
  });

  // 4. Controlled Execution Validation
  await test('Controlled Execution: Runs allowed command inside workspace and captures output', async () => {
    const result = await executor.execute({
      operation: 'PROJECT_TEST',
      binary: 'node',
      args: ['-e', 'console.log("AIVA_SAFE_EXEC_OK")'],
      cwd: workspaceRoot,
      timeoutMs: 10000,
    });

    assert(result.success, `Execution should succeed: ${result.error}`);
    assert(result.exitCode === 0, `Exit code should be 0, got ${result.exitCode}`);
    assert(result.stdout.includes('AIVA_SAFE_EXEC_OK'), 'Stdout should contain output');
    assert(result.verification.status === 'SUCCEEDED', 'Verification should be SUCCEEDED');
  });

  await test('Controlled Execution: Rejects execution with blocked patterns before child process is spawned', async () => {
    const result = await executor.execute({
      operation: 'PROJECT_TEST',
      binary: 'node',
      args: ['-e', 'rm -rf /'],
      cwd: workspaceRoot,
    });

    assert(!result.success, 'Execution should be rejected');
    assert(result.exitCode === 1, 'Exit code should be non-zero');
    assert(result.error?.includes('forbidden or dangerous pattern') === true, 'Error should describe rejection reason');
    assert(result.verification.status === 'FAILED', 'Verification should be FAILED');
  });

  console.log(`\n============================================================`);
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('============================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runCommandExecutorTestSuite().catch((err) => {
  console.error('Fatal error in command executor test suite:', err);
  process.exit(1);
});
