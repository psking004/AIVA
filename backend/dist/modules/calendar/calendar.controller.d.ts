/**
 * CalendarController - Calendar HTTP endpoints
 */
import { CalendarService } from './calendar.service';
export declare class CalendarController {
    private calendarService;
    constructor(calendarService: CalendarService);
    create(auth: string, body: any): Promise<any>;
    findAll(auth: string, filters: any): Promise<any>;
    findOne(auth: string, id: string): Promise<any>;
    update(auth: string, id: string, body: any): Promise<any>;
    remove(auth: string, id: string): Promise<any>;
    availability(auth: string, date: string, duration: string): Promise<{
        start: string;
        end: string;
    }[]>;
    private extractUserId;
}
//# sourceMappingURL=calendar.controller.d.ts.map