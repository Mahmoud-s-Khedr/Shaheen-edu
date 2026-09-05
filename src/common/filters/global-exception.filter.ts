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
    let translatedMessage: LocalizedMessage | undefined;

    const parserError = this.mapParserError(exception);

    if (parserError) {
      statusCode = parserError.statusCode;
      message = parserError.message;
      explicitCode = parserError.code;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
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
        details = bodyObj.details as ValidationDetail[] | undefined;
        if (Array.isArray(rawMessage)) {
          const messages = rawMessage.filter(
            (value): value is string => typeof value === 'string',
          );
          message = messages[0] ?? exception.message;
          if (!details?.length) {
            details = messages.map((value) => ({
              field: '',
              code: 'VALIDATION.INVALID',
              message: localizedMessage(value, statusCode),
            }));
          }
        } else if (
          typeof rawMessage === 'object' &&
          rawMessage !== null &&
          'en' in rawMessage &&
          'ar' in rawMessage &&
          typeof rawMessage.en === 'string' &&
          typeof rawMessage.ar === 'string'
        ) {
          translatedMessage = { en: rawMessage.en, ar: rawMessage.ar };
          message = rawMessage.en;
        } else {
          message =
            typeof rawMessage === 'string' ? rawMessage : exception.message;
        }
        if (typeof bodyObj.code === 'string') explicitCode = bodyObj.code;
        meta = bodyObj.meta as Record<string, unknown> | undefined;
      }
      if (
        'code' in exception &&
        typeof exception.code === 'string' &&
        exception.code
      )
        explicitCode = exception.code;
      if ('meta' in exception)
        meta = (exception as { meta?: Record<string, unknown> }).meta;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Internal server error';
      translatedMessage = undefined;
    }

    const payload: ErrorResponseShape = {
      statusCode,
      code: errorCode(message, statusCode, explicitCode),
      message: translatedMessage ?? localizedMessage(message, statusCode),
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
          version: process.env.VERSION ?? 'unknown',
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
          version: process.env.VERSION ?? 'unknown',
        },
        'Expected API client error',
      );
    }

    if (exception instanceof RateLimitException) {
      void response.header('Retry-After', String(exception.retryAfterSeconds));
    }

    void response.status(statusCode).send(payload);
  }

  private mapParserError(exception: unknown) {
    if (!(exception instanceof Error)) return;
    let parserCode = 'code' in exception ? exception.code : undefined;
    // Nest converts FastifyError into HttpException before invoking filters,
    // dropping its code. Match only known static parser messages and statuses.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.getResponse();
      if (
        status === 400 &&
        (message ===
          "Body is not valid JSON but content-type is set to 'application/json'" ||
          message ===
            "Body cannot be empty when content-type is set to 'application/json'")
      ) {
        parserCode = 'FST_ERR_CTP_INVALID_JSON_BODY';
      } else if (status === 413 && message === 'Request body is too large') {
        parserCode = 'FST_ERR_CTP_BODY_TOO_LARGE';
      } else if (status === 415 && message === 'Unsupported Media Type') {
        parserCode = 'FST_ERR_CTP_INVALID_MEDIA_TYPE';
      }
    }
    switch (parserCode) {
      case 'FST_ERR_CTP_INVALID_JSON_BODY':
      case 'FST_ERR_CTP_EMPTY_JSON_BODY':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Request body must contain valid JSON',
          code: 'BAD_REQUEST.INVALID_JSON',
        };
      case 'FST_ERR_CTP_BODY_TOO_LARGE':
        return {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          message: 'Request body is too large. Reduce its size and try again.',
          code: 'PAYLOAD_TOO_LARGE.REQUEST_BODY',
        };
      case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
        return {
          statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          message:
            'Unsupported Content-Type. Use a media type accepted by this endpoint.',
          code: 'UNSUPPORTED_MEDIA_TYPE.CONTENT_TYPE',
        };
    }
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
