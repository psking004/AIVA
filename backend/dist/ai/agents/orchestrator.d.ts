/**
 * Agent Orchestrator - Routes tasks to specialized agents
 *
 * This is the dispatcher that AIVA uses to delegate work to
 * specialized agents based on intent classification.
 */
import { TaskAgent } from './task.agent';
import { CalendarAgent } from './calendar.agent';
import { EmailAgent } from './email.agent';
import { ResearchAgent } from './research.agent';
import { AutomationAgent } from './automation.agent';
import { MemoryService } from '../memory/memory.service';
export type AgentType = 'task' | 'calendar' | 'email' | 'research' | 'automation';
export declare class AgentOrchestrator {
    private memoryService;
    private readonly logger;
    private agents;
    constructor(taskAgent: TaskAgent, calendarAgent: CalendarAgent, emailAgent: EmailAgent, researchAgent: ResearchAgent, automationAgent: AutomationAgent, memoryService: MemoryService);
    /**
     * Execute an agent based on intent
     */
    execute(userId: string, agentType: AgentType, input: string, parameters: Record<string, unknown>, context: any): Promise<AgentExecutionResult>;
    /**
     * Get available agents
     */
    getAvailableAgents(): AgentInfo[];
    private logExecution;
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
//# sourceMappingURL=orchestrator.d.ts.map