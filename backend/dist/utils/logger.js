"use strict";
/**
 * Logger Utility - Winston-based logging
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const { combine, timestamp, colorize, printf, errors } = winston_1.default.format;
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});
exports.logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'debug',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
    defaultMeta: { service: 'aiva-api' },
    transports: [
        new winston_1.default.transports.Console({
            format: combine(colorize(), logFormat),
        }),
        new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }),
        new winston_1.default.transports.File({
            filename: 'logs/combined.log',
        }),
    ],
});
// Custom logger class for services
class Logger {
    logger;
    context;
    constructor(context) {
        this.logger = exports.logger;
        this.context = context;
    }
    debug(message, ...meta) {
        this.logger.debug(`[${this.context}] ${message}`, ...meta);
    }
    log(message, ...meta) {
        this.logger.info(`[${this.context}] ${message}`, ...meta);
    }
    info(message, ...meta) {
        this.logger.info(`[${this.context}] ${message}`, ...meta);
    }
    warn(message, ...meta) {
        this.logger.warn(`[${this.context}] ${message}`, ...meta);
    }
    error(message, ...meta) {
        this.logger.error(`[${this.context}] ${message}`, ...meta);
    }
    fatal(message, ...meta) {
        this.logger.error(`[FATAL][${this.context}] ${message}`, ...meta);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map