/**
 * Health Check Utility
 *
 * Provides health and readiness endpoints for Kubernetes
 */

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../cache/redis.service';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceHealth;
    cache: ServiceHealth;
    ai?: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down';
  latency?: number;
  error?: string;
}

export async function checkHealth(
  prisma: PrismaService,
  redis: RedisService,
): Promise<HealthStatus> {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'up' },
      cache: { status: 'up' },
    },
  };

  // Check database
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.services.database.latency = Date.now() - start;
  } catch (error) {
    health.services.database = { status: 'down', error: error.message };
    health.status = 'unhealthy';
  }

  // Check Redis
  try {
    const start = Date.now();
    await redis.getClient().ping();
    health.services.cache.latency = Date.now() - start;
  } catch (error) {
    health.services.cache = { status: 'down', error: error.message };
    health.status = 'degraded';
  }

  // Check AI service (optional)
  if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    health.services.ai = { status: 'up' };
  }

  return health;
}

export async function checkReadiness(
  prisma: PrismaService,
  redis: RedisService,
): Promise<boolean> {
  try {
    // Database must be up
    await prisma.$queryRaw`SELECT 1`;

    // Redis is optional for readiness
    try {
      await redis.getClient().ping();
    } catch {
      // Redis down but still acceptable for readiness
    }

    return true;
  } catch {
    return false;
  }
}
