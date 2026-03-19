/**
 * NotesService - Notes CRUD operations
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateNoteDto) {
    return this.prisma.note.create({
      data: {
        userId,
        title: data.title,
        content: data.content,
        tags: data.tags || [],
        folderId: data.folderId,
      },
    });
  }

  async findAll(userId: string, filters: NoteFilters = {}) {
    return this.prisma.note.findMany({
      where: {
        userId,
        isArchived: filters.isArchived ?? false,
        folderId: filters.folderId,
        OR: filters.search ? [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { content: { contains: filters.search, mode: 'insensitive' } },
        ] : undefined,
      },
      include: { folder: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.note.findFirst({
      where: { id, userId },
      include: { folder: true, replies: true },
    });
  }

  async update(userId: string, id: string, data: UpdateNoteDto) {
    return this.prisma.note.update({
      where: { id, userId },
      data,
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.note.delete({
      where: { id, userId },
    });
  }

  async archive(userId: string, id: string) {
    return this.prisma.note.update({
      where: { id, userId },
      data: { isArchived: true },
    });
  }

  async pin(userId: string, id: string) {
    return this.prisma.note.update({
      where: { id, userId },
      data: { isPinned: true },
    });
  }
}

interface CreateNoteDto {
  title: string;
  content: string;
  tags?: string[];
  folderId?: string;
}

interface NoteFilters {
  search?: string;
  folderId?: string;
  isArchived?: boolean;
}

interface UpdateNoteDto {
  title?: string;
  content?: string;
  tags?: string[];
  folderId?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}
