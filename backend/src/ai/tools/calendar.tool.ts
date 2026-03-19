/**
 * Calendar Tool — Provides calendar management capabilities to agents
 */
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CalendarTool {
  private readonly logger = new Logger(CalendarTool.name);

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`CalendarTool executing: ${action} for user ${userId}`);
    return { success: true, action, params };
  }
}
