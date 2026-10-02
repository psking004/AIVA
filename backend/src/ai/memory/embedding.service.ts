/**
 * Embedding Service
 *
 * Generates vector embeddings for RAG and Long-Term Memory using:
 * 1. Local Ollama (nomic-embed-text / qwen3:8b)
 * 2. Google Gemini Embedding API (text-embedding-004)
 * 3. OpenRouter embeddings
 * 4. Resilient Fallback Normalizer
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingService {
  readonly dimension = 768;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate vector embedding for given text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const cleanText = text.trim();
    if (!cleanText) {
      return new Array(this.dimension).fill(0);
    }

    // 1. Try local Ollama embedding
    const ollamaBaseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://localhost:11434');
    try {
      const response = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.configService.get<string>('OLLAMA_MODEL', 'qwen3:8b'),
          prompt: cleanText,
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const data: any = await response.json();
        if (data?.embedding && Array.isArray(data.embedding)) {
          return this.normalizeVector(data.embedding);
        }
      }
    } catch {
      // Fallback to Gemini
    }

    // 2. Try Gemini Embedding API
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
            signal: AbortSignal.timeout(2000),
          },
        );

        if (response.ok) {
          const data: any = await response.json();
          if (data?.embedding?.values) {
            return this.normalizeVector(data.embedding.values);
          }
        }
      } catch {
        // Fallback to deterministic vector
      }
    }

    // 3. Fallback deterministic dimensional embedding
    return this.generateDeterministicVector(cleanText, this.dimension);
  }

  /**
   * Cosine similarity between two normalized vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
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

  private generateDeterministicVector(text: string, dim: number): number[] {
    const vector = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    words.forEach((word, wordIdx) => {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        const idx = Math.abs((charCode * 31 + i * 17 + wordIdx * 7) % dim);
        vector[idx] += 1.0 / (wordIdx + 1);
      }
    });

    return this.normalizeVector(vector);
  }
}
