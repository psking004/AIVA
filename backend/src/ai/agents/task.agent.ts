/**
 * Task Agent - Handles task management operations
 *
 * Capabilities:
 * - Create tasks from natural language
 * - Update/modify tasks
 * - Prioritize and schedule tasks
 * - Extract tasks from content
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';

@Injectable()
export class TaskAgent {
  private readonly logger = new Logger(TaskAgent.name);
  readonly name = 'Task Agent';
  readonly description = 'Manages user tasks - creation, prioritization, scheduling, and tracking';
  readonly tools = ['createTask', 'updateTask', 'deleteTask', 'listTasks', 'prioritizeTasks'];

  constructor(
    private prisma: PrismaService,
    private aiva: AIVAService,
  ) {}

  async execute(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
    context: any,
  ): Promise<TaskAgentResult> {
    this.logger.debug(`Task Agent executing for user ${userId}: ${input}`);

    // Extract intent from input
    const action = parameters.action as string || 'create';

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

  private async createTask(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
  ): Promise<TaskAgentResult> {
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

  private async updateTask(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<TaskAgentResult> {
    const taskId = parameters.taskId as string;
    const updates = parameters.updates as Record<string, unknown> || {};

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

  private async deleteTask(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<TaskAgentResult> {
    const taskId = parameters.taskId as string;

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

  private async listTasks(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<TaskAgentResult> {
    const status = parameters.status as string || null;
    const limit = parseInt((parameters.limit as string) || '10');

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

  private async prioritizeTasks(
    userId: string,
    input: string,
  ): Promise<TaskAgentResult> {
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
}

export interface TaskAgentResult {
  success: boolean;
  response: string;
  task?: any;
  tasks?: any[];
  toolCalls: any[];
  context: Record<string, unknown>;
  conversationId: string | null;
}
