/**
 * AIVA Compute Node Registry & Orchestrator
 *
 * Implements the Two-PC Compute Node Architecture (Sections 18 & 21):
 * - PC-A registers as AI Power Node (RTX 3050 CUDA, Qwen3 8B, Chatterbox)
 * - PC-B registers as CPU Local Node (i5 13th Gen, Kokoro ONNX, Whisper CPU)
 * - Android registers as Autonomous Mobile Node
 * - Dynamically evaluates node availability, VRAM, and latency to route workloads
 */

import { Injectable, Logger } from '@nestjs/common';

export type NodeId = 'PC-A' | 'PC-B' | 'ANDROID' | 'CLOUD' | string;
export type NodeRole = 'AI_POWER_NODE' | 'CPU_LOCAL_NODE' | 'MOBILE_CLIENT' | 'CLOUD_CLUSTER' | string;

export interface ComputeNodeRegistration {
  deviceId: string;
  deviceName: string;
  nodeId: NodeId;
  nodeRole: NodeRole;
  cpu: {
    model: string;
    cores: number;
    utilizationPercent?: number | undefined;
  };
  memory: {
    totalGb: number;
    availableGb: number;
    ramUsedGb?: number | undefined;
  };
  gpu: {
    hasCuda: boolean;
    deviceCount: number;
    deviceName: string;
    vramMb: number;
    vramUsedMb?: number | undefined;
    utilizationPercent?: number | undefined;
  };
  models: string[];
  ttsEngines: string[];
  capabilities: string[];
  workspaceRoots?: string[] | undefined;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  latencyMs?: number | undefined;
  activeWorkloadCount?: number | undefined;
  batteryPercent?: number | undefined;
  isPluggedIn?: boolean | undefined;
  lastHeartbeat: number;
}

@Injectable()
export class ComputeNodeService {
  private readonly logger = new Logger(ComputeNodeService.name);
  private nodes: Map<string, ComputeNodeRegistration> = new Map();
  private readonly heartbeatTimeoutMs = 60000; // 1 minute liveness timeout

  // Peer Node Circuit Breaker tracking
  private nodeFailures: Map<string, { count: number; lastFailed: number; cooldownUntil: number }> = new Map();
  private readonly failureThreshold = 3;
  private readonly failureCooldownMs = 30000; // 30s cooldown upon trip

  constructor() {
    this.logger.log('AIVA Compute Node Service initialized');
  }

  /**
   * Register or update node status
   */
  public registerNode(node: Omit<ComputeNodeRegistration, 'lastHeartbeat'>): ComputeNodeRegistration {
    const fullNode: ComputeNodeRegistration = {
      ...node,
      lastHeartbeat: Date.now(),
    };

    this.nodes.set(node.deviceId, fullNode);
    this.recordNodeSuccess(node.deviceId);
    this.logger.log(
      `Registered AIVA Compute Node: ${node.nodeId} (${node.nodeRole}) on host "${node.deviceName}" [CUDA: ${node.gpu?.hasCuda}]`
    );

    return fullNode;
  }

  /**
   * Unregister node (clean departure)
   */
  public unregisterNode(key: string): boolean {
    const node = this.findNode(key);
    if (!node) return false;
    this.nodes.delete(node.deviceId);
    this.logger.log(`Unregistered AIVA Compute Node: ${node.nodeId} (${node.deviceId})`);
    return true;
  }

  /**
   * Helper to find node by either deviceId or nodeId
   */
  public findNode(key: string): ComputeNodeRegistration | undefined {
    let node = this.nodes.get(key);
    if (!node) {
      for (const n of this.nodes.values()) {
        if (n.nodeId === key || n.deviceId === key) {
          node = n;
          break;
        }
      }
    }
    return node;
  }

  /**
   * Record heartbeat from an active node
   */
  public recordHeartbeat(key: string, latencyMs?: number): boolean {
    const node = this.findNode(key);
    if (!node) return false;

    node.lastHeartbeat = Date.now();
    node.status = 'ONLINE';
    if (latencyMs !== undefined) node.latencyMs = latencyMs;
    this.recordNodeSuccess(key);
    return true;
  }

  /**
   * Record node failure for circuit breaker protection
   */
  public recordNodeFailure(key: string): void {
    const node = this.findNode(key);
    const identifier = node?.nodeId || key;
    const current = this.nodeFailures.get(identifier) || { count: 0, lastFailed: 0, cooldownUntil: 0 };
    const now = Date.now();
    current.count += 1;
    current.lastFailed = now;
    if (current.count >= this.failureThreshold) {
      current.cooldownUntil = now + this.failureCooldownMs;
      if (node) node.status = 'BUSY';
      this.logger.warn(`[NODE CIRCUIT BREAKER] Peer ${identifier} tripped after ${current.count} failures. Cooldown for ${this.failureCooldownMs / 1000}s`);
    }
    this.nodeFailures.set(identifier, current);
  }

  /**
   * Reset node failure count on successful execution
   */
  public recordNodeSuccess(key: string): void {
    const node = this.findNode(key);
    const identifier = node?.nodeId || key;
    this.nodeFailures.delete(identifier);
    if (node && node.deviceId) this.nodeFailures.delete(node.deviceId);
  }

  /**
   * Check whether a node is active and not tripped by circuit breaker
   */
  public isNodeAvailable(key: string): boolean {
    const node = this.findNode(key);
    if (!node) return false;
    const now = Date.now();
    if (now - node.lastHeartbeat > this.heartbeatTimeoutMs) {
      node.status = 'OFFLINE';
      return false;
    }
    const failInfo = this.nodeFailures.get(node.nodeId) || this.nodeFailures.get(node.deviceId);
    if (failInfo && now < failInfo.cooldownUntil) {
      return false;
    }
    return node.status === 'ONLINE';
  }

  /**
   * List all currently registered nodes
   */
  public listNodes(): ComputeNodeRegistration[] {
    const now = Date.now();
    const result: ComputeNodeRegistration[] = [];

    for (const node of this.nodes.values()) {
      if (now - node.lastHeartbeat > this.heartbeatTimeoutMs) {
        node.status = 'OFFLINE';
      }
      result.push({ ...node });
    }

    return result;
  }

  /**
   * Select the optimal node for a workload
   */
  public selectBestNode(workloadType: 'HEAVY_INFERENCE' | 'LIGHT_INFERENCE' | 'TTS' | 'CODE'): ComputeNodeRegistration | null {
    const activeNodes = this.listNodes().filter((n) => this.isNodeAvailable(n.deviceId));

    if (activeNodes.length === 0) return null;

    if (workloadType === 'HEAVY_INFERENCE' || workloadType === 'CODE') {
      // Prefer AI Power Node with CUDA / high VRAM
      const powerNode = activeNodes.find((n) => (n.gpu?.hasCuda && (n.gpu?.vramMb ?? 0) >= 4000) || n.nodeRole === 'AI_POWER_NODE' || n.nodeId === 'PC-A');
      if (powerNode) return powerNode;
    }

    // Fall back to any active available node
    const candidate = activeNodes.find((n) => n.nodeRole === 'CPU_LOCAL_NODE' || n.nodeId === 'PC-B');
    if (candidate) return candidate;

    return activeNodes[0] || null;
  }

  /**
   * Update live telemetry (CPU, GPU, RAM, VRAM utilization) from a node
   */
  public updateTelemetry(key: string, telemetry: {
    cpuUtilizationPercent?: number;
    gpuUtilizationPercent?: number;
    vramUsedMb?: number;
    ramUsedGb?: number;
    activeWorkloadCount?: number;
    batteryPercent?: number;
    isPluggedIn?: boolean;
    latencyMs?: number;
  }): boolean {
    const node = this.findNode(key);
    if (!node) return false;

    if (telemetry.cpuUtilizationPercent !== undefined) node.cpu.utilizationPercent = telemetry.cpuUtilizationPercent;
    if (telemetry.gpuUtilizationPercent !== undefined) node.gpu.utilizationPercent = telemetry.gpuUtilizationPercent;
    if (telemetry.vramUsedMb !== undefined) node.gpu.vramUsedMb = telemetry.vramUsedMb;
    if (telemetry.ramUsedGb !== undefined) node.memory.ramUsedGb = telemetry.ramUsedGb;
    if (telemetry.activeWorkloadCount !== undefined) node.activeWorkloadCount = telemetry.activeWorkloadCount;
    if (telemetry.batteryPercent !== undefined) node.batteryPercent = telemetry.batteryPercent;
    if (telemetry.isPluggedIn !== undefined) node.isPluggedIn = telemetry.isPluggedIn;
    if (telemetry.latencyMs !== undefined) node.latencyMs = telemetry.latencyMs;

    // Auto-update status to BUSY if GPU > 90% or CPU > 90%
    if ((node.gpu.utilizationPercent ?? 0) >= 90 || (node.cpu.utilizationPercent ?? 0) >= 90) {
      node.status = 'BUSY';
    } else {
      node.status = 'ONLINE';
    }

    node.lastHeartbeat = Date.now();
    return true;
  }

  /**
   * Directly update a node's operational status (e.g. for failover or maintenance)
   */
  public setNodeStatus(key: string, status: 'ONLINE' | 'OFFLINE' | 'BUSY'): boolean {
    const node = this.findNode(key);
    if (!node) return false;
    node.status = status;
    return true;
  }

  /**
   * Retrieve node by deviceId or nodeId
   */
  public getNode(key: string): ComputeNodeRegistration | null {
    const node = this.findNode(key);
    if (!node) return null;
    if (Date.now() - node.lastHeartbeat > this.heartbeatTimeoutMs) {
      node.status = 'OFFLINE';
    }
    return { ...node };
  }

  /**
   * Retrieve node by role
   */
  public getNodeByRole(role: 'AI_POWER_NODE' | 'CPU_LOCAL_NODE'): ComputeNodeRegistration | null {
    const active = this.listNodes().filter((n) => n.status !== 'OFFLINE');
    const match = active.find((n) => n.nodeRole === role);
    return match || null;
  }
}

