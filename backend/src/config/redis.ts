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

export function getRedisConfig(configService: ConfigService): RedisConfig {
  const config: RedisConfig = {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: parseInt(configService.get('REDIS_PORT', '6379')),
    db: parseInt(configService.get('REDIS_DB', '0')),
    keyPrefix: configService.get('REDIS_PREFIX', 'aiva:'),
  };
  const password = configService.get('REDIS_PASSWORD');
  if (password) config.password = password;
  return config;
}
