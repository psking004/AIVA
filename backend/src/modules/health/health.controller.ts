/**
 * Health Controller
 *
 * Exposes /health and /health/ready endpoints for system monitoring,
 * load balancers, and mobile/desktop clients.
 */

import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../cache/redis.service';
import { ModelRouterService } from '../../ai/router/model-router.service';
import { checkHealth, checkReadiness } from '../../utils/health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  @Get()
  async getHealth() {
    return checkHealth(this.prisma, this.redis, this.modelRouter);
  }

  @Get('ready')
  async getReadiness() {
    const isReady = await checkReadiness(this.prisma, this.redis);
    return { ready: isReady, timestamp: new Date().toISOString() };
  }

  @Get('providers')
  async getProviders() {
    return this.modelRouter.getStatus();
  }
}
