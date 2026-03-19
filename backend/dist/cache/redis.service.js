"use strict";
/**
 * Redis Service - Caching layer for the application
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RedisService = RedisService_1 = class RedisService {
    configService;
    logger = new common_1.Logger(RedisService_1.name);
    client;
    constructor(configService) {
        this.configService = configService;
        const host = this.configService.get('REDIS_HOST', 'localhost');
        const port = this.configService.get('REDIS_PORT', 6379);
        const password = this.configService.get('REDIS_PASSWORD');
        this.client = new ioredis_1.Redis({
            host,
            port,
            password,
            retryStrategy: (times) => Math.min(times * 50, 2000),
        });
        this.client.on('error', (err) => {
            this.logger.error('Redis error:', err.message);
        });
        this.client.on('connect', () => {
            this.logger.log('Redis connected');
        });
    }
    async onModuleInit() {
        try {
            await this.client.ping();
            this.logger.log('Redis service initialized');
        }
        catch (error) {
            this.logger.warn('Redis not available, caching disabled:', error.message);
        }
    }
    /**
     * Get value from cache
     */
    async get(key) {
        try {
            return await this.client.get(key);
        }
        catch {
            return null;
        }
    }
    /**
     * Set value in cache with TTL
     */
    async set(key, value, ttlSeconds) {
        try {
            if (ttlSeconds) {
                await this.client.setex(key, ttlSeconds, value);
            }
            else {
                await this.client.set(key, value);
            }
        }
        catch (error) {
            this.logger.warn('Failed to set cache:', error.message);
        }
    }
    /**
     * Delete value from cache
     */
    async del(key) {
        try {
            await this.client.del(key);
        }
        catch (error) {
            this.logger.warn('Failed to delete cache:', error.message);
        }
    }
    /**
     * Check if key exists
     */
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        }
        catch {
            return false;
        }
    }
    /**
     * Get client for direct operations
     */
    getClient() {
        return this.client;
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map