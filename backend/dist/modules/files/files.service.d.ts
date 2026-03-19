/**
 * FilesService - File storage operations
 */
import { PrismaService } from '../../database/prisma.service';
import { RAGService } from '../../ai/memory/rag.service';
export declare class FilesService {
    private prisma;
    private ragService;
    private readonly logger;
    constructor(prisma: PrismaService, ragService: RAGService);
    upload(userId: string, file: FileUploadDto): Promise<any>;
    findAll(userId: string, filters?: FileFilters): Promise<any>;
    findOne(userId: string, id: string): Promise<any>;
    remove(userId: string, id: string): Promise<any>;
    search(userId: string, query: string): Promise<any>;
}
interface FileUploadDto {
    title?: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    storagePath: string;
    mimeType: string;
    checksum: string;
    content?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}
interface FileFilters {
    fileType?: string;
    isProcessed?: boolean;
}
export {};
//# sourceMappingURL=files.service.d.ts.map