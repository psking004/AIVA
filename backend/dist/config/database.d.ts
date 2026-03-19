/**
 * Database Configuration
 */
import { ConfigService } from '@nestjs/config';
export interface DatabaseConfig {
    url: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
    poolSize: number;
}
export declare function getDatabaseConfig(configService: ConfigService): DatabaseConfig;
//# sourceMappingURL=database.d.ts.map