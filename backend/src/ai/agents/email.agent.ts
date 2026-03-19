/**
 * Email Agent - Handles email operations
 *
 * Capabilities:
 * - Email summarization
 * - Task extraction from emails
 * - Priority detection
 * - Smart inbox management
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';

@Injectable()
export class EmailAgent {
  private readonly logger = new Logger(EmailAgent.name);
  readonly name = 'Email Agent';
  readonly description = 'Manages emails - summarization, task extraction, and priority detection';
  readonly tools = ['summarizeEmails', 'extractTasksFromEmails', 'listEmails', 'markAsRead'];

  constructor(
    private prisma: PrismaService,
    private aiva: AIVAService,
  ) {}

  async execute(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
    context: any,
  ): Promise<EmailAgentResult> {
    this.logger.debug(`Email Agent executing for user ${userId}: ${input}`);

    const action = parameters.action as string || 'summarize';

    switch (action) {
      case 'summarize':
        return this.summarizeEmails(userId, parameters);
      case 'extractTasks':
        return this.extractTasksFromEmails(userId, parameters);
      case 'list':
        return this.listEmails(userId, parameters);
      case 'markAsRead':
        return this.markAsRead(userId, parameters);
      default:
        return this.summarizeEmails(userId, parameters);
    }
  }

  private async summarizeEmails(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<EmailAgentResult> {
    const limit = parseInt((parameters.limit as string) || '10');
    const unreadOnly = (parameters.unreadOnly as boolean) ?? true;

    // Get email account
    const account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    if (!account) {
      return {
        success: false,
        response: 'No email account connected. Please connect your email first.',
        toolCalls: [],
        context: {},
        conversationId: null,
      };
    }

    // Get recent emails
    const emails = await this.prisma.email.findMany({
      where: { accountId: account.id, isRead: unreadOnly ? false : undefined },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    // Summarize using AI
    const emailText = emails.map((e, i) => `${i + 1}. From: ${e.from}, Subject: ${e.subject}`).join('\n');

    const summary = await this.aiva.summarize(userId, emailText, 'email list');

    return {
      success: true,
      response: `Here's a summary of your ${unreadOnly ? 'unread ' : ''}emails:\n\n${summary}`,
      emails,
      summary,
      toolCalls: [{ name: 'summarizeEmails', args: { limit, unreadOnly } }],
      context: { emailCount: emails.length },
      conversationId: null,
    };
  }

  private async extractTasksFromEmails(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<EmailAgentResult> {
    const limit = parseInt((parameters.limit as string) || '5');

    const account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    if (!account) {
      return {
        success: false,
        response: 'No email account connected.',
        toolCalls: [],
        context: {},
        conversationId: null,
      };
    }

    const emails = await this.prisma.email.findMany({
      where: { accountId: account.id },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    const createdTasks: any[] = [];

    for (const email of emails) {
      // Extract tasks from email content
      const tasks = await this.aiva.extractTasks(userId, `${email.subject}\n\n${email.body}`);

      if (Array.isArray(tasks) && tasks.length > 0) {
        for (const task of tasks) {
          const created = await this.prisma.task.create({
            data: {
              userId,
              title: task.title,
              description: `${task.description || task.title}\n\nFrom email: ${email.subject}`,
              priority: task.priority || 'MEDIUM',
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              tags: ['from-email'],
              metadata: { sourceEmailId: email.id },
            },
          });
          createdTasks.push(created);
        }
      }
    }

    return {
      success: true,
      response: createdTasks.length > 0
        ? `I've created ${createdTasks.length} tasks from your emails`
        : 'No actionable tasks found in recent emails',
      tasks: createdTasks,
      toolCalls: [{ name: 'extractTasksFromEmails', args: { createdCount: createdTasks.length } }],
      context: { tasksCreated: createdTasks.length },
      conversationId: null,
    };
  }

  private async listEmails(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<EmailAgentResult> {
    const limit = parseInt((parameters.limit as string) || '20');
    const search = parameters.search as string | null;

    const account = await this.prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });

    if (!account) {
      return {
        success: false,
        response: 'No email account connected.',
        toolCalls: [],
        context: {},
        conversationId: null,
      };
    }

    const emails = await this.prisma.email.findMany({
      where: {
        accountId: account.id,
        OR: search ? [
          { subject: { contains: search, mode: 'insensitive' } },
          { from: { contains: search, mode: 'insensitive' } },
        ] : undefined,
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    const emailList = emails.map((e, i) => `${i + 1}. ${e.from} - ${e.subject} (${e.receivedAt.toLocaleDateString()})`).join('\n');

    return {
      success: true,
      response: `Your emails:\n\n${emailList}`,
      emails,
      toolCalls: [{ name: 'listEmails', args: { limit, search } }],
      context: { emailCount: emails.length },
      conversationId: null,
    };
  }

  private async markAsRead(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<EmailAgentResult> {
    const emailIds = parameters.emailIds as string[];

    await this.prisma.email.updateMany({
      where: { id: { in: emailIds } },
      data: { isRead: true },
    });

    return {
      success: true,
      response: `Marked ${emailIds.length} emails as read`,
      toolCalls: [{ name: 'markAsRead', args: { count: emailIds.length } }],
      context: {},
      conversationId: null,
    };
  }
}

export interface EmailAgentResult {
  success: boolean;
  response: string;
  emails?: any[];
  tasks?: any[];
  summary?: string;
  toolCalls: any[];
  context: Record<string, unknown>;
  conversationId: string | null;
}
