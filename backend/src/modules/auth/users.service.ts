/**
 * UsersService - User management operations
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get user by ID
   */
  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            tasks: true,
            notes: true,
            documents: true,
            conversations: true,
          },
        },
      },
    });
  }

  /**
   * Get user by email
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; avatarUrl?: string; timezone?: string; language?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Get user dashboard stats
   */
  async getDashboardStats(userId: string) {
    const [taskStats, noteStats, documentStats, eventStats] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      }),
      this.prisma.note.count({ where: { userId, isArchived: false } }),
      this.prisma.document.count({ where: { userId } }),
      this.prisma.calendarEvent.count({
        where: { userId, startTime: { gte: new Date() } },
      }),
    ]);

    return {
      tasks: taskStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      notes: noteStats,
      documents: documentStats,
      upcomingEvents: eventStats,
    };
  }

  /**
   * Delete user account
   */
  async deleteAccount(userId: string) {
    // In production, would soft delete or archive data
    await this.prisma.user.delete({
      where: { id: userId },
    });

    this.logger.log(`Account deleted: ${userId}`);
  }
}
