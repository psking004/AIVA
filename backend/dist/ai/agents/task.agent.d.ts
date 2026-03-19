/**
 * Task Agent - Handles task management operations
 *
 * Capabilities:
 * - Create tasks from natural language
 * - Update/modify tasks
 * - Prioritize and schedule tasks
 * - Extract tasks from content
 */
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';
export declare class TaskAgent {
    private prisma;
    private aiva;
    private readonly logger;
    readonly name = "Task Agent";
    readonly description = "Manages user tasks - creation, prioritization, scheduling, and tracking";
    readonly tools: string[];
    constructor(prisma: PrismaService, aiva: AIVAService);
    execute(userId: string, input: string, parameters: Record<string, unknown>, context: any): Promise<TaskAgentResult>;
    private createTask;
    private updateTask;
    private deleteTask;
    private listTasks;
    private prioritizeTasks;
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
//# sourceMappingURL=task.agent.d.ts.map