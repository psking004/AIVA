/**
 * Long-Term Memory — Persistent Vector Store
 *
 * In production, this would use ChromaDB for vector similarity search.
 * For the prototype, we implement a compatible in-memory vector store
 * with the same API surface (add, query, semantic search).
 *
 * - Storage: In-memory vector store (ChromaDB-compatible interface)
 * - Content: User preferences, past interaction summaries, learned facts
 * - Embedding: Simulated (all-MiniLM-L6-v2 384-dim in production)
 * - Purpose: Recall relevant context across sessions via semantic similarity
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface LongTermMemoryEntry {
  id: string;
  document: string;
  metadata: {
    type: 'preference' | 'summary' | 'fact' | 'interaction' | 'general';
    userId: string;
    created: string;
    source?: string;
    [key: string]: unknown;
  };
  embedding: number[];
  createdAt: Date;
}

export interface LongTermQueryResult {
  id: string;
  document: string;
  metadata: Record<string, unknown>;
  score: number;
}

@Injectable()
export class LongTermMemory {
  private readonly logger = new Logger(LongTermMemory.name);
  private readonly EMBEDDING_DIM = 384; // all-MiniLM-L6-v2 compatible

  /**
   * In-memory store — mimics ChromaDB collection
   * In production: chromadb.PersistentClient(path="./aiva_memory")
   */
  private store: Map<string, LongTermMemoryEntry[]> = new Map();

  constructor() {
    this.logger.log('Long-term memory initialized (in-memory vector store)');
    this.logger.warn(
      'Using in-memory vector store — replace with ChromaDB PersistentClient in production',
    );
  }

  /**
   * Store a memory
   *
   * Equivalent to ChromaDB:
   *   collection.add(
   *     documents=["User prefers dark mode and concise answers"],
   *     metadatas=[{"type": "preference", "created": "2026-03-18"}],
   *     ids=["pref_001"]
   *   )
   */
  async add(
    userId: string,
    document: string,
    type: LongTermMemoryEntry['metadata']['type'] = 'general',
    additionalMetadata: Record<string, unknown> = {},
  ): Promise<string> {
    const id = `${type}_${uuidv4().substring(0, 8)}`;

    const embedding = this.generateEmbedding(document);

    const entry: LongTermMemoryEntry = {
      id,
      document,
      metadata: {
        type,
        userId,
        created: new Date().toISOString(),
        ...additionalMetadata,
      },
      embedding,
      createdAt: new Date(),
    };

    const userEntries = this.store.get(userId) || [];
    userEntries.push(entry);
    this.store.set(userId, userEntries);

    this.logger.debug(
      `Long-term memory stored: [${type}] "${document.substring(0, 80)}..." (id: ${id})`,
    );

    return id;
  }

  /**
   * Retrieve relevant memories via semantic similarity search
   *
   * Equivalent to ChromaDB:
   *   results = collection.query(
   *     query_texts=["What display settings does the user like?"],
   *     n_results=3
   *   )
   */
  async query(
    userId: string,
    queryText: string,
    nResults: number = 3,
  ): Promise<LongTermQueryResult[]> {
    const userEntries = this.store.get(userId) || [];

    if (userEntries.length === 0) {
      return [];
    }

    const queryEmbedding = this.generateEmbedding(queryText);

    // Calculate similarity scores and rank
    const scored = userEntries.map((entry) => ({
      id: entry.id,
      document: entry.document,
      metadata: entry.metadata,
      score: this.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // Sort by score descending and take top N
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, nResults);

    this.logger.debug(
      `Long-term query: "${queryText.substring(0, 50)}..." → ${results.length} results (best score: ${results[0]?.score.toFixed(3) || 'N/A'})`,
    );

    return results;
  }

  /**
   * Query by metadata type
   */
  async queryByType(
    userId: string,
    type: LongTermMemoryEntry['metadata']['type'],
    limit: number = 10,
  ): Promise<LongTermQueryResult[]> {
    const userEntries = this.store.get(userId) || [];

    return userEntries
      .filter((e) => e.metadata.type === type)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        document: e.document,
        metadata: e.metadata,
        score: 1.0, // exact type match
      }));
  }

  /**
   * Delete a specific memory
   */
  async delete(userId: string, memoryId: string): Promise<boolean> {
    const userEntries = this.store.get(userId) || [];
    const index = userEntries.findIndex((e) => e.id === memoryId);

    if (index === -1) return false;

    userEntries.splice(index, 1);
    return true;
  }

  /**
   * Get all stored memories for a user
   */
  async getAll(userId: string): Promise<LongTermQueryResult[]> {
    const userEntries = this.store.get(userId) || [];
    return userEntries.map((e) => ({
      id: e.id,
      document: e.document,
      metadata: e.metadata,
      score: 1.0,
    }));
  }

  /**
   * Get memory statistics
   */
  getStats(userId: string): {
    totalMemories: number;
    byType: Record<string, number>;
  } {
    const userEntries = this.store.get(userId) || [];
    const byType: Record<string, number> = {};

    userEntries.forEach((e) => {
      byType[e.metadata.type] = (byType[e.metadata.type] || 0) + 1;
    });

    return { totalMemories: userEntries.length, byType };
  }

  /**
   * Format memories for prompt context injection
   */
  formatForPrompt(results: LongTermQueryResult[]): string {
    if (results.length === 0) return '';

    const lines = ['Recalled from long-term memory:'];
    results.forEach((r) => {
      lines.push(`- [${r.metadata.type}] ${r.document} (relevance: ${r.score.toFixed(2)})`);
    });

    return lines.join('\n');
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * Generate pseudo-embedding for text
   * In production, use: all-MiniLM-L6-v2 (384-dim, fast, local)
   */
  private generateEmbedding(text: string): number[] {
    const tokens = text.toLowerCase().split(/\s+/);
    const embedding = new Array(this.EMBEDDING_DIM).fill(0);

    // Simple bag-of-words style embedding
    tokens.forEach((token, tokenIdx) => {
      for (let i = 0; i < token.length; i++) {
        const charCode = token.charCodeAt(i);
        const idx = (charCode * (tokenIdx + 1) + i * 7) % this.EMBEDDING_DIM;
        embedding[idx] += 1.0 / tokens.length;
      }
    });

    // L2 normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
