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
export declare class LongTermMemory {
    private readonly logger;
    private readonly EMBEDDING_DIM;
    /**
     * In-memory store — mimics ChromaDB collection
     * In production: chromadb.PersistentClient(path="./aiva_memory")
     */
    private store;
    constructor();
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
    add(userId: string, document: string, type?: LongTermMemoryEntry['metadata']['type'], additionalMetadata?: Record<string, unknown>): Promise<string>;
    /**
     * Retrieve relevant memories via semantic similarity search
     *
     * Equivalent to ChromaDB:
     *   results = collection.query(
     *     query_texts=["What display settings does the user like?"],
     *     n_results=3
     *   )
     */
    query(userId: string, queryText: string, nResults?: number): Promise<LongTermQueryResult[]>;
    /**
     * Query by metadata type
     */
    queryByType(userId: string, type: LongTermMemoryEntry['metadata']['type'], limit?: number): Promise<LongTermQueryResult[]>;
    /**
     * Delete a specific memory
     */
    delete(userId: string, memoryId: string): Promise<boolean>;
    /**
     * Get all stored memories for a user
     */
    getAll(userId: string): Promise<LongTermQueryResult[]>;
    /**
     * Get memory statistics
     */
    getStats(userId: string): {
        totalMemories: number;
        byType: Record<string, number>;
    };
    /**
     * Format memories for prompt context injection
     */
    formatForPrompt(results: LongTermQueryResult[]): string;
    /**
     * Generate pseudo-embedding for text
     * In production, use: all-MiniLM-L6-v2 (384-dim, fast, local)
     */
    private generateEmbedding;
    /**
     * Cosine similarity between two vectors
     */
    private cosineSimilarity;
}
//# sourceMappingURL=long-term.memory.d.ts.map