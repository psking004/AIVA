"use strict";
/**
 * Tool Registry - Central registry for all available tools
 *
 * Tools are functions that agents can call to perform actions
 * across different system modules.
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
var ToolRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let ToolRegistry = ToolRegistry_1 = class ToolRegistry {
    prisma;
    logger = new common_1.Logger(ToolRegistry_1.name);
    tools = new Map();
    constructor(prisma) {
        this.prisma = prisma;
        this.registerBuiltInTools();
    }
    /**
     * Register a tool handler
     */
    register(name, handler, description) {
        this.tools.set(name, { handler, description });
        this.logger.debug(`Tool registered: ${name}`);
    }
    /**
     * Execute a tool
     */
    async execute(userId, toolName, args) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        this.logger.debug(`Executing tool: ${toolName} for user ${userId}`);
        try {
            const result = await tool.handler(userId, args);
            return { success: true, toolName, result };
        }
        catch (error) {
            this.logger.error(`Tool ${toolName} failed: ${error.message}`);
            return { success: false, toolName, error: error.message };
        }
    }
    /**
     * List available tools
     */
    listTools() {
        return Array.from(this.tools.entries()).map(([name, tool]) => ({
            name,
            description: tool.description,
        }));
    }
    /**
     * Check if tool exists
     */
    hasTool(name) {
        return this.tools.has(name);
    }
    /**
     * Register built-in tools
     */
    registerBuiltInTools() {
        // Summarize tool
        this.register('summarize', async (userId, args) => {
            const content = args.content;
            // In production, would call LLM
            return content?.substring(0, 200) + '...';
        }, 'Summarize content concisely');
        // Extract entities tool
        this.register('extractEntities', async (userId, args) => {
            const content = args.content;
            return { entities: [], content };
        }, 'Extract named entities from text');
        // Classify tool
        this.register('classify', async (userId, args) => {
            const content = args.content;
            const categories = args.categories || [];
            return { category: categories[0] || 'general', content };
        }, 'Classify content into categories');
        // Search tool
        this.register('search', async (userId, args) => {
            const query = args.query;
            const type = args.type || 'all';
            const results = await Promise.all([
                this.prisma.task.findMany({
                    where: { userId, OR: [{ title: { contains: query } }, { description: { contains: query } }] },
                    take: 5,
                }),
                this.prisma.note.findMany({
                    where: { userId, OR: [{ title: { contains: query } }, { content: { contains: query } }] },
                    take: 5,
                }),
                this.prisma.document.findMany({
                    where: { userId, title: { contains: query } },
                    take: 5,
                }),
            ]);
            return {
                tasks: results[0],
                notes: results[1],
                documents: results[2],
            };
        }, 'Search across tasks, notes, and documents');
        // Create task tool
        this.register('createTask', async (userId, args) => {
            return this.prisma.task.create({
                data: {
                    userId,
                    title: args.title || 'Untitled task',
                    description: args.description,
                    priority: args.priority || 'MEDIUM',
                    dueDate: args.dueDate ? new Date(args.dueDate) : null,
                },
            });
        }, 'Create a new task');
        // Create note tool
        this.register('createNote', async (userId, args) => {
            return this.prisma.note.create({
                data: {
                    userId,
                    title: args.title || 'Untitled note',
                    content: args.content || '',
                    tags: Array.isArray(args.tags) ? args.tags : [],
                },
            });
        }, 'Create a new note');
        // Create event tool
        this.register('createEvent', async (userId, args) => {
            return this.prisma.calendarEvent.create({
                data: {
                    userId,
                    title: args.title || 'Untitled event',
                    startTime: new Date(args.startTime) || new Date(),
                    endTime: new Date(args.endTime) || new Date(Date.now() + 3600000),
                    description: args.description,
                },
            });
        }, 'Create a new calendar event');
    }
};
exports.ToolRegistry = ToolRegistry;
exports.ToolRegistry = ToolRegistry = ToolRegistry_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ToolRegistry);
//# sourceMappingURL=registry.js.map