import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { normalizeCorrelationId } from './correlation-id';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const nodeEnv = configService.get('nodeEnv', { infer: true });
        return {
          pinoHttp: {
            level: nodeEnv === 'production' ? 'info' : 'debug',
            transport:
              nodeEnv === 'production'
                ? undefined
                : { target: 'pino-pretty', options: { singleLine: true } },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.oldPassword',
                'req.body.newPassword',
                'req.body.nationalId',
                'req.body.refreshToken',
              ],
              censor: '[REDACTED]',
            },
            // Keep request logs useful without exporting query values, IDs, or
            // request bodies. Structured exception records add Fastify route
            // templates after route matching, never literal request URLs.
            serializers: {
              req: (request: { method?: string }) => ({
                method: request.method ?? 'unknown',
              }),
              res: (response: { statusCode?: number }) => ({
                statusCode: response.statusCode ?? 0,
              }),
            },
            customProps: (_request, response: { statusCode?: number }) => ({
              event: 'http_request_completed',
              statusCode: response.statusCode ?? 0,
              version: process.env.VERSION ?? 'unknown',
            }),
            customLogLevel: (_request, response, error) => {
              if (error || response.statusCode >= 500) return 'error';
              if (response.statusCode >= 400) return 'warn';
              // Successful access logs are intentionally not written. They
              // add little diagnostic value and may expose literal URLs.
              return 'silent';
            },
            autoLogging: {
              ignore: (request) =>
                request.url === '/health' || request.url === '/health/ready',
            },
            genReqId: (req: { headers: Record<string, unknown> }) =>
              normalizeCorrelationId(req.headers['x-correlation-id']),
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
