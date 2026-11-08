/**
 * AIVA Unified Email Tool
 *
 * Coordinates email operations between LocalEmailProvider (Prisma DB)
 * and GmailProvider (Real Gmail REST API v1).
 *
 * Enforces strict honesty:
 * - Local drafts and database records are never claimed as sent emails.
 * - Only reports 'Email sent' after Gmail confirms the send operation.
 * - If Gmail OAuth is unconfigured, truthfully returns 'Gmail is not connected to AIVA.'
 */

import { Injectable, Logger } from '@nestjs/common';
import { LocalEmailProvider } from './email/local-email.provider';
import { GmailProvider } from './email/gmail.provider';
import { EmailProvider } from './email/email-provider.interface';

@Injectable()
export class EmailTool {
  private readonly logger = new Logger(EmailTool.name);

  constructor(
    private readonly localProvider: LocalEmailProvider,
    private readonly gmailProvider: GmailProvider,
  ) {}

  private async resolveProvider(userId: string, requested?: unknown): Promise<EmailProvider> {
    const req = String(requested || '').toLowerCase();
    if (req === 'gmail') {
      return this.gmailProvider;
    }
    if (req === 'local') {
      return this.localProvider;
    }

    // Auto-selection: prefer Gmail if connected, otherwise fallback to Local
    const gmailStatus = await this.gmailProvider.getStatus(userId);
    if (gmailStatus.connected) {
      return this.gmailProvider;
    }
    return this.localProvider;
  }

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`EmailTool executing: ${action} for user ${userId} (target: ${params.provider || 'auto'})`);

    if (action === 'status') {
      const [localStatus, gmailStatus] = await Promise.all([
        this.localProvider.getStatus(userId),
        this.gmailProvider.getStatus(userId),
      ]);
      return {
        success: true,
        action,
        providers: {
          local: localStatus,
          gmail: gmailStatus,
        },
      };
    }

    const provider = await this.resolveProvider(userId, params.provider);

    switch (action) {
      case 'list': {
        const limit = typeof params.limit === 'number' ? params.limit : 10;
        const unreadOnly = Boolean(params.unreadOnly);
        const emails = await provider.listMessages(userId, { unreadOnly, limit });
        return {
          success: true,
          action,
          provider: provider.name,
          count: emails.length,
          emails,
        };
      }

      case 'get': {
        const messageId = String(params.messageId || params.id || '');
        const email = await provider.getMessage(userId, messageId);
        if (!email) {
          return {
            success: false,
            action,
            provider: provider.name,
            error: `Message not found: ${messageId}`,
          };
        }
        return { success: true, action, provider: provider.name, email };
      }

      case 'search': {
        const query = String(params.query || params.q || '');
        const limit = typeof params.limit === 'number' ? params.limit : 10;
        const emails = await provider.searchMessages(userId, query, limit);
        return {
          success: true,
          action,
          provider: provider.name,
          query,
          count: emails.length,
          emails,
        };
      }

      case 'send': {
        const toRaw = params.to;
        const to = Array.isArray(toRaw)
          ? (toRaw as string[])
          : String(toRaw || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

        if (to.length === 0) {
          return { success: false, action, error: 'Recipient "to" address is required.' };
        }

        const subject = String(params.subject || 'No Subject');
        const body = String(params.body || params.content || '');

        const result = await provider.sendMessage(userId, {
          to,
          subject,
          body,
          cc: Array.isArray(params.cc) ? (params.cc as string[]) : undefined,
          bcc: Array.isArray(params.bcc) ? (params.bcc as string[]) : undefined,
          threadId: params.threadId ? String(params.threadId) : undefined,
        });

        return {
          success: result.success,
          action,
          provider: result.provider,
          status: result.status,
          messageId: result.messageId,
          confirmation: result.confirmation,
        };
      }

      case 'reply': {
        const messageId = String(params.messageId || params.id || '');
        const body = String(params.body || params.content || '');

        if (!messageId || !body) {
          return { success: false, action, error: 'Parameters "messageId" and "body" are required for reply.' };
        }

        const result = await provider.replyMessage(userId, messageId, body);
        return {
          success: result.success,
          action,
          provider: result.provider,
          status: result.status,
          messageId: result.messageId,
          confirmation: result.confirmation,
        };
      }

      case 'markAsRead': {
        const messageId = String(params.messageId || params.id || '');
        const ok = await provider.markAsRead(userId, messageId);
        return { success: ok, action, provider: provider.name, messageId };
      }

      default:
        return { success: false, action, error: `Unsupported email action: ${action}` };
    }
  }
}
