export declare class EmailTool {
    private readonly logger;
    execute(userId: string, action: string, params?: Record<string, unknown>): Promise<{
        success: boolean;
        action: string;
        params: Record<string, unknown>;
    }>;
}
//# sourceMappingURL=email.tool.d.ts.map