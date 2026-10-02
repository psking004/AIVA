/**
 * Email Tool — Provides email integration capabilities to agents
 */
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailTool {
  private readonly logger = new Logger(EmailTool.name);

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`EmailTool executing: ${action} for user ${userId}`);
    return { success: true, action, params };
  }
}
