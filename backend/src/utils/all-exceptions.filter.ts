import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error
        ? exception.message
        : (exception as any)?.message || 'Unknown server error';

    const stack = exception instanceof Error ? exception.stack : undefined;
    const name = exception instanceof Error ? exception.name : 'UnknownError';

    // Log the complete server-side stack trace in Render logs
    this.logger.error(`[AIVA BACKEND EXCEPTION] ${request?.method || 'REQ'} ${request?.url || ''} - Status ${status} (${name}): ${message}`);
    if (stack) {
      console.error(`[AIVA BACKEND STACK TRACE]\n${stack}`);
    }

    // Do NOT replace the real exception with generic "Internal server error"
    const errorPayload = {
      statusCode: status,
      error: name,
      message,
      timestamp: new Date().toISOString(),
      path: request?.url,
      stack: process.env.NODE_ENV !== 'production' ? stack : undefined,
    };

    if (typeof response?.status === 'function') {
      if (typeof response.json === 'function') {
        response.status(status).json(errorPayload);
      } else if (typeof response.send === 'function') {
        response.status(status).send(errorPayload);
      }
    }
  }
}
