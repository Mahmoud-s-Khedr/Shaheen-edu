import {
  assert,
  expectAbsent,
  expectStatus,
  expectString,
} from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const superAdminJourney: JourneyDefinition = {
  id: 'AUTH-001',
  name: 'Seeded super-admin session lifecycle',
  category: 'auth',
  dependsOn: ['INFRA-001'],
  async run({ clients, context, environment, step }) {
    const client = clients.superAdmin;
    await step('Logging in as seeded super admin', async () => {
      const response = await client.request<any>('POST', '/auth/admins/login', {
        email: environment.superAdminEmail,
        password: environment.superAdminPassword,
      });
      expectStatus(response, 201);
      expectString(response.body.accessToken, 'accessToken');
      assert(
        response.body.user?.role === 'SUPER_ADMIN',
        'Seeded user must be SUPER_ADMIN',
      );
      assert(client.jar.has('refresh_token'), 'Login must set refresh cookie');
      client.accessToken = response.body.accessToken;
      context.superAdmin.id = response.body.user.id;
      context.superAdmin.accessToken = response.body.accessToken;
    });
    await step('Reading current super-admin identity', async () => {
      const response = await client.request<any>('GET', '/auth/me');
      expectStatus(response, 200);
      assert(
        response.body.id === context.superAdmin.id,
        'auth/me must return logged-in user',
      );
      assert(
        response.body.role === 'SUPER_ADMIN',
        'auth/me role must be SUPER_ADMIN',
      );
    });
    await step('Rotating refresh session', async () => {
      const response = await client.request<any>('POST', '/auth/refresh');
      expectStatus(response, 201);
      expectString(response.body.accessToken, 'refreshed accessToken');
      assert(
        client.jar.has('refresh_token'),
        'Refresh must retain rotated cookie',
      );
      client.accessToken = response.body.accessToken;
      context.superAdmin.accessToken = response.body.accessToken;
    });
    await step('Logging out and rejecting revoked session', async () => {
      const logout = await client.request<any>('POST', '/auth/logout');
      expectStatus(logout, 201);
      assert(logout.body.success === true, 'Logout must succeed');
      const me = await client.request<any>('GET', '/auth/me');
      expectStatus(me, 401);
    });
    await step('Logging in again for dependent journeys', async () => {
      const response = await client.request<any>('POST', '/auth/admins/login', {
        email: environment.superAdminEmail,
        password: environment.superAdminPassword,
      });
      expectStatus(response, 201);
      expectAbsent(
        JSON.stringify(response.body),
        environment.superAdminPassword,
        'password',
      );
      client.accessToken = response.body.accessToken;
      context.superAdmin.accessToken = response.body.accessToken;
    });
  },
};
