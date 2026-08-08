import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assert, expectStatus } from '../lib/assertions.js';
import { fetchDeliveryUrl } from '../lib/delivery.js';
import type { JourneyDefinition } from '../lib/types.js';

const testCover = resolve(process.cwd(), 'test-files', 'G5LDVlJWQAANOhJ.jpg');

/** CONTENT-014 — live cover delivery across public, retained-student, and revoked states. */
export const assetAccessJourney: JourneyDefinition = {
  id: 'CONTENT-014',
  name: 'Asset preview, cover visibility, and archived student retention',
  category: 'content',
  dependsOn: ['CONTENT-007'],
  requiresBunny: true,
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    const student = context.students[0];
    if (!student?.id || !student.accessToken) throw new Error('A registered student is required');
    const bytes = await readFile(testCover);
    const create = async (path: string, body: unknown) => {
      const response = await admin.request<any>('POST', path, body);
      expectStatus(response, 201);
      return response.body;
    };
    let courseId = ''; let snapshotId = '';

    await step('Creating a leaf published course with a real Bunny cover', async () => {
      const grade = await create('/admin/academic-grades', { title: factory.localizedTitle('Archived cover grade'), slug: factory.slug('archived-cover-grade') });
      const subject = await create('/admin/subjects', { title: factory.title('Archived cover subject'), slug: factory.slug('archived-cover-subject'), academicGradeId: grade.id });
      const course = await create('/admin/courses', { title: factory.title('Archived cover course'), slug: factory.slug('archived-cover-course'), subjectId: subject.id, accessType: 'PUBLIC' });
      courseId = course.id;
      Object.assign(context.created, { grades: [...context.created.grades, grade.id], subjects: [...context.created.subjects, subject.id], courses: [...context.created.courses, courseId] });
      for (const [resource, id] of [['academic-grades', grade.id], ['subjects', subject.id], ['courses', courseId]]) {
        expectStatus(await admin.request('POST', `/admin/${resource}/${id}/publish`), 201);
      }
      const cover = await admin.upload<any>('/admin/assets/upload?kind=COVER_IMAGE', { buffer: bytes, filename: `archived-cover-${factory.runId}.jpg`, contentType: 'image/jpeg' });
      expectStatus(cover, 201);
      expectStatus(await admin.request('POST', `/admin/assets/covers/courses/${courseId}`, { assetId: cover.body.id }), 201);
      const adminPreview = await admin.request<any>('GET', `/admin/assets/${cover.body.id}/access`);
      expectStatus(adminPreview, 200);
      await fetchDeliveryUrl(adminPreview.body.url, 'Admin archived-course cover preview');
      const publicCover = await clients.public.request<any>('GET', `/catalog/courses/${courseId}/cover/access`);
      expectStatus(publicCover, 200);
      await fetchDeliveryUrl(publicCover.body.url, 'Published course cover');
    });

    await step('Retaining existing student access when the covered course is archived', async () => {
      expectStatus(await admin.request('POST', '/admin/entitlements', { studentUserId: student.id, courseId }), 201);
      expectStatus(await admin.request('POST', `/admin/courses/${courseId}/archive`), 201);
      expectStatus(await clients.public.request('GET', `/catalog/courses/${courseId}/cover/access`), 403);
      const retained = await clients.student.request<any>('GET', `/catalog/courses/${courseId}/cover/access`, undefined, { accessToken: student.accessToken });
      expectStatus(retained, 200);
      await fetchDeliveryUrl(retained.body.url, 'Retained student archived-course cover');
      const library = await clients.student.request<any>('GET', '/student/library', undefined, { accessToken: student.accessToken });
      expectStatus(library, 200);
      const entry = library.body.data.find((item: any) => item.targetType === 'COURSE' && item.target?.id === courseId && item.retainedAccess === true);
      assert(entry?.archivedAccessSnapshotId, 'Student library must expose retained archived course access');
      snapshotId = entry.archivedAccessSnapshotId;
    });

    await step('Revoking retained archived access blocks further cover delivery', async () => {
      expectStatus(await admin.request('POST', `/admin/entitlements/archived-access/${snapshotId}/revoke`), 201);
      expectStatus(await clients.student.request('GET', `/catalog/courses/${courseId}/cover/access`, undefined, { accessToken: student.accessToken }), 403);
    });
  },
};
