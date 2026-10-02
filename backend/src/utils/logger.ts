/**
 * Logger Utility - Winston-based logging
 */

import winston from 'winston';

const { combine, timestamp, colorize, printf, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  defaultMeta: { service: 'aiva-api' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

// Custom logger class for services
export class Logger {
  private logger: winston.Logger;
  private context: string;

  constructor(context: string) {
    this.logger = logger;
    this.context = context;
  }

  debug(message: string, ...meta: unknown[]) {
    this.logger.debug(`[${this.context}] ${message}`, ...meta);
  }

  log(message: string, ...meta: unknown[]) {
    this.logger.info(`[${this.context}] ${message}`, ...meta);
  }

  info(message: string, ...meta: unknown[]) {
    this.logger.info(`[${this.context}] ${message}`, ...meta);
  }

  warn(message: string, ...meta: unknown[]) {
    this.logger.warn(`[${this.context}] ${message}`, ...meta);
  }

  error(message: string, ...meta: unknown[]) {
    this.logger.error(`[${this.context}] ${message}`, ...meta);
  }

  fatal(message: string, ...meta: unknown[]) {
    this.logger.error(`[FATAL][${this.context}] ${message}`, ...meta);
  }
}
