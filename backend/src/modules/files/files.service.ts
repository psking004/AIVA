/**
 * FilesService - File storage operations
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RAGService } from '../../ai/memory/rag.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private prisma: PrismaService,
    private ragService: RAGService,
  ) {}

  async upload(userId: string, file: FileUploadDto) {
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

  async findAll(userId: string, filters: FileFilters = {}) {
    return this.prisma.document.findMany({
      where: {
        userId,
        fileType: filters.fileType,
        isProcessed: filters.isProcessed,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.document.findFirst({
      where: { id, userId },
    });
  }

  async remove(userId: string, id: string) {
    await this.ragService.deleteDocumentVectors(userId, id);
    return this.prisma.document.delete({
      where: { id, userId },
    });
  }

  async search(userId: string, query: string) {
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
