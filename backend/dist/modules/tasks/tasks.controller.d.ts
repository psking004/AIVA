/**
 * TasksController - Task HTTP endpoints
 */
import { TasksService } from './tasks.service';
export declare class TasksController {
    private tasksService;
    constructor(tasksService: TasksService);
    create(auth: string, body: any): Promise<any>;
    findAll(auth: string, filters: any): Promise<any>;
    findOne(auth: string, id: string): Promise<any>;
    update(auth: string, id: string, body: any): Promise<any>;
    remove(auth: string, id: string): Promise<any>;
    private extractUserId;
}
//# sourceMappingURL=tasks.controller.d.ts.map