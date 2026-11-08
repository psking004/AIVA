/**
 * AIVA Email Provider Interface
 *
 * Defines contract for email integrations:
 * - LocalEmailProvider: Internal Prisma database email records / drafts
 * - GmailProvider: Real Google Gmail REST API (v1)
 */

export interface EmailMessageInput {
  to: string[];
  subject: string;
  body: string;
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  inReplyTo?: string | undefined;
  threadId?: string | undefined;
}

export interface EmailMessageOutput {
  id: string;
  provider: 'LOCAL' | 'GMAIL';
  messageId?: string | undefined;
  threadId?: string | undefined;
  from: string;
  to: string[];
  cc?: string[] | undefined;
  subject: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
  isStarred?: boolean | undefined;
  labels?: string[] | undefined;
}

export interface EmailProviderStatus {
  connected: boolean;
  provider: 'LOCAL' | 'GMAIL';
  accountEmail?: string | undefined;
  error?: string | undefined;
  requiredEnvVars?: string[] | undefined;
}

export interface EmailSendResult {
  success: boolean;
  provider: 'LOCAL' | 'GMAIL';
  messageId: string;
  threadId?: string | undefined;
  status: 'SENT' | 'DRAFT_SAVED' | 'FAILED';
  confirmation: string;
}

export interface EmailProvider {
  readonly name: 'LOCAL' | 'GMAIL';

  getStatus(userId: string): Promise<EmailProviderStatus>;

  listMessages(
    userId: string,
    options?: { unreadOnly?: boolean | undefined; limit?: number | undefined } | undefined,
  ): Promise<EmailMessageOutput[]>;

  getMessage(userId: string, messageId: string): Promise<EmailMessageOutput | null>;

  searchMessages(userId: string, query: string, limit?: number): Promise<EmailMessageOutput[]>;

  sendMessage(userId: string, input: EmailMessageInput): Promise<EmailSendResult>;

  replyMessage(
    userId: string,
    messageId: string,
    replyBody: string,
  ): Promise<EmailSendResult>;

  markAsRead(userId: string, messageId: string): Promise<boolean>;
}
