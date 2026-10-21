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
import { ComputeNodeService, NodeId, NodeRole } from './compute-node.service';
import { AivaPolicyEngine } from '../policy/aiva-policy-engine';

export interface WorkloadRequest {
  type: 'HEAVY_INFERENCE' | 'LIGHT_INFERENCE' | 'CODING' | 'FILE_OPS' | 'EMBEDDINGS' | 'TTS' | 'AI_INFERENCE';
  sourceDeviceId: string;
  sourceDeviceType: 'android' | 'desktop' | 'web';
  privacyLevel: 'PUBLIC' | 'STANDARD' | 'PRIVATE';
  priority?: 'URGENT' | 'NORMAL' | 'BACKGROUND';
  requiredCapability?: string;
  payloadSizeKb?: number;
}

export interface SchedulingDecision {
  targetNode: NodeId;
  targetDeviceId?: string;
  nodeRole: NodeRole;
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

    const activeNodes = this.nodeService.listNodes().filter((n) => this.nodeService.isNodeAvailable(n.deviceId));
    
    // Capability-based peer matching (prefer AI_POWER_NODE / CUDA for heavy tasks, CPU_LOCAL_NODE for lighter tasks)
    const powerNode = activeNodes.find(
      (n) => (n.nodeRole === 'AI_POWER_NODE' || (n.gpu?.hasCuda && (n.gpu?.vramMb ?? 0) >= 4000) || n.nodeId === 'PC-A')
    );
    const cpuNode = activeNodes.find(
      (n) => (n.nodeRole === 'CPU_LOCAL_NODE' || n.nodeId === 'PC-B')
    );

    this.logger.debug(
      `Scheduling workload "${request.type}" from ${request.sourceDeviceType} [Privacy: ${request.privacyLevel}]`
    );

    // 1. Privacy Rule: Strictly forbid Cloud for PRIVATE workloads
    if (request.privacyLevel === 'PRIVATE') {
      if (powerNode && powerNode.status === 'ONLINE' && (powerNode.gpu?.utilizationPercent ?? 0) < 90) {
        return {
          targetNode: powerNode.nodeId,
          targetDeviceId: powerNode.deviceId,
          nodeRole: powerNode.nodeRole,
          provider: 'ollama',
          model: powerNode.models?.[0] || 'qwen3.5:latest',
          routingReason: 'Privacy policy: Private workload routed to local AI Power Node.',
          isRemote: request.sourceDeviceId !== powerNode.deviceId,
          estimatedCost: 0,
          score: 98,
        };
      }

      if (cpuNode && cpuNode.status === 'ONLINE') {
        return {
          targetNode: cpuNode.nodeId,
          targetDeviceId: cpuNode.deviceId,
          nodeRole: cpuNode.nodeRole,
          provider: 'ollama',
          model: cpuNode.models?.[0] || 'qwen3.5:latest',
          routingReason: 'Privacy policy: Private workload routed to local CPU Node.',
          isRemote: request.sourceDeviceId !== cpuNode.deviceId,
          estimatedCost: 0,
          score: 85,
        };
      }

      // If no local node available for private workload, reject rather than leak to cloud
      return {
        targetNode: 'LOCAL_STANDALONE',
        nodeRole: 'STANDALONE_NODE',
        provider: 'local',
        model: 'none',
        routingReason: 'No authorized local compute node online to process PRIVATE workload securely.',
        isRemote: false,
        estimatedCost: 0,
        score: 0,
      };
    }

    // 2. Explicit capability routing
    // LOCAL_LLM must prefer an available local node before cloud fallback.
    if (request.requiredCapability === 'LOCAL_LLM') {
      if (powerNode && powerNode.status === 'ONLINE' &&
          (powerNode.models?.length ?? 0) > 0 &&
          (powerNode.gpu?.utilizationPercent ?? 0) < 90) {
        return {
          targetNode: powerNode.nodeId,
          targetDeviceId: powerNode.deviceId,
          nodeRole: powerNode.nodeRole,
          provider: 'ollama',
          model: powerNode.models?.[0] || 'qwen3.5:latest',
          routingReason: `${powerNode.nodeId} selected for explicit LOCAL_LLM capability.`,
          isRemote: request.sourceDeviceId !== powerNode.deviceId,
          estimatedCost: 0,
          score: 99,
        };
      }

      if (cpuNode && cpuNode.status === 'ONLINE' &&
          (cpuNode.models?.length ?? 0) > 0) {
        return {
          targetNode: cpuNode.nodeId,
          targetDeviceId: cpuNode.deviceId,
          nodeRole: cpuNode.nodeRole,
          provider: 'ollama',
          model: cpuNode.models?.[0] || 'qwen3:4b',
          routingReason: `${cpuNode.nodeId} selected for explicit LOCAL_LLM capability.`,
          isRemote: request.sourceDeviceId !== cpuNode.deviceId,
          estimatedCost: 0,
          score: 95,
        };
      }
    }
    // 2. Android Standard Route (PC-Off World Resilience)
    if (request.sourceDeviceType === 'android') {
      // If Android requests heavy inference or coding, AND an AI Power Node is online with available capacity:
      if (
        (request.type === 'HEAVY_INFERENCE' || request.type === 'CODING') &&
        powerNode &&
        powerNode.status === 'ONLINE' &&
        (powerNode.gpu?.utilizationPercent ?? 0) < 85
      ) {
        return {
          targetNode: powerNode.nodeId,
          targetDeviceId: powerNode.deviceId,
          nodeRole: powerNode.nodeRole,
          provider: 'ollama',
          model: powerNode.models?.[0] || 'qwen3.5:latest',
          routingReason: `Idle Resource Harvesting: Android heavy workload offloaded to underutilized ${powerNode.nodeId} (${powerNode.gpu?.deviceName || 'GPU'}).`,
          isRemote: true,
          estimatedCost: 0,
          score: 95,
        };
      }

      // Default autonomous mobile cloud route (Gemini) - Zero PC dependency
      return {
        targetNode: 'CLOUD',
        nodeRole: 'CLOUD_CLUSTER',
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        routingReason: 'Mobile Autonomous Route: Zero PC dependency, high-speed cloud reasoning via Gemini.',
        isRemote: false,
        estimatedCost: 0.00001,
        score: 92,
      };
    }

    // 3. Desktop / PC-B Workload Scheduling
    if (request.type === 'HEAVY_INFERENCE' || request.type === 'CODING') {
      // Load-Aware Shedding Check for Power Node:
      if (powerNode && (powerNode.status === 'ONLINE' || powerNode.status === 'BUSY')) {
        const maxGpu = this.configService.get<number>('MAX_GPU_LOAD') ?? 90;
        const isOverloaded =
          (powerNode.gpu?.utilizationPercent ?? 0) >= maxGpu ||
          (powerNode.cpu?.utilizationPercent ?? 0) >= 90 ||
          powerNode.status === 'BUSY';

        if (isOverloaded) {
          this.logger.warn(`[LOAD SHEDDING] ${powerNode.nodeId} is at capacity (>90%). Shedding workload to cloud/secondary.`);
          return {
            targetNode: 'CLOUD',
            nodeRole: 'CLOUD_CLUSTER',
            provider: 'openrouter',
            model: 'qwen/qwen-2.5-72b-instruct',
            routingReason: `Load-Aware Shedding: ${powerNode.nodeId} is busy; task shed to Cloud accelerator.`,
            isRemote: false,
            estimatedCost: 0.0005,
            score: 75,
          };
        }

        // Power Node is available and optimal
        return {
          targetNode: powerNode.nodeId,
          targetDeviceId: powerNode.deviceId,
          nodeRole: powerNode.nodeRole,
          provider: 'ollama',
          model: powerNode.models?.[0] || 'qwen3.5:latest',
          routingReason: `${powerNode.nodeId} (${powerNode.gpu?.deviceName || 'GPU'}) available for heavy inference.`,
          isRemote: request.sourceDeviceType === 'web' || request.sourceDeviceId !== powerNode.deviceId,
          estimatedCost: 0,
          score: 96,
        };
      }
    }

    // 4. Default Local-First or Cloud Fallback
    if (cpuNode && cpuNode.status === 'ONLINE' && request.type === 'LIGHT_INFERENCE') {
      return {
        targetNode: cpuNode.nodeId,
        targetDeviceId: cpuNode.deviceId,
        nodeRole: cpuNode.nodeRole,
        provider: 'ollama',
        model: cpuNode.models?.[0] || 'qwen3.5:latest',
        routingReason: `${cpuNode.nodeId} CPU Local Node available for lightweight task.`,
        isRemote: request.sourceDeviceId !== cpuNode.deviceId,
        estimatedCost: 0,
        score: 82,
      };
    }

    // Cloud Fallback
    return {
      targetNode: 'CLOUD',
      nodeRole: 'CLOUD_CLUSTER',
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      routingReason: 'Cloud cluster optimal for fast general inquiry.',
      isRemote: false,
      estimatedCost: 0.00001,
      score: 90,
    };
  }
}
