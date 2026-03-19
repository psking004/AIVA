/**
 * Search Tool — Provides search / web lookup capabilities to agents
 */
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SearchTool {
  private readonly logger = new Logger(SearchTool.name);

  async execute(userId: string, query: string, params: Record<string, unknown> = {}) {
    this.logger.log(`SearchTool executing: "${query}" for user ${userId}`);
    return { success: true, query, params, results: [] };
  }
}
