/**
 * EmailController - Email HTTP endpoints
 */
import { EmailService } from './email.service';
export declare class EmailController {
    private emailService;
    constructor(emailService: EmailService);
    connect(auth: string, body: any): Promise<any>;
    getAccounts(auth: string): Promise<any>;
    getMessages(auth: string, filters: any): Promise<any>;
    markAsRead(auth: string, id: string): Promise<any>;
    markAsStarred(auth: string, id: string): Promise<any>;
    deleteEmail(auth: string, id: string): Promise<any>;
    private extractUserId;
}
//# sourceMappingURL=email.controller.d.ts.map