/**
 * TasksService - Task CRUD operations
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateTaskDto) {
    return this.prisma.task.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        tags: data.tags || [],
      },
    });
  }

  async findAll(userId: string, filters: TaskFilters) {
    return this.prisma.task.findMany({
      where: {
        userId,
        status: filters.status,
        priority: filters.priority,
        parentId: filters.parentId,
      },
      orderBy: { [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc' },
      include: { subtasks: true },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.task.findFirst({
      where: { id, userId },
      include: { subtasks: true, parent: true },
    });
  }

  async update(userId: string, id: string, data: UpdateTaskDto) {
    return this.prisma.task.update({
      where: { id, userId },
      data,
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.task.delete({
      where: { id, userId },
    });
  }

  async bulkUpdate(userId: string, ids: string[], data: UpdateTaskDto) {
    return this.prisma.task.updateMany({
      where: { id: { in: ids }, userId },
      data,
    });
  }
}

interface CreateTaskDto {
  title: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate?: string;
  tags?: string[];
}

interface TaskFilters {
  status?: string;
  priority?: string;
  parentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  completedAt?: Date;
  tags?: string[];
}
