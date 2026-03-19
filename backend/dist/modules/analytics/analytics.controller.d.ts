/**
 * AnalyticsController - Analytics HTTP endpoints
 */
import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private analyticsService;
    constructor(analyticsService: AnalyticsService);
    getDashboard(auth: string): Promise<{
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
    getActivity(auth: string, days: string): Promise<{
        period: string;
        activity: any;
        totalActions: any;
    }>;
    getProductivity(auth: string, start: string, end: string): Promise<{
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
    private extractUserId;
}
//# sourceMappingURL=analytics.controller.d.ts.map