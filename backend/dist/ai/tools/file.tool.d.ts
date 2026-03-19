export declare class FileTool {
    private readonly logger;
    execute(userId: string, action: string, params?: Record<string, unknown>): Promise<{
        success: boolean;
        action: string;
        params: Record<string, unknown>;
    }>;
}
//# sourceMappingURL=file.tool.d.ts.map