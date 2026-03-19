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
export declare function checkHealth(prisma: PrismaService, redis: RedisService): Promise<HealthStatus>;
export declare function checkReadiness(prisma: PrismaService, redis: RedisService): Promise<boolean>;
//# sourceMappingURL=health.d.ts.map