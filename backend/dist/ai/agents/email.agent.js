"use strict";
/**
 * Email Agent - Handles email operations
 *
 * Capabilities:
 * - Email summarization
 * - Task extraction from emails
 * - Priority detection
 * - Smart inbox management
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailAgent = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const aiva_service_1 = require("../aiva.service");
let EmailAgent = EmailAgent_1 = class EmailAgent {
    prisma;
    aiva;
    logger = new common_1.Logger(EmailAgent_1.name);
    name = 'Email Agent';
    description = 'Manages emails - summarization, task extraction, and priority detection';
    tools = ['summarizeEmails', 'extractTasksFromEmails', 'listEmails', 'markAsRead'];
    constructor(prisma, aiva) {
        this.prisma = prisma;
        this.aiva = aiva;
    }
    async execute(userId, input, parameters, context) {
        this.logger.debug(`Email Agent executing for user ${userId}: ${input}`);
        const action = parameters.action || 'summarize';
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
    async summarizeEmails(userId, parameters) {
        const limit = parseInt(parameters.limit || '10');
        const unreadOnly = parameters.unreadOnly ?? true;
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
    async extractTasksFromEmails(userId, parameters) {
        const limit = parseInt(parameters.limit || '5');
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
        const createdTasks = [];
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
    async listEmails(userId, parameters) {
        const limit = parseInt(parameters.limit || '20');
        const search = parameters.search;
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
    async markAsRead(userId, parameters) {
        const emailIds = parameters.emailIds;
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
};
exports.EmailAgent = EmailAgent;
exports.EmailAgent = EmailAgent = EmailAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        aiva_service_1.AIVAService])
], EmailAgent);
//# sourceMappingURL=email.agent.js.map