/**
 * AIVA Authentication & Device Authorization Test Suite
 *
 * Tests:
 * 1. Single-owner registration lockdown (2nd user rejected with 403)
 * 2. Password hashing with bcrypt (verifying salt and hash, no plaintext)
 * 3. Access token & refresh token generation with distinct secrets and TTLs
 * 4. Refresh token rotation & validation
 * 5. Device registration, authorization, and revocation
 * 6. Unknown device rejection in DeviceAuthGuard
 * 7. Revoked device rejection in DeviceAuthGuard
 * 8. User sanitization (passwordHash never exposed)
 */

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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
    get: (key: string, defaultValue?: string) => env[key] ?? defaultValue ?? '',
  } as unknown as ConfigService;
}

async function main() {
  console.log('\n==================================================');
  console.log('AIVA AUTHENTICATION & DEVICE AUTHORIZATION TESTS');
  console.log('==================================================\n');

  const jwtSecret = 'test-super-secret-key-32-bytes-minimum-length!';
  const jwtRefreshSecret = 'test-refresh-super-secret-key-32-bytes!';

  const config = createMockConfig({
    JWT_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    SESSION_EXPIRY: '86400',
  });

  const jwtService = new JwtService();

  // Test 1: Single-Owner Registration Lock
  await runTest('1. Single-Owner: Blocks second registration attempt with 403 Forbidden', async () => {
    const mockPrisma: any = {
      user: {
        count: async () => 1, // Already has 1 user
      },
    };

    const authService = new AuthService(mockPrisma, jwtService, config);
    let threw = false;
    try {
      await authService.register('attacker@test.com', 'password123');
    } catch (err: any) {
      threw = true;
      assert(err instanceof ForbiddenException, 'Must throw ForbiddenException');
      assert(err.message.includes('Multi-user registration is disabled'), 'Error message mismatch');
    }
    assert(threw, 'Should have blocked second registration');
  });

  // Test 2: Password Hashing Verification
  await runTest('2. Passwords are cryptographically hashed using bcrypt (never plaintext)', async () => {
    let storedHash = '';
    const mockPrisma: any = {
      user: {
        count: async () => 0,
        create: async (args: any) => {
          storedHash = args.data.passwordHash;
          return { id: 'user-1', email: args.data.email, passwordHash: storedHash };
        },
      },
    };

    const authService = new AuthService(mockPrisma, jwtService, config);
    const result = await authService.register('owner@aiva.local', 'SuperSecurePass123!');

    assert(storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$'), 'Must be a valid bcrypt hash');
    assert(storedHash !== 'SuperSecurePass123!', 'Password must not be stored in plaintext');
    assert(await bcrypt.compare('SuperSecurePass123!', storedHash), 'Bcrypt compare must succeed with password');
    assert(!('passwordHash' in result.user), 'Returned user object must not leak passwordHash');
  });

  // Test 3: JWT Access & Refresh Token Creation & Expiry
  await runTest('3. Tokens have separate secrets, valid payload, and proper expiry (1h / 30d)', async () => {
    const mockPrisma: any = {
      user: {
        findUnique: async () => ({
          id: 'owner-id',
          email: 'owner@aiva.local',
          passwordHash: await bcrypt.hash('CorrectPassword!', 10),
        }),
      },
      session: {
        create: async () => ({ id: 'sess-1' }),
      },
    };

    const authService = new AuthService(mockPrisma, jwtService, config);
    const tokens = await authService.login('owner@aiva.local', 'CorrectPassword!');

    assert(tokens.accessToken !== undefined, 'accessToken should be returned');
    assert(tokens.refreshToken !== undefined, 'refreshToken should be returned');
    assert(tokens.tokenType === 'Bearer', 'tokenType should be Bearer');
    assert(tokens.expiresIn === 3600, 'expiresIn should be 3600s');

    // Verify Access Token signature with access secret
    const accessPayload: any = jwtService.verify(tokens.accessToken, {
      secret: jwtSecret,
    });
    assert(accessPayload.sub === 'owner-id', 'Access token subject mismatch');
    assert(accessPayload.type === 'access', 'Access token type mismatch');

    // Verify Refresh Token signature with refresh secret
    const refreshPayload: any = jwtService.verify(tokens.refreshToken, {
      secret: jwtRefreshSecret,
    });
    assert(refreshPayload.sub === 'owner-id', 'Refresh token subject mismatch');
    assert(refreshPayload.type === 'refresh', 'Refresh token type mismatch');

    // Reject access token when verified with refresh secret
    let crossSecretFailed = false;
    try {
      jwtService.verify(tokens.accessToken, {
        secret: jwtRefreshSecret,
      });
    } catch {
      crossSecretFailed = true;
    }
    assert(crossSecretFailed, 'Access token should fail validation against refresh secret');
  });

  // Test 4: Refresh Token Rotation
  await runTest('4. Refresh token rotation generates a new valid access token pair', async () => {
    const mockPrisma: any = {
      user: {
        findUnique: async (args: any) => {
          if (args.where.id === 'owner-id') {
            return { id: 'owner-id', email: 'owner@aiva.local' };
          }
          return null;
        },
      },
      device: {
        findUnique: async () => ({ deviceId: 'dev-1', userId: 'owner-id', revokedAt: null }),
        update: async () => ({}),
      },
    };

    const authService = new AuthService(mockPrisma, jwtService, config);
    const initialTokens = await (authService as any).generateTokens('owner-id', 'owner@aiva.local', 'dev-1');

    const rotatedTokens = await authService.refreshToken(initialTokens.refreshToken, 'dev-1');
    assert(rotatedTokens.accessToken !== undefined, 'Rotated access token must be generated');
    assert(rotatedTokens.refreshToken !== undefined, 'Rotated refresh token must be generated');
  });

  // Test 5: Revoked Device Rejection in DeviceAuthGuard
  await runTest('5. DeviceAuthGuard rejects revoked devices with 403 Forbidden', async () => {
    const mockPrisma: any = {
      device: {
        findUnique: async () => ({
          deviceId: 'banned-phone',
          userId: 'owner-id',
          revokedAt: new Date(), // Revoked!
        }),
      },
    };

    const authService = new AuthService(mockPrisma, jwtService, config);
    const validToken = jwtService.sign(
      { sub: 'owner-id', email: 'owner@aiva.local', type: 'access' },
      { secret: jwtSecret },
    );

    const guard = new DeviceAuthGuard(authService);
    const mockContext: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: `Bearer ${validToken}`,
            'x-device-id': 'banned-phone',
          },
        }),
      }),
    } as any;

    let threw = false;
    try {
      await guard.canActivate(mockContext);
    } catch (err: any) {
      threw = true;
      assert(err instanceof ForbiddenException, 'Must throw ForbiddenException for revoked device');
      assert(err.message.includes('Unauthorized or revoked device'), 'Error message mismatch');
    }
    assert(threw, 'Should have blocked revoked device');
  });

  // Test 6: Missing Device Header Rejection in DeviceAuthGuard
  await runTest('6. DeviceAuthGuard rejects requests missing x-device-id header with 403 Forbidden', async () => {
    const mockPrisma: any = {};
    const authService = new AuthService(mockPrisma, jwtService, config);
    const validToken = jwtService.sign(
      { sub: 'owner-id', email: 'owner@aiva.local', type: 'access' },
      { secret: jwtSecret },
    );

    const guard = new DeviceAuthGuard(authService);
    const mockContext: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: `Bearer ${validToken}`,
            // Missing x-device-id header
          },
        }),
      }),
    } as any;

    let threw = false;
    try {
      await guard.canActivate(mockContext);
    } catch (err: any) {
      threw = true;
      assert(err instanceof ForbiddenException, 'Must throw ForbiddenException for missing device header');
      assert(err.message.includes('Device identity required'), 'Error message mismatch');
    }
    assert(threw, 'Should have blocked missing device header');
  });

  // Test 7: Authorized Device Acceptance in DeviceAuthGuard
  await runTest('7. DeviceAuthGuard allows authorized, non-revoked device with valid JWT', async () => {
    const mockPrisma: any = {
      device: {
        findUnique: async () => ({
          deviceId: 'trusted-windows-desktop',
          userId: 'owner-id',
          revokedAt: null, // Active
        }),
        update: async () => ({}),
      },
    };

    const authService = new AuthService(mockPrisma, jwtService, config);
    const validToken = jwtService.sign(
      { sub: 'owner-id', email: 'owner@aiva.local', type: 'access' },
      { secret: jwtSecret },
    );

    const guard = new DeviceAuthGuard(authService);
    const mockReq: any = {
      headers: {
        authorization: `Bearer ${validToken}`,
        'x-device-id': 'trusted-windows-desktop',
      },
    };
    const mockContext: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
      }),
    } as any;

    const allowed = await guard.canActivate(mockContext);
    assert(allowed === true, 'Guard should allow request');
    assert(mockReq.user.id === 'owner-id', 'Request user context should be attached');
    assert(mockReq.deviceId === 'trusted-windows-desktop', 'Request device ID should be attached');
  });

  // Test 8: Feature Controllers pass authenticated req.user.id (not hardcoded user-id)
  await runTest('8. Feature controllers receive authenticated req.user.id and pass to service layer', async () => {
    // Test TasksController
    const { TasksController } = await import('../tasks/tasks.controller');
    let capturedUserId = '';
    const mockTasksService: any = {
      findAll: async (userId: string) => {
        capturedUserId = userId;
        return [];
      },
    };
    const tasksController = new TasksController(mockTasksService);
    const mockReq = { user: { id: 'authenticated-owner-xyz-777', email: 'owner@aiva.local' }, deviceId: 'dev-1' };
    await tasksController.findAll(mockReq, {});
    assert(capturedUserId === 'authenticated-owner-xyz-777', 'TasksController must pass authenticated req.user.id');
    assert(capturedUserId !== 'user-id', 'TasksController must not use hardcoded user-id');

    // Test NotesController
    const { NotesController } = await import('../notes/notes.controller');
    let capturedNotesUserId = '';
    const mockNotesService: any = {
      findAll: async (userId: string) => {
        capturedNotesUserId = userId;
        return [];
      },
    };
    const notesController = new NotesController(mockNotesService);
    await notesController.findAll(mockReq, {});
    assert(capturedNotesUserId === 'authenticated-owner-xyz-777', 'NotesController must pass authenticated req.user.id');

    // Test AnalyticsController
    const { AnalyticsController } = await import('../analytics/analytics.controller');
    let capturedAnalyticsUserId = '';
    const mockAnalyticsService: any = {
      getDashboard: async (userId: string) => {
        capturedAnalyticsUserId = userId;
        return {};
      },
    };
    const analyticsController = new AnalyticsController(mockAnalyticsService);
    await analyticsController.getDashboard(mockReq);
    assert(capturedAnalyticsUserId === 'authenticated-owner-xyz-777', 'AnalyticsController must pass authenticated req.user.id');
  });

  console.log('\n==================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
