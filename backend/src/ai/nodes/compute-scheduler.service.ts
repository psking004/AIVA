/**
 * AIVA Global Compute Scheduler
 *
 * Implements the Distributed Compute Fabric & Dynamic Workload Dispatching:
 * - Idle Resource Harvesting: Dispatches heavy mobile/client workloads to underutilized PC-A.
 * - Load-Aware Shedding: Automatically diverts tasks when PC-A GPU/CPU exceeds 90%.
 * - Privacy Routing: Strictly confines 'PRIVATE' workloads to local nodes.
 * - Cross-Device Composition: Intelligently selects between PC-A (RTX 3050), PC-B (CPU), Android, or Cloud.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComputeNodeService } from './compute-node.service';
import { AivaPolicyEngine } from '../policy/aiva-policy-engine';

export interface WorkloadRequest {
  type: 'HEAVY_INFERENCE' | 'LIGHT_INFERENCE' | 'CODING' | 'FILE_OPS' | 'EMBEDDINGS' | 'TTS';
  sourceDeviceId: string;
  sourceDeviceType: 'android' | 'desktop' | 'web';
  privacyLevel: 'PUBLIC' | 'STANDARD' | 'PRIVATE';
  priority?: 'URGENT' | 'NORMAL' | 'BACKGROUND';
  requiredCapability?: string;
  payloadSizeKb?: number;
}

export interface SchedulingDecision {
  targetNode: 'PC-A' | 'PC-B' | 'ANDROID' | 'CLOUD';
  targetDeviceId?: string;
  nodeRole: string;
  provider: 'ollama' | 'gemini' | 'openrouter' | 'local';
  model: string;
  routingReason: string;
  isRemote: boolean;
  estimatedCost: number;
  score: number;
}

@Injectable()
export class ComputeSchedulerService {
  private readonly logger = new Logger(ComputeSchedulerService.name);

  constructor(
    private readonly nodeService: ComputeNodeService,
    private readonly policyEngine: AivaPolicyEngine,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('AIVA Global Compute Scheduler active');
  }

  /**
   * Dynamically evaluate available nodes and schedule workload
   */
  public schedule(request: WorkloadRequest): SchedulingDecision {
    if (request.requiredCapability) {
      const policy = this.policyEngine.evaluateCapability(request.requiredCapability);
      if (!policy.allowed) {
        this.logger.warn(`Capability ${request.requiredCapability} disallowed by policy: ${policy.reason}`);
      }
    }

    const activeNodes = this.nodeService.listNodes().filter((n) => n.status !== 'OFFLINE');
    const pca = activeNodes.find((n) => n.nodeId === 'PC-A');
    const pcb = activeNodes.find((n) => n.nodeId === 'PC-B');

    this.logger.debug(
      `Scheduling workload "${request.type}" from ${request.sourceDeviceType} [Privacy: ${request.privacyLevel}]`
    );

    // 1. Privacy Rule: Strictly forbid Cloud for PRIVATE workloads
    if (request.privacyLevel === 'PRIVATE') {
      if (pca && pca.status === 'ONLINE' && (pca.gpu.utilizationPercent ?? 0) < 90) {
        return {
          targetNode: 'PC-A',
          targetDeviceId: pca.deviceId,
          nodeRole: pca.nodeRole,
          provider: 'ollama',
          model: 'qwen3:8b',
          routingReason: 'Privacy policy: Private workload routed to local RTX AI Power Node.',
          isRemote: request.sourceDeviceType !== 'desktop',
          estimatedCost: 0,
          score: 98,
        };
      }

      if (pcb && pcb.status === 'ONLINE') {
        return {
          targetNode: 'PC-B',
          targetDeviceId: pcb.deviceId,
          nodeRole: pcb.nodeRole,
          provider: 'ollama',
          model: 'qwen3:8b',
          routingReason: 'Privacy policy: Private workload routed to local CPU Node.',
          isRemote: request.sourceDeviceType !== 'desktop',
          estimatedCost: 0,
          score: 85,
        };
      }

      // If no local node available for private workload, reject rather than leak to cloud
      return {
        targetNode: 'PC-A',
        nodeRole: 'AI_POWER_NODE',
        provider: 'local',
        model: 'none',
        routingReason: 'No authorized local compute node online to process PRIVATE workload securely.',
        isRemote: false,
        estimatedCost: 0,
        score: 0,
      };
    }

    // 2. Android Standard Route (PC-Off World Resilience)
    if (request.sourceDeviceType === 'android') {
      // If Android requests heavy inference or coding, AND PC-A is online with available capacity:
      if (
        (request.type === 'HEAVY_INFERENCE' || request.type === 'CODING') &&
        pca &&
        pca.status === 'ONLINE' &&
        (pca.gpu.utilizationPercent ?? 0) < 85
      ) {
        return {
          targetNode: 'PC-A',
          targetDeviceId: pca.deviceId,
          nodeRole: pca.nodeRole,
          provider: 'ollama',
          model: 'qwen3:8b',
          routingReason: 'Idle Resource Harvesting: Android heavy workload offloaded to underutilized PC-A RTX 3050.',
          isRemote: true,
          estimatedCost: 0,
          score: 95,
        };
      }

      // Default autonomous mobile cloud route (Gemini)
      return {
        targetNode: 'CLOUD',
        nodeRole: 'CLOUD_CLUSTER',
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        routingReason: 'Mobile Autonomous Route: Zero PC dependency, high-speed cloud reasoning via Gemini.',
        isRemote: false,
        estimatedCost: 0.00001,
        score: 92,
      };
    }

    // 3. Desktop / PC-B Workload Scheduling
    if (request.type === 'HEAVY_INFERENCE' || request.type === 'CODING') {
      // Load-Aware Shedding Check for PC-A:
      if (pca && (pca.status === 'ONLINE' || pca.status === 'BUSY')) {
        const maxGpu = this.configService.get<number>('MAX_GPU_LOAD') ?? 90;
        const isOverloaded =
          (pca.gpu.utilizationPercent ?? 0) >= maxGpu ||
          (pca.cpu.utilizationPercent ?? 0) >= 90 ||
          pca.status === 'BUSY';

        if (isOverloaded) {
          this.logger.warn('[LOAD SHEDDING] PC-A is at capacity (>90%). Shedding workload to cloud/secondary.');
          return {
            targetNode: 'CLOUD',
            nodeRole: 'CLOUD_CLUSTER',
            provider: 'openrouter',
            model: 'qwen/qwen-2.5-72b-instruct',
            routingReason: 'Load-Aware Shedding: PC-A is busy; task shed to Cloud accelerator.',
            isRemote: false,
            estimatedCost: 0.0005,
            score: 75,
          };
        }

        // PC-A is available and optimal
        return {
          targetNode: 'PC-A',
          targetDeviceId: pca.deviceId,
          nodeRole: pca.nodeRole,
          provider: 'ollama',
          model: 'qwen3:8b',
          routingReason: 'AI Power Node RTX 3050 available for heavy inference.',
          isRemote: request.sourceDeviceType === 'web' || request.sourceDeviceId !== pca.deviceId,
          estimatedCost: 0,
          score: 96,
        };
      }
    }

    // 4. Default Local-First or Cloud Fallback
    if (pcb && pcb.status === 'ONLINE' && request.type === 'LIGHT_INFERENCE') {
      return {
        targetNode: 'PC-B',
        targetDeviceId: pcb.deviceId,
        nodeRole: pcb.nodeRole,
        provider: 'ollama',
        model: 'qwen3:8b',
        routingReason: 'CPU Local Node available for lightweight task.',
        isRemote: false,
        estimatedCost: 0,
        score: 82,
      };
    }

    // Cloud Fallback
    return {
      targetNode: 'CLOUD',
      nodeRole: 'CLOUD_CLUSTER',
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      routingReason: 'Cloud cluster optimal for fast general inquiry.',
      isRemote: false,
      estimatedCost: 0.00001,
      score: 90,
    };
  }
}
