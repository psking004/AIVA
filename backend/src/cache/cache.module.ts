/**
 * Cache Module - Redis caching layer
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, RedisThrottlerStorageService],
  exports: [RedisService, RedisThrottlerStorageService],
})
export class CacheModule {}
