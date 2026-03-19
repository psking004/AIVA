"use strict";
/**
 * Research Agent - Handles research and information retrieval
 *
 * Capabilities:
 * - Web search (when integrated)
 * - Document research
 * - Knowledge base queries
 * - Information synthesis
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
var ResearchAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchAgent = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const aiva_service_1 = require("../aiva.service");
const rag_service_1 = require("../memory/rag.service");
let ResearchAgent = ResearchAgent_1 = class ResearchAgent {
    prisma;
    aiva;
    ragService;
    logger = new common_1.Logger(ResearchAgent_1.name);
    name = 'Research Agent';
    description = 'Conducts research - information retrieval, knowledge base queries, and synthesis';
    tools = ['searchKnowledge', 'searchDocuments', 'summarizeContent', 'findRelated'];
    constructor(prisma, aiva, ragService) {
        this.prisma = prisma;
        this.aiva = aiva;
        this.ragService = ragService;
    }
    async execute(userId, input, parameters, context) {
        this.logger.debug(`Research Agent executing for user ${userId}: ${input}`);
        const action = parameters.action || 'search';
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
    async searchKnowledge(userId, query, parameters) {
        const limit = parseInt(parameters.limit || '10');
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
        const synthesizedResponse = await this.synthesizeResults(userId, query, vectorResults, documents);
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
    async summarizeContent(userId, parameters) {
        const documentId = parameters.documentId;
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
        const summary = await this.aiva.summarize(userId, document.metadata || 'No content', 'document');
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
    async findRelated(userId, parameters) {
        const sourceId = parameters.sourceId;
        const type = parameters.type || 'document';
        // Get source content
        let sourceContent;
        if (type === 'document') {
            const doc = await this.prisma.document.findFirst({ where: { id: sourceId, userId } });
            sourceContent = doc ? (doc.title + ' ' + JSON.stringify(doc.metadata)) : '';
        }
        else {
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
    async compareDocuments(userId, parameters) {
        const documentIds = parameters.documentIds;
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
    async synthesizeResults(userId, query, vectorResults, documents) {
        const resultsText = [
            'Vector search results:',
            ...vectorResults.map((r, i) => `${i + 1}. Score: ${r.score}, Content: ${r.content?.substring(0, 100)}`),
            '\nDocuments:',
            ...documents.map((d, i) => `${i + 1}. ${d.title}`),
        ].join('\n');
        const synthesis = await this.aiva.summarize(userId, resultsText, 'research results');
        return `Research results for "${query}":\n\n${synthesis}`;
    }
};
exports.ResearchAgent = ResearchAgent;
exports.ResearchAgent = ResearchAgent = ResearchAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        aiva_service_1.AIVAService,
        rag_service_1.RAGService])
], ResearchAgent);
//# sourceMappingURL=research.agent.js.map