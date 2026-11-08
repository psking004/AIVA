/**
 * Local Email Provider
 *
 * Stores and manages local drafts, simulated internal inbox, and Prisma records.
 * Explicitly marks all items as LOCAL and reports 'DRAFT_SAVED' rather than 'Email sent'.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  EmailProvider,
  EmailMessageInput,
  EmailMessageOutput,
  EmailProviderStatus,
  EmailSendResult,
} from './email-provider.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LocalEmailProvider implements EmailProvider {
  readonly name = 'LOCAL' as const;
  private readonly logger = new Logger(LocalEmailProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string): Promise<EmailProviderStatus> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    return {
      connected: true,
      provider: 'LOCAL',
      accountEmail: account?.email || 'local@aiva.internal',
    };
  }

  async listMessages(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<EmailMessageOutput[]> {
    const limit = options?.limit ?? 10;
    const account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    if (!account) return [];

    const emails = await this.prisma.email.findMany({
      where: {
        accountId: account.id,
        ...(options?.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    return emails.map((e) => ({
      id: e.id,
      provider: 'LOCAL',
      messageId: e.messageId,
      threadId: e.threadId || undefined,
      from: e.from,
      to: e.to,
      cc: e.cc,
      subject: e.subject,
      body: e.body,
      receivedAt: e.receivedAt,
      isRead: e.isRead,
      isStarred: e.isStarred,
      labels: e.labels,
    }));
  }

  async getMessage(userId: string, messageId: string): Promise<EmailMessageOutput | null> {
    const email = await this.prisma.email.findFirst({
      where: {
        OR: [{ id: messageId }, { messageId }],
        account: { userId },
      },
    });

    if (!email) return null;

    return {
      id: email.id,
      provider: 'LOCAL',
      messageId: email.messageId,
      threadId: email.threadId || undefined,
      from: email.from,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      body: email.body,
      receivedAt: email.receivedAt,
      isRead: email.isRead,
      isStarred: email.isStarred,
      labels: email.labels,
    };
  }

  async searchMessages(userId: string, query: string, limit: number = 10): Promise<EmailMessageOutput[]> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    if (!account) return [];

    const emails = await this.prisma.email.findMany({
      where: {
        accountId: account.id,
        OR: [
          { subject: { contains: query, mode: 'insensitive' } },
          { body: { contains: query, mode: 'insensitive' } },
          { from: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    return emails.map((e) => ({
      id: e.id,
      provider: 'LOCAL',
      messageId: e.messageId,
      threadId: e.threadId || undefined,
      from: e.from,
      to: e.to,
      cc: e.cc,
      subject: e.subject,
      body: e.body,
      receivedAt: e.receivedAt,
      isRead: e.isRead,
      isStarred: e.isStarred,
      labels: e.labels,
    }));
  }

  async sendMessage(userId: string, input: EmailMessageInput): Promise<EmailSendResult> {
    this.logger.log(`Saving local email draft: "${input.subject}" to ${input.to.join(', ')}`);

    let account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    if (!account) {
      account = await this.prisma.emailAccount.create({
        data: {
          userId,
          email: `${userId}@aiva.local`,
          provider: 'local',
          accessToken: 'local-token',
          refreshToken: 'local-refresh-token',
          tokenExpiry: new Date(Date.now() + 864000000),
          isActive: true,
        },
      });
    }

    const messageId = `local_${uuidv4()}`;
    const email = await this.prisma.email.create({
      data: {
        accountId: account.id,
        messageId,
        threadId: input.threadId || `thread_${uuidv4().substring(0, 8)}`,
        subject: input.subject,
        from: account.email,
        to: input.to,
        cc: input.cc || [],
        bcc: input.bcc || [],
        body: input.body,
        receivedAt: new Date(),
        isRead: true,
        labels: ['DRAFT', 'LOCAL'],
      },
    });

    return {
      success: true,
      provider: 'LOCAL',
      messageId: email.messageId,
      threadId: email.threadId || undefined,
      status: 'DRAFT_SAVED',
      confirmation: `Email saved to local AIVA storage (id: ${email.messageId}). External SMTP dispatch requires Gmail OAuth connection.`,
    };
  }

  async replyMessage(
    userId: string,
    messageId: string,
    replyBody: string,
  ): Promise<EmailSendResult> {
    const parent = await this.getMessage(userId, messageId);
    if (!parent) {
      throw new Error(`Cannot reply: Message ${messageId} not found in local email store.`);
    }

    return this.sendMessage(userId, {
      to: [parent.from],
      subject: parent.subject.startsWith('Re:') ? parent.subject : `Re: ${parent.subject}`,
      body: replyBody,
      threadId: parent.threadId,
      inReplyTo: parent.messageId,
    });
  }

  async markAsRead(_userId: string, messageId: string): Promise<boolean> {
    try {
      await this.prisma.email.updateMany({
        where: {
          OR: [{ id: messageId }, { messageId }],
        },
        data: { isRead: true },
      });
      return true;
    } catch {
      return false;
    }
  }
}
