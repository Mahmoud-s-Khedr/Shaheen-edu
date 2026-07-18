import { assert, expectAbsent, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const studentJourney: JourneyDefinition = {
  id: 'AUTH-004', name: 'Student registration, profile, password, and sessions', category: 'auth', dependsOn: ['AUTH-001'],
  async run({ clients, context, factory, step }) {
    const phone = factory.phone(); const parentPhone = factory.phone(); const nationalId = factory.nationalId(); const password = factory.password('Student');
    const payload = { fullName: factory.title('Student'), nationalId, phone: `+20${phone.slice(1)}`, parentPhone, governorate: 'Cairo', center: 'Journey Center', password };
    await step('Registering a normalized student account', async () => {
      const r = await clients.student.request<any>('POST', '/auth/students/register', payload); expectStatus(r, 201); assert(r.body.user.role === 'STUDENT', 'Registered role must be STUDENT'); assert(r.body.user.loginIdentifier === phone, 'Student phone must be normalized'); expectAbsent(JSON.stringify(r.body), nationalId, 'national ID'); assert(clients.student.jar.has('refresh_token'), 'Registration must set refresh cookie');
      clients.student.accessToken = r.body.accessToken; context.students.push({ id: r.body.user.id, phone, password, nationalId, parentPhone, accessToken: r.body.accessToken }); context.created.students.push(r.body.user.id);
    });
    await step('Rejecting duplicate phone and National ID', async () => {
      const duplicatePhone = await clients.public.request<any>('POST', '/auth/students/register', { ...payload, nationalId: factory.nationalId(), phone }); expectStatus(duplicatePhone, 409);
      const duplicateId = await clients.public.request<any>('POST', '/auth/students/register', { ...payload, nationalId, phone: factory.phone() }); expectStatus(duplicateId, 409);
    });
    await step('Reading and safely updating student profile', async () => {
      const me = await clients.student.request<any>('GET', '/students/me'); expectStatus(me, 200); assert(me.body.id === context.students[0].id, 'Profile must belong to current student'); expectAbsent(JSON.stringify(me.body), nationalId, 'national ID');
      const update = await clients.student.request<any>('PATCH', '/students/me', { center: 'Updated Journey Center' }); expectStatus(update, 200); assert(update.body.studentProfile?.center === 'Updated Journey Center', 'Allowed profile update must persist');
      const protectedField = await clients.student.request<any>('PATCH', '/students/me', { role: 'SUPER_ADMIN' }); expectStatus(protectedField, 400);
    });
    await step('Refreshing the student session', async () => { const r = await clients.student.request<any>('POST', '/auth/refresh'); expectStatus(r, 201); clients.student.accessToken = r.body.accessToken; context.students[0].accessToken = r.body.accessToken; });
    await step('Logging out all sessions', async () => {
      const second = await clients.public.request<any>('POST', '/auth/students/login', { phone, password }); expectStatus(second, 201);
      const logoutAll = await clients.student.request<any>('POST', '/auth/logout-all'); expectStatus(logoutAll, 201); assert(logoutAll.body.success === true, 'Logout-all must succeed');
      const revoked = await clients.public.request<any>('GET', '/auth/me', undefined, { accessToken: second.body.accessToken }); expectStatus(revoked, 401);
      const reLogin = await clients.student.request<any>('POST', '/auth/students/login', { phone, password }); expectStatus(reLogin, 201); clients.student.accessToken = reLogin.body.accessToken; context.students[0].accessToken = reLogin.body.accessToken;
    });
    await step('Changing password invalidates previous session', async () => {
      const newPassword = factory.password('StudentNew'); const second = await clients.public.request<any>('POST', '/auth/students/login', { phone, password }); expectStatus(second, 201);
      const changed = await clients.student.request<any>('POST', '/auth/change-password', { oldPassword: password, newPassword }); expectStatus(changed, 201); assert(changed.body.success === true, 'Password change must succeed');
      const revoked = await clients.public.request<any>('GET', '/auth/me', undefined, { accessToken: second.body.accessToken }); expectStatus(revoked, 401);
      const login = await clients.student.request<any>('POST', '/auth/students/login', { phone, password: newPassword }); expectStatus(login, 201); clients.student.accessToken = login.body.accessToken; context.students[0].password = newPassword; context.students[0].accessToken = login.body.accessToken;
    });
  },
};
