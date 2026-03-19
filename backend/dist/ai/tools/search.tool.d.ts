export declare class SearchTool {
    private readonly logger;
    execute(userId: string, query: string, params?: Record<string, unknown>): Promise<{
        success: boolean;
        query: string;
        params: Record<string, unknown>;
        results: never[];
    }>;
}
//# sourceMappingURL=search.tool.d.ts.map