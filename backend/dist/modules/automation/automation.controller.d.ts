/**
 * AutomationController - Automation HTTP endpoints
 */
import { AutomationService } from './automation.service';
export declare class AutomationController {
    private automationService;
    constructor(automationService: AutomationService);
    create(auth: string, body: any): Promise<any>;
    findAll(auth: string, active: string): Promise<any>;
    findOne(auth: string, id: string): Promise<any>;
    update(auth: string, id: string, body: any): Promise<any>;
    activate(auth: string, id: string): Promise<any>;
    deactivate(auth: string, id: string): Promise<any>;
    trigger(auth: string, id: string): Promise<{
        rule: any;
        results: any[];
    } | null>;
    remove(auth: string, id: string): Promise<any>;
    private extractUserId;
}
//# sourceMappingURL=automation.controller.d.ts.map