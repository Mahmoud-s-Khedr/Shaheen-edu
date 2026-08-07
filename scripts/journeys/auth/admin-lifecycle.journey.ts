import { assert, expectStatus, expectString } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const adminJourney: JourneyDefinition = {
  id: 'AUTH-002', name: 'Admin lifecycle', category: 'auth', dependsOn: ['AUTH-001'],
  async run({ clients, context, factory, step }) {
    const email = factory.email('admin'); const password = factory.password('Admin');
    await step('Creating an administrator', async () => {
      const r = await clients.superAdmin.request<any>('POST', '/admin/admins', { email, password }); expectStatus(r, 201); assert(r.body.role === 'ADMIN', 'Created role must be ADMIN'); assert(r.body.loginIdentifier === email, 'Admin email must be normalized'); expectString(r.body.id, 'admin.id'); context.admin = { id: r.body.id, email, password }; context.created.admins.push(r.body.id);
    });
    await step('Reading and updating administrator', async () => {
      const get = await clients.superAdmin.request<any>('GET', `/admin/admins/${context.admin.id}`); expectStatus(get, 200); assert(get.body.id === context.admin.id, 'Read admin must match created ID');
      const newEmail = factory.email('admin-updated'); const update = await clients.superAdmin.request<any>('PATCH', `/admin/admins/${context.admin.id}`, { email: newEmail }); expectStatus(update, 200); assert(update.body.loginIdentifier === newEmail, 'Email update must persist'); context.admin.email = newEmail;
    });
    await step('Logging in and rejecting admin creation by normal admin', async () => {
      const login = await clients.admin.request<any>('POST', '/auth/admins/login', { email: context.admin.email, password }); expectStatus(login, 201); assert(login.body.user.role === 'ADMIN', 'Login role must be ADMIN'); clients.admin.accessToken = login.body.accessToken; context.admin.accessToken = login.body.accessToken;
      const forbidden = await clients.admin.request<any>('POST', '/admin/admins', { email: factory.email('forbidden'), password: factory.password('Forbidden') }); expectStatus(forbidden, 403);
    });
    await step('Suspending admin and rejecting authenticated use', async () => {
      const suspend = await clients.superAdmin.request<any>('POST', `/admin/admins/${context.admin.id}/suspend`); expectStatus(suspend, 201); assert(suspend.body.status === 'SUSPENDED', 'Admin must be suspended');
      const refresh = await clients.admin.request<any>('POST', '/auth/refresh'); expectStatus(refresh, 401);
      const login = await clients.admin.request<any>('POST', '/auth/admins/login', { email: context.admin.email, password }); expectStatus(login, 401);
    });
    await step('Reactivating and re-authenticating admin', async () => {
      const reactivate = await clients.superAdmin.request<any>('POST', `/admin/admins/${context.admin.id}/reactivate`); expectStatus(reactivate, 201); assert(reactivate.body.status === 'ACTIVE', 'Admin must be active');
      const login = await clients.admin.request<any>('POST', '/auth/admins/login', { email: context.admin.email, password }); expectStatus(login, 201); clients.admin.accessToken = login.body.accessToken; context.admin.accessToken = login.body.accessToken;
    });
    await step('Forcing an administrator password reset', async () => {
      const denied = await clients.admin.request<any>('POST', `/admin/admins/${context.admin.id}/reset-password`); expectStatus(denied, 403);
      const reset = await clients.superAdmin.request<any>('POST', `/admin/admins/${context.admin.id}/reset-password`); expectStatus(reset, 201); assert(typeof reset.body.temporaryPassword === 'string', 'Reset must return a temporary password');
      const revoked = await clients.public.request<any>('GET', '/auth/me', undefined, { accessToken: context.admin.accessToken }); expectStatus(revoked, 401);
      const temporaryLogin = await clients.admin.request<any>('POST', '/auth/admins/login', { email: context.admin.email, password: reset.body.temporaryPassword }); expectStatus(temporaryLogin, 201); assert(temporaryLogin.body.user.mustChangePassword === true, 'Temporary-password login must require a password change'); clients.admin.accessToken = temporaryLogin.body.accessToken;
      const blocked = await clients.admin.request<any>('GET', '/admin/partners'); expectStatus(blocked, 403);
      const finalPassword = factory.password('AdminReset'); const changed = await clients.admin.request<any>('POST', '/auth/change-password', { oldPassword: reset.body.temporaryPassword, newPassword: finalPassword }); expectStatus(changed, 201);
      const finalLogin = await clients.admin.request<any>('POST', '/auth/admins/login', { email: context.admin.email, password: finalPassword }); expectStatus(finalLogin, 201); assert(finalLogin.body.user.mustChangePassword === false, 'Password change must clear the forced-change flag'); clients.admin.accessToken = finalLogin.body.accessToken; context.admin.password = finalPassword; context.admin.accessToken = finalLogin.body.accessToken;
    });
  },
};
