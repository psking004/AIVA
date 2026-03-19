/**
 * AnalyticsService - Dashboard and analytics
 */
import { PrismaService } from '../../database/prisma.service';
export declare class AnalyticsService {
    private prisma;
    constructor(prisma: PrismaService);
    getDashboard(userId: string): Promise<{
        recentTasks: any;
        recentNotes: any;
        recentDocuments: any;
        upcomingEvents: any;
        recentConversations: any;
        recentActivity: any;
        stats: {
            tasks: any;
            totalNotes: any;
            totalDocuments: any;
            totalConversations: any;
        };
    }>;
    getActivitySummary(userId: string, days?: number): Promise<{
        period: string;
        activity: any;
        totalActions: any;
    }>;
    getProductivityStats(userId: string, startDate: Date, endDate: Date): Promise<{
        period: {
            start: Date;
            end: Date;
        };
        tasksCompleted: any;
        notesCreated: any;
        documentsProcessed: any;
        eventsAttended: any;
        conversationsStarted: any;
    }>;
}
//# sourceMappingURL=analytics.service.d.ts.map