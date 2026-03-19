/**
 * TasksService - Task CRUD operations
 */
import { PrismaService } from '../../database/prisma.service';
export declare class TasksService {
    private prisma;
    constructor(prisma: PrismaService);
    create(userId: string, data: CreateTaskDto): Promise<any>;
    findAll(userId: string, filters: TaskFilters): Promise<any>;
    findOne(userId: string, id: string): Promise<any>;
    update(userId: string, id: string, data: UpdateTaskDto): Promise<any>;
    remove(userId: string, id: string): Promise<any>;
    bulkUpdate(userId: string, ids: string[], data: UpdateTaskDto): Promise<any>;
}
interface CreateTaskDto {
    title: string;
    description?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    dueDate?: string;
    tags?: string[];
}
interface TaskFilters {
    status?: string;
    priority?: string;
    parentId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
interface UpdateTaskDto {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    dueDate?: string;
    completedAt?: Date;
    tags?: string[];
}
export {};
//# sourceMappingURL=tasks.service.d.ts.map