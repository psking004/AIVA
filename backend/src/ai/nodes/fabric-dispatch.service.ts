import { Injectable, Logger } from '@nestjs/common';

export type FabricWorkType =
  | 'AI_INFERENCE'
  | 'SYSTEM_INFO';

export type FabricWorkStatus =
  | 'QUEUED'
  | 'CLAIMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

export interface FabricWorkItem {
  requestId: string;
  sourceDeviceId: string;
  targetNodeId: 'PC-A' | 'PC-B' | 'ANDROID' | 'CLOUD';
  targetDeviceId: string;

  type: FabricWorkType;
  capability: string;
  capabilityLevel: 0 | 1 | 2 | 3;

  payload: {
    messages?: Array<{
      role: string;
      content: string;
    }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };

  createdAt: number;
  expiresAt: number;

  status: FabricWorkStatus;

  claimedAt?: number;
  completedAt?: number;

  result?: {
    content?: string;
    model?: string;
    provider?: string;
    latencyMs?: number;
    [key: string]: unknown;
  };

  error?: string;
}

@Injectable()
export class FabricDispatchService {
  private readonly logger = new Logger(FabricDispatchService.name);

  private readonly queue = new Map<string, FabricWorkItem>();

  private readonly completionWaiters = new Map<
    string,
    Set<(work: FabricWorkItem) => void>
  >();

  private readonly defaultTtlMs = 120_000;

  createWork(input: {
    requestId: string;
    sourceDeviceId: string;
    targetNodeId: 'PC-A' | 'PC-B' | 'ANDROID' | 'CLOUD';
    targetDeviceId: string;
    type: FabricWorkType;
    capability: string;
    capabilityLevel: 0 | 1 | 2 | 3;
    payload: FabricWorkItem['payload'];
    ttlMs?: number;
  }): FabricWorkItem {
    const now = Date.now();

    const ttlMs = Math.min(
      Math.max(input.ttlMs ?? this.defaultTtlMs, 5_000),
      300_000,
    );

    const item: FabricWorkItem = {
      requestId: input.requestId,
      sourceDeviceId: input.sourceDeviceId,
      targetNodeId: input.targetNodeId,
      targetDeviceId: input.targetDeviceId,
      type: input.type,
      capability: input.capability,
      capabilityLevel: input.capabilityLevel,
      payload: input.payload,
      createdAt: now,
      expiresAt: now + ttlMs,
      status: 'QUEUED',
    };

    this.queue.set(item.requestId, item);

    this.logger.log(
      `Fabric work queued: ${item.requestId} -> ${item.targetNodeId}`,
    );

    return item;
  }

  claimWork(
    requestId: string,
    deviceId: string,
  ): FabricWorkItem {
    const item = this.requireWork(requestId);

    this.ensureNotExpired(item);

    if (item.targetDeviceId !== deviceId) {
      throw new Error('Work item device mismatch');
    }

    if (item.status !== 'QUEUED') {
      throw new Error(
        `Work item is not claimable: ${item.status}`,
      );
    }

    item.status = 'CLAIMED';
    item.claimedAt = Date.now();

    return item;
  }

  completeWork(
    requestId: string,
    deviceId: string,
    result: FabricWorkItem['result'],
  ): FabricWorkItem {
    const item = this.requireWork(requestId);

    if (item.targetDeviceId !== deviceId) {
      throw new Error('Work item device mismatch');
    }

    if (
      item.status !== 'CLAIMED' &&
      item.status !== 'QUEUED'
    ) {
      throw new Error(
        `Work item cannot be completed: ${item.status}`,
      );
    }

    item.status = 'COMPLETED';
    item.completedAt = Date.now();

    if (result !== undefined) {
      item.result = result;
    }

    this.resolveCompletionWaiters(item);

    return item;
  }

  failWork(
    requestId: string,
    deviceId: string,
    error: string,
  ): FabricWorkItem {
    const item = this.requireWork(requestId);

    if (item.targetDeviceId !== deviceId) {
      throw new Error('Work item device mismatch');
    }

    item.status = 'FAILED';
    item.error = error;
    item.completedAt = Date.now();

    this.resolveCompletionWaiters(item);

    return item;
  }

  pollWork(
    nodeId: 'PC-A' | 'PC-B' | 'ANDROID' | 'CLOUD',
    deviceId: string,
  ): FabricWorkItem | null {
    this.expireOldWork();

    for (const item of this.queue.values()) {
      if (
        item.status === 'QUEUED' &&
        item.targetNodeId === nodeId &&
        item.targetDeviceId === deviceId
      ) {
        return this.claimWork(item.requestId, deviceId);
      }
    }

    return null;
  }

  getWork(requestId: string): FabricWorkItem | null {
    this.expireOldWork();

    return this.queue.get(requestId) ?? null;
  }

  async waitForCompletion(
    requestId: string,
    timeoutMs = 120_000,
  ): Promise<FabricWorkItem> {
    const existing = this.getWork(requestId);

    if (!existing) {
      throw new Error(
        `Fabric work not found: ${requestId}`,
      );
    }

    if (
      existing.status === 'COMPLETED' ||
      existing.status === 'FAILED' ||
      existing.status === 'EXPIRED'
    ) {
      return existing;
    }

    return new Promise<FabricWorkItem>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;

      const finish = (work: FabricWorkItem) => {
        clearTimeout(timer);

        const waiters =
          this.completionWaiters.get(requestId);

        if (waiters) {
          waiters.delete(finish);

          if (waiters.size === 0) {
            this.completionWaiters.delete(requestId);
          }
        }

        resolve(work);
      };

      let waiters =
        this.completionWaiters.get(requestId);

      if (!waiters) {
        waiters = new Set();
        this.completionWaiters.set(
          requestId,
          waiters,
        );
      }

      waiters.add(finish);

      timer = setTimeout(() => {
        const currentWaiters =
          this.completionWaiters.get(requestId);

        if (currentWaiters) {
          currentWaiters.delete(finish);

          if (currentWaiters.size === 0) {
            this.completionWaiters.delete(
              requestId,
            );
          }
        }

        reject(
          new Error(
            `Fabric work timed out after ${timeoutMs}ms: ${requestId}`,
          ),
        );
      }, timeoutMs);
    });
  }

  private resolveCompletionWaiters(
    work: FabricWorkItem,
  ): void {
    const waiters =
      this.completionWaiters.get(work.requestId);

    if (!waiters) {
      return;
    }

    this.completionWaiters.delete(
      work.requestId,
    );

    for (const resolve of waiters) {
      resolve(work);
    }
  }

  private requireWork(
    requestId: string,
  ): FabricWorkItem {
    const item = this.queue.get(requestId);

    if (!item) {
      throw new Error(
        `Fabric work not found: ${requestId}`,
      );
    }

    return item;
  }

  private ensureNotExpired(
    item: FabricWorkItem,
  ): void {
    if (
      item.status === 'EXPIRED' ||
      Date.now() >= item.expiresAt
    ) {
      item.status = 'EXPIRED';
      item.completedAt = Date.now();

      this.resolveCompletionWaiters(item);

      throw new Error(
        `Fabric work expired: ${item.requestId}`,
      );
    }
  }

  private expireOldWork(): void {
    const now = Date.now();

    for (const item of this.queue.values()) {
      if (
        item.status === 'QUEUED' &&
        now >= item.expiresAt
      ) {
        item.status = 'EXPIRED';
        item.completedAt = now;

        this.resolveCompletionWaiters(item);
      }
    }
  }
}
