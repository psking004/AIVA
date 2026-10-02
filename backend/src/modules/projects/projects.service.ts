/**
 * ProjectsService - Project Tracker CRUD and AI Analysis operations
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ProjectStatus, Priority } from '@prisma/client';

export interface CreateProjectDto {
  title: string;
  description?: string;
  priority?: Priority;
  status?: ProjectStatus;
  deadline?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateProjectDto {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: Priority;
  progress?: number;
  deadline?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        userId,
        title: data.title,
        description: data.description || null,
        priority: data.priority || 'MEDIUM',
        status: data.status || 'ACTIVE',
        deadline: data.deadline ? new Date(data.deadline) : null,
        tags: data.tags || [],
        metadata: (data.metadata || {}) as any,
      },
      include: { tasks: true },
    });
  }

  async findAll(userId: string, filters: { status?: ProjectStatus; priority?: Priority } = {}) {
    return this.prisma.project.findMany({
      where: {
        userId,
        ...(filters.status !== undefined && { status: filters.status }),
        ...(filters.priority !== undefined && { priority: filters.priority }),
      },
      orderBy: { createdAt: 'desc' },
      include: { tasks: true },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.project.findFirst({
      where: { id, userId },
      include: { tasks: true },
    });
  }

  async update(userId: string, id: string, data: UpdateProjectDto) {
    const updateData: any = { ...data };
    if (data.deadline) {
      updateData.deadline = new Date(data.deadline);
    }
    return this.prisma.project.update({
      where: { id, userId },
      data: updateData,
      include: { tasks: true },
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.project.delete({
      where: { id, userId },
    });
  }

  async linkTask(userId: string, projectId: string, taskId: string) {
    return this.prisma.task.update({
      where: { id: taskId, userId },
      data: { projectId },
    });
  }

  async unlinkTask(userId: string, taskId: string) {
    return this.prisma.task.update({
      where: { id: taskId, userId },
      data: { projectId: null },
    });
  }
}
