/**
 * EmailService - Email account and message management
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EmailService {
  constructor(private prisma: PrismaService) {}

  async connectAccount(userId: string, data: ConnectEmailDto) {
    return this.prisma.emailAccount.create({
      data: {
        userId,
        email: data.email,
        provider: data.provider,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiry: new Date(data.tokenExpiry),
        isActive: true,
      },
    });
  }

  async getAccounts(userId: string) {
    return this.prisma.emailAccount.findMany({
      where: { userId },
    });
  }

  async syncEmails(accountId: string, emails: SyncEmailDto[]) {
    const results = [];

    for (const email of emails) {
      const existing = await this.prisma.email.findUnique({
        where: { messageId: email.messageId },
      });

      if (existing) {
        results.push(await this.prisma.email.update({
          where: { id: existing.id },
          data: { ...email },
        }));
      } else {
        results.push(await this.prisma.email.create({
          data: {
            accountId,
            ...email,
          },
        }));
      }
    }

    await this.prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncedAt: new Date() },
    });

    return results;
  }

  async getEmails(accountId: string, filters: EmailFilters = {}) {
    return this.prisma.email.findMany({
      where: {
        accountId,
        isRead: filters.isRead !== undefined ? filters.isRead : undefined,
        OR: filters.search ? [
          { subject: { contains: filters.search, mode: 'insensitive' } },
          { from: { contains: filters.search, mode: 'insensitive' } },
        ] : undefined,
      },
      orderBy: { receivedAt: 'desc' },
      take: filters.limit || 50,
    });
  }

  async markAsRead(userId: string, emailId: string) {
    return this.prisma.email.update({
      where: { id: emailId },
      data: { isRead: true },
    });
  }

  async markAsStarred(userId: string, emailId: string) {
    return this.prisma.email.update({
      where: { id: emailId },
      data: { isStarred: true },
    });
  }

  async deleteEmail(userId: string, emailId: string) {
    return this.prisma.email.delete({
      where: { id: emailId },
    });
  }
}

interface ConnectEmailDto {
  email: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string;
}

interface SyncEmailDto {
  messageId: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  body: string;
  htmlBody?: string;
  receivedAt: Date;
  labels?: string[];
  attachments?: any[];
}

interface EmailFilters {
  search?: string;
  isRead?: boolean;
  limit?: number;
}
