/**
 * Redis Service Test Suite
 *
 * Validates:
 * 1. Upstash / Cloud Redis configuration (REDIS_URL with rediss:// TLS)
 * 2. Local / Docker Redis configuration (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD)
 * 3. Graceful degradation when Redis server is unreachable (no crashing)
 * 4. Cache operations (get, set, del, exists)
 */

import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

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

function createMockConfig(env: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) => env[key] ?? defaultValue,
  } as unknown as ConfigService;
}

async function main() {
  console.log('\n========================================');
  console.log('AIVA REDIS SERVICE TEST SUITE');
  console.log('========================================\n');

  // Test 1: Configuration parsing with REDIS_URL (Upstash rediss:// TLS)
  await runTest('1. RedisService initializes in Cloud/Upstash mode with rediss://', async () => {
    const config = createMockConfig({
      REDIS_URL: 'rediss://default:mock-token@mock-endpoint.upstash.io:6379',
    });
    const service = new RedisService(config);
    const client = service.getClient();
    assert(client !== null && client !== undefined, 'Redis client should be created');
    assert((client.options as any).tls !== undefined, 'TLS should be enabled for rediss:// URL');
    // Disconnect mock client to avoid hanging handles
    client.disconnect();
  });

  // Test 2: Configuration parsing with REDIS_HOST / REDIS_PORT
  await runTest('2. RedisService initializes in Local/Docker mode with REDIS_HOST/REDIS_PORT', async () => {
    const config = createMockConfig({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'mock-password',
    });
    const service = new RedisService(config);
    const client = service.getClient();
    assert(client !== null && client !== undefined, 'Redis client should be created');
    assert((client.options as any).host === '127.0.0.1', 'Host mismatch');
    assert((client.options as any).port === 6379, 'Port mismatch');
    assert((client.options as any).password === 'mock-password', 'Password mismatch');
    client.disconnect();
  });

  // Test 3: Graceful degradation when offline
  await runTest('3. Cache operations degrade gracefully when Redis is offline', async () => {
    const config = createMockConfig({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '59998', // Closed port
    });
    const service = new RedisService(config);

    // Should return null and not throw
    const value = await service.get('test:key');
    assert(value === null, 'get() should return null when offline');

    // exists should return false and not throw
    const exists = await service.exists('test:key');
    assert(exists === false, 'exists() should return false when offline');

    // set and del should resolve without throwing
    await service.set('test:key', 'value', 60);
    await service.del('test:key');

    service.getClient().disconnect();
  });

  // Test 4: Module lifecycle onModuleInit does not crash the server if Redis is down
  await runTest('4. onModuleInit gracefully handles unreachable Redis without crashing', async () => {
    const config = createMockConfig({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '59998',
    });
    const service = new RedisService(config);
    // Should complete without throwing
    await service.onModuleInit();
    service.getClient().disconnect();
  });

  console.log('\n========================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
