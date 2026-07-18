import { assert, expectAbsent, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const studentJourney: JourneyDefinition = {
  id: 'AUTH-004', name: 'Student registration, profile, password, and sessions', category: 'auth', dependsOn: ['AUTH-002'],
  async run({ clients, context, factory, step }) {
    const phone = factory.phone(); const parentPhone = factory.phone(); const nationalId = factory.nationalId(); const password = factory.password('Student'); let academicGradeId = '';
    await step('Fetching a published grade for student registration', async () => {
      const created = await clients.admin.request<any>('POST', '/admin/academic-grades', { title: factory.title('Registration grade'), slug: factory.slug('registration-grade') }); expectStatus(created, 201);
      const beforePublish = await clients.public.request<any>('GET', '/academic-grades'); expectStatus(beforePublish, 200); assert(!beforePublish.body.data.some((grade: any) => grade.id === created.body.id), 'Draft grades must not be public');
      const published = await clients.admin.request<any>('POST', `/admin/academic-grades/${created.body.id}/publish`, { version: created.body.version }); expectStatus(published, 201);
      const grades = await clients.public.request<any>('GET', '/academic-grades'); expectStatus(grades, 200); const selected = grades.body.data.find((grade: any) => grade.id === created.body.id); assert(selected?.status === 'PUBLISHED', 'Published grade must be selectable'); academicGradeId = selected.id; context.academic.gradeId = academicGradeId; context.created.grades.push(academicGradeId);
    });
    const payload = { fullName: factory.title('Student'), nationalId, phone: `+20${phone.slice(1)}`, parentPhone, governorate: 'Cairo', center: 'Journey Center', academicGradeId, password };
    await step('Registering a normalized student account', async () => {
      const r = await clients.student.request<any>('POST', '/auth/students/register', payload); expectStatus(r, 201); assert(r.body.user.role === 'STUDENT', 'Registered role must be STUDENT'); assert(r.body.user.loginIdentifier === phone, 'Student phone must be normalized'); expectAbsent(JSON.stringify(r.body), nationalId, 'national ID'); assert(clients.student.jar.has('refresh_token'), 'Registration must set refresh cookie');
      clients.student.accessToken = r.body.accessToken; context.students.push({ id: r.body.user.id, phone, password, nationalId, parentPhone, accessToken: r.body.accessToken }); context.created.students.push(r.body.user.id);
    });
    await step('Rejecting missing grade, duplicate phone and National ID', async () => {
      const missingGradePayload = { fullName: payload.fullName, nationalId: payload.nationalId, phone: payload.phone, parentPhone: payload.parentPhone, governorate: payload.governorate, center: payload.center, password: payload.password };
      const missingGrade = await clients.public.request<any>('POST', '/auth/students/register', missingGradePayload); expectStatus(missingGrade, 400);
      const duplicatePhone = await clients.public.request<any>('POST', '/auth/students/register', { ...payload, nationalId: factory.nationalId(), phone }); expectStatus(duplicatePhone, 409);
      const duplicateId = await clients.public.request<any>('POST', '/auth/students/register', { ...payload, nationalId, phone: factory.phone() }); expectStatus(duplicateId, 409);
    });
    await step('Reading and safely updating student profile', async () => {
      const me = await clients.student.request<any>('GET', '/students/me'); expectStatus(me, 200); assert(me.body.id === context.students[0].id, 'Profile must belong to current student'); assert(me.body.studentProfile?.academicGradeId === academicGradeId, 'Selected grade must persist'); expectAbsent(JSON.stringify(me.body), nationalId, 'national ID');
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
