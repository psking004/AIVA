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
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../cache/redis.service';
export declare class RAGService {
    private prisma;
    private configService;
    private redis;
    private readonly logger;
    private readonly CHUNK_SIZE;
    private readonly CHUNK_OVERLAP;
    private vectorStore;
    constructor(prisma: PrismaService, configService: ConfigService, redis: RedisService);
    /**
     * Ingest a document - chunk, embed, and store
     */
    ingestDocument(userId: string, documentId: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
    /**
     * Search for relevant content
     */
    search(userId: string, query: string, limit?: number): Promise<SearchResult[]>;
    /**
     * Find similar content to a source
     */
    findSimilar(userId: string, sourceContent: string, limit?: number): Promise<SearchResult[]>;
    /**
     * Chunk text into smaller pieces
     */
    private chunkText;
    /**
     * Generate embedding for text (placeholder - use real API in production)
     */
    private generateEmbedding;
    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity;
    /**
     * Simple hash function
     */
    private hash;
    /**
     * Delete vectors for a document
     */
    deleteDocumentVectors(userId: string, documentId: string): Promise<void>;
    /**
     * Get vector statistics
     */
    getStats(userId: string): VectorStats;
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
//# sourceMappingURL=rag.service.d.ts.map