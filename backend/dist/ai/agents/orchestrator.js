"use strict";
/**
 * Agent Orchestrator - Routes tasks to specialized agents
 *
 * This is the dispatcher that AIVA uses to delegate work to
 * specialized agents based on intent classification.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AgentOrchestrator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const common_1 = require("@nestjs/common");
const task_agent_1 = require("./task.agent");
const calendar_agent_1 = require("./calendar.agent");
const email_agent_1 = require("./email.agent");
const research_agent_1 = require("./research.agent");
const automation_agent_1 = require("./automation.agent");
const memory_service_1 = require("../memory/memory.service");
let AgentOrchestrator = AgentOrchestrator_1 = class AgentOrchestrator {
    memoryService;
    logger = new common_1.Logger(AgentOrchestrator_1.name);
    agents;
    constructor(taskAgent, calendarAgent, emailAgent, researchAgent, automationAgent, memoryService) {
        this.memoryService = memoryService;
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
    async execute(userId, agentType, input, parameters, context) {
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
        }
        catch (error) {
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
    getAvailableAgents() {
        return Array.from(this.agents.entries()).map(([type, agent]) => ({
            type,
            name: agent.name,
            description: agent.description,
            tools: agent.tools || [],
        }));
    }
    async logExecution(userId, agentType, result) {
        // This would typically write to the database
        this.logger.debug(`Agent execution logged: ${agentType} for ${userId}`);
    }
};
exports.AgentOrchestrator = AgentOrchestrator;
exports.AgentOrchestrator = AgentOrchestrator = AgentOrchestrator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [task_agent_1.TaskAgent,
        calendar_agent_1.CalendarAgent,
        email_agent_1.EmailAgent,
        research_agent_1.ResearchAgent,
        automation_agent_1.AutomationAgent,
        memory_service_1.MemoryService])
], AgentOrchestrator);
//# sourceMappingURL=orchestrator.js.map