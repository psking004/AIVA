/**
 * Logger Utility - Winston-based logging
 */
import winston from 'winston';
export declare const logger: winston.Logger;
export declare class Logger {
    private logger;
    private context;
    constructor(context: string);
    debug(message: string, ...meta: unknown[]): void;
    log(message: string, ...meta: unknown[]): void;
    info(message: string, ...meta: unknown[]): void;
    warn(message: string, ...meta: unknown[]): void;
    error(message: string, ...meta: unknown[]): void;
    fatal(message: string, ...meta: unknown[]): void;
}
//# sourceMappingURL=logger.d.ts.map