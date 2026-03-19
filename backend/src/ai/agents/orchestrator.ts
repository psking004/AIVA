/**
 * Agent Orchestrator - Routes tasks to specialized agents
 *
 * This is the dispatcher that AIVA uses to delegate work to
 * specialized agents based on intent classification.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { TaskAgent } from './task.agent';
import { CalendarAgent } from './calendar.agent';
import { EmailAgent } from './email.agent';
import { ResearchAgent } from './research.agent';
import { AutomationAgent } from './automation.agent';
import { MemoryService } from '../memory/memory.service';

export type AgentType = 'task' | 'calendar' | 'email' | 'research' | 'automation';

@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);
  private agents: Map<AgentType, any>;

  constructor(
    taskAgent: TaskAgent,
    calendarAgent: CalendarAgent,
    emailAgent: EmailAgent,
    researchAgent: ResearchAgent,
    automationAgent: AutomationAgent,
    private memoryService: MemoryService,
  ) {
    this.agents = new Map([
      ['task', taskAgent],
      ['calendar', calendarAgent],
      ['email', emailAgent],
      ['research', researchAgent],
      ['automation', automationAgent],
    ]);

    this.logger.log(`Agent Orchestrator initialized with ${this.agents.size} agents`);
  }

  /**
   * Execute an agent based on intent
   */
  async execute(
    userId: string,
    agentType: AgentType,
    input: string,
    parameters: Record<string, unknown>,
    context: any,
  ): Promise<AgentExecutionResult> {
    const agent = this.agents.get(agentType);

    if (!agent) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    this.logger.log(`Executing ${agentType} agent for user ${userId}`);

    try {
      // Execute the agent
      const result = await agent.execute(userId, input, parameters, context);

      // Log execution
      await this.logExecution(userId, agentType, result);

      return {
        conversationId: result.conversationId || await this.memoryService.getOrCreateConversation(userId),
        response: result.response,
        agentType,
        toolCalls: result.toolCalls || [],
        context: result.context,
      };
    } catch (error) {
      this.logger.error(`Agent ${agentType} failed: ${error.message}`);

      await this.logExecution(userId, agentType, {
        success: false,
        error: error.message,
      });

      return {
        conversationId: await this.memoryService.getOrCreateConversation(userId),
        response: `I encountered an error while processing your ${agentType} request: ${error.message}`,
        agentType,
        toolCalls: [],
        context,
      };
    }
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): AgentInfo[] {
    return Array.from(this.agents.entries()).map(([type, agent]) => ({
      type,
      name: agent.name,
      description: agent.description,
      tools: agent.tools || [],
    }));
  }

  private async logExecution(userId: string, agentType: string, result: any) {
    // This would typically write to the database
    this.logger.debug(`Agent execution logged: ${agentType} for ${userId}`);
  }
}

export interface AgentExecutionResult {
  conversationId: string;
  response: string;
  agentType: string;
  toolCalls: any[];
  context: any;
}

export interface AgentInfo {
  type: string;
  name: string;
  description: string;
  tools: string[];
}
