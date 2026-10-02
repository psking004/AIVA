/**
 * Project Tracker Test Suite
 */

import { ProjectsService } from './projects.service';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ PASS: ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.error(`  ✗ FAIL: ${name} -> ${error.message}`);
  }
}

async function main() {
  console.log('\n==================================================');
  console.log('AIVA PROJECT TRACKER TESTS');
  console.log('==================================================\n');

  const mockDb: any[] = [];
  const mockTaskDb: any[] = [];

  const mockPrisma = {
    project: {
      create: async ({ data }: any) => {
        const item = { id: `proj_${Date.now()}`, ...data, tasks: [] };
        mockDb.push(item);
        return item;
      },
      findMany: async ({ where }: any) => {
        return mockDb.filter((p) => p.userId === where.userId);
      },
      findFirst: async ({ where }: any) => {
        return mockDb.find((p) => p.id === where.id && p.userId === where.userId) || null;
      },
      update: async ({ where, data }: any) => {
        const idx = mockDb.findIndex((p) => p.id === where.id && p.userId === where.userId);
        if (idx !== -1) {
          mockDb[idx] = { ...mockDb[idx], ...data };
          return mockDb[idx];
        }
        throw new Error('Not found');
      },
      delete: async ({ where }: any) => {
        const idx = mockDb.findIndex((p) => p.id === where.id && p.userId === where.userId);
        if (idx !== -1) {
          return mockDb.splice(idx, 1)[0];
        }
        throw new Error('Not found');
      },
    },
    task: {
      update: async ({ where, data }: any) => {
        const task = { id: where.id, userId: where.userId, projectId: data.projectId };
        mockTaskDb.push(task);
        return task;
      },
    },
  } as any;

  const service = new ProjectsService(mockPrisma);

  await runTest('1. Create Project protocol with default status and tags', async () => {
    const proj = await service.create('user_1', {
      title: 'Neural Engine V2',
      description: 'Upgrade model router and local offline inference',
      priority: 'HIGH',
      tags: ['ai', 'core'],
    });

    assert(proj.title === 'Neural Engine V2', 'Title must match');
    assert(proj.status === 'ACTIVE', 'Default status should be ACTIVE');
    assert(proj.priority === 'HIGH', 'Priority should be HIGH');
  });

  await runTest('2. List projects scoped to authenticated user', async () => {
    const list = await service.findAll('user_1');
    assert(list.length === 1, 'Should return 1 project for user_1');
    const emptyList = await service.findAll('user_2');
    assert(emptyList.length === 0, 'Should return 0 projects for user_2');
  });

  await runTest('3. Update project progress and status', async () => {
    const list = await service.findAll('user_1');
    const projId = list[0]!.id;

    const updated = await service.update('user_1', projId, {
      progress: 75,
      status: 'ACTIVE',
    });

    assert(updated.progress === 75, 'Progress should be updated to 75%');
  });

  await runTest('4. Link task to project protocol', async () => {
    const list = await service.findAll('user_1');
    const projId = list[0]!.id;

    const linked = await service.linkTask('user_1', projId, 'task_99');
    assert(linked.projectId === projId, 'Task must be linked to project');
  });

  console.log('\n==================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('==================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
