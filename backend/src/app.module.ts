/**
 * AIVA Root Module - Orchestrates all system modules
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { NotesModule } from './modules/notes/notes.module';
import { FilesModule } from './modules/files/files.module';
import { AutomationModule } from './modules/automation/automation.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { EmailModule } from './modules/email/email.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AIModule } from './ai/ai.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { RedisThrottlerStorageService } from './cache/redis-throttler-storage.service';

import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env.local', '.env'],
    }),

    // Distributed Rate limiting via Redis
    ThrottlerModule.forRootAsync({
      imports: [CacheModule],
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => [
        {
          ttl: 60000,
          limit: 100,
          storage,
        },
      ],
    }),

    // Core modules
    DatabaseModule,
    CacheModule,
    AIModule,

    // Feature modules
    HealthModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
    NotesModule,
    FilesModule,
    AutomationModule,
    CalendarModule,
    EmailModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
