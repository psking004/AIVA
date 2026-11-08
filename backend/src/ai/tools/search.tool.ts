import { Injectable, Logger } from '@nestjs/common';
import { WebSearchService } from '../kernel/web-search.service';

@Injectable()
export class SearchTool {
  private readonly logger = new Logger(SearchTool.name);

  constructor(private readonly webSearchService: WebSearchService) {}

  async execute(userId: string, query: string, params: Record<string, unknown> = {}) {
    this.logger.log(`SearchTool executing: "${query}" for user ${userId}`);
    const searchResponse = await this.webSearchService.search(query);
    return {
      success: true,
      query,
      params,
      source: searchResponse.source,
      retrievedAt: searchResponse.retrievedAt,
      results: searchResponse.results,
      summary: searchResponse.summary,
    };
  }
}
