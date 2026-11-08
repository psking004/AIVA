/**
 * AIVA Real Vector Embedding Service
 *
 * Generates high-dimensional vector embeddings for Semantic Memory and RAG.
 * Strict Architecture Rules:
 * 1. Preferred Order:
 *    a) Local Ollama embedding model (nomic-embed-text / qwen3:8b)
 *    b) Approved Cloud: Google Gemini text-embedding-004
 *    c) Cleanly throw/report unavailable if neither is configured.
 * 2. NO fake character-code pseudo-embeddings.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EmbeddingProviderName = 'ollama' | 'gemini' | 'none';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  readonly dimension = 768;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Check if any real embedding provider is reachable
   */
  async checkAvailability(): Promise<{ available: boolean; provider: EmbeddingProviderName }> {
    const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    try {
      const res = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        return { available: true, provider: 'ollama' };
      }
    } catch (_) {}

    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiKey) {
      return { available: true, provider: 'gemini' };
    }

    return { available: false, provider: 'none' };
  }

  /**
   * Generate vector embedding for given text using real AI providers
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const cleanText = text.trim();
    if (!cleanText) {
      return new Array(this.dimension).fill(0);
    }

    // 1. Try local Ollama embedding
    const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    const ollamaModel = this.configService.get<string>('OLLAMA_EMBED_MODEL') || 'nomic-embed-text';

    try {
      const response = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: cleanText,
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data: any = await response.json();
        if (data?.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
          this.logger.debug(`Generated ${data.embedding.length}-dim embedding via Ollama (${ollamaModel})`);
          return this.normalizeVector(data.embedding);
        }
      }
    } catch {
      // Proceed to cloud embedding
    }

    // 2. Try Google Gemini text-embedding-004
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: { parts: [{ text: cleanText }] },
            }),
            signal: AbortSignal.timeout(5000),
          },
        );

        if (response.ok) {
          const data: any = await response.json();
          const values = data?.embedding?.values;
          if (Array.isArray(values) && values.length > 0) {
            this.logger.debug(`Generated ${values.length}-dim embedding via Gemini text-embedding-004`);
            return this.normalizeVector(values);
          }
        } else {
          const errText = await response.text();
          this.logger.warn(`Gemini embedding returned HTTP ${response.status}: ${errText}`);
        }
      } catch (err: any) {
        this.logger.warn(`Gemini embedding request failed: ${err.message}`);
      }
    }

    // 3. Cleanly throw unavailable — strictly NO fake character-code fallback
    throw new Error(
      'Embedding provider unavailable: Neither local Ollama nor Google Gemini text-embedding-004 is reachable. Please configure GEMINI_API_KEY or start Ollama with an embedding model.',
    );
  }

  /**
   * Cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < length; i++) {
      const valA = a[i] || 0;
      const valB = b[i] || 0;
      dot += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map((v) => v / norm);
  }
}
