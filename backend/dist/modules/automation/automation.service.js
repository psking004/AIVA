"use strict";
/**
 * AutomationService - Automation rules management
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
exports.AutomationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let AutomationService = class AutomationService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, data) {
        return this.prisma.automationRule.create({
            data: {
                userId,
                name: data.name,
                description: data.description,
                trigger: data.trigger,
                actions: data.actions,
                conditions: data.conditions,
                isActive: true,
            },
        });
    }
    async findAll(userId, activeOnly = true) {
        return this.prisma.automationRule.findMany({
            where: {
                userId,
                isActive: activeOnly ? true : undefined,
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(userId, id) {
        return this.prisma.automationRule.findFirst({
            where: { id, userId },
        });
    }
    async update(userId, id, data) {
        return this.prisma.automationRule.update({
            where: { id, userId },
            data,
        });
    }
    async activate(userId, id) {
        return this.prisma.automationRule.update({
            where: { id, userId },
            data: { isActive: true },
        });
    }
    async deactivate(userId, id) {
        return this.prisma.automationRule.update({
            where: { id, userId },
            data: { isActive: false },
        });
    }
    async remove(userId, id) {
        return this.prisma.automationRule.delete({
            where: { id, userId },
        });
    }
    async trigger(userId, id) {
        const rule = await this.prisma.automationRule.findFirst({
            where: { id, userId },
        });
        if (!rule)
            return null;
        // Execute actions
        const results = await this.executeActions(userId, rule.actions);
        await this.prisma.automationRule.update({
            where: { id },
            data: {
                lastTriggered: new Date(),
                triggerCount: { increment: 1 },
            },
        });
        return { rule, results };
    }
    async executeActions(userId, actions) {
        const results = [];
        for (const action of actions) {
            // Execute action based on type
            results.push({ type: action.type, executed: true });
        }
        return results;
    }
};
exports.AutomationService = AutomationService;
exports.AutomationService = AutomationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AutomationService);
//# sourceMappingURL=automation.service.js.map