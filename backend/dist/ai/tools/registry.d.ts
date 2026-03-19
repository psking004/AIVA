/**
 * Tool Registry - Central registry for all available tools
 *
 * Tools are functions that agents can call to perform actions
 * across different system modules.
 */
import { PrismaService } from '../../database/prisma.service';
export type ToolHandler = (userId: string, args: Record<string, unknown>) => Promise<any>;
export declare class ToolRegistry {
    private prisma;
    private readonly logger;
    private tools;
    constructor(prisma: PrismaService);
    /**
     * Register a tool handler
     */
    register(name: string, handler: ToolHandler, description: string): void;
    /**
     * Execute a tool
     */
    execute(userId: string, toolName: string, args: Record<string, unknown>): Promise<any>;
    /**
     * List available tools
     */
    listTools(): ToolInfo[];
    /**
     * Check if tool exists
     */
    hasTool(name: string): boolean;
    /**
     * Register built-in tools
     */
    private registerBuiltInTools;
}
export interface ToolInfo {
    name: string;
    description: string;
}
//# sourceMappingURL=registry.d.ts.map