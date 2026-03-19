/**
 * Research Agent - Handles research and information retrieval
 *
 * Capabilities:
 * - Web search (when integrated)
 * - Document research
 * - Knowledge base queries
 * - Information synthesis
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';
import { RAGService } from '../memory/rag.service';

@Injectable()
export class ResearchAgent {
  private readonly logger = new Logger(ResearchAgent.name);
  readonly name = 'Research Agent';
  readonly description = 'Conducts research - information retrieval, knowledge base queries, and synthesis';
  readonly tools = ['searchKnowledge', 'searchDocuments', 'summarizeContent', 'findRelated'];

  constructor(
    private prisma: PrismaService,
    private aiva: AIVAService,
    private ragService: RAGService,
  ) {}

  async execute(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
    context: any,
  ): Promise<ResearchAgentResult> {
    this.logger.debug(`Research Agent executing for user ${userId}: ${input}`);

    const action = parameters.action as string || 'search';

    switch (action) {
      case 'search':
        return this.searchKnowledge(userId, input, parameters);
      case 'summarize':
        return this.summarizeContent(userId, parameters);
      case 'findRelated':
        return this.findRelated(userId, parameters);
      case 'compare':
        return this.compareDocuments(userId, parameters);
      default:
        return this.searchKnowledge(userId, input, parameters);
    }
  }

  private async searchKnowledge(
    userId: string,
    query: string,
    parameters: Record<string, unknown>,
  ): Promise<ResearchAgentResult> {
    const limit = parseInt((parameters.limit as string) || '10');

    // Search vector database for relevant content
    const vectorResults = await this.ragService.search(userId, query, limit);

    // Also search documents
    const documents = await this.prisma.document.findMany({
      where: {
        userId,
        isProcessed: true,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { tags: { has: query.toLowerCase() } },
        ],
      },
      take: limit,
    });

    // Synthesize results
    const synthesizedResponse = await this.synthesizeResults(
      userId,
      query,
      vectorResults,
      documents,
    );

    return {
      success: true,
      response: synthesizedResponse,
      vectorResults,
      documents,
      toolCalls: [{ name: 'searchKnowledge', args: { query, limit } }],
      context: { resultCount: vectorResults.length + documents.length },
      conversationId: null,
    };
  }

  private async summarizeContent(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<ResearchAgentResult> {
    const documentId = parameters.documentId as string;

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) {
      return {
        success: false,
        response: 'Document not found',
        toolCalls: [],
        context: {},
        conversationId: null,
      };
    }

    // Generate summary using AI
    const summary = await this.aiva.summarize(userId, document.metadata as string || 'No content', 'document');

    return {
      success: true,
      response: `Summary of "${document.title}":\n\n${summary}`,
      summary,
      document,
      toolCalls: [{ name: 'summarizeContent', args: { documentId } }],
      context: { documentId },
      conversationId: null,
    };
  }

  private async findRelated(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<ResearchAgentResult> {
    const sourceId = parameters.sourceId as string;
    const type = parameters.type as string || 'document';

    // Get source content
    let sourceContent: string;
    if (type === 'document') {
      const doc = await this.prisma.document.findFirst({ where: { id: sourceId, userId } });
      sourceContent = doc ? (doc.title + ' ' + JSON.stringify(doc.metadata)) : '';
    } else {
      const note = await this.prisma.note.findFirst({ where: { id: sourceId, userId } });
      sourceContent = note ? (note.title + ' ' + note.content) : '';
    }

    // Find related content via vector search
    const related = await this.ragService.findSimilar(userId, sourceContent, 5);

    return {
      success: true,
      response: `Found ${related.length} related items`,
      relatedItems: related,
      toolCalls: [{ name: 'findRelated', args: { sourceId, type } }],
      context: { relatedCount: related.length },
      conversationId: null,
    };
  }

  private async compareDocuments(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<ResearchAgentResult> {
    const documentIds = parameters.documentIds as string[];

    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, userId },
    });

    if (documents.length < 2) {
      return {
        success: false,
        response: 'Please provide at least 2 documents to compare',
        toolCalls: [],
        context: {},
        conversationId: null,
      };
    }

    // Compare using AI
    const docText = documents.map((d, i) => `${i + 1}. ${d.title}: ${JSON.stringify(d.metadata)}`).join('\n');

    const comparison = await this.aiva.executeTool(userId, 'summarize', {
      content: `Compare these documents and highlight key similarities and differences:\n\n${docText}`,
    });

    return {
      success: true,
      response: `Comparison:\n\n${comparison}`,
      documents,
      comparison,
      toolCalls: [{ name: 'compareDocuments', args: { count: documents.length } }],
      context: { comparedCount: documents.length },
      conversationId: null,
    };
  }

  private async synthesizeResults(
    userId: string,
    query: string,
    vectorResults: any[],
    documents: any[],
  ): Promise<string> {
    const resultsText = [
      'Vector search results:',
      ...vectorResults.map((r, i) => `${i + 1}. Score: ${r.score}, Content: ${r.content?.substring(0, 100)}`),
      '\nDocuments:',
      ...documents.map((d, i) => `${i + 1}. ${d.title}`),
    ].join('\n');

    const synthesis = await this.aiva.summarize(userId, resultsText, 'research results');

    return `Research results for "${query}":\n\n${synthesis}`;
  }
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
