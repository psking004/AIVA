/**
 * NotesController - Notes HTTP endpoints
 */
import { NotesService } from './notes.service';
export declare class NotesController {
    private notesService;
    constructor(notesService: NotesService);
    create(auth: string, body: any): Promise<any>;
    findAll(auth: string, filters: any): Promise<any>;
    findOne(auth: string, id: string): Promise<any>;
    update(auth: string, id: string, body: any): Promise<any>;
    remove(auth: string, id: string): Promise<any>;
    archive(auth: string, id: string): Promise<any>;
    pin(auth: string, id: string): Promise<any>;
    private extractUserId;
}
//# sourceMappingURL=notes.controller.d.ts.map