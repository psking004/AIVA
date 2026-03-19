"use strict";
/**
 * Redis Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisConfig = getRedisConfig;
function getRedisConfig(configService) {
    return {
        host: configService.get('REDIS_HOST', 'localhost'),
        port: parseInt(configService.get('REDIS_PORT', '6379')),
        password: configService.get('REDIS_PASSWORD'),
        db: parseInt(configService.get('REDIS_DB', '0')),
        keyPrefix: configService.get('REDIS_PREFIX', 'aiva:'),
    };
}
//# sourceMappingURL=redis.js.map