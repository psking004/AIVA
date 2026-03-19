/**
 * RAG (Retrieval Augmented Generation) Service
 *
 * Handles:
 * - Document chunking
 * - Embedding generation
 * - Vector storage
 * - Semantic search
 * - Context retrieval
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../cache/redis.service';

// In production, would use actual vector DB (Pinecone, Weaviate, Chroma)
// This is a simplified in-memory implementation for the prototype

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);
  private readonly CHUNK_SIZE = 500;
  private readonly CHUNK_OVERLAP = 50;

  // In-memory vector store for prototype (replace with Pinecone in production)
  private vectorStore: Map<string, VectorDocument[]> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private redis: RedisService,
  ) {
    this.logger.log('RAG Service initialized');
    this.logger.warn('Using in-memory vector store - replace with Pinecone/Weaviate in production');
  }

  /**
   * Ingest a document - chunk, embed, and store
   */
  async ingestDocument(
    userId: string,
    documentId: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    this.logger.log(`Ingesting document ${documentId} for user ${userId}`);

    // Chunk the content
    const chunks = this.chunkText(content, this.CHUNK_SIZE, this.CHUNK_OVERLAP);

    // Generate embeddings and store
    const vectorDocs: VectorDocument[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // In production, call actual embedding API
      const embedding = await this.generateEmbedding(chunk);

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

    // Store in vector store
    const userVectors = this.vectorStore.get(userId) || [];
    userVectors.push(...vectorDocs);
    this.vectorStore.set(userId, userVectors);

    // Update document status
    await this.prisma.document.update({
      where: { id: documentId },
      data: { isProcessed: true },
    });

    this.logger.log(`Created ${chunks.length} chunks for document ${documentId}`);
  }

  /**
   * Search for relevant content
   */
  async search(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    this.logger.debug(`Searching for "${query}" for user ${userId}`);

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Get user's vectors
    const vectors = this.vectorStore.get(userId) || [];

    // Calculate cosine similarity and sort
    const results = vectors
      .map((doc) => ({
        ...doc,
        score: this.cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Cache results
    const cacheKey = `search:${userId}:${this.hash(query)}`;
    await this.redis.set(cacheKey, JSON.stringify(results), 300); // 5 min cache

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
    const embedding = await this.generateEmbedding(sourceContent);
    const vectors = this.vectorStore.get(userId) || [];

    return vectors
      .map((doc) => ({
        id: doc.id,
        documentId: doc.documentId,
        content: doc.content,
        score: this.cosineSimilarity(embedding, doc.embedding),
        metadata: doc.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Chunk text into smaller pieces
   */
  private chunkText(
    text: string,
    chunkSize: number,
    overlap: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunkEnd = end;

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        if (lastPeriod > start) {
          chunkEnd = lastPeriod + 1;
        }
      }

      chunks.push(text.substring(start, chunkEnd).trim());
      start = chunkEnd - overlap;
    }

    return chunks;
  }

  /**
   * Generate embedding for text (placeholder - use real API in production)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // In production, call OpenAI/Anthropic embedding API
    // For prototype, return a pseudo-embedding based on text hash
    const hash = this.hash(text);
    const embedding = new Array(1536).fill(0).map((_, i) => {
      return (hash % (i + 1)) / (i + 1);
    });

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / norm);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (normA * normB);
  }

  /**
   * Simple hash function
   */
  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Delete vectors for a document
   */
  async deleteDocumentVectors(userId: string, documentId: string): Promise<void> {
    const vectors = this.vectorStore.get(userId) || [];
    const filtered = vectors.filter((v) => v.documentId !== documentId);
    this.vectorStore.set(userId, filtered);
  }

  /**
   * Get vector statistics
   */
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
