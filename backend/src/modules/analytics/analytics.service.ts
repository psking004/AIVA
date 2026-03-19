/**
 * AnalyticsService - Dashboard and analytics
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const [
      tasks,
      notes,
      documents,
      events,
      conversations,
      activity,
    ] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.note.findMany({
        where: { userId, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.document.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          startTime: { gte: new Date() },
        },
        orderBy: { startTime: 'asc' },
        take: 10,
      }),
      this.prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.activityLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    // Calculate stats
    const taskStats = await this.prisma.task.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
    });

    return {
      recentTasks: tasks,
      recentNotes: notes,
      recentDocuments: documents,
      upcomingEvents: events,
      recentConversations: conversations,
      recentActivity: activity,
      stats: {
        tasks: taskStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
        totalNotes: await this.prisma.note.count({ where: { userId, isArchived: false } }),
        totalDocuments: await this.prisma.document.count({ where: { userId } }),
        totalConversations: await this.prisma.conversation.count({ where: { userId } }),
      },
    };
  }

  async getActivitySummary(userId: string, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const activity = await this.prisma.activityLog.groupBy({
      by: ['action'],
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    return {
      period: `${days} days`,
      activity,
      totalActions: activity.reduce((sum, a) => sum + a._count, 0),
    };
  }

  async getProductivityStats(userId: string, startDate: Date, endDate: Date) {
    const [
      completedTasks,
      notesCreated,
      documentsProcessed,
      eventsAttended,
      conversations,
    ] = await Promise.all([
      this.prisma.task.count({
        where: {
          userId,
          status: 'COMPLETED',
          completedAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.note.count({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.document.count({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.calendarEvent.count({
        where: {
          userId,
          startTime: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.conversation.count({
        where: {
          userId,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return {
      period: { start: startDate, end: endDate },
      tasksCompleted: completedTasks,
      notesCreated,
      documentsProcessed,
      eventsAttended,
      conversationsStarted: conversations,
    };
  }
}
