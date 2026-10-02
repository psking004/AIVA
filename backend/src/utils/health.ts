/**
 * Health Check Utility
 *
 * Provides health and readiness diagnostics for Kubernetes, Docker, and clients.
 * Separately reports Ollama, OpenRouter, and Gemini availability.
 */

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../cache/redis.service';
import { ModelRouterService } from '../ai/router/model-router.service';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceHealth;
    cache: ServiceHealth;
    aiProviders: {
      ollama: { status: 'available' | 'unavailable'; model: string; latencyMs?: number | undefined; error?: string | undefined };
      openrouter: { status: 'available' | 'unavailable'; model: string; latencyMs?: number | undefined; error?: string | undefined };
      gemini: { status: 'available' | 'unavailable'; model: string; latencyMs?: number | undefined; error?: string | undefined };
    };
  };
  routing: {
    strategy: string;
    preferredCloudProvider: string;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down';
  latency?: number | undefined;
  error?: string | undefined;
}

export async function checkHealth(
  prisma: PrismaService,
  redis: RedisService,
  modelRouter?: ModelRouterService,
): Promise<HealthStatus> {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'up' },
      cache: { status: 'up' },
      aiProviders: {
        ollama: { status: 'unavailable', model: 'qwen3:8b' },
        openrouter: { status: 'unavailable', model: 'qwen/qwen-2.5-72b-instruct' },
        gemini: { status: 'unavailable', model: 'gemini-1.5-flash' },
      },
    },
    routing: {
      strategy: modelRouter?.strategy || 'local-first',
      preferredCloudProvider: modelRouter?.cloudProviderPreference || 'openrouter',
    },
  };

  // Check database
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.services.database.latency = Date.now() - start;
  } catch (error: any) {
    health.services.database = { status: 'down', error: error.message };
    health.status = 'unhealthy';
  }

  // Check Redis (optional/cache)
  try {
    const start = Date.now();
    await redis.getClient().ping();
    health.services.cache.latency = Date.now() - start;
  } catch (error: any) {
    health.services.cache = { status: 'down', error: error.message };
    if (health.status !== 'unhealthy') {
      health.status = 'degraded';
    }
  }

  // Check AI Providers separately if router is provided
  if (modelRouter) {
    try {
      const routerStatus = await modelRouter.getStatus();
      health.services.aiProviders = {
        ollama: {
          status: routerStatus.providers.ollama.isAvailable ? 'available' : 'unavailable',
          model: routerStatus.providers.ollama.model,
          latencyMs: routerStatus.providers.ollama.latencyMs,
          error: routerStatus.providers.ollama.error,
        },
        openrouter: {
          status: routerStatus.providers.openrouter.isAvailable ? 'available' : 'unavailable',
          model: routerStatus.providers.openrouter.model,
          latencyMs: routerStatus.providers.openrouter.latencyMs,
          error: routerStatus.providers.openrouter.error,
        },
        gemini: {
          status: routerStatus.providers.gemini.isAvailable ? 'available' : 'unavailable',
          model: routerStatus.providers.gemini.model,
          latencyMs: routerStatus.providers.gemini.latencyMs,
          error: routerStatus.providers.gemini.error,
        },
      };
    } catch {
      // Keep defaults
    }
  }

  return health;
}

export async function checkReadiness(
  prisma: PrismaService,
  _redis: RedisService,
): Promise<boolean> {
  try {
    // Database must be up for readiness
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
