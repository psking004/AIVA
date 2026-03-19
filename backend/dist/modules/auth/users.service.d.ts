/**
 * UsersService - User management operations
 */
import { PrismaService } from '../../database/prisma.service';
export declare class UsersService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    /**
     * Get user by ID
     */
    findById(userId: string): Promise<any>;
    /**
     * Get user by email
     */
    findByEmail(email: string): Promise<any>;
    /**
     * Update user profile
     */
    updateProfile(userId: string, data: {
        firstName?: string;
        lastName?: string;
        avatarUrl?: string;
        timezone?: string;
        language?: string;
    }): Promise<any>;
    /**
     * Get user dashboard stats
     */
    getDashboardStats(userId: string): Promise<{
        tasks: any;
        notes: any;
        documents: any;
        upcomingEvents: any;
    }>;
    /**
     * Delete user account
     */
    deleteAccount(userId: string): Promise<void>;
}
//# sourceMappingURL=users.service.d.ts.map