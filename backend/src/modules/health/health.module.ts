import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AIModule } from '../../ai/ai.module';
import { DatabaseModule } from '../../database/database.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [DatabaseModule, CacheModule, AIModule],
  controllers: [HealthController],
})
export class HealthModule {}
