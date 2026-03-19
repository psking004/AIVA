/**
 * FilesController - File HTTP endpoints
 */
import { FilesService } from './files.service';
export declare class FilesController {
    private filesService;
    constructor(filesService: FilesService);
    upload(auth: string, body: any): Promise<any>;
    findAll(auth: string, filters: any): Promise<any>;
    findOne(auth: string, id: string): Promise<any>;
    remove(auth: string, id: string): Promise<any>;
    search(auth: string, query: string): Promise<any>;
    private extractUserId;
}
//# sourceMappingURL=files.controller.d.ts.map