"use strict";
/**
 * Task Agent - Handles task management operations
 *
 * Capabilities:
 * - Create tasks from natural language
 * - Update/modify tasks
 * - Prioritize and schedule tasks
 * - Extract tasks from content
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
var TaskAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskAgent = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const aiva_service_1 = require("../aiva.service");
let TaskAgent = TaskAgent_1 = class TaskAgent {
    prisma;
    aiva;
    logger = new common_1.Logger(TaskAgent_1.name);
    name = 'Task Agent';
    description = 'Manages user tasks - creation, prioritization, scheduling, and tracking';
    tools = ['createTask', 'updateTask', 'deleteTask', 'listTasks', 'prioritizeTasks'];
    constructor(prisma, aiva) {
        this.prisma = prisma;
        this.aiva = aiva;
    }
    async execute(userId, input, parameters, context) {
        this.logger.debug(`Task Agent executing for user ${userId}: ${input}`);
        // Extract intent from input
        const action = parameters.action || 'create';
        switch (action) {
            case 'create':
                return this.createTask(userId, input, parameters);
            case 'update':
                return this.updateTask(userId, parameters);
            case 'delete':
                return this.deleteTask(userId, parameters);
            case 'list':
                return this.listTasks(userId, parameters);
            case 'prioritize':
                return this.prioritizeTasks(userId, input);
            default:
                return this.createTask(userId, input, parameters);
        }
    }
    async createTask(userId, input, parameters) {
        // Use AI to extract task details from natural language
        const extracted = await this.aiva.extractTasks(userId, input);
        const taskData = Array.isArray(extracted) ? extracted[0] : extracted;
        const task = await this.prisma.task.create({
            data: {
                userId,
                title: taskData.title || input,
                description: taskData.description || input,
                priority: taskData.priority || 'MEDIUM',
                dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
                tags: taskData.tags || [],
            },
        });
        return {
            success: true,
            response: `I've created a task: "${task.title}"` + (task.dueDate ? ` due on ${task.dueDate.toDateString()}` : ''),
            task: { id: task.id, title: task.title, priority: task.priority },
            toolCalls: [{ name: 'createTask', args: { title: task.title } }],
            context: { taskId: task.id },
            conversationId: null,
        };
    }
    async updateTask(userId, parameters) {
        const taskId = parameters.taskId;
        const updates = parameters.updates || {};
        const task = await this.prisma.task.update({
            where: { id: taskId, userId },
            data: updates,
        });
        return {
            success: true,
            response: `Task "${task.title}" has been updated`,
            task: { id: task.id, title: task.title },
            toolCalls: [{ name: 'updateTask', args: { taskId, updates } }],
            context: { taskId: task.id },
            conversationId: null,
        };
    }
    async deleteTask(userId, parameters) {
        const taskId = parameters.taskId;
        await this.prisma.task.delete({
            where: { id: taskId, userId },
        });
        return {
            success: true,
            response: 'Task has been deleted',
            toolCalls: [{ name: 'deleteTask', args: { taskId } }],
            context: {},
            conversationId: null,
        };
    }
    async listTasks(userId, parameters) {
        const status = parameters.status || null;
        const limit = parseInt(parameters.limit || '10');
        const tasks = await this.prisma.task.findMany({
            where: {
                userId,
                status: status || undefined,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        const taskList = tasks.map((t, i) => `${i + 1}. ${t.title} (${t.priority})`).join('\n');
        return {
            success: true,
            response: `Here are your tasks:\n\n${taskList}`,
            tasks,
            toolCalls: [{ name: 'listTasks', args: { status, limit } }],
            context: { taskCount: tasks.length },
            conversationId: null,
        };
    }
    async prioritizeTasks(userId, input) {
        // Get pending tasks
        const tasks = await this.prisma.task.findMany({
            where: { userId, status: 'PENDING' },
            orderBy: { createdAt: 'asc' },
        });
        // Use AI to prioritize
        const taskText = tasks.map((t, i) => `${i + 1}. ${t.title} - ${t.description || 'No description'}`).join('\n');
        const prompt = `Analyze these tasks and suggest priority order (1=highest priority):
    Consider: urgency, importance, dependencies, deadlines.

    Tasks:
    ${taskText}

    Return JSON: { taskId: newPriority }`;
        const prioritization = await this.aiva.executeTool(userId, 'summarize', { content: prompt });
        return {
            success: true,
            response: 'I\'ve analyzed your tasks and suggest reprioritization based on urgency and importance.',
            tasks,
            toolCalls: [{ name: 'prioritizeTasks', args: { taskCount: tasks.length } }],
            context: { prioritization },
            conversationId: null,
        };
    }
};
exports.TaskAgent = TaskAgent;
exports.TaskAgent = TaskAgent = TaskAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        aiva_service_1.AIVAService])
], TaskAgent);
//# sourceMappingURL=task.agent.js.map