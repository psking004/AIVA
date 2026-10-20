/**
 * AIVA Personal AI Operating System - Main Server Entry Point
 *
 * Architecture: NestJS + Fastify + AI Orchestration Layer
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as dns from 'dns';

// Ensure IPv4 first on Windows to avoid ISP IPv6 packet drops
dns.setDefaultResultOrder('ipv4first');

// Load environment variables early
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Patch DATABASE_URL with pgbouncer and statement_cache_size=0 unconditionally to prevent prepared statement collisions
if (process.env.DATABASE_URL) {
  if (!process.env.DATABASE_URL.includes('pgbouncer=true')) {
    const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${sep}pgbouncer=true`;
  }
  if (!process.env.DATABASE_URL.includes('statement_cache_size=0')) {
    const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${sep}statement_cache_size=0`;
  }
}

import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { Logger } from './utils/logger';
import { AllExceptionsFilter } from './utils/all-exceptions.filter';

function logEnvVerification() {
  const envVars = [
    'OPENROUTER_API_KEY',
    'OPENROUTER_MODEL',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'DATABASE_URL',
    'DIRECT_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  console.log('[AIVA ENV VERIFICATION]');
  for (const envVar of envVars) {
    const isPresent = !!process.env[envVar] && process.env[envVar]!.trim().length > 0;
    console.log(`${envVar}: ${isPresent ? 'PRESENT' : 'MISSING'}`);
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logEnvVerification();

  // Create NestJS application with Fastify for better performance
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Global exception filter for rich diagnostics and unmasked server-side error logging
  app.useGlobalFilters(new AllExceptionsFilter());

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
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'x-device-id',
      'x-client-platform',
    ],
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

  const port = Number(configService.get('PORT', 4000));
  const nodeMode = (configService.get<string>('AIVA_NODE_MODE', 'standalone') || 'standalone').toLowerCase();
  // Standalone mode binds strictly to 127.0.0.1 (private/local)
  // Peer mode binds to 0.0.0.0 (or configured HOST) for authenticated LAN peer collaboration
  const defaultHost = nodeMode === 'peer' ? '0.0.0.0' : '127.0.0.1';
  const host = configService.get<string>('HOST', defaultHost);

  await app.listen(port, host);

  logger.log(`AIVA Server listening on ${host}:${port} [Node Mode: ${nodeMode.toUpperCase()}]`);
  logger.log(`Environment: ${configService.get('NODE_ENV', 'development')}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start AIVA server:', error);
  process.exit(1);
});
