/**
 * FilesService - Secure file storage & RAG indexing operations
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RAGService } from '../../ai/memory/rag.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadDir = path.join(process.cwd(), 'storage', 'uploads');

  constructor(
    private prisma: PrismaService,
    private ragService: RAGService,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadBinary(
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported MIME type: ${mimeType}`);
    }

    const sanitizedName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(sanitizedName).toLowerCase();
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const storageKey = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const targetPath = path.join(this.uploadDir, storageKey);

    fs.writeFileSync(targetPath, fileBuffer);

    const document = await this.prisma.document.create({
      data: {
        userId,
        title: sanitizedName,
        fileName: sanitizedName,
        fileType: ext.replace('.', '') || 'bin',
        fileSize: BigInt(fileBuffer.length),
        storagePath: targetPath,
        mimeType: mimeType || 'application/octet-stream',
        checksum,
        metadata: metadata as any,
      },
    });

    // If textual file, ingest for RAG indexing
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const content = fileBuffer.toString('utf8');
      await this.ragService.ingestDocument(userId, document.id, content, {
        fileName: sanitizedName,
        uploadedAt: new Date(),
      });
    }

    return this.serializeDocument(document);
  }

  async findAll(userId: string, filters: { fileType?: string; isProcessed?: boolean } = {}) {
    const docs = await this.prisma.document.findMany({
      where: {
        userId,
        ...(filters.fileType !== undefined && { fileType: filters.fileType }),
        ...(filters.isProcessed !== undefined && { isProcessed: filters.isProcessed }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => this.serializeDocument(d));
  }

  async findOne(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });
    return this.serializeDocument(doc);
  }

  async remove(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, userId },
    });

    if (doc && fs.existsSync(doc.storagePath)) {
      try {
        fs.unlinkSync(doc.storagePath);
      } catch (e: any) {
        this.logger.warn(`Could not delete file ${doc.storagePath}: ${e.message}`);
      }
    }

    await this.ragService.deleteDocumentVectors(userId, id);
    const deleted = await this.prisma.document.delete({
      where: { id, userId },
    });
    return this.serializeDocument(deleted);
  }

  async search(userId: string, query: string) {
    const docs = await this.prisma.document.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { tags: { has: query.toLowerCase() } },
        ],
      },
    });

    return docs.map((d) => this.serializeDocument(d));
  }

  private serializeDocument(doc: any) {
    if (!doc) return null;
    return {
      ...doc,
      fileSize: doc.fileSize != null ? doc.fileSize.toString() : '0',
    };
  }
}
