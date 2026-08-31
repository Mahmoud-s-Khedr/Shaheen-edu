import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoNestLogger, PinoLogger } from 'nestjs-pino';
import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import {
  validationDetail,
  type ValidationDetail,
} from './common/i18n/api-messages';
import type { AppConfig } from './config/configuration';
import { normalizeCorrelationId } from './common/logging/correlation-id';
import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

export interface CreateAppOptions {
  enableSwagger?: boolean;
  enableLogging?: boolean;
}

/** Builds the HTTP application used by both the server and e2e tests. */
export async function createApp(
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Numeric trust is deliberately opt-in. Production deployments must set
      // this to the exact number of controlled reverse-proxy hops so req.ip
      // (used by authentication throttling) is neither shared nor spoofable.
      trustProxy: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10),
      genReqId: (request: IncomingMessage | Http2ServerRequest) => {
        const correlationId = normalizeCorrelationId(
          request.headers['x-correlation-id'],
        );
        // Nest middleware, CLS, the HTTP logger, audits, and the exception
        // filter all consume the same normalized value.
        request.headers['x-correlation-id'] = correlationId;
        return correlationId;
      },
    }),
    // `rawBody: true` uses Nest's built-in raw-body capture (needed by the Bunny
    // Stream webhook signature check). It integrates with Nest's own body-parser
    // registration; the standalone fastify-raw-body plugin conflicts with it by
    // re-registering the application/json parser.
    { bufferLogs: true, rawBody: true },
  );
  const configService = app.get(ConfigService<AppConfig, true>);

  if (options.enableLogging !== false) {
    app.useLogger(app.get(PinoNestLogger));
  }

  const cookieSecret: string = configService.get('cookieSecret', {
    infer: true,
  });
  await app.register(fastifyCookie, { secret: cookieSecret });
  await app.register(fastifyHelmet);
  const storageConfig = configService.get('storage', { infer: true });
  await app.register(fastifyMultipart, {
    limits: {
      files: 1,
      parts: 12,
      fields: 10,
      fieldSize: 16 * 1024,
      fileSize: storageConfig.downloadMaxBytes,
    },
  });

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          message: 'Validation failed',
          details: flattenValidationErrors(errors),
        }),
    }),
  );
  // PinoLogger is transient-scoped, so resolving it is required. The Nest
  // Logger wrapper used by app.useLogger() exposes `log`, not `info`; passing
  // it to this filter turned ordinary 4xx responses into 500s while logging.
  app.useGlobalFilters(
    new GlobalExceptionFilter(await app.resolve(PinoLogger)),
  );
  app.enableCors({
    origin: configService.get('corsOrigins', { infer: true }),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  if (options.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Shaheen Edu API')
      .setDescription(
        'REST API for Shaheen Edu authentication, academic content, learning, assets, commerce, and administration.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth(
        'refresh_token',
        { type: 'apiKey', in: 'cookie' },
        'refresh_token',
      )
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  return app;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => validationDetail(field, constraint, message),
    );
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}
