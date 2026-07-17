/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Swagger output is dynamic JSON */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.factory';

describe('Swagger (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ enableSwagger: true, enableLogging: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents paginated collections and shared auth cookie flows', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });
    expect(response.statusCode).toBe(200);
    const document = JSON.parse(response.body);

    expect(document.components.securitySchemes.refresh_token).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
    });
    expect(document.paths['/api/v1/admin/admins'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
      ]),
    );

    const refresh = document.paths['/api/v1/auth/refresh'].post;
    expect(refresh.summary).toBe('Refresh user access token');
    expect(refresh.security).toEqual([{ refresh_token: [] }]);
    expect(refresh.responses).toMatchObject({
      201: expect.objectContaining({
        headers: expect.objectContaining({ 'Set-Cookie': expect.any(Object) }),
      }),
      401: expect.any(Object),
      429: expect.any(Object),
    });

    for (const path of Object.values(document.paths) as Array<
      Record<string, { summary?: string }>
    >) {
      for (const operation of Object.values(path)) {
        if (typeof operation === 'object' && operation !== null) {
          expect(operation.summary).toBeDefined();
        }
      }
    }
  });
});
