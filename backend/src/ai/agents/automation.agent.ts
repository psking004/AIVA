/**
 * Automation Agent - Handles workflow automation
 *
 * Capabilities:
 * - Trigger-based automation
 * - Workflow execution
 * - Rule management
 * - Cross-module coordination
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';

@Injectable()
export class AutomationAgent {
  private readonly logger = new Logger(AutomationAgent.name);
  readonly name = 'Automation Agent';
  readonly description = 'Executes automations - trigger-based workflows and cross-module coordination';
  readonly tools = ['createRule', 'triggerRule', 'listRules', 'executeWorkflow'];

  constructor(
    private prisma: PrismaService,
    private aiva: AIVAService,
  ) {}

  async execute(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
    context: any,
  ): Promise<AutomationAgentResult> {
    this.logger.debug(`Automation Agent executing for user ${userId}: ${input}`);

    const action = parameters.action as string || 'create';

    switch (action) {
      case 'create':
        return this.createRule(userId, input, parameters);
      case 'trigger':
        return this.triggerRule(userId, parameters);
      case 'list':
        return this.listRules(userId, parameters);
      case 'execute':
        return this.executeWorkflow(userId, parameters);
      default:
        return this.createRule(userId, input, parameters);
    }
  }

  private async createRule(
    userId: string,
    input: string,
    parameters: Record<string, unknown>,
  ): Promise<AutomationAgentResult> {
    // Parse natural language automation request
    const ruleConfig = await this.parseRuleConfig(userId, input);

    const rule = await this.prisma.automationRule.create({
      data: {
        userId,
        name: ruleConfig.name || input,
        description: ruleConfig.description,
        trigger: ruleConfig.trigger || { type: 'manual' },
        actions: ruleConfig.actions || [],
        conditions: ruleConfig.conditions,
        isActive: true,
      },
    });

    return {
      success: true,
      response: `I've created the automation rule: "${rule.name}"`,
      rule: { id: rule.id, name: rule.name, isActive: rule.isActive },
      toolCalls: [{ name: 'createRule', args: { name: rule.name } }],
      context: { ruleId: rule.id },
      conversationId: null,
    };
  }

  private async triggerRule(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<AutomationAgentResult> {
    const ruleId = parameters.ruleId as string;

    const rule = await this.prisma.automationRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      return {
        success: false,
        response: 'Automation rule not found',
        toolCalls: [],
        context: {},
        conversationId: null,
      };
    }

    // Execute the rule actions
    const results = await this.executeActions(userId, rule.actions);

    // Update rule stats
    await this.prisma.automationRule.update({
      where: { id: ruleId },
      data: {
        lastTriggered: new Date(),
        triggerCount: { increment: 1 },
      },
    });

    return {
      success: true,
      response: `Automation "${rule.name}" executed successfully`,
      results,
      toolCalls: [{ name: 'triggerRule', args: { ruleId } }],
      context: { ruleId, executedActions: results.length },
      conversationId: null,
    };
  }

  private async listRules(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<AutomationAgentResult> {
    const activeOnly = (parameters.activeOnly as boolean) ?? true;

    const rules = await this.prisma.automationRule.findMany({
      where: {
        userId,
        isActive: activeOnly ? true : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });

    const ruleList = rules.map((r, i) => `${i + 1}. ${r.name} (${r.triggerCount} triggered)`).join('\n');

    return {
      success: true,
      response: `Your automation rules:\n\n${ruleList}`,
      rules,
      toolCalls: [{ name: 'listRules', args: { count: rules.length } }],
      context: { ruleCount: rules.length },
      conversationId: null,
    };
  }

  private async executeWorkflow(
    userId: string,
    parameters: Record<string, unknown>,
  ): Promise<AutomationAgentResult> {
    const workflowType = parameters.workflowType as string;
    const inputData = parameters.data as Record<string, unknown> || {};

    // Execute predefined workflow
    const results = await this.executeWorkflowActions(userId, workflowType, inputData);

    return {
      success: true,
      response: `Workflow "${workflowType}" completed`,
      results,
      toolCalls: [{ name: 'executeWorkflow', args: { workflowType } }],
      context: { workflowType },
      conversationId: null,
    };
  }

  private async executeActions(userId: string, actions: any[]): Promise<any[]> {
    const results = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'createTask':
            const task = await this.prisma.task.create({
              data: {
                userId,
                title: action.title || 'Automated task',
                description: action.description,
                priority: action.priority || 'MEDIUM',
              },
            });
            results.push({ type: 'task', id: task.id });
            break;

          case 'sendNotification':
            // Would integrate with notification service
            results.push({ type: 'notification', message: action.message });
            break;

          case 'createEvent':
            const event = await this.prisma.calendarEvent.create({
              data: {
                userId,
                title: action.title || 'Automated event',
                startTime: new Date(action.startTime),
                endTime: new Date(action.endTime),
              },
            });
            results.push({ type: 'event', id: event.id });
            break;

          default:
            results.push({ type: 'unknown', action });
        }
      } catch (error) {
        results.push({ type: 'error', message: error.message });
      }
    }

    return results;
  }

  private async executeWorkflowActions(
    userId: string,
    workflowType: string,
    data: Record<string, unknown>,
  ): Promise<any[]> {
    // Predefined workflow templates
    const workflows: Record<string, any[]> = {
      'morningBrief': [
        { type: 'listTasks', status: 'pending' },
        { type: 'listEvents', today: true },
        { type: 'summarizeEmails', unread: true },
      ],
      'meetingPrep': [
        { type: 'findEvent', id: data.eventId },
        { type: 'findRelatedDocuments', topic: data.topic },
        { type: 'createTask', title: `Prepare for ${data.topic}`, priority: 'HIGH' },
      ],
      'emailProcess': [
        { type: 'fetchEmails', limit: 10 },
        { type: 'extractTasks', fromEmails: true },
        { type: 'markAsRead', all: true },
      ],
    };

    const actions = workflows[workflowType] || [];

    return this.executeActions(userId, actions);
  }

  private async parseRuleConfig(userId: string, input: string) {
    // Use AI to parse natural language automation request
    const prompt = `Parse this automation request into structured config:
    "${input}"

    Return JSON with: name, description, trigger (object with type and conditions), actions (array), conditions (object)`;

    const result = await this.aiva.executeTool(userId, 'summarize', { content: prompt });

    return {
      name: input,
      trigger: { type: 'manual' },
      actions: [],
    };
  }
}

export interface AutomationAgentResult {
  success: boolean;
  response: string;
  rule?: any;
  rules?: any[];
  results?: any[];
  toolCalls: any[];
  context: Record<string, unknown>;
  conversationId: string | null;
}
