import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { errorCodes } from 'fastify';
import { GlobalExceptionFilter } from './global-exception.filter';
import { AppException } from '../exceptions/app.exception';

describe('GlobalExceptionFilter', () => {
  const logger = { error: jest.fn(), info: jest.fn() };
  const filter = new GlobalExceptionFilter(logger as unknown as PinoLogger);

  function respond(exception: unknown) {
    const response = {
      header: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn<void, [unknown]>(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ headers: {}, routeOptions: { url: '/test' } }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
    return response.send.mock.calls[0][0] as {
      statusCode: number;
      code: string;
      message: { en: string; ar: string };
      details?: Array<{ field: string; message: { en: string; ar: string } }>;
      meta?: Record<string, unknown>;
    };
  }

  it('preserves every message from a legacy validation exception', () => {
    const payload = respond(
      new BadRequestException(['phone is required', 'password is required']),
    );
    expect(payload.message.en).toBe('phone is required');
    expect(payload.details?.map((detail) => detail.message.en)).toEqual([
      'phone is required',
      'password is required',
    ]);
  });

  it('preserves localized messages, explicit body codes, nested field details and metadata', () => {
    const message = { en: 'Enter your phone number.', ar: 'أدخل رقم الهاتف.' };
    const details = [
      { field: 'profile.phone', code: 'VALIDATION.ISSTRING', message },
    ];
    expect(
      respond(
        new BadRequestException({
          message,
          code: 'BAD_REQUEST.VALIDATION_FAILED',
          details,
          meta: { retry: false },
        }),
      ),
    ).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST.VALIDATION_FAILED',
      message,
      details,
      meta: { retry: false },
    });
  });

  it('keeps application exception codes and metadata', () => {
    expect(
      respond(
        new AppException('Invalid input', 400, 'CUSTOM.INVALID', {
          field: 'phone',
        }),
      ),
    ).toMatchObject({
      code: 'CUSTOM.INVALID',
      meta: { field: 'phone' },
    });
  });

  it.each([
    [
      new errorCodes.FST_ERR_CTP_INVALID_JSON_BODY(),
      400,
      'BAD_REQUEST.INVALID_JSON',
    ],
    [
      new errorCodes.FST_ERR_CTP_EMPTY_JSON_BODY(),
      400,
      'BAD_REQUEST.INVALID_JSON',
    ],
    [
      new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE(),
      413,
      'PAYLOAD_TOO_LARGE.REQUEST_BODY',
    ],
    [
      new errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE(),
      415,
      'UNSUPPORTED_MEDIA_TYPE.CONTENT_TYPE',
    ],
  ])(
    'maps parser error %s to a safe client response',
    (exception, statusCode, code) => {
      exception.message = 'secret raw request input';
      const payload = respond(exception);
      expect(payload).toMatchObject({ statusCode, code });
      expect(JSON.stringify(payload)).not.toContain('secret raw request input');
    },
  );

  it('does not trust arbitrary statusCode properties on unknown errors', () => {
    expect(
      respond(Object.assign(new Error('secret'), { statusCode: 400 })),
    ).toMatchObject({
      statusCode: 500,
      message: { en: 'Internal server error' },
    });
  });

  it('redacts localized internal server messages in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(
        respond(
          new HttpException({ message: { en: 'secret', ar: 'secret' } }, 500),
        ).message.en,
      ).toBe('Internal server error');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
