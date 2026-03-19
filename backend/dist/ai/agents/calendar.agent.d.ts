/**
 * Calendar Agent - Handles calendar and scheduling operations
 *
 * Capabilities:
 * - Create events from natural language
 * - Smart scheduling
 * - Conflict detection
 * - Meeting coordination
 */
import { PrismaService } from '../../database/prisma.service';
import { AIVAService } from '../aiva.service';
export declare class CalendarAgent {
    private prisma;
    private aiva;
    private readonly logger;
    readonly name = "Calendar Agent";
    readonly description = "Manages calendar events - scheduling, conflict detection, and meeting coordination";
    readonly tools: string[];
    constructor(prisma: PrismaService, aiva: AIVAService);
    execute(userId: string, input: string, parameters: Record<string, unknown>, context: any): Promise<CalendarAgentResult>;
    private createEvent;
    private updateEvent;
    private deleteEvent;
    private listEvents;
    private findAvailability;
    private parseEventDetails;
    private formatTimeSlot;
}
export interface CalendarAgentResult {
    success: boolean;
    response: string;
    event?: any;
    events?: any[];
    availableSlots?: string[];
    toolCalls: any[];
    context: Record<string, unknown>;
    conversationId: string | null;
}
//# sourceMappingURL=calendar.agent.d.ts.map