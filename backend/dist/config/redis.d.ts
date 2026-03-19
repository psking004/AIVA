/**
 * Redis Configuration
 */
import { ConfigService } from '@nestjs/config';
export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
}
export declare function getRedisConfig(configService: ConfigService): RedisConfig;
//# sourceMappingURL=redis.d.ts.map