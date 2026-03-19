/**
 * Tool Registry - Central registry for all available tools
 *
 * Tools are functions that agents can call to perform actions
 * across different system modules.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type ToolHandler = (userId: string, args: Record<string, unknown>) => Promise<any>;

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private tools: Map<string, { handler: ToolHandler; description: string }> = new Map();

  constructor(
    private prisma: PrismaService,
  ) {
    this.registerBuiltInTools();
  }

  /**
   * Register a tool handler
   */
  register(name: string, handler: ToolHandler, description: string) {
    this.tools.set(name, { handler, description });
    this.logger.debug(`Tool registered: ${name}`);
  }

  /**
   * Execute a tool
   */
  async execute(userId: string, toolName: string, args: Record<string, unknown>): Promise<any> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    this.logger.debug(`Executing tool: ${toolName} for user ${userId}`);

    try {
      const result = await tool.handler(userId, args);
      return { success: true, toolName, result };
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed: ${error.message}`);
      return { success: false, toolName, error: error.message };
    }
  }

  /**
   * List available tools
   */
  listTools(): ToolInfo[] {
    return Array.from(this.tools.entries()).map(([name, tool]) => ({
      name,
      description: tool.description,
    }));
  }

  /**
   * Check if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Register built-in tools
   */
  private registerBuiltInTools() {
    // Summarize tool
    this.register('summarize', async (userId, args) => {
      const content = args.content as string;
      // In production, would call LLM
      return content?.substring(0, 200) + '...';
    }, 'Summarize content concisely');

    // Extract entities tool
    this.register('extractEntities', async (userId, args) => {
      const content = args.content as string;
      return { entities: [], content };
    }, 'Extract named entities from text');

    // Classify tool
    this.register('classify', async (userId, args) => {
      const content = args.content as string;
      const categories = args.categories as string[] || [];
      return { category: categories[0] || 'general', content };
    }, 'Classify content into categories');

    // Search tool
    this.register('search', async (userId, args) => {
      const query = args.query as string;
      const type = args.type as string || 'all';

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
          title: args.title as string || 'Untitled task',
          description: args.description as string,
          priority: (args.priority as string) || 'MEDIUM',
          dueDate: args.dueDate ? new Date(args.dueDate as string) : null,
        },
      });
    }, 'Create a new task');

    // Create note tool
    this.register('createNote', async (userId, args) => {
      return this.prisma.note.create({
        data: {
          userId,
          title: args.title as string || 'Untitled note',
          content: args.content as string || '',
          tags: Array.isArray(args.tags) ? args.tags : [],
        },
      });
    }, 'Create a new note');

    // Create event tool
    this.register('createEvent', async (userId, args) => {
      return this.prisma.calendarEvent.create({
        data: {
          userId,
          title: args.title as string || 'Untitled event',
          startTime: new Date(args.startTime as string) || new Date(),
          endTime: new Date(args.endTime as string) || new Date(Date.now() + 3600000),
          description: args.description as string,
        },
      });
    }, 'Create a new calendar event');
  }
}

export interface ToolInfo {
  name: string;
  description: string;
}
