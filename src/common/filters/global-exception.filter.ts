import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { RateLimitException } from '../exceptions/rate-limit.exception';
import {
  errorCode,
  localizedError,
  localizedMessage,
  type LocalizedMessage,
  type ValidationDetail,
} from '../i18n/api-messages';
import { normalizeCorrelationId } from '../logging/correlation-id';
import { safeErrorRecord } from '../logging/error-record';

interface ErrorResponseShape {
  statusCode: number;
  code: string;
  message: LocalizedMessage;
  error: LocalizedMessage;
  details?: ValidationDetail[];
  meta?: Record<string, unknown>;
  correlationId: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId = normalizeCorrelationId(
      request.headers['x-correlation-id'],
    );

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let explicitCode: string | undefined;
    let details: ValidationDetail[] | undefined;
    let meta: Record<string, unknown> | undefined;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception.code);
      statusCode = mapped.statusCode;
      message = mapped.message;
      explicitCode = mapped.code;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const bodyObj = body as Record<string, unknown>;
        const rawMessage = bodyObj.message ?? exception.message;
        message = Array.isArray(rawMessage)
          ? (rawMessage[0] ?? exception.message)
          : String(rawMessage);
        details = bodyObj.details as ValidationDetail[] | undefined;
        meta = bodyObj.meta as Record<string, unknown> | undefined;
      }
      if ('code' in exception)
        explicitCode = String((exception as { code?: unknown }).code ?? '');
      if ('meta' in exception)
        meta = (exception as { meta?: Record<string, unknown> }).meta;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Internal server error';
    }

    const payload: ErrorResponseShape = {
      statusCode,
      code: errorCode(message, statusCode, explicitCode),
      message: localizedMessage(message, statusCode),
      error: localizedError(statusCode),
      ...(details?.length ? { details } : {}),
      ...(meta ? { meta } : {}),
      correlationId,
    };

    const route = request.routeOptions?.url ?? 'unmatched';
    const code = payload.code;
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        {
          event: 'unhandled_exception',
          context: GlobalExceptionFilter.name,
          ...safeErrorRecord(exception),
          route,
          statusCode,
          correlationId,
          release: process.env.RELEASE_REVISION ?? 'unknown',
        },
        'Unhandled API exception',
      );
    } else {
      this.logger.info(
        {
          event: 'http_client_error',
          context: GlobalExceptionFilter.name,
          route,
          statusCode,
          code,
          correlationId,
          release: process.env.RELEASE_REVISION ?? 'unknown',
        },
        'Expected API client error',
      );
    }

    if (exception instanceof RateLimitException) {
      void response.header('Retry-After', String(exception.retryAfterSeconds));
    }

    void response.status(statusCode).send(payload);
  }

  private mapPrismaError(code: string) {
    switch (code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with these values already exists',
          code: 'CONFLICT.UNIQUE_CONSTRAINT',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'The record is still referenced',
          code: 'CONFLICT.FOREIGN_KEY_CONSTRAINT',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          code: 'NOT_FOUND.RECORD_NOT_FOUND',
        };
      case 'P2034':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Concurrent update conflict; retry the request',
          code: 'CONFLICT.CONCURRENT_UPDATE',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          code: 'INTERNAL_SERVER_ERROR.DATABASE_ERROR',
        };
    }
  }
}
