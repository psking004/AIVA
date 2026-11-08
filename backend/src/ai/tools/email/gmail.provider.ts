/**
 * Gmail Real Provider Implementation
 *
 * Direct integration with Gmail REST API v1 (https://gmail.googleapis.com/gmail/v1).
 * Features:
 * - OAuth 2.0 token refresh with expiry caching
 * - RFC 2822 MIME message construction & Base64URL encoding
 * - Real inbox listing, unread filtering, and search
 * - Send & Reply operations with Thread-ID and In-Reply-To correlation
 * - Truthful status reporting: Returns 'Gmail is not connected to AIVA.' if credentials are not configured.
 * - Only reports "Email sent" when Gmail returns HTTP 200 with message ID.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import {
  EmailProvider,
  EmailMessageInput,
  EmailMessageOutput,
  EmailProviderStatus,
  EmailSendResult,
} from './email-provider.interface';

@Injectable()
export class GmailProvider implements EmailProvider {
  readonly name = 'GMAIL' as const;
  private readonly logger = new Logger(GmailProvider.name);

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getRequiredEnvVars(): string[] {
    return ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
  }

  private async getOAuthCredentials(userId?: string): Promise<{
    clientId: string | null;
    clientSecret: string | null;
    refreshToken: string | null;
    accountEmail?: string;
  }> {
    // 1. Check environment variables
    const clientId =
      this.configService.get<string>('GMAIL_CLIENT_ID') ||
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      null;
    const clientSecret =
      this.configService.get<string>('GMAIL_CLIENT_SECRET') ||
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      null;
    const refreshToken =
      this.configService.get<string>('GMAIL_REFRESH_TOKEN') ||
      this.configService.get<string>('GOOGLE_REFRESH_TOKEN') ||
      null;

    if (clientId && clientSecret && refreshToken) {
      return { clientId, clientSecret, refreshToken };
    }

    // 2. Check per-user stored EmailAccount in Prisma
    if (userId) {
      const account = await this.prisma.emailAccount.findFirst({
        where: {
          userId,
          provider: 'gmail',
          isActive: true,
        },
      });

      if (account && account.refreshToken) {
        return {
          clientId: clientId || this.configService.get<string>('GOOGLE_CLIENT_ID') || null,
          clientSecret: clientSecret || this.configService.get<string>('GOOGLE_CLIENT_SECRET') || null,
          refreshToken: account.refreshToken,
          accountEmail: account.email,
        };
      }
    }

    return { clientId, clientSecret, refreshToken };
  }

  async getStatus(userId?: string): Promise<EmailProviderStatus> {
    const creds = await this.getOAuthCredentials(userId);
    const missing: string[] = [];

    if (!creds.clientId) missing.push('GMAIL_CLIENT_ID');
    if (!creds.clientSecret) missing.push('GMAIL_CLIENT_SECRET');
    if (!creds.refreshToken) missing.push('GMAIL_REFRESH_TOKEN');

    if (missing.length > 0) {
      return {
        connected: false,
        provider: 'GMAIL',
        error: `Gmail is not connected to AIVA. Missing required credentials: ${missing.join(', ')}`,
        requiredEnvVars: this.getRequiredEnvVars(),
      };
    }

    return {
      connected: true,
      provider: 'GMAIL',
      accountEmail: creds.accountEmail || 'primary',
      requiredEnvVars: this.getRequiredEnvVars(),
    };
  }

  private async getValidAccessToken(userId?: string): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

    const creds = await this.getOAuthCredentials(userId);
    if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
      throw new Error(
        `Gmail is not connected to AIVA. Required environment variables: ${this.getRequiredEnvVars().join(', ')}`,
      );
    }

    this.logger.debug('Refreshing Gmail OAuth access token...');

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: creds.refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Gmail OAuth refresh failed (HTTP ${response.status}): ${errText}`);
        throw new Error(`Gmail authorization failed: HTTP ${response.status}`);
      }

      const data: any = await response.json();
      if (!data.access_token) {
        throw new Error('Gmail OAuth refresh did not return an access token.');
      }

      this.cachedAccessToken = String(data.access_token);
      this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return this.cachedAccessToken;
    } catch (err: any) {
      this.logger.error(`Gmail token refresh exception: ${err.message}`);
      throw new Error(`Gmail authorization error: ${err.message}`);
    }
  }

  async listMessages(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<EmailMessageOutput[]> {
    const token = await this.getValidAccessToken(userId);
    const limit = options?.limit ?? 10;
    const q = options?.unreadOnly ? 'is:unread' : '';

    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', String(limit));
    if (q) listUrl.searchParams.set('q', q);

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!listRes.ok) {
      const err = await listRes.text();
      throw new Error(`Gmail message listing failed (HTTP ${listRes.status}): ${err}`);
    }

    const listData: any = await listRes.json();
    const messages = listData.messages || [];

    const results: EmailMessageOutput[] = [];
    for (const msg of messages.slice(0, limit)) {
      try {
        const detail = await this.getMessage(userId, msg.id);
        if (detail) results.push(detail);
      } catch (err: any) {
        this.logger.warn(`Failed to fetch details for Gmail message ${msg.id}: ${err.message}`);
      }
    }

    return results;
  }

  async getMessage(userId: string, messageId: string): Promise<EmailMessageOutput | null> {
    const token = await this.getValidAccessToken(userId);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail message fetch failed (HTTP ${res.status}): ${err}`);
    }

    const data: any = await res.json();
    return this.parseGmailMessage(data);
  }

  async searchMessages(userId: string, query: string, limit: number = 10): Promise<EmailMessageOutput[]> {
    const token = await this.getValidAccessToken(userId);

    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', String(limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail search failed (HTTP ${res.status}): ${err}`);
    }

    const data: any = await res.json();
    const messages = data.messages || [];

    const results: EmailMessageOutput[] = [];
    for (const msg of messages.slice(0, limit)) {
      try {
        const detail = await this.getMessage(userId, msg.id);
        if (detail) results.push(detail);
      } catch (_) {}
    }

    return results;
  }

  async sendMessage(userId: string, input: EmailMessageInput): Promise<EmailSendResult> {
    const token = await this.getValidAccessToken(userId);

    this.logger.log(`Dispatching real Gmail message to: ${input.to.join(', ')} (subject: "${input.subject}")`);

    const rawMime = this.buildRfc2822Message(input);
    const base64UrlRaw = Buffer.from(rawMime, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: base64UrlRaw,
        threadId: input.threadId || undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Gmail send failed (HTTP ${res.status}): ${err}`);
      throw new Error(`Gmail send operation failed (HTTP ${res.status}): ${err}`);
    }

    const result: any = await res.json();
    this.logger.log(`Gmail send confirmed by Google: ID ${result.id}`);

    return {
      success: true,
      provider: 'GMAIL',
      messageId: result.id,
      threadId: result.threadId || undefined,
      status: 'SENT',
      confirmation: `Email sent successfully via Gmail. (Message ID: ${result.id})`,
    };
  }

  async replyMessage(
    userId: string,
    messageId: string,
    replyBody: string,
  ): Promise<EmailSendResult> {
    const parent = await this.getMessage(userId, messageId);
    if (!parent) {
      throw new Error(`Cannot reply: Original message ${messageId} not found in Gmail.`);
    }

    const subject = parent.subject.startsWith('Re:') ? parent.subject : `Re: ${parent.subject}`;
    return this.sendMessage(userId, {
      to: [parent.from],
      subject,
      body: replyBody,
      threadId: parent.threadId,
      inReplyTo: parent.messageId || parent.id,
    });
  }

  async markAsRead(userId: string, messageId: string): Promise<boolean> {
    const token = await this.getValidAccessToken(userId);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD'],
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    return res.ok;
  }

  private buildRfc2822Message(input: EmailMessageInput): string {
    const lines: string[] = [];
    lines.push(`To: ${input.to.join(', ')}`);
    if (input.cc && input.cc.length > 0) {
      lines.push(`Cc: ${input.cc.join(', ')}`);
    }
    if (input.bcc && input.bcc.length > 0) {
      lines.push(`Bcc: ${input.bcc.join(', ')}`);
    }
    lines.push(`Subject: ${input.subject}`);
    if (input.inReplyTo) {
      lines.push(`In-Reply-To: ${input.inReplyTo}`);
      lines.push(`References: ${input.inReplyTo}`);
    }
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(input.body);

    return lines.join('\r\n');
  }

  private parseGmailMessage(data: any): EmailMessageOutput {
    const headers = data.payload?.headers || [];
    const getHeader = (name: string): string => {
      const h = headers.find((item: any) => item.name?.toLowerCase() === name.toLowerCase());
      return h?.value || '';
    };

    let bodyText = '';
    if (data.snippet) {
      bodyText = data.snippet;
    }

    // Attempt to extract text/plain payload part if available
    const parts = data.payload?.parts || [];
    const textPart = parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      try {
        bodyText = Buffer.from(textPart.body.data, 'base64url').toString('utf-8');
      } catch (_) {}
    } else if (data.payload?.body?.data) {
      try {
        bodyText = Buffer.from(data.payload.body.data, 'base64url').toString('utf-8');
      } catch (_) {}
    }

    const internalDate = data.internalDate ? new Date(parseInt(data.internalDate, 10)) : new Date();
    const labelIds = data.labelIds || [];

    return {
      id: data.id,
      provider: 'GMAIL',
      messageId: getHeader('Message-ID') || data.id,
      threadId: data.threadId || undefined,
      from: getHeader('From'),
      to: getHeader('To').split(',').map((s: string) => s.trim()).filter(Boolean),
      cc: getHeader('Cc') ? getHeader('Cc').split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
      subject: getHeader('Subject') || '(No Subject)',
      body: bodyText,
      receivedAt: internalDate,
      isRead: !labelIds.includes('UNREAD'),
      isStarred: labelIds.includes('STARRED'),
      labels: labelIds,
    };
  }
}
