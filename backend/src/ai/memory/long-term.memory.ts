/**
 * Long-Term Memory — Persistent Vector Store
 *
 * Stores user preferences, past interaction summaries, learned facts, and preferences.
 * Integrates with EmbeddingService for real semantic similarity retrieval.
 * Features persistent disk backup so memories survive restarts.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingService } from './embedding.service';
import * as fs from 'fs';
import * as path from 'path';

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
export class LongTermMemory implements OnModuleInit {
  private readonly logger = new Logger(LongTermMemory.name);
  private readonly storagePath = path.join(process.cwd(), 'data', 'long_term_memory.json');
  private store: Map<string, LongTermMemoryEntry[]> = new Map();

  constructor(private readonly embeddingService: EmbeddingService) {
    this.logger.log('Long-term memory initialized with persistent vector store');
  }

  async onModuleInit() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dataDir = path.dirname(this.storagePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [userId, entries] of Object.entries(parsed)) {
          this.store.set(
            userId,
            (entries as any[]).map((e) => ({
              ...e,
              createdAt: new Date(e.createdAt),
            })),
          );
        }
        this.logger.log(`Loaded persisted long-term memories from ${this.storagePath}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not load long-term memory from disk: ${err.message}`);
    }
  }

  private saveToDisk(): void {
    try {
      const dataDir = path.dirname(this.storagePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const serializable: Record<string, LongTermMemoryEntry[]> = {};
      for (const [userId, entries] of this.store.entries()) {
        serializable[userId] = entries;
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(serializable, null, 2), 'utf8');
    } catch (err: any) {
      this.logger.warn(`Could not save long-term memory to disk: ${err.message}`);
    }
  }

  /**
   * Store a memory
   */
  async add(
    userId: string,
    document: string,
    type: LongTermMemoryEntry['metadata']['type'] = 'general',
    additionalMetadata: Record<string, unknown> = {},
  ): Promise<string> {
    const id = `${type}_${uuidv4().substring(0, 8)}`;
    const embedding = await this.embeddingService.generateEmbedding(document);

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
    this.saveToDisk();

    this.logger.debug(
      `Long-term memory stored: [${type}] "${document.substring(0, 80)}..." (id: ${id})`,
    );

    return id;
  }

  /**
   * Retrieve relevant memories via semantic similarity search
   */
  async query(
    userId: string,
    queryText: string,
    nResults: number = 3,
  ): Promise<LongTermQueryResult[]> {
    const userEntries = this.store.get(userId) || [];
    if (userEntries.length === 0) return [];

    const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);

    const scored = userEntries.map((entry) => ({
      id: entry.id,
      document: entry.document,
      metadata: entry.metadata,
      score: this.embeddingService.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, nResults);
  }

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
        score: 1.0,
      }));
  }

  async delete(userId: string, memoryId: string): Promise<boolean> {
    const userEntries = this.store.get(userId) || [];
    const index = userEntries.findIndex((e) => e.id === memoryId);
    if (index === -1) return false;

    userEntries.splice(index, 1);
    this.saveToDisk();
    return true;
  }

  async getAll(userId: string): Promise<LongTermQueryResult[]> {
    const userEntries = this.store.get(userId) || [];
    return userEntries.map((e) => ({
      id: e.id,
      document: e.document,
      metadata: e.metadata,
      score: 1.0,
    }));
  }

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

  formatForPrompt(results: LongTermQueryResult[]): string {
    if (results.length === 0) return '';
    const lines = ['Recalled from long-term memory:'];
    results.forEach((r) => {
      lines.push(`- [${r.metadata.type}] ${r.document} (relevance: ${r.score.toFixed(2)})`);
    });
    return lines.join('\n');
  }
}
