/**
 * AIVA Web & Live Information Retrieval Capability Service
 *
 * Implements WEB_SEARCH, NEWS, and CURRENT_INFORMATION retrieval.
 * Distinguishes retrieved external facts from model-generated explanations.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SearchResultItem {
  title: string;
  snippet: string;
  url?: string;
  source?: string;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResultItem[];
  retrievedAt: string;
  source: string;
  summary: string;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  /**
   * Search web for current facts, news, and queries
   */
  public async search(query: string): Promise<WebSearchResponse> {
    const cleanQuery = query.trim();
    this.logger.log(`Performing web search for: "${cleanQuery}"`);
    const retrievedAt = new Date().toISOString();

    try {
      // 1. DuckDuckGo Instant Answer API
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(5000) });

      if (res.ok) {
        const data = (await res.json()) as any;
        const results: SearchResultItem[] = [];

        if (data.AbstractText) {
          results.push({
            title: data.Heading || cleanQuery,
            snippet: data.AbstractText,
            url: data.AbstractURL || '',
            source: data.AbstractSource || 'DuckDuckGo Knowledge',
          });
        }

        if (Array.isArray(data.RelatedTopics)) {
          for (const item of data.RelatedTopics.slice(0, 4)) {
            if (item.Text && !item.Topics) {
              results.push({
                title: (item.Text.split(' - ')[0] || cleanQuery).slice(0, 80),
                snippet: item.Text,
                url: item.FirstURL || '',
                source: 'Web Topic',
              });
            }
          }
        }

        if (results.length > 0) {
          const summary = results.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`).join('\n\n');
          return {
            query: cleanQuery,
            results,
            retrievedAt,
            source: 'DuckDuckGo Instant Answer',
            summary,
          };
        }
      }
    } catch (e: any) {
      this.logger.warn(`DuckDuckGo API notice: ${e.message}`);
    }

    // 2. Wikipedia Summary Fallback for general knowledge / current affairs concepts
    try {
      const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, '_'))}`;
      const wRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(4000) });
      if (wRes.ok) {
        const wData = (await wRes.json()) as any;
        if (wData.extract) {
          return {
            query: cleanQuery,
            results: [
              {
                title: wData.title || cleanQuery,
                snippet: wData.extract,
                url: wData.content_urls?.desktop?.page || '',
                source: 'Wikipedia Live Summary',
              },
            ],
            retrievedAt,
            source: 'Wikipedia',
            summary: `${wData.title}: ${wData.extract}`,
          };
        }
      }
    } catch (_) {}

    return {
      query: cleanQuery,
      results: [],
      retrievedAt,
      source: 'None',
      summary: `No live search entries could be retrieved for "${cleanQuery}". External search network may be restricted.`,
    };
  }
}
