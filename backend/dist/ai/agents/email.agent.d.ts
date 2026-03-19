/**
 * Email Agent - Handles email operations
 *
 * Capabilities:
 * - Email summarization
 * - Task extraction from emails
 * - Priority detection
 * - Smart inbox management
 */
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';
export declare class EmailAgent {
    private prisma;
    private aiva;
    private readonly logger;
    readonly name = "Email Agent";
    readonly description = "Manages emails - summarization, task extraction, and priority detection";
    readonly tools: string[];
    constructor(prisma: PrismaService, aiva: AIVAService);
    execute(userId: string, input: string, parameters: Record<string, unknown>, context: any): Promise<EmailAgentResult>;
    private summarizeEmails;
    private extractTasksFromEmails;
    private listEmails;
    private markAsRead;
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
//# sourceMappingURL=email.agent.d.ts.map