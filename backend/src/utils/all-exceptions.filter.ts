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

    // Sanitize client-facing error messages to prevent vendor API dumps/keys from leaking
    let clientMessage = message;
    if (status >= 500) {
      const isVendorDump =
        /GoogleGenerativeAI|OpenRouter|gemini|generativelanguage|Bearer|sk-[a-zA-Z0-9]|AIza[a-zA-Z0-9]|API key|503 Service Unavailable|502 Bad Gateway|overloaded|timeout|timed out|credits|upstream service|All cloud AI providers/i.test(
          message,
        );
      if (isVendorDump) {
        clientMessage =
          'AIVA intelligence services are temporarily experiencing high demand. Please try again in a moment.';
      }
    }

    const errorPayload = {
      statusCode: status,
      error: name,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request?.url,
      stack: process.env.NODE_ENV !== 'production' && status < 500 ? stack : undefined,
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
