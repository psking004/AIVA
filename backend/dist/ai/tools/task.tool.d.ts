export declare class TaskTool {
    private readonly logger;
    execute(userId: string, action: string, params?: Record<string, unknown>): Promise<{
        success: boolean;
        action: string;
        params: Record<string, unknown>;
    }>;
}
//# sourceMappingURL=task.tool.d.ts.map