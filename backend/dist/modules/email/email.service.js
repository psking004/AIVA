"use strict";
/**
 * EmailService - Email account and message management
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let EmailService = class EmailService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async connectAccount(userId, data) {
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
    async getAccounts(userId) {
        return this.prisma.emailAccount.findMany({
            where: { userId },
        });
    }
    async syncEmails(accountId, emails) {
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
            }
            else {
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
    async getEmails(accountId, filters = {}) {
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
    async markAsRead(userId, emailId) {
        return this.prisma.email.update({
            where: { id: emailId },
            data: { isRead: true },
        });
    }
    async markAsStarred(userId, emailId) {
        return this.prisma.email.update({
            where: { id: emailId },
            data: { isStarred: true },
        });
    }
    async deleteEmail(userId, emailId) {
        return this.prisma.email.delete({
            where: { id: emailId },
        });
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EmailService);
//# sourceMappingURL=email.service.js.map