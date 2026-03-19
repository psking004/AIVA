"use strict";
/**
 * TasksService - Task CRUD operations
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
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let TasksService = class TasksService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, data) {
        return this.prisma.task.create({
            data: {
                userId,
                title: data.title,
                description: data.description,
                priority: data.priority || 'MEDIUM',
                dueDate: data.dueDate ? new Date(data.dueDate) : null,
                tags: data.tags || [],
            },
        });
    }
    async findAll(userId, filters) {
        return this.prisma.task.findMany({
            where: {
                userId,
                status: filters.status,
                priority: filters.priority,
                parentId: filters.parentId,
            },
            orderBy: { [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc' },
            include: { subtasks: true },
        });
    }
    async findOne(userId, id) {
        return this.prisma.task.findFirst({
            where: { id, userId },
            include: { subtasks: true, parent: true },
        });
    }
    async update(userId, id, data) {
        return this.prisma.task.update({
            where: { id, userId },
            data,
        });
    }
    async remove(userId, id) {
        return this.prisma.task.delete({
            where: { id, userId },
        });
    }
    async bulkUpdate(userId, ids, data) {
        return this.prisma.task.updateMany({
            where: { id: { in: ids }, userId },
            data,
        });
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map