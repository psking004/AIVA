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
  ) {}

  /**
   * Standard Chat Completion
   */
  @Post('chat')
  async chat(@Request() req: any, @Body() body: ChatRequestDto) {
    const userId = req.user.id;
    return this.aivaService.chat(userId, body.message, body.conversationId);
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
}
