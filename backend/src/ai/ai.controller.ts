/**
 * AI Controller - HTTP endpoints for AI Chat, Streaming, and Model Status
 */

import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AIVAService } from './aiva.service';
import { ModelRouterService } from './router/model-router.service';
import { MemoryOrchestrator } from './memory/memory-orchestrator.service';
import { DeviceAuthGuard } from '../modules/auth/guards/device-auth.guard';
import { IsString, IsOptional, IsObject } from 'class-validator';

import { ComputeNodeService, type ComputeNodeRegistration } from './nodes/compute-node.service';
import { ComputeSchedulerService, WorkloadRequest } from './nodes/compute-scheduler.service';
import { RemoteAgentService, RemoteExecutionRequest } from './nodes/remote-agent.service';
import { FabricDispatchService } from './nodes/fabric-dispatch.service';

export class ChatRequestDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsObject()
  options?: {
    temperature?: number;
    maxTokens?: number;
    strategy?: string;
  };
}

@Controller('ai')
@UseGuards(DeviceAuthGuard)
export class AIController {
  constructor(
    private readonly aivaService: AIVAService,
    private readonly modelRouter: ModelRouterService,
    private readonly memoryOrchestrator: MemoryOrchestrator,
    private readonly computeNodeService: ComputeNodeService,
    private readonly computeScheduler: ComputeSchedulerService,
    private readonly remoteAgent: RemoteAgentService,
    private readonly fabricDispatch: FabricDispatchService,
  ) {}

  /**
   * Standard Chat Completion
   */
  @Post('chat')
  async chat(@Request() req: any, @Body() body: ChatRequestDto) {
    const userId = req.user?.id;
    const deviceId = req.deviceId || req.headers?.['x-device-id'] || 'none';
    const clientPlatform =
      (req.headers?.['x-client-platform'] as string) ||
      (req.headers?.['x-platform'] as string) ||
      'web';
    const requestId =
      (req.headers?.['x-request-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return this.aivaService.chat(userId, body.message, body.conversationId, {
      requestId,
      authenticated: !!req.user,
      deviceAuthorized: !!req.deviceId || deviceId !== 'none',
      route: '/ai/chat',
      mode: body.options?.strategy || 'default',
      clientPlatform,
    });
  }

  /**
   * Server-Sent Events (SSE) Streaming Chat Completion
   */
  @Post('stream')
  async streamChat(
    @Request() req: any,
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ) {
    const userId = req.user.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const response = await this.modelRouter.streamChat(
        [{ role: 'user', content: body.message }],
        (chunk: string) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        },
        body.options,
      );

      // Record interaction turn in memory
      await this.memoryOrchestrator.writeBack({
        type: 'user_turn',
        userId,
        content: body.message,
      });

      await this.memoryOrchestrator.writeBack({
        type: 'assistant_turn',
        userId,
        content: response.content,
      });

      res.write(`data: ${JSON.stringify({ done: true, fullResponse: response.content })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Get Model Router & Provider Health Status
   */
  @Get('status')
  async getStatus() {
    return this.modelRouter.getStatus();
  }

  /**
   * Get Memory Statistics for authenticated user
   */
  @Get('memory/stats')
  async getMemoryStats(@Request() req: any) {
    return this.memoryOrchestrator.getStats(req.user.id);
  }

  /**
   * Register or Update Node in AIVA Compute Fabric
   */
  @Post('fabric/register')
  async registerNode(@Body() body: Omit<ComputeNodeRegistration, 'lastHeartbeat'>) {
    return this.computeNodeService.registerNode(body);
  }

  /**
   * Node Heartbeat Ping
   */
  @Post('fabric/heartbeat')
  async heartbeat(@Body() body: { deviceId: string; latencyMs?: number }) {
    const success = this.computeNodeService.recordHeartbeat(body.deviceId, body.latencyMs);
    return { success, deviceId: body.deviceId, timestamp: Date.now() };
  }

  /**
   * Get Live Compute Fabric Nodes & Telemetry
   */
  @Get('fabric/nodes')
  async getFabricNodes() {
    return this.computeNodeService.listNodes();
  }

  /**
   * Schedule Workload across Compute Fabric
   */
  @Post('fabric/schedule')
  async scheduleWorkload(@Body() body: WorkloadRequest) {
    return this.computeScheduler.schedule(body);
  }

  /**
   * Update Node Telemetry Heartbeat
   */
  @Post('fabric/telemetry')
  async updateTelemetry(
    @Body()
    body: {
      nodeId: string;
      cpuUtilizationPercent?: number;
      gpuUtilizationPercent?: number;
      vramUsedMb?: number;
      ramUsedGb?: number;
      status?: 'ONLINE' | 'BUSY' | 'OFFLINE';
    },
  ) {
    return this.computeNodeService.updateTelemetry(body.nodeId, body);
  }

  /**
   * Execute Remote Capability through Protected Remote Agent
   */

  /**
   * Poll for work assigned to the authenticated compute node.
   */
  @Post('fabric/work/poll')
  async pollFabricWork(
    @Request() req: any,
    @Body() body: {
      nodeId: 'PC-A' | 'PC-B' | 'ANDROID' | 'CLOUD';
    },
  ) {
    const deviceId =
      req.deviceId ||
      req.headers?.['x-device-id'];

    if (!deviceId) {
      throw new Error('Authenticated device ID is required');
    }

    if (!body?.nodeId) {
      throw new Error('nodeId is required');
    }

    const node = this.computeNodeService.getNode(deviceId);

    if (!node) {
      throw new Error('Device is not registered with the compute fabric');
    }

    if (node.nodeId !== body.nodeId) {
      throw new Error('Authenticated device/node mismatch');
    }

    if (node.status !== 'ONLINE') {
      return {
        work: null,
        reason: 'NODE_OFFLINE',
        timestamp: Date.now(),
      };
    }

    return {
      work: this.fabricDispatch.claimWork(
        deviceId,
        body.nodeId,
      ),
      timestamp: Date.now(),
    };
  }

  /**
   * Submit successful node execution.
   */
  @Post('fabric/work/complete')
  async completeFabricWork(
    @Request() req: any,
    @Body()
    body: {
      requestId: string;
      result?: {
        content?: string;
        model?: string;
        provider?: string;
        latencyMs?: number;
      };
    },
  ) {
    const deviceId =
      req.deviceId ||
      req.headers?.['x-device-id'];

    if (!deviceId) {
      throw new Error('Authenticated device ID is required');
    }

    if (!body?.requestId) {
      throw new Error('requestId is required');
    }

    const work = this.fabricDispatch.completeWork(
      body.requestId,
      deviceId,
      body.result,
    );

    return {
      success: true,
      requestId: work.requestId,
      status: work.status,
      result: work.result,
      timestamp: Date.now(),
    };
  }

  /**
   * Submit failed node execution.
   */
  @Post('fabric/work/fail')
  async failFabricWork(
    @Request() req: any,
    @Body()
    body: {
      requestId: string;
      error: string;
    },
  ) {
    const deviceId =
      req.deviceId ||
      req.headers?.['x-device-id'];

    if (!deviceId) {
      throw new Error('Authenticated device ID is required');
    }

    if (!body?.requestId) {
      throw new Error('requestId is required');
    }

    const work = this.fabricDispatch.failWork(
      body.requestId,
      deviceId,
      body.error || 'Unknown node execution error',
    );

    return {
      success: true,
      requestId: work.requestId,
      status: work.status,
      error: work.error,
      timestamp: Date.now(),
    };
  }

  @Post('remote/execute')
  async executeRemoteCapability(@Body() body: RemoteExecutionRequest) {
    return this.remoteAgent.executeRemoteCapability(body);
  }
}
