/**
 * JWT Strategy - Passport JWT authentication strategy
 */
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users.service';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private configService;
    private usersService;
    constructor(configService: ConfigService, usersService: UsersService);
    validate(payload: any): Promise<{
        userId: any;
        email: any;
    }>;
}
export {};
//# sourceMappingURL=jwt.strategy.d.ts.map