/**
 * AuthService - Handles authentication logic
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private configService;
    private readonly logger;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService);
    /**
     * Register a new user
     */
    register(email: string, password: string, firstName?: string, lastName?: string): Promise<{
        user: any;
        token: string;
    }>;
    /**
     * Login user
     */
    login(email: string, password: string): Promise<{
        user: any;
        token: string;
    }>;
    /**
     * Logout user
     */
    logout(userId: string, token: string): Promise<void>;
    /**
     * Validate JWT token
     */
    validateToken(token: string): Promise<any>;
    /**
     * Refresh token
     */
    refreshToken(userId: string): Promise<string>;
    /**
     * Generate JWT token
     */
    private generateToken;
    /**
     * Hash token for storage
     */
    private hashToken;
    /**
     * Remove sensitive data from user object
     */
    private sanitizeUser;
}
//# sourceMappingURL=auth.service.d.ts.map