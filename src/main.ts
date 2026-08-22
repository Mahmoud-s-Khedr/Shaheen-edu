import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config/configuration';
import { createApp } from './app.factory';

async function bootstrap() {
  const enableSwagger =
    process.env.API_DOCS_ENABLED !== undefined
      ? process.env.API_DOCS_ENABLED === 'true'
      : process.env.NODE_ENV !== 'production';
  const app = await createApp({ enableSwagger });
  const configService = app.get(ConfigService<AppConfig, true>);
  app.enableShutdownHooks();

  const port = configService.get('port', { infer: true });
  const host = configService.get('host', { infer: true });
  await app.listen(port, host);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap application', err);
  process.exit(1);
});
