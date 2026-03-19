"use strict";
/**
 * Database Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabaseConfig = getDatabaseConfig;
function getDatabaseConfig(configService) {
    const url = configService.get('DATABASE_URL');
    if (url) {
        return {
            url,
            host: configService.get('DATABASE_HOST', 'localhost'),
            port: parseInt(configService.get('DATABASE_PORT', '5432')),
            user: configService.get('DATABASE_USER', 'aiva'),
            password: configService.get('DATABASE_PASSWORD', ''),
            database: configService.get('DATABASE_NAME', 'aiva'),
            ssl: configService.get('DATABASE_SSL', false),
            poolSize: parseInt(configService.get('DATABASE_POOL_SIZE', '10')),
        };
    }
    return {
        url: '',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: parseInt(configService.get('DATABASE_PORT', '5432')),
        user: configService.get('DATABASE_USER', 'aiva'),
        password: configService.get('DATABASE_PASSWORD', 'aiva-secret'),
        database: configService.get('DATABASE_NAME', 'aiva'),
        ssl: configService.get('DATABASE_SSL', false),
        poolSize: parseInt(configService.get('DATABASE_POOL_SIZE', '10')),
    };
}
//# sourceMappingURL=database.js.map