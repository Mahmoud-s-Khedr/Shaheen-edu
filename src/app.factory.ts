import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
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
    { bufferLogs: true },
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
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  return app;
}
