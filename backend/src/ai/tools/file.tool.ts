/**
 * File Tool — Provides file management capabilities to agents
 */
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FileTool {
  private readonly logger = new Logger(FileTool.name);

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`FileTool executing: ${action} for user ${userId}`);
    return { success: true, action, params };
  }
}
