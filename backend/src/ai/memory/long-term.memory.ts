/**
 * AIVA Long-Term Vector Memory Engine
 *
 * Implements real semantic vector memory storage & retrieval:
 * - 6 Memory Types: WORKING, EPISODIC, SEMANTIC, PROJECT, DEVICE, TASK
 * - Real vector embeddings (Gemini text-embedding-004 / Ollama)
 * - Persistent storage surviving backend restarts & deploys
 * - Relevance threshold filtering (rejects irrelevant memories)
 * - Context budget limiting (prevents prompt explosion)
 * - Conflict & stale-memory resolution
 * - User isolation and privacy boundaries
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingService } from './embedding.service';
import * as fs from 'fs';
import * as path from 'path';

export type MemoryType = 'WORKING' | 'EPISODIC' | 'SEMANTIC' | 'PROJECT' | 'DEVICE' | 'TASK';

export interface MemoryMetadata {
  type: MemoryType;
  userId: string;
  sourceTimestamp: string;
  projectId?: string | undefined;
  taskId?: string | undefined;
  deviceId?: string | undefined;
  confidence?: number | undefined;
  tags?: string[] | undefined;
  [key: string]: unknown;
}

export interface VectorMemoryEntry {
  id: string;
  document: string;
  type: MemoryType;
  userId: string;
  embedding: number[];
  metadata: MemoryMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryQueryResult {
  id: string;
  document: string;
  type: MemoryType;
  metadata: MemoryMetadata;
  score: number;
}

export type LongTermQueryResult = MemoryQueryResult;

export interface MemoryQueryOptions {
  limit?: number | undefined;
  minRelevance?: number | undefined; // Default 0.65
  type?: MemoryType | undefined;
  projectId?: string | undefined;
  taskId?: string | undefined;
  maxContextChars?: number | undefined;
}

@Injectable()
export class LongTermMemory implements OnModuleInit {
  private readonly logger = new Logger(LongTermMemory.name);
  private readonly storagePath = path.join(process.cwd(), 'data', 'long_term_vector_store.json');
  private store: Map<string, VectorMemoryEntry[]> = new Map();

  // Default relevance threshold: Below this similarity, memories are deemed irrelevant
  readonly defaultRelevanceThreshold = 0.65;

  constructor(private readonly embeddingService: EmbeddingService) {
    this.logger.log('Long-term vector memory engine initialized with multi-tier classification');
  }

  async onModuleInit() {
    this.loadFromDisk();
  }

  /**
   * Load persisted memories from disk
   */
  public loadFromDisk(): void {
    try {
      const dataDir = path.dirname(this.storagePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.store.clear();

        for (const [userId, entries] of Object.entries(parsed)) {
          this.store.set(
            userId,
            (entries as any[]).map((e) => ({
              ...e,
              createdAt: new Date(e.createdAt),
              updatedAt: new Date(e.updatedAt || e.createdAt),
            })),
          );
        }
        this.logger.log(`Loaded persisted vector memories for ${this.store.size} users from ${this.storagePath}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not load vector memory from disk: ${err.message}`);
    }
  }

  /**
   * Save all memories durably to disk with atomic write
   */
  public saveToDisk(): void {
    try {
      const dataDir = path.dirname(this.storagePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const serializable: Record<string, VectorMemoryEntry[]> = {};
      for (const [userId, entries] of this.store.entries()) {
        serializable[userId] = entries;
      }

      const tempPath = `${this.storagePath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(serializable, null, 2), 'utf8');
      fs.renameSync(tempPath, this.storagePath);
    } catch (err: any) {
      this.logger.error(`Failed to save vector memory to disk: ${err.message}`);
    }
  }

  private normalizeMemoryType(rawType: string): MemoryType {
    const upper = String(rawType || '').toUpperCase();
    if (upper === 'WORKING' || upper === 'EPISODIC' || upper === 'SEMANTIC' || upper === 'PROJECT' || upper === 'DEVICE' || upper === 'TASK') {
      return upper as MemoryType;
    }
    if (upper === 'PREFERENCE' || upper === 'FACT') return 'SEMANTIC';
    if (upper === 'SUMMARY' || upper === 'INTERACTION') return 'EPISODIC';
    return 'SEMANTIC';
  }

  /**
   * Add a classified memory with real vector embedding and conflict resolution
   */
  async add(
    userId: string,
    document: string,
    type: MemoryType | string = 'SEMANTIC',
    additionalMetadata: Record<string, unknown> = {},
  ): Promise<string> {
    const memType = this.normalizeMemoryType(type);
    const cleanDoc = document.trim();
    if (!cleanDoc) {
      throw new Error('Memory document cannot be empty.');
    }

    // 1. Conflict & Stale Memory Resolution
    // If exact or near-identical memory exists for same user and type, update it
    const userEntries = this.store.get(userId) || [];
    let existingIndex = userEntries.findIndex(
      (e) => e.type === memType && e.document.toLowerCase() === cleanDoc.toLowerCase(),
    );

    // 2. Generate Real High-Dimensional Embedding
    const embedding = await this.embeddingService.generateEmbedding(cleanDoc);

    // 2b. Semantic Deduplication: Check if an existing memory of the same type has similarity > 0.95
    if (existingIndex === -1 && userEntries.length > 0) {
      existingIndex = userEntries.findIndex(
        (e) => e.type === memType && this.embeddingService.cosineSimilarity(embedding, e.embedding) > 0.95,
      );
    }

    const now = new Date();
    const metadata: MemoryMetadata = {
      type: memType,
      userId,
      sourceTimestamp: now.toISOString(),
      ...(additionalMetadata as any),
    };

    if (existingIndex !== -1 && userEntries[existingIndex]) {
      // Conflict resolution: update document, timestamp and embedding
      const existing = userEntries[existingIndex]!;
      existing.document = cleanDoc;
      existing.embedding = embedding;
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.updatedAt = now;
      this.saveToDisk();
      this.logger.log(`Updated existing vector memory [${memType}] (id: ${existing.id}) for user ${userId} (deduped/updated)`);
      return existing.id;
    }

    // 3. New Entry Creation
    const id = `mem_${memType.toLowerCase()}_${uuidv4().substring(0, 8)}`;
    const entry: VectorMemoryEntry = {
      id,
      document: cleanDoc,
      type: memType,
      userId,
      embedding,
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    userEntries.push(entry);
    this.store.set(userId, userEntries);
    this.saveToDisk();

    this.logger.log(`Stored vector memory [${type}] "${cleanDoc.substring(0, 60)}..." (id: ${id}) for user ${userId}`);
    return id;
  }

  /**
   * Query memories using semantic vector similarity, relevance thresholding, and context budgeting
   */
  async query(
    userId: string,
    queryText: string,
    options: number | MemoryQueryOptions = {},
  ): Promise<MemoryQueryResult[]> {
    const opts: MemoryQueryOptions = typeof options === 'number' ? { limit: options } : options;
    const userEntries = this.store.get(userId) || [];
    if (userEntries.length === 0) return [];

    const cleanQuery = queryText.trim();
    if (!cleanQuery) return [];

    // Generate real query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(cleanQuery);

    const minScore = opts.minRelevance ?? this.defaultRelevanceThreshold;
    const limit = opts.limit ?? 5;
    const maxChars = opts.maxContextChars ?? 2000;

    // Filter by type or associations if requested
    let candidates = userEntries;
    if (opts.type) {
      candidates = candidates.filter((e) => e.type === opts.type);
    }
    if (opts.projectId) {
      candidates = candidates.filter((e) => e.metadata.projectId === opts.projectId);
    }
    if (opts.taskId) {
      candidates = candidates.filter((e) => e.metadata.taskId === opts.taskId);
    }

    // Score via Cosine Similarity
    const scored: MemoryQueryResult[] = candidates.map((entry) => ({
      id: entry.id,
      document: entry.document,
      type: entry.type,
      metadata: entry.metadata,
      score: this.embeddingService.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // Filter by relevance threshold: Rejects irrelevant memories
    const relevant = scored.filter((item) => item.score >= minScore);
    relevant.sort((a, b) => b.score - a.score);

    // Apply Context Budget limit
    const budgeted: MemoryQueryResult[] = [];
    let accumulatedChars = 0;

    for (const item of relevant) {
      if (budgeted.length >= limit) break;
      if (accumulatedChars + item.document.length > maxChars && budgeted.length > 0) {
        break; // Context budget exhausted
      }
      budgeted.push(item);
      accumulatedChars += item.document.length;
    }

    this.logger.debug(
      `Vector search for "${cleanQuery.substring(0, 40)}": found ${relevant.length} relevant memories (threshold: ${minScore}), returning ${budgeted.length}`,
    );

    return budgeted;
  }

  /**
   * Delete a specific memory by ID
   */
  async delete(userId: string, memoryId: string): Promise<boolean> {
    const userEntries = this.store.get(userId) || [];
    const index = userEntries.findIndex((e) => e.id === memoryId);
    if (index === -1) return false;

    userEntries.splice(index, 1);
    this.saveToDisk();
    this.logger.log(`Deleted vector memory ${memoryId} for user ${userId}`);
    return true;
  }

  /**
   * Delete memories matching query text
   */
  async deleteByQuery(userId: string, queryText: string): Promise<number> {
    const results = await this.query(userId, queryText, { minRelevance: 0.85, limit: 5 });
    let deletedCount = 0;
    for (const item of results) {
      if (await this.delete(userId, item.id)) {
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * Query all memories for user
   */
  async getAll(userId: string): Promise<MemoryQueryResult[]> {
    const userEntries = this.store.get(userId) || [];
    return userEntries.map((e) => ({
      id: e.id,
      document: e.document,
      type: e.type,
      metadata: e.metadata,
      score: 1.0,
    }));
  }

  /**
   * Retrieve statistics by memory type
   */
  getStats(userId: string): {
    totalMemories: number;
    byType: Record<string, number>;
    storageLocation: string;
  } {
    const userEntries = this.store.get(userId) || [];
    const byType: Record<string, number> = {};

    userEntries.forEach((e) => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });

    return {
      totalMemories: userEntries.length,
      byType,
      storageLocation: this.storagePath,
    };
  }

  /**
   * Format memories cleanly for LLM system prompt context
   */
  formatForPrompt(results: MemoryQueryResult[]): string {
    if (results.length === 0) return '';
    const lines = ['[LONG-TERM CONTEXT]'];
    results.forEach((r) => {
      lines.push(`- [${r.type}] ${r.document} (relevance: ${Math.round(r.score * 100)}%)`);
    });
    return lines.join('\n');
  }
}
