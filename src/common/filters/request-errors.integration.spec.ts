import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { IsEmail, MinLength } from 'class-validator';
import { PinoLogger } from 'nestjs-pino';
import { createRequestValidationPipe } from '../validation/request-validation.pipe';
import { GlobalExceptionFilter } from './global-exception.filter';

class RequestDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;
}

@Controller('requests')
class RequestController {
  @Post()
  create(@Body() body: RequestDto) {
    return body;
  }
}

@Module({ controllers: [RequestController] })
class RequestModule {}

describe('Request error HTTP integration', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      RequestModule,
      new FastifyAdapter({ bodyLimit: 256 }),
      { logger: false },
    );
    app.useGlobalPipes(createRequestValidationPipe());
    app.useGlobalFilters(
      new GlobalExceptionFilter({
        error: jest.fn(),
        info: jest.fn(),
      } as unknown as PinoLogger),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns actionable bilingual validation messages and every field error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/requests',
      payload: { email: 'invalid', password: 'short' },
    });
    const payload: unknown = response.json();
    expect(response.statusCode).toBe(400);
    expect(payload).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST.VALIDATION_FAILED',
      message: {
        en: expect.stringMatching(/email/i) as unknown,
        ar: expect.any(String) as unknown,
      },
      error: { en: 'Bad Request', ar: expect.any(String) as unknown },
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'email', code: 'VALIDATION.ISEMAIL' }),
        expect.objectContaining({
          field: 'password',
          code: 'VALIDATION.MINLENGTH',
        }),
      ]) as unknown,
      correlationId: expect.any(String) as unknown,
    });
  });

  it.each([
    [
      'malformed JSON',
      'application/json',
      '{"secret":"private"',
      400,
      'BAD_REQUEST.INVALID_JSON',
      'Request body must contain valid JSON',
    ],
    [
      'empty JSON',
      'application/json',
      '',
      400,
      'BAD_REQUEST.INVALID_JSON',
      'Request body must contain valid JSON',
    ],
    [
      'unsupported media',
      'application/x-unsupported',
      'private',
      415,
      'UNSUPPORTED_MEDIA_TYPE.CONTENT_TYPE',
      'Unsupported Content-Type. Use a media type accepted by this endpoint.',
    ],
    [
      'oversized JSON',
      'application/json',
      JSON.stringify({ secret: 'private'.repeat(100) }),
      413,
      'PAYLOAD_TOO_LARGE.REQUEST_BODY',
      'Request body is too large. Reduce its size and try again.',
    ],
  ])(
    'returns a safe client error for %s',
    async (_name, contentType, body, statusCode, code, message) => {
      const response = await app.inject({
        method: 'POST',
        url: '/requests',
        headers: { 'content-type': contentType },
        payload: body,
      });
      expect(response.statusCode).toBe(statusCode);
      expect(response.json<unknown>()).toMatchObject({
        statusCode,
        code,
        message: { en: message, ar: expect.any(String) as unknown },
        correlationId: expect.any(String) as unknown,
      });
      expect(response.body).not.toContain('private');
    },
  );
});
