"use strict";
/**
 * UsersService - User management operations
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
var UsersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let UsersService = UsersService_1 = class UsersService {
    prisma;
    logger = new common_1.Logger(UsersService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * Get user by ID
     */
    async findById(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                _count: {
                    select: {
                        tasks: true,
                        notes: true,
                        documents: true,
                        conversations: true,
                    },
                },
            },
        });
    }
    /**
     * Get user by email
     */
    async findByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }
    /**
     * Update user profile
     */
    async updateProfile(userId, data) {
        return this.prisma.user.update({
            where: { id: userId },
            data,
        });
    }
    /**
     * Get user dashboard stats
     */
    async getDashboardStats(userId) {
        const [taskStats, noteStats, documentStats, eventStats] = await Promise.all([
            this.prisma.task.groupBy({
                by: ['status'],
                where: { userId },
                _count: true,
            }),
            this.prisma.note.count({ where: { userId, isArchived: false } }),
            this.prisma.document.count({ where: { userId } }),
            this.prisma.calendarEvent.count({
                where: { userId, startTime: { gte: new Date() } },
            }),
        ]);
        return {
            tasks: taskStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
            notes: noteStats,
            documents: documentStats,
            upcomingEvents: eventStats,
        };
    }
    /**
     * Delete user account
     */
    async deleteAccount(userId) {
        // In production, would soft delete or archive data
        await this.prisma.user.delete({
            where: { id: userId },
        });
        this.logger.log(`Account deleted: ${userId}`);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map