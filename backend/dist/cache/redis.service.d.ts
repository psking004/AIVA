/**
 * Redis Service - Caching layer for the application
 */
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
export declare class RedisService implements OnModuleInit {
    private configService;
    private readonly logger;
    private client;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    /**
     * Get value from cache
     */
    get(key: string): Promise<string | null>;
    /**
     * Set value in cache with TTL
     */
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    /**
     * Delete value from cache
     */
    del(key: string): Promise<void>;
    /**
     * Check if key exists
     */
    exists(key: string): Promise<boolean>;
    /**
     * Get client for direct operations
     */
    getClient(): Redis;
}
//# sourceMappingURL=redis.service.d.ts.map