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

export function getDatabaseConfig(configService: ConfigService): DatabaseConfig {
  const url = configService.get<string>('DATABASE_URL');

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
