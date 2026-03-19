/**
 * AuthController - HTTP endpoints for authentication
 */
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
export declare class AuthController {
    private authService;
    private usersService;
    private readonly logger;
    constructor(authService: AuthService, usersService: UsersService);
    register(body: RegisterDto): Promise<{
        user: any;
        token: string;
    }>;
    login(body: LoginDto): Promise<{
        user: any;
        token: string;
    }>;
    logout(authHeader: string, body: LogoutDto): Promise<void>;
    refresh(body: RefreshDto): Promise<{
        token: string;
    }>;
    getMe(authHeader: string): Promise<{
        error: string;
        user?: never;
    } | {
        user: any;
        error?: never;
    }>;
}
interface RegisterDto {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
}
interface LoginDto {
    email: string;
    password: string;
}
interface LogoutDto {
    userId: string;
}
interface RefreshDto {
    userId: string;
}
export {};
//# sourceMappingURL=auth.controller.d.ts.map