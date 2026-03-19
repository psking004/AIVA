/**
 * AIVA Personal AI Operating System - Main Server Entry Point
 *
 * Architecture: NestJS + Fastify + AI Orchestration Layer
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { Logger } from './utils/logger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create NestJS application with Fastify for better performance
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Security middleware
  app.use(helmet({
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
  app.use(compression());

  // CORS configuration
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
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
