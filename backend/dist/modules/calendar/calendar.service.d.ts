/**
 * CalendarService - Calendar events CRUD
 */
import { PrismaService } from '../../database/prisma.service';
export declare class CalendarService {
    private prisma;
    constructor(prisma: PrismaService);
    create(userId: string, data: CreateEventDto): Promise<any>;
    findAll(userId: string, filters?: CalendarFilters): Promise<any>;
    findOne(userId: string, id: string): Promise<any>;
    update(userId: string, id: string, data: UpdateEventDto): Promise<any>;
    remove(userId: string, id: string): Promise<any>;
    findAvailability(userId: string, date: string, durationMinutes: number): Promise<{
        start: string;
        end: string;
    }[]>;
    private formatTime;
}
interface CreateEventDto {
    title: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime: string;
    isAllDay?: boolean;
    attendees?: string[];
    meetingLink?: string;
    visibility?: 'PRIVATE' | 'PUBLIC' | 'INTERNAL';
}
interface CalendarFilters {
    startDate?: string;
    endDate?: string;
    status?: string;
}
interface UpdateEventDto {
    title?: string;
    description?: string;
    location?: string;
    startTime?: Date;
    endTime?: Date;
    isAllDay?: boolean;
    attendees?: string[];
    meetingLink?: string;
    status?: string;
    visibility?: string;
}
export {};
//# sourceMappingURL=calendar.service.d.ts.map