export declare class CalendarTool {
    private readonly logger;
    execute(userId: string, action: string, params?: Record<string, unknown>): Promise<{
        success: boolean;
        action: string;
        params: Record<string, unknown>;
    }>;
}
//# sourceMappingURL=calendar.tool.d.ts.map