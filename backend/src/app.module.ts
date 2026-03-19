/**
 * AIVA Root Module - Orchestrates all system modules
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { FilesModule } from './modules/files/files.module';
import { AutomationModule } from './modules/automation/automation.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { EmailModule } from './modules/email/email.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AIModule } from './ai/ai.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    // Core modules
    DatabaseModule,
    CacheModule,
    AIModule,

    // Feature modules
    AuthModule,
    TasksModule,
    NotesModule,
    FilesModule,
    AutomationModule,
    CalendarModule,
    EmailModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
