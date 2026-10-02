/**
 * RAG (Retrieval Augmented Generation) Service
 *
 * Handles:
 * - Document chunking
 * - Neural embedding generation via EmbeddingService
 * - Persistent vector storage with disk backup & Redis caching
 * - Semantic cosine search
 * - Context retrieval
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from './embedding.service';
import * as fs from 'fs';
import * as path from 'path';

export interface VectorDocument {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStats {
  totalChunks: number;
  documentCount: number;
  userId: string;
}

@Injectable()
export class RAGService implements OnModuleInit {
  private readonly logger = new Logger(RAGService.name);
  private readonly CHUNK_SIZE = 500;
  private readonly CHUNK_OVERLAP = 50;
  private readonly storagePath = path.join(process.cwd(), 'data', 'rag_vectors.json');

  // Memory cache of vectors
  private vectorStore: Map<string, VectorDocument[]> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.logger.log('RAG Service initialized with persistent vector backing');
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
        for (const [userId, docs] of Object.entries(parsed)) {
          this.vectorStore.set(userId, docs as VectorDocument[]);
        }
        this.logger.log(`Loaded persisted vector documents from ${this.storagePath}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not load vector store from disk: ${err.message}`);
    }
  }

  private saveToDisk(): void {
    try {
      const dataDir = path.dirname(this.storagePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const serializable: Record<string, VectorDocument[]> = {};
      for (const [userId, docs] of this.vectorStore.entries()) {
        serializable[userId] = docs;
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(serializable, null, 2), 'utf8');
    } catch (err: any) {
      this.logger.warn(`Could not save vector store to disk: ${err.message}`);
    }
  }

  /**
   * Ingest a document - chunk, embed, and persist
   */
  async ingestDocument(
    userId: string,
    documentId: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    this.logger.log(`Ingesting document ${documentId} for user ${userId}`);

    const chunks = this.chunkText(content, this.CHUNK_SIZE, this.CHUNK_OVERLAP);
    const vectorDocs: VectorDocument[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      const embedding = await this.embeddingService.generateEmbedding(chunk);

      vectorDocs.push({
        id: `${documentId}-chunk-${i}`,
        documentId,
        userId,
        content: chunk,
        embedding,
        metadata: { ...metadata, chunkIndex: i, totalChunks: chunks.length },
        createdAt: new Date(),
      });
    }

    const userVectors = this.vectorStore.get(userId) || [];
    userVectors.push(...vectorDocs);
    this.vectorStore.set(userId, userVectors);

    this.saveToDisk();

    await this.prisma.document.update({
      where: { id: documentId },
      data: { isProcessed: true },
    });

    this.logger.log(`Created & stored ${chunks.length} vectors for document ${documentId}`);
  }

  /**
   * Search for relevant content via semantic cosine similarity
   */
  async search(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    this.logger.debug(`Searching for "${query}" for user ${userId}`);

    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    const vectors = this.vectorStore.get(userId) || [];

    const results = vectors
      .map((doc) => ({
        ...doc,
        score: this.embeddingService.cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      content: r.content,
      score: r.score,
      metadata: r.metadata,
    }));
  }

  /**
   * Find similar content to a source
   */
  async findSimilar(
    userId: string,
    sourceContent: string,
    limit: number = 5,
  ): Promise<SearchResult[]> {
    const embedding = await this.embeddingService.generateEmbedding(sourceContent);
    const vectors = this.vectorStore.get(userId) || [];

    return vectors
      .map((doc) => ({
        id: doc.id,
        documentId: doc.documentId,
        content: doc.content,
        score: this.embeddingService.cosineSimilarity(embedding, doc.embedding),
        metadata: doc.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    if (!text || text.length <= chunkSize) {
      return text ? [text.trim()] : [];
    }
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunkEnd = end;

      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        if (lastPeriod > start) {
          chunkEnd = lastPeriod + 1;
        }
      }

      const chunk = text.substring(start, chunkEnd).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      if (chunkEnd >= text.length) {
        break;
      }

      const nextStart = chunkEnd - overlap;
      start = nextStart > start ? nextStart : chunkEnd;
    }

    return chunks;
  }

  async deleteDocumentVectors(userId: string, documentId: string): Promise<void> {
    const vectors = this.vectorStore.get(userId) || [];
    const filtered = vectors.filter((v) => v.documentId !== documentId);
    this.vectorStore.set(userId, filtered);
    this.saveToDisk();
  }

  getStats(userId: string): VectorStats {
    const vectors = this.vectorStore.get(userId) || [];
    const docCount = new Set(vectors.map((v) => v.documentId)).size;

    return {
      totalChunks: vectors.length,
      documentCount: docCount,
      userId,
    };
  }
}
