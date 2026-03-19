/**
 * AutomationService - Automation rules management
 */
import { PrismaService } from '../../database/prisma.service';
export declare class AutomationService {
    private prisma;
    constructor(prisma: PrismaService);
    create(userId: string, data: CreateAutomationDto): Promise<any>;
    findAll(userId: string, activeOnly?: boolean): Promise<any>;
    findOne(userId: string, id: string): Promise<any>;
    update(userId: string, id: string, data: UpdateAutomationDto): Promise<any>;
    activate(userId: string, id: string): Promise<any>;
    deactivate(userId: string, id: string): Promise<any>;
    remove(userId: string, id: string): Promise<any>;
    trigger(userId: string, id: string): Promise<{
        rule: any;
        results: any[];
    } | null>;
    private executeActions;
}
interface CreateAutomationDto {
    name: string;
    description?: string;
    trigger: Record<string, unknown>;
    actions: any[];
    conditions?: Record<string, unknown>;
}
interface UpdateAutomationDto {
    name?: string;
    description?: string;
    trigger?: Record<string, unknown>;
    actions?: any[];
    conditions?: Record<string, unknown>;
    isActive?: boolean;
}
export {};
//# sourceMappingURL=automation.service.d.ts.map