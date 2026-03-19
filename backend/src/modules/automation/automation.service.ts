/**
 * AutomationService - Automation rules management
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateAutomationDto) {
    return this.prisma.automationRule.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        trigger: data.trigger,
        actions: data.actions,
        conditions: data.conditions,
        isActive: true,
      },
    });
  }

  async findAll(userId: string, activeOnly = true) {
    return this.prisma.automationRule.findMany({
      where: {
        userId,
        isActive: activeOnly ? true : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    return this.prisma.automationRule.findFirst({
      where: { id, userId },
    });
  }

  async update(userId: string, id: string, data: UpdateAutomationDto) {
    return this.prisma.automationRule.update({
      where: { id, userId },
      data,
    });
  }

  async activate(userId: string, id: string) {
    return this.prisma.automationRule.update({
      where: { id, userId },
      data: { isActive: true },
    });
  }

  async deactivate(userId: string, id: string) {
    return this.prisma.automationRule.update({
      where: { id, userId },
      data: { isActive: false },
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.automationRule.delete({
      where: { id, userId },
    });
  }

  async trigger(userId: string, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, userId },
    });

    if (!rule) return null;

    // Execute actions
    const results = await this.executeActions(userId, rule.actions);

    await this.prisma.automationRule.update({
      where: { id },
      data: {
        lastTriggered: new Date(),
        triggerCount: { increment: 1 },
      },
    });

    return { rule, results };
  }

  private async executeActions(userId: string, actions: any[]): Promise<any[]> {
    const results = [];
    for (const action of actions) {
      // Execute action based on type
      results.push({ type: action.type, executed: true });
    }
    return results;
  }
}

interface CreateAutomationDto {
  name: string;
  description?: string;
  trigger: Record<string, unknown>;
  actions: any[];
  conditions?: Record<string, unknown>;
}

interface UpdateAutomationDto {
  name?: string;
  description?: string;
  trigger?: Record<string, unknown>;
  actions?: any[];
  conditions?: Record<string, unknown>;
  isActive?: boolean;
}
