/**
 * EmailService - Email account and message management
 */
import { PrismaService } from '../../database/prisma.service';
export declare class EmailService {
    private prisma;
    constructor(prisma: PrismaService);
    connectAccount(userId: string, data: ConnectEmailDto): Promise<any>;
    getAccounts(userId: string): Promise<any>;
    syncEmails(accountId: string, emails: SyncEmailDto[]): Promise<any[]>;
    getEmails(accountId: string, filters?: EmailFilters): Promise<any>;
    markAsRead(userId: string, emailId: string): Promise<any>;
    markAsStarred(userId: string, emailId: string): Promise<any>;
    deleteEmail(userId: string, emailId: string): Promise<any>;
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
export {};
//# sourceMappingURL=email.service.d.ts.map