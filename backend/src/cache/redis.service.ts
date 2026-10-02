/**
 * Redis Service - Caching & Temporary State Layer
 *
 * Supports:
 * - Upstash Cloud Redis (via REDIS_URL with rediss:// TLS)
 * - Render / Managed Cloud Redis
 * - Local fallback (REDIS_HOST, REDIS_PORT)
 * - Resilient non-blocking initialization
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      this.logger.log('Initializing Redis client from REDIS_URL (Cloud/Upstash mode)');
      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      });
    } else {
      const host = this.configService.get('REDIS_HOST', 'localhost');
      const port = this.configService.get('REDIS_PORT', 6379);
      const password = this.configService.get('REDIS_PASSWORD');

      this.logger.log(`Initializing Redis client for ${host}:${port}`);
      this.client = new Redis({
        host,
        port: Number(port),
        password: password || undefined,
        retryStrategy: (times) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
      });
    }

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection warning: ${err.message}`);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });
  }

  async onModuleInit() {
    try {
      await this.client.ping();
      this.logger.log('Redis service initialized and ping successful');
    } catch (error: any) {
      this.logger.warn('Redis not currently reachable. Transient caching will degrade gracefully:', error.message);
    }
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  /**
   * Set value in cache with TTL (seconds)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to set cache for key "${key}":`, error.message);
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error: any) {
      this.logger.warn(`Failed to delete cache key "${key}":`, error.message);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch {
      return false;
    }
  }

  /**
   * Get client for direct operations
   */
  getClient(): Redis {
    return this.client;
  }
}
