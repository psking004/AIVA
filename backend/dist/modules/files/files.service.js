"use strict";
/**
 * FilesService - File storage operations
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
var FilesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const rag_service_1 = require("../../ai/memory/rag.service");
let FilesService = FilesService_1 = class FilesService {
    prisma;
    ragService;
    logger = new common_1.Logger(FilesService_1.name);
    constructor(prisma, ragService) {
        this.prisma = prisma;
        this.ragService = ragService;
    }
    async upload(userId, file) {
        const document = await this.prisma.document.create({
            data: {
                userId,
                title: file.title || file.fileName,
                fileName: file.fileName,
                fileType: file.fileType,
                fileSize: BigInt(file.fileSize),
                storagePath: file.storagePath,
                mimeType: file.mimeType,
                checksum: file.checksum,
                tags: file.tags || [],
                metadata: file.metadata || {},
            },
        });
        // Process document for RAG
        if (file.content) {
            await this.ragService.ingestDocument(userId, document.id, file.content, {
                fileName: file.fileName,
                uploadedAt: new Date(),
            });
        }
        return document;
    }
    async findAll(userId, filters = {}) {
        return this.prisma.document.findMany({
            where: {
                userId,
                fileType: filters.fileType,
                isProcessed: filters.isProcessed,
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(userId, id) {
        return this.prisma.document.findFirst({
            where: { id, userId },
        });
    }
    async remove(userId, id) {
        await this.ragService.deleteDocumentVectors(userId, id);
        return this.prisma.document.delete({
            where: { id, userId },
        });
    }
    async search(userId, query) {
        return this.prisma.document.findMany({
            where: {
                userId,
                OR: [
                    { title: { contains: query, mode: 'insensitive' } },
                    { tags: { has: query.toLowerCase() } },
                ],
            },
        });
    }
};
exports.FilesService = FilesService;
exports.FilesService = FilesService = FilesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rag_service_1.RAGService])
], FilesService);
//# sourceMappingURL=files.service.js.map