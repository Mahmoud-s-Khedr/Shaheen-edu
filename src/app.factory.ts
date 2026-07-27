import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import { BadRequestException, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validationDetail, type ValidationDetail } from './common/i18n/api-messages';
import type { AppConfig } from './config/configuration';

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
    new FastifyAdapter(),
    // `rawBody: true` uses Nest's built-in raw-body capture (needed by the Bunny
    // Stream webhook signature check). It integrates with Nest's own body-parser
    // registration; the standalone fastify-raw-body plugin conflicts with it by
    // re-registering the application/json parser.
    { bufferLogs: true, rawBody: true },
  );
  const configService = app.get(ConfigService<AppConfig, true>);

  if (options.enableLogging !== false) {
    app.useLogger(app.get(PinoLogger));
  }

  const cookieSecret: string = configService.get('cookieSecret', {
    infer: true,
  });
  await app.register(fastifyCookie, { secret: cookieSecret });
  await app.register(fastifyHelmet);
  await app.register(fastifyMultipart, { limits: { files: 1 } });

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors: ValidationError[]) => new BadRequestException({
        message: 'Validation failed',
        details: flattenValidationErrors(errors),
      }),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors({
    origin: configService.get('corsOrigins', { infer: true }),
    credentials: true,
  });

  if (options.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Shaheen Edu API')
      .setDescription(
        'Authentication and identity/authorization system for the Shaheen Edu platform',
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

function flattenValidationErrors(errors: ValidationError[], parent = ''): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([constraint, message]) => validationDetail(field, constraint, message));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}
