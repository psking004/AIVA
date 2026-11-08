/**
 * AIVA Memory Tool
 *
 * Exposes capability-based long-term vector memory access:
 * - MEMORY_READ: Semantic retrieval with relevance thresholding
 * - MEMORY_WRITE: Classified persistence (WORKING, EPISODIC, SEMANTIC, PROJECT, DEVICE, TASK)
 * - MEMORY_DELETE: Targeted deletion by ID or query
 */

import { Injectable, Logger } from '@nestjs/common';
import { LongTermMemory, MemoryType } from '../memory/long-term.memory';

@Injectable()
export class MemoryTool {
  private readonly logger = new Logger(MemoryTool.name);

  constructor(private readonly longTermMemory: LongTermMemory) {}

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`MemoryTool executing: ${action} for user ${userId}`);

    switch (action) {
      case 'read':
      case 'search': {
        const query = String(params.query || params.q || params.text || '');
        if (!query) {
          return { success: false, action, error: 'Query parameter is required for memory search.' };
        }

        const limit = typeof params.limit === 'number' ? params.limit : 5;
        const minRelevance = typeof params.minRelevance === 'number' ? params.minRelevance : 0.5;
        const type = params.type ? (String(params.type).toUpperCase() as MemoryType) : undefined;
        const projectId = params.projectId ? String(params.projectId) : undefined;
        const taskId = params.taskId ? String(params.taskId) : undefined;

        const results = await this.longTermMemory.query(userId, query, {
          limit,
          minRelevance,
          type,
          projectId,
          taskId,
        });

        return {
          success: true,
          action,
          query,
          count: results.length,
          memories: results,
        };
      }

      case 'write':
      case 'store': {
        const document = String(params.document || params.content || params.text || '');
        if (!document) {
          return { success: false, action, error: 'Document content is required to store a memory.' };
        }

        const rawType = String(params.type || 'SEMANTIC').toUpperCase();
        const type: MemoryType = ['WORKING', 'EPISODIC', 'SEMANTIC', 'PROJECT', 'DEVICE', 'TASK'].includes(rawType)
          ? (rawType as MemoryType)
          : 'SEMANTIC';

        const metadata: Record<string, unknown> = {
          ...(typeof params.metadata === 'object' && params.metadata !== null ? (params.metadata as any) : {}),
        };
        if (params.projectId) metadata.projectId = String(params.projectId);
        if (params.taskId) metadata.taskId = String(params.taskId);
        if (params.deviceId) metadata.deviceId = String(params.deviceId);

        const memoryId = await this.longTermMemory.add(userId, document, type, metadata);

        return {
          success: true,
          action,
          memoryId,
          type,
          document,
          stored: true,
        };
      }

      case 'delete': {
        const memoryId = params.memoryId ? String(params.memoryId) : undefined;
        const query = params.query ? String(params.query) : undefined;

        if (memoryId) {
          const deleted = await this.longTermMemory.delete(userId, memoryId);
          return { success: deleted, action, memoryId, deleted };
        }

        if (query) {
          const count = await this.longTermMemory.deleteByQuery(userId, query);
          return { success: count > 0, action, query, deletedCount: count };
        }

        return { success: false, action, error: 'Either memoryId or query must be provided for deletion.' };
      }

      case 'stats': {
        const stats = this.longTermMemory.getStats(userId);
        return { success: true, action, stats };
      }

      default:
        return { success: false, action, error: `Unsupported memory action: ${action}` };
    }
  }
}
