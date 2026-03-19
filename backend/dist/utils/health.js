"use strict";
/**
 * Health Check Utility
 *
 * Provides health and readiness endpoints for Kubernetes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkHealth = checkHealth;
exports.checkReadiness = checkReadiness;
async function checkHealth(prisma, redis) {
    const health = {
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
        await prisma.$queryRaw `SELECT 1`;
        health.services.database.latency = Date.now() - start;
    }
    catch (error) {
        health.services.database = { status: 'down', error: error.message };
        health.status = 'unhealthy';
    }
    // Check Redis
    try {
        const start = Date.now();
        await redis.getClient().ping();
        health.services.cache.latency = Date.now() - start;
    }
    catch (error) {
        health.services.cache = { status: 'down', error: error.message };
        health.status = 'degraded';
    }
    // Check AI service (optional)
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
        health.services.ai = { status: 'up' };
    }
    return health;
}
async function checkReadiness(prisma, redis) {
    try {
        // Database must be up
        await prisma.$queryRaw `SELECT 1`;
        // Redis is optional for readiness
        try {
            await redis.getClient().ping();
        }
        catch {
            // Redis down but still acceptable for readiness
        }
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=health.js.map