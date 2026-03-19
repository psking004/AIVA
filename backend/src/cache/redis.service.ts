/**
 * Redis Service - Caching layer for the application
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private configService: ConfigService) {
    const host = this.configService.get('REDIS_HOST', 'localhost');
    const port = this.configService.get('REDIS_PORT', 6379);
    const password = this.configService.get('REDIS_PASSWORD');

    this.client = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis error:', err.message);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  async onModuleInit() {
    try {
      await this.client.ping();
      this.logger.log('Redis service initialized');
    } catch (error) {
      this.logger.warn('Redis not available, caching disabled:', error.message);
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
   * Set value in cache with TTL
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.warn('Failed to set cache:', error.message);
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn('Failed to delete cache:', error.message);
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
