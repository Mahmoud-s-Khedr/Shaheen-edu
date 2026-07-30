import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const parentJourney: JourneyDefinition = {
  id: 'AUTH-005', name: 'Parent multi-child scoped access', category: 'auth', dependsOn: ['AUTH-004'],
  async run({ clients, context, factory, step }) {
    const parentPhone = factory.phone();
    const governorateId = String(context.academic.governorateId);
    assert(governorateId, 'AUTH-004 must provide a managed governorate for student registration');
    const child = () => ({ fullName: factory.title('Child'), nationalId: factory.nationalId(), phone: factory.phone(), parentPhone, governorateId, academicGradeId: context.academic.gradeId, password: factory.password('Child') });
    const childA = child(); const childB = child(); let childAId = ''; let childBId = ''; let unrelatedId = '';
    await step('Registering two children under one parent', async () => {
      for (const [index, data] of [childA, childB].entries()) { const r = await clients.public.request<any>('POST', '/auth/students/register', data); expectStatus(r, 201); if (index === 0) childAId = r.body.user.id; else childBId = r.body.user.id; context.students.push({ id: r.body.user.id, phone: data.phone, password: data.password, nationalId: data.nationalId, parentPhone }); context.created.students.push(r.body.user.id); }
      const unrelated = child(); unrelated.parentPhone = factory.phone(); const r = await clients.public.request<any>('POST', '/auth/students/register', unrelated); expectStatus(r, 201); unrelatedId = r.body.user.id; context.created.students.push(unrelatedId);
    });
    await step('Authenticating parent and listing both children', async () => {
      const login = await clients.parent.request<any>('POST', '/auth/parents/login', { nationalId: childA.nationalId, parentPhone }); expectStatus(login, 201); clients.parent.accessToken = login.body.accessToken; context.parent.accessToken = login.body.accessToken;
      const children = await clients.parent.request<any>('GET', '/auth/parents/children'); expectStatus(children, 200); assert(children.body.meta.total === 2, 'Parent must see exactly two linked children'); assert(children.body.data.some((entry: any) => entry.userId === childAId), 'Child A must be listed'); assert(children.body.data.some((entry: any) => entry.userId === childBId), 'Child B must be listed');
      const wrong = await clients.public.request<any>('POST', '/auth/parents/login', { nationalId: childA.nationalId, parentPhone: factory.phone() }); expectStatus(wrong, 401); assert(wrong.body.message?.en === 'Invalid credentials', 'Credential failure must be generic');
    });
    await step('Selecting and switching children', async () => {
      const first = await clients.parent.request<any>('POST', '/auth/parents/select-child', { studentUserId: childAId }); expectStatus(first, 201); clients.parent.accessToken = first.body.accessToken;
      const selectedA = await clients.parent.request<any>('GET', '/auth/parents/selected-child'); expectStatus(selectedA, 200); assert(selectedA.body.userId === childAId, 'Child A must be active');
      const second = await clients.parent.request<any>('POST', '/auth/parents/select-child', { studentUserId: childBId }); expectStatus(second, 201); clients.parent.accessToken = second.body.accessToken;
      const selectedB = await clients.parent.request<any>('GET', '/auth/parents/selected-child'); expectStatus(selectedB, 200); assert(selectedB.body.userId === childBId, 'Child B must replace active child'); context.parent.activeStudentId = selectedB.body.userId;
    });
    await step('Rejecting unrelated child selection', async () => { const r = await clients.parent.request<any>('POST', '/auth/parents/select-child', { studentUserId: unrelatedId }); expectStatus(r, 403); });
  },
};
