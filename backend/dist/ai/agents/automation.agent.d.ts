/**
 * Automation Agent - Handles workflow automation
 *
 * Capabilities:
 * - Trigger-based automation
 * - Workflow execution
 * - Rule management
 * - Cross-module coordination
 */
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';
export declare class AutomationAgent {
    private prisma;
    private aiva;
    private readonly logger;
    readonly name = "Automation Agent";
    readonly description = "Executes automations - trigger-based workflows and cross-module coordination";
    readonly tools: string[];
    constructor(prisma: PrismaService, aiva: AIVAService);
    execute(userId: string, input: string, parameters: Record<string, unknown>, context: any): Promise<AutomationAgentResult>;
    private createRule;
    private triggerRule;
    private listRules;
    private executeWorkflow;
    private executeActions;
    private executeWorkflowActions;
    private parseRuleConfig;
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
//# sourceMappingURL=automation.agent.d.ts.map