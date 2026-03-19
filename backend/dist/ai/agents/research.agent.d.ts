/**
 * Research Agent - Handles research and information retrieval
 *
 * Capabilities:
 * - Web search (when integrated)
 * - Document research
 * - Knowledge base queries
 * - Information synthesis
 */
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';
import { RAGService } from '../memory/rag.service';
export declare class ResearchAgent {
    private prisma;
    private aiva;
    private ragService;
    private readonly logger;
    readonly name = "Research Agent";
    readonly description = "Conducts research - information retrieval, knowledge base queries, and synthesis";
    readonly tools: string[];
    constructor(prisma: PrismaService, aiva: AIVAService, ragService: RAGService);
    execute(userId: string, input: string, parameters: Record<string, unknown>, context: any): Promise<ResearchAgentResult>;
    private searchKnowledge;
    private summarizeContent;
    private findRelated;
    private compareDocuments;
    private synthesizeResults;
}
export interface ResearchAgentResult {
    success: boolean;
    response: string;
    vectorResults?: any[];
    documents?: any[];
    relatedItems?: any[];
    summary?: string;
    comparison?: string;
    toolCalls: any[];
    context: Record<string, unknown>;
    conversationId: string | null;
}
//# sourceMappingURL=research.agent.d.ts.map