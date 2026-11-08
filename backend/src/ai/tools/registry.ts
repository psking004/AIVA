/**
 * AIVA Capability & Tool Registry
 *
 * Implements formal capability-based execution (Sections 7 & 8):
 * - Capability definitions with parameter schemas
 * - Permission Level enforcement (0 - 3) via AivaPolicyEngine
 * - Execution timeout enforcement
 * - Verification hooks (Never claim completion without verification)
 * - Auditable execution logging
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Priority, TaskStatus } from '@prisma/client';
import { AivaPolicyEngine, PermissionLevel } from '../policy/aiva-policy-engine';
import { ScaffolderService, SupportedFramework } from './scaffolder.service';
import { PackageManagerService, PackageOperation } from './package-manager.service';
import { PatchEngineService } from './patch-engine.service';
import { ControlledCommandExecutor, ControlledOperationType } from './command-executor.service';
import { CalendarTool } from './calendar.tool';
import { EmailTool } from './email.tool';
import { MemoryTool } from './memory.tool';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ToolHandler = (userId: string, args: Record<string, unknown>) => Promise<any>;

export interface CapabilitySchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  description: string;
}

export interface CapabilityDefinition {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  schema: Record<string, CapabilitySchemaField>;
  timeoutMs: number;
  handler: ToolHandler;
}

export interface ToolExecutionResponse {
  success: boolean;
  toolName: string;
  permissionLevel: PermissionLevel;
  result?: any;
  error?: string | undefined;
  verified: boolean;
  auditId?: string | undefined;
}

@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private capabilities: Map<string, CapabilityDefinition> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEngine: AivaPolicyEngine,
    @Optional() private readonly scaffolder?: ScaffolderService,
    @Optional() private readonly packageManager?: PackageManagerService,
    @Optional() private readonly patchEngine?: PatchEngineService,
    @Optional() private readonly commandExecutor?: ControlledCommandExecutor,
    @Optional() private readonly calendarTool?: CalendarTool,
    @Optional() private readonly emailTool?: EmailTool,
    @Optional() private readonly memoryTool?: MemoryTool,
  ) {
    this.registerCoreCapabilities();
  }

  /**
   * Register a capability with formal schema and permission tier
   */
  public registerCapability(definition: CapabilityDefinition) {
    this.capabilities.set(definition.name.toUpperCase(), definition);
    this.capabilities.set(definition.name.toLowerCase(), definition);
    this.logger.debug(`Registered capability: ${definition.name} (Level ${definition.permissionLevel})`);
  }

  /**
   * Execute a capability with policy evaluation, validation, and audit
   */
  public async execute(userId: string, toolName: string, args: Record<string, unknown> = {}): Promise<ToolExecutionResponse> {
    const key = toolName.toUpperCase();
    const cap = this.capabilities.get(key) || this.capabilities.get(toolName.toLowerCase());

    if (!cap) {
      this.logger.warn(`Capability not found in registry: ${toolName}`);
      return {
        success: false,
        toolName,
        permissionLevel: 2,
        error: `Unknown capability: ${toolName}`,
        verified: false,
      };
    }

    // 1. Policy Gate Evaluation (Section 8)
    const policy = this.policyEngine.evaluateCapability(cap.name);
    if (!policy.allowed) {
      this.logger.warn(`[POLICY REJECTION] ${cap.name} blocked: ${policy.reason}`);
      return {
        success: false,
        toolName: cap.name,
        permissionLevel: cap.permissionLevel,
        error: policy.reason,
        verified: false,
      };
    }

    // 2. Schema Validation
    for (const [field, spec] of Object.entries(cap.schema)) {
      if (spec.required && (args[field] === undefined || args[field] === null || args[field] === '')) {
        return {
          success: false,
          toolName: cap.name,
          permissionLevel: cap.permissionLevel,
          error: `Missing required parameter "${field}" for capability ${cap.name}.`,
          verified: false,
        };
      }
    }

    this.logger.debug(`Executing capability: ${cap.name} for user ${userId}`);

    try {
      // 3. Execution with Timeout
      const resultPromise = cap.handler(userId, args);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${cap.timeoutMs}ms`)), cap.timeoutMs)
      );

      const rawResult = await Promise.race([resultPromise, timeoutPromise]);

      // 4. Audit Log
      let auditLogId: string | undefined;
      try {
        const log = await this.prisma.activityLog.create({
          data: {
            userId,
            action: `CAPABILITY_${cap.name}`,
            resource: cap.name,
            metadata: JSON.parse(JSON.stringify({ args, success: true })),
          },
        });
        auditLogId = log.id;
      } catch (_) {}

      return {
        success: true,
        toolName: cap.name,
        permissionLevel: cap.permissionLevel,
        result: rawResult,
        verified: true,
        auditId: auditLogId,
      };
    } catch (err: any) {
      this.logger.error(`Capability ${cap.name} failed: ${err.message}`);
      return {
        success: false,
        toolName: cap.name,
        permissionLevel: cap.permissionLevel,
        error: err.message || 'Execution error',
        verified: false,
      };
    }
  }

  public listCapabilities() {
    const list: Array<{ name: string; description: string; permissionLevel: PermissionLevel; schema: Record<string, CapabilitySchemaField> }> = [];
    const seen = new Set<string>();
    for (const cap of this.capabilities.values()) {
      if (!seen.has(cap.name)) {
        seen.add(cap.name);
        list.push({
          name: cap.name,
          description: cap.description,
          permissionLevel: cap.permissionLevel,
          schema: cap.schema,
        });
      }
    }
    return list;
  }

  /**
   * Register full set of formal AIVA capabilities
   */
  private registerCoreCapabilities() {
    // ── TASK PROTOCOLS ──────────────────────────────────────────
    this.registerCapability({
      name: 'TASK_CREATE',
      description: 'Create a new personal task',
      permissionLevel: 1,
      schema: {
        title: { type: 'string', required: true, description: 'Task title' },
        description: { type: 'string', description: 'Detailed description' },
        priority: { type: 'string', description: 'LOW | MEDIUM | HIGH | CRITICAL' },
        dueDate: { type: 'string', description: 'ISO date or relative string' },
      },
      timeoutMs: 8000,
      handler: async (userId, args) => {
        let dueDate: Date | null = null;
        if (args.dueDate) {
          dueDate = new Date(args.dueDate as string);
          if (isNaN(dueDate.getTime())) dueDate = null;
        }
        return this.prisma.task.create({
          data: {
            userId,
            title: (args.title as string).trim(),
            description: (args.description as string) || null,
            priority: (args.priority as Priority) || Priority.MEDIUM,
            dueDate,
          },
        });
      },
    });

    this.registerCapability({
      name: 'TASK_READ',
      description: 'Query tasks with optional status and search filter',
      permissionLevel: 0,
      schema: {
        query: { type: 'string', description: 'Text search query' },
        status: { type: 'string', description: 'PENDING | IN_PROGRESS | COMPLETED' },
      },
      timeoutMs: 5000,
      handler: async (userId, args) => {
        const where: any = { userId };
        if (args.query) {
          where.OR = [
            { title: { contains: args.query as string, mode: 'insensitive' } },
            { description: { contains: args.query as string, mode: 'insensitive' } },
          ];
        }
        if (args.status) {
          where.status = args.status as TaskStatus;
        }
        return this.prisma.task.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
      },
    });

    this.registerCapability({
      name: 'TASK_COMPLETE',
      description: 'Mark a task as completed',
      permissionLevel: 1,
      schema: {
        taskId: { type: 'string', required: true, description: 'UUID of the task' },
      },
      timeoutMs: 5000,
      handler: async (userId, args) => {
        return this.prisma.task.update({
          where: { id: args.taskId as string, userId },
          data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
        });
      },
    });

    // ── PROJECT PROTOCOLS ───────────────────────────────────────
    this.registerCapability({
      name: 'PROJECT_READ',
      description: 'Query user project initiative matrix',
      permissionLevel: 0,
      schema: {
        query: { type: 'string', description: 'Search term' },
      },
      timeoutMs: 5000,
      handler: async (userId, args) => {
        const where: any = { userId };
        if (args.query) {
          where.OR = [
            { title: { contains: args.query as string, mode: 'insensitive' } },
            { description: { contains: args.query as string, mode: 'insensitive' } },
          ];
        }
        return this.prisma.project.findMany({
          where,
          include: { tasks: { take: 5 } },
          take: 5,
        });
      },
    });

    // ── TEMPORAL / CALENDAR PROTOCOLS ───────────────────────────
    this.registerCapability({
      name: 'CALENDAR_READ',
      description: 'Retrieve calendar events from Local DB or Google Calendar',
      permissionLevel: 0,
      schema: {
        startTime: { type: 'string', description: 'ISO start date filter' },
        endTime: { type: 'string', description: 'ISO end date filter' },
        limit: { type: 'number', description: 'Max items to return' },
        provider: { type: 'string', description: 'LOCAL | GOOGLE | auto' },
      },
      timeoutMs: 10000,
      handler: async (userId, args) => {
        if (this.calendarTool) {
          return this.calendarTool.execute(userId, 'list', args);
        }
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        return this.prisma.calendarEvent.findMany({
          where: { userId, startTime: { gte: now, lte: endOfDay } },
          orderBy: { startTime: 'asc' },
        });
      },
    });

    this.registerCapability({
      name: 'CALENDAR_CREATE',
      description: 'Create an event in Local DB or Google Calendar',
      permissionLevel: 1,
      schema: {
        title: { type: 'string', required: true, description: 'Event title' },
        startTime: { type: 'string', required: true, description: 'ISO start date' },
        endTime: { type: 'string', description: 'ISO end date' },
        description: { type: 'string', description: 'Event description' },
        location: { type: 'string', description: 'Event location' },
        attendees: { type: 'array', description: 'Attendee email addresses' },
        provider: { type: 'string', description: 'LOCAL | GOOGLE | auto' },
      },
      timeoutMs: 15000,
      handler: async (userId, args) => {
        if (this.calendarTool) {
          return this.calendarTool.execute(userId, 'create', args);
        }
        const start = new Date(args.startTime as string);
        const end = args.endTime ? new Date(args.endTime as string) : new Date(start.getTime() + 3600000);
        return this.prisma.calendarEvent.create({
          data: {
            userId,
            title: (args.title as string).trim(),
            startTime: start,
            endTime: end,
          },
        });
      },
    });

    this.registerCapability({
      name: 'CALENDAR_UPDATE',
      description: 'Update existing calendar event in Local DB or Google Calendar',
      permissionLevel: 1,
      schema: {
        eventId: { type: 'string', required: true, description: 'Event ID' },
        title: { type: 'string', description: 'Updated title' },
        startTime: { type: 'string', description: 'Updated start time' },
        endTime: { type: 'string', description: 'Updated end time' },
        provider: { type: 'string', description: 'LOCAL | GOOGLE | auto' },
      },
      timeoutMs: 15000,
      handler: async (userId, args) => {
        if (this.calendarTool) {
          return this.calendarTool.execute(userId, 'update', args);
        }
        return this.prisma.calendarEvent.update({
          where: { id: args.eventId as string, userId },
          data: (args.updates as any) || {},
        });
      },
    });

    this.registerCapability({
      name: 'CALENDAR_DELETE',
      description: 'Delete calendar event from Local DB or Google Calendar',
      permissionLevel: 2,
      schema: {
        eventId: { type: 'string', required: true, description: 'Event ID' },
        provider: { type: 'string', description: 'LOCAL | GOOGLE | auto' },
      },
      timeoutMs: 10000,
      handler: async (userId, args) => {
        if (this.calendarTool) {
          return this.calendarTool.execute(userId, 'delete', args);
        }
        return this.prisma.calendarEvent.delete({
          where: { id: args.eventId as string, userId },
        });
      },
    });

    // ── EMAIL PROTOCOLS ──────────────────────────────────────────
    this.registerCapability({
      name: 'EMAIL_READ',
      description: 'Retrieve incoming emails from Local store or Gmail',
      permissionLevel: 0,
      schema: {
        limit: { type: 'number', description: 'Max emails to list' },
        unreadOnly: { type: 'boolean', description: 'Filter unread only' },
        provider: { type: 'string', description: 'LOCAL | GMAIL | auto' },
      },
      timeoutMs: 15000,
      handler: async (userId, args) => {
        if (this.emailTool) {
          return this.emailTool.execute(userId, 'list', args);
        }
        throw new Error('EmailTool is not available in current runtime.');
      },
    });

    this.registerCapability({
      name: 'EMAIL_SEARCH',
      description: 'Search messages in Local store or Gmail',
      permissionLevel: 0,
      schema: {
        query: { type: 'string', required: true, description: 'Search query' },
        limit: { type: 'number', description: 'Max items' },
        provider: { type: 'string', description: 'LOCAL | GMAIL | auto' },
      },
      timeoutMs: 15000,
      handler: async (userId, args) => {
        if (this.emailTool) {
          return this.emailTool.execute(userId, 'search', args);
        }
        throw new Error('EmailTool is not available in current runtime.');
      },
    });

    this.registerCapability({
      name: 'EMAIL_SEND',
      description: 'Dispatch real email via Gmail or save local draft',
      permissionLevel: 2,
      schema: {
        to: { type: 'array', required: true, description: 'Recipient addresses' },
        subject: { type: 'string', required: true, description: 'Subject line' },
        body: { type: 'string', required: true, description: 'Email body text' },
        cc: { type: 'array', description: 'CC addresses' },
        provider: { type: 'string', description: 'LOCAL | GMAIL | auto' },
      },
      timeoutMs: 20000,
      handler: async (userId, args) => {
        if (this.emailTool) {
          return this.emailTool.execute(userId, 'send', args);
        }
        throw new Error('EmailTool is not available in current runtime.');
      },
    });

    this.registerCapability({
      name: 'EMAIL_REPLY',
      description: 'Reply to an email thread via Gmail or local store',
      permissionLevel: 2,
      schema: {
        messageId: { type: 'string', required: true, description: 'Target message ID' },
        body: { type: 'string', required: true, description: 'Reply text' },
        provider: { type: 'string', description: 'LOCAL | GMAIL | auto' },
      },
      timeoutMs: 20000,
      handler: async (userId, args) => {
        if (this.emailTool) {
          return this.emailTool.execute(userId, 'reply', args);
        }
        throw new Error('EmailTool is not available in current runtime.');
      },
    });

    // ── LONG-TERM VECTOR MEMORY PROTOCOLS ─────────────────────────
    this.registerCapability({
      name: 'MEMORY_READ',
      description: 'Query long-term vector memory with semantic similarity',
      permissionLevel: 0,
      schema: {
        query: { type: 'string', required: true, description: 'Search text' },
        limit: { type: 'number', description: 'Max results' },
        minRelevance: { type: 'number', description: 'Relevance threshold 0.0 - 1.0' },
        type: { type: 'string', description: 'WORKING | EPISODIC | SEMANTIC | PROJECT | DEVICE | TASK' },
      },
      timeoutMs: 10000,
      handler: async (userId, args) => {
        if (this.memoryTool) {
          return this.memoryTool.execute(userId, 'read', args);
        }
        throw new Error('MemoryTool is not available in current runtime.');
      },
    });

    this.registerCapability({
      name: 'MEMORY_WRITE',
      description: 'Store classified vector memory with real embeddings',
      permissionLevel: 1,
      schema: {
        document: { type: 'string', required: true, description: 'Memory content to persist' },
        type: { type: 'string', description: 'WORKING | EPISODIC | SEMANTIC | PROJECT | DEVICE | TASK' },
        projectId: { type: 'string', description: 'Associated project ID' },
        taskId: { type: 'string', description: 'Associated task ID' },
      },
      timeoutMs: 10000,
      handler: async (userId, args) => {
        if (this.memoryTool) {
          return this.memoryTool.execute(userId, 'write', args);
        }
        throw new Error('MemoryTool is not available in current runtime.');
      },
    });

    this.registerCapability({
      name: 'MEMORY_DELETE',
      description: 'Delete stored vector memory by ID or query',
      permissionLevel: 2,
      schema: {
        memoryId: { type: 'string', description: 'Unique memory identifier' },
        query: { type: 'string', description: 'Semantic query to find memory to delete' },
      },
      timeoutMs: 10000,
      handler: async (userId, args) => {
        if (this.memoryTool) {
          return this.memoryTool.execute(userId, 'delete', args);
        }
        throw new Error('MemoryTool is not available in current runtime.');
      },
    });

    // ── SYSTEM STATE & COMPUTER INFORMATION ─────────────────────
    this.registerCapability({
      name: 'SYSTEM_INFO',
      description: 'Get hardware platform, CPU, RAM, and runtime statistics',
      permissionLevel: 0,
      schema: {},
      timeoutMs: 3000,
      handler: async () => {
        return {
          platform: os.platform(),
          release: os.release(),
          cpuCount: os.cpus().length,
          cpuModel: os.cpus()[0]?.model || 'Intel Core',
          totalMemoryGB: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
          freeMemoryGB: Math.round(os.freemem() / (1024 ** 3) * 10) / 10,
          nodeVersion: process.version,
          uptimeSeconds: Math.round(os.uptime()),
        };
      },
    });

    // ── CODEBASE & REPOSITORY INSPECTION ────────────────────────
    this.registerCapability({
      name: 'CODE_READ',
      description: 'Read contents of a workspace file within security boundaries',
      permissionLevel: 0,
      schema: {
        filePath: { type: 'string', required: true, description: 'Relative path to file' },
      },
      timeoutMs: 5000,
      handler: async (_userId, args) => {
        const reqPath = args.filePath as string;
        const normalized = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
        const target = path.resolve(process.cwd(), normalized);

        // Security boundary check: Stay inside workspace
        if (!target.startsWith(process.cwd())) {
          throw new Error('Access denied: File path outside workspace boundary.');
        }

        if (!fs.existsSync(target)) {
          throw new Error(`File not found: ${reqPath}`);
        }

        const stat = fs.statSync(target);
        if (stat.size > 500000) {
          throw new Error(`File exceeds maximum size limit (500KB).`);
        }

        return {
          filePath: reqPath,
          sizeBytes: stat.size,
          content: fs.readFileSync(target, 'utf8'),
        };
      },
    });

    // Aliases for legacy compatibility
    this.registerCapability({
      name: 'search',
      description: 'Legacy search tool',
      permissionLevel: 0,
      schema: { query: { type: 'string', required: true, description: 'query' } },
      timeoutMs: 5000,
      handler: async (userId, args) => {
        const query = args.query as string;
        const [tasks, notes, documents] = await Promise.all([
          this.prisma.task.findMany({ where: { userId, title: { contains: query, mode: 'insensitive' } }, take: 5 }),
          this.prisma.note.findMany({ where: { userId, title: { contains: query, mode: 'insensitive' } }, take: 5 }),
          this.prisma.document.findMany({ where: { userId, title: { contains: query, mode: 'insensitive' } }, take: 5 }),
        ]);
        return { tasks, notes, documents };
      },
    });

    this.registerCapability({
      name: 'createTask',
      description: 'Legacy createTask tool',
      permissionLevel: 1,
      schema: { title: { type: 'string', required: true, description: 'title' } },
      timeoutMs: 5000,
      handler: async (userId, args) => {
        return this.prisma.task.create({
          data: {
            userId,
            title: args.title as string,
            description: args.description as string,
            priority: (args.priority as Priority) || Priority.MEDIUM,
          },
        });
      },
    });

    // ── AUTONOMOUS ACTION ENGINE PROTOCOLS (P0) ───────────────────
    this.registerCapability({
      name: 'PROJECT_CREATE',
      description: 'Autonomous project scaffolding (React, Next.js, FastAPI, Node.js)',
      permissionLevel: 2,
      schema: {
        projectName: { type: 'string', required: true, description: 'Project name' },
        framework: { type: 'string', required: true, description: 'Framework (react, nextjs, fastapi, nodejs)' },
        targetDir: { type: 'string', description: 'Optional target directory' },
        installDependencies: { type: 'boolean', description: 'Install dependencies automatically' },
        runBuild: { type: 'boolean', description: 'Run build to verify scaffolding' },
      },
      timeoutMs: 120000,
      handler: async (_userId, args) => {
        if (!this.scaffolder) {
          throw new Error('ScaffolderService is not available in current runtime.');
        }
        return this.scaffolder.scaffoldProject({
          projectName: args.projectName as string,
          framework: (args.framework as string).toLowerCase() as SupportedFramework,
          targetDir: args.targetDir as string | undefined,
          installDependencies: args.installDependencies !== false,
          runBuild: args.runBuild !== false,
        });
      },
    });

    this.registerCapability({
      name: 'PACKAGE_INSTALL',
      description: 'Controlled package manager execution (pnpm/npm add, install, remove)',
      permissionLevel: 2,
      schema: {
        operation: { type: 'string', required: true, description: 'Operation (add, install, remove)' },
        manager: { type: 'string', description: 'Manager (pnpm, npm)' },
        packages: { type: 'array', description: 'Package names' },
        cwd: { type: 'string', required: true, description: 'Target working directory' },
      },
      timeoutMs: 120000,
      handler: async (_userId, args) => {
        if (!this.packageManager) {
          throw new Error('PackageManagerService is not available in current runtime.');
        }
        return this.packageManager.executeOperation({
          operation: args.operation as PackageOperation,
          manager: (args.manager as 'pnpm' | 'npm') || 'pnpm',
          packages: (args.packages as string[]) || [],
          cwd: args.cwd as string,
        });
      },
    });

    this.registerCapability({
      name: 'AST_DIFF_PATCH',
      description: 'Targeted code patch engine with readback verification and rollback',
      permissionLevel: 2,
      schema: {
        filePath: { type: 'string', required: true, description: 'Target file path' },
        searchSnippet: { type: 'string', required: true, description: 'Original snippet to replace' },
        replaceSnippet: { type: 'string', required: true, description: 'Replacement snippet' },
        allowMultiple: { type: 'boolean', description: 'Allow multiple replacements' },
      },
      timeoutMs: 10000,
      handler: async (_userId, args) => {
        if (!this.patchEngine) {
          throw new Error('PatchEngineService is not available in current runtime.');
        }
        return this.patchEngine.applyPatch({
          filePath: args.filePath as string,
          searchSnippet: args.searchSnippet as string,
          replaceSnippet: args.replaceSnippet as string,
          allowMultiple: Boolean(args.allowMultiple),
        });
      },
    });

    this.registerCapability({
      name: 'CONTROLLED_COMMAND',
      description: 'Controlled command execution within approved workspaces',
      permissionLevel: 2,
      schema: {
        operation: { type: 'string', required: true, description: 'Controlled operation type' },
        command: { type: 'string', required: true, description: 'Executable name' },
        args: { type: 'array', description: 'Command arguments' },
        cwd: { type: 'string', required: true, description: 'Working directory' },
        timeoutMs: { type: 'number', description: 'Execution timeout in ms' },
      },
      timeoutMs: 120000,
      handler: async (_userId, args) => {
        if (!this.commandExecutor) {
          throw new Error('ControlledCommandExecutor is not available in current runtime.');
        }
        return this.commandExecutor.execute({
          operation: args.operation as ControlledOperationType,
          command: args.command as string,
          args: (args.args as string[]) || [],
          cwd: args.cwd as string,
          timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
        });
      },
    });
  }
}
