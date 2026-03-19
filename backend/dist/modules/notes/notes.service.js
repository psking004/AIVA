"use strict";
/**
 * NotesService - Notes CRUD operations
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
exports.NotesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let NotesService = class NotesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, data) {
        return this.prisma.note.create({
            data: {
                userId,
                title: data.title,
                content: data.content,
                tags: data.tags || [],
                folderId: data.folderId,
            },
        });
    }
    async findAll(userId, filters = {}) {
        return this.prisma.note.findMany({
            where: {
                userId,
                isArchived: filters.isArchived ?? false,
                folderId: filters.folderId,
                OR: filters.search ? [
                    { title: { contains: filters.search, mode: 'insensitive' } },
                    { content: { contains: filters.search, mode: 'insensitive' } },
                ] : undefined,
            },
            include: { folder: true },
            orderBy: { updatedAt: 'desc' },
        });
    }
    async findOne(userId, id) {
        return this.prisma.note.findFirst({
            where: { id, userId },
            include: { folder: true, replies: true },
        });
    }
    async update(userId, id, data) {
        return this.prisma.note.update({
            where: { id, userId },
            data,
        });
    }
    async remove(userId, id) {
        return this.prisma.note.delete({
            where: { id, userId },
        });
    }
    async archive(userId, id) {
        return this.prisma.note.update({
            where: { id, userId },
            data: { isArchived: true },
        });
    }
    async pin(userId, id) {
        return this.prisma.note.update({
            where: { id, userId },
            data: { isPinned: true },
        });
    }
};
exports.NotesService = NotesService;
exports.NotesService = NotesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotesService);
//# sourceMappingURL=notes.service.js.map