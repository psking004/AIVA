"use strict";
/**
 * AIVA Personal AI Operating System - Main Server Entry Point
 *
 * Architecture: NestJS + Fastify + AI Orchestration Layer
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const app_module_1 = require("./app.module");
const logger_1 = require("./utils/logger");
async function bootstrap() {
    const logger = new logger_1.Logger('Bootstrap');
    // Create NestJS application with Fastify for better performance
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    const configService = app.get(config_1.ConfigService);
    // Security middleware
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: [`'self'`],
                styleSrc: [`'self'`, `'unsafe-inline'`],
                imgSrc: [`'self'`, 'data:', 'https:'],
                scriptSrc: [`'self'`],
            },
        },
    }));
    // Compression
    app.use((0, compression_1.default)());
    // CORS configuration
    app.enableCors({
        origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    });
    // Global validation pipe
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    // Rate limiting will be configured via ThrottlerModule
    const port = configService.get('PORT', 4000);
    await app.listen(port);
    logger.log(`AIVA Server started on port ${port}`);
    logger.log(`Environment: ${configService.get('NODE_ENV', 'development')}`);
}
bootstrap().catch((error) => {
    console.error('Failed to start AIVA server:', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map