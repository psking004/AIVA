/**
 * Redis Throttler Storage - Distributed Rate Limiting for NestJS Throttler
 *
 * Atomically increments hit counts and sets millisecond TTL in Redis.
 * Seamlessly degrades to in-memory tracking if Redis is temporarily unreachable.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorageService.name);
  private readonly memoryFallback = new Map<string, { totalHits: number; expiresAt: number }>();

  // Redis Lua script for atomic increment and millisecond expiration
  private readonly luaScript = `
    local current = redis.call('incr', KEYS[1])
    if current == 1 then
      redis.call('pexpire', KEYS[1], ARGV[1])
    end
    local pttl = redis.call('pttl', KEYS[1])
    return {current, pttl}
  `;

  constructor(private readonly redisService: RedisService) {}

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${key}`;

    try {
      const client = this.redisService.getClient();
      if (client && client.status === 'ready') {
        const result = (await client.eval(
          this.luaScript,
          1,
          redisKey,
          ttl.toString(),
        )) as [number, number];

        const totalHits = result[0];
        const timeToExpire = Math.max(0, Math.ceil(result[1] / 1000));

        return {
          totalHits,
          timeToExpire,
        };
      }
    } catch (err: any) {
      this.logger.debug(`Redis rate-limit eval failed (${err.message}). Using memory fallback.`);
    }

    // In-memory fallback
    const now = Date.now();
    const existing = this.memoryFallback.get(key);

    if (existing && existing.expiresAt > now) {
      existing.totalHits += 1;
      return {
        totalHits: existing.totalHits,
        timeToExpire: Math.max(0, Math.ceil((existing.expiresAt - now) / 1000)),
      };
    }

    const expiresAt = now + ttl;
    this.memoryFallback.set(key, { totalHits: 1, expiresAt });

    return {
      totalHits: 1,
      timeToExpire: Math.ceil(ttl / 1000),
    };
  }
}
