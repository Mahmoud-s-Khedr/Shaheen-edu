import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';
import { RateLimitException } from '../exceptions/rate-limit.exception';

interface ErrorResponseShape {
  statusCode: number;
  message: string | string[];
  error: string;
  correlationId: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ??
      randomUUID();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const bodyObj = body as Record<string, unknown>;
        message = (bodyObj.message as string | string[]) ?? exception.message;
        error = (bodyObj.error as string) ?? exception.name;
      }
      if (error === 'Internal Server Error') {
        error = exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Internal server error';
    }

    const payload: ErrorResponseShape = {
      statusCode,
      message,
      error,
      correlationId,
    };

    if (exception instanceof RateLimitException) {
      void response.header('Retry-After', String(exception.retryAfterSeconds));
    }

    void response.status(statusCode).send(payload);
  }
}
