"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RAGService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../database/prisma.service");
const redis_service_1 = require("../../cache/redis.service");
// In production, would use actual vector DB (Pinecone, Weaviate, Chroma)
// This is a simplified in-memory implementation for the prototype
let RAGService = RAGService_1 = class RAGService {
    prisma;
    configService;
    redis;
    logger = new common_1.Logger(RAGService_1.name);
    CHUNK_SIZE = 500;
    CHUNK_OVERLAP = 50;
    // In-memory vector store for prototype (replace with Pinecone in production)
    vectorStore = new Map();
    constructor(prisma, configService, redis) {
        this.prisma = prisma;
        this.configService = configService;
        this.redis = redis;
        this.logger.log('RAG Service initialized');
        this.logger.warn('Using in-memory vector store - replace with Pinecone/Weaviate in production');
    }
    /**
     * Ingest a document - chunk, embed, and store
     */
    async ingestDocument(userId, documentId, content, metadata = {}) {
        this.logger.log(`Ingesting document ${documentId} for user ${userId}`);
        // Chunk the content
        const chunks = this.chunkText(content, this.CHUNK_SIZE, this.CHUNK_OVERLAP);
        // Generate embeddings and store
        const vectorDocs = [];
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
    async search(userId, query, limit = 10) {
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
    async findSimilar(userId, sourceContent, limit = 5) {
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
    chunkText(text, chunkSize, overlap) {
        const chunks = [];
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
    async generateEmbedding(text) {
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
    cosineSimilarity(a, b) {
        const dot = a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
        const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
        const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
        return dot / (normA * normB);
    }
    /**
     * Simple hash function
     */
    hash(str) {
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
    async deleteDocumentVectors(userId, documentId) {
        const vectors = this.vectorStore.get(userId) || [];
        const filtered = vectors.filter((v) => v.documentId !== documentId);
        this.vectorStore.set(userId, filtered);
    }
    /**
     * Get vector statistics
     */
    getStats(userId) {
        const vectors = this.vectorStore.get(userId) || [];
        const docCount = new Set(vectors.map((v) => v.documentId)).size;
        return {
            totalChunks: vectors.length,
            documentCount: docCount,
            userId,
        };
    }
};
exports.RAGService = RAGService;
exports.RAGService = RAGService = RAGService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], RAGService);
//# sourceMappingURL=rag.service.js.map