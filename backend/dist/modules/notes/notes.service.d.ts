/**
 * NotesService - Notes CRUD operations
 */
import { PrismaService } from '../../database/prisma.service';
export declare class NotesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(userId: string, data: CreateNoteDto): Promise<any>;
    findAll(userId: string, filters?: NoteFilters): Promise<any>;
    findOne(userId: string, id: string): Promise<any>;
    update(userId: string, id: string, data: UpdateNoteDto): Promise<any>;
    remove(userId: string, id: string): Promise<any>;
    archive(userId: string, id: string): Promise<any>;
    pin(userId: string, id: string): Promise<any>;
}
interface CreateNoteDto {
    title: string;
    content: string;
    tags?: string[];
    folderId?: string;
}
interface NoteFilters {
    search?: string;
    folderId?: string;
    isArchived?: boolean;
}
interface UpdateNoteDto {
    title?: string;
    content?: string;
    tags?: string[];
    folderId?: string;
    isPinned?: boolean;
    isArchived?: boolean;
}
export {};
//# sourceMappingURL=notes.service.d.ts.map