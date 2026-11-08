import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TaskTool {
  private readonly logger = new Logger(TaskTool.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`TaskTool executing: ${action} for user ${userId}`);

    switch (action) {
      case 'create': {
        const title = String(params.title || params.input || 'Untitled Task');
        const description = params.description ? String(params.description) : null;
        const priority = (params.priority as any) || 'MEDIUM';
        const task = await this.prisma.task.create({
          data: {
            userId,
            title,
            description,
            priority,
            dueDate: params.dueDate ? new Date(params.dueDate as string) : null,
            tags: Array.isArray(params.tags) ? params.tags : [],
          },
        });
        return { success: true, action, task };
      }
      case 'list': {
        const limit = typeof params.limit === 'number' ? params.limit : 20;
        const tasks = await this.prisma.task.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return { success: true, action, count: tasks.length, tasks };
      }
      case 'update': {
        const taskId = String(params.taskId || params.id || '');
        const updates = (params.updates as Record<string, unknown>) || {};
        const task = await this.prisma.task.update({
          where: { id: taskId, userId },
          data: updates,
        });
        return { success: true, action, task };
      }
      case 'delete': {
        const taskId = String(params.taskId || params.id || '');
        await this.prisma.task.delete({
          where: { id: taskId, userId },
        });
        return { success: true, action, taskId };
      }
      default:
        return { success: true, action, params };
    }
  }
}
