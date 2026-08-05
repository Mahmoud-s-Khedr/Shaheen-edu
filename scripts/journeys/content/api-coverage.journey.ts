import { createHmac } from 'node:crypto';
import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/**
 * CONTENT-008 deliberately exercises the endpoint variants which are not a
 * natural part of the product journeys.  Every record is disposable and this
 * runs last, so destructive operations cannot invalidate another journey.
 */
export const apiCoverageJourney: JourneyDefinition = {
  id: 'CONTENT-008',
  name: 'Exhaustive administration endpoint variants',
  category: 'content',
  dependsOn: ['CONTENT-007'],
  async run({ clients, context, environment, factory, step }) {
    const admin = clients.admin;
    const create = async (path: string, body: unknown) => {
      const response = await admin.request<any>('POST', path, body);
      expectStatus(response, 201);
      return response.body;
    };
    const grade = String(context.academic.gradeId);
    const subject = String(context.academic.subjectId);
    const course = String(context.academic.courseId);
    const chapter = String(context.academic.chapterId);
    const lesson = String(context.academic.lessonId);
    const section = String(context.academic.sectionId);
    const catalogStudent = context.students[0];
    assert(
      catalogStudent?.accessToken,
      'AUTH-004 must provide an authenticated student for catalog coverage',
    );
    const entitlementStudent = context.students.find(
      (candidate, index) => index > 0 && candidate.id && candidate.phone && candidate.password,
    );
    assert(
      entitlementStudent?.id && entitlementStudent.phone && entitlementStudent.password,
      'AUTH-005 must provide a second registered student for entitlement coverage',
    );

    await step('Listing administrators and partners created by earlier journeys', async () => {
      expectStatus(await clients.superAdmin.request('GET', '/admin/admins'), 200);
      expectStatus(await admin.request('GET', '/admin/partners'), 200);
      expectStatus(await admin.request('GET', `/admin/partners/${context.partner.id}`), 200);
    });

    await step('Listing, reading, updating, and reordering every hierarchy level', async () => {
      for (const [path, id] of [
        ['academic-grades', grade], ['subjects', subject], ['courses', course],
        ['chapters', chapter], ['lessons', lesson], ['sections', section],
      ]) {
        expectStatus(await admin.request('GET', `/admin/${path}`), 200);
        expectStatus(await admin.request('GET', `/admin/${path}/${id}`), 200);
        expectStatus(await admin.request('PATCH', `/admin/${path}/${id}`, {
          title: path === 'academic-grades'
            ? factory.localizedTitle(`Covered ${path}`)
            : factory.title(`Covered ${path}`),
        }), 200);
      }
      const reorder = async (path: string, parent?: Record<string, string>) => {
        const query = parent ? `?${new URLSearchParams({ ...parent, limit: '100' })}` : '?limit=100';
        const listed = await admin.request<any>('GET', `/admin/${path}${query}`);
        expectStatus(listed, 200);
        expectStatus(await admin.request('POST', `/admin/${path}/reorder`, {
          ...parent,
          items: listed.body.data.map((item: any, index: number) => ({ id: item.id, sortOrder: index + 1 })),
        }), 201);
      };
      await reorder('academic-grades');
      await reorder('subjects', { academicGradeId: grade });
      await reorder('courses', { subjectId: subject });
      await reorder('chapters', { courseId: course });
      await reorder('lessons', { chapterId: chapter });
      await reorder('sections', { lessonId: lesson });
    });

    await step('Browsing every catalog hierarchy child-list endpoint', async () => {
      const publicChapters = await clients.public.request<any>('GET', `/catalog/courses/${course}/chapters`);
      expectStatus(publicChapters, 200);
      assert(publicChapters.body.data.some((item: any) => item.id === chapter), 'Public catalog must return the known chapter');
      const publicLessons = await clients.public.request<any>('GET', `/catalog/chapters/${chapter}/lessons`);
      expectStatus(publicLessons, 200);
      assert(publicLessons.body.data.some((item: any) => item.id === lesson), 'Public catalog must return the known lesson');
      const publicSections = await clients.public.request<any>('GET', `/catalog/lessons/${lesson}/sections`);
      expectStatus(publicSections, 200);
      assert(publicSections.body.data.some((item: any) => item.id === section), 'Public catalog must return the known section');
      const studentLessons = await clients.public.request<any>('GET', `/student/catalog/chapters/${chapter}/lessons`, undefined, { accessToken: catalogStudent.accessToken });
      expectStatus(studentLessons, 200);
      assert(studentLessons.body.data.some((item: any) => item.id === lesson), 'Student catalog must return the known lesson');
      const studentSections = await clients.public.request<any>('GET', `/student/catalog/lessons/${lesson}/sections`, undefined, { accessToken: catalogStudent.accessToken });
      expectStatus(studentSections, 200);
      assert(studentSections.body.data.some((item: any) => item.id === section), 'Student catalog must return the known section');
    });

    await step('Setting and removing a hierarchy cover image', async () => {
      const assets = await admin.request<any>('GET', '/admin/assets');
      expectStatus(assets, 200);
      const cover = assets.body.data.find(
        (asset: any) => asset.kind === 'COVER_IMAGE' && asset.status === 'READY',
      );
      assert(cover, 'CONTENT-007 must leave a ready cover asset for coverage');
      expectStatus(
        await admin.request('POST', `/admin/assets/covers/courses/${course}`, {
          assetId: cover.id,
        }),
        201,
      );
      expectStatus(
        await admin.request('DELETE', `/admin/assets/covers/courses/${course}`),
        200,
      );
    });

    await step('Exercising hierarchy access, move, archive, restore, and delete variants', async () => {
      const g = await create('/admin/academic-grades', { title: factory.localizedTitle('Coverage grade'), slug: factory.slug('coverage-grade') });
      const targetG = await create('/admin/academic-grades', { title: factory.localizedTitle('Coverage grade target'), slug: factory.slug('coverage-grade-target') });
      const s = await create('/admin/subjects', { title: factory.title('Coverage subject'), slug: factory.slug('coverage-subject'), academicGradeId: g.id });
      const targetS = await create('/admin/subjects', { title: factory.title('Coverage subject target'), slug: factory.slug('coverage-subject-target'), academicGradeId: targetG.id });
      const c = await create('/admin/courses', { title: factory.title('Coverage course'), slug: factory.slug('coverage-course'), subjectId: s.id, accessType: 'PUBLIC' });
      const targetC = await create('/admin/courses', { title: factory.title('Coverage course target'), slug: factory.slug('coverage-course-target'), subjectId: targetS.id, accessType: 'PUBLIC' });
      const ch = await create('/admin/chapters', { title: factory.title('Coverage chapter'), slug: factory.slug('coverage-chapter'), courseId: c.id });
      const targetCh = await create('/admin/chapters', { title: factory.title('Coverage chapter target'), slug: factory.slug('coverage-chapter-target'), courseId: targetC.id });
      const l = await create('/admin/lessons', { title: factory.title('Coverage lesson'), slug: factory.slug('coverage-lesson'), chapterId: ch.id });
      const targetL = await create('/admin/lessons', { title: factory.title('Coverage lesson target'), slug: factory.slug('coverage-lesson-target'), chapterId: targetCh.id });
      const sec = await create('/admin/sections', { title: factory.title('Coverage section'), slug: factory.slug('coverage-section'), lessonId: l.id });

      for (const [path, id] of [['courses', c.id], ['chapters', ch.id], ['lessons', l.id], ['sections', sec.id]])
        expectStatus(await admin.request('PATCH', `/admin/${path}/${id}/access`, { accessType: 'FREE' }), 200);
      expectStatus(await admin.request('POST', `/admin/subjects/${s.id}/move`, { newAcademicGradeId: targetG.id }), 201);
      expectStatus(await admin.request('POST', `/admin/courses/${c.id}/move`, { newSubjectId: targetS.id }), 201);
      expectStatus(await admin.request('POST', `/admin/chapters/${ch.id}/move`, { newCourseId: targetC.id }), 201);
      expectStatus(await admin.request('POST', `/admin/lessons/${l.id}/move`, { newChapterId: targetCh.id }), 201);
      expectStatus(await admin.request('POST', `/admin/sections/${sec.id}/move`, { newLessonId: targetL.id }), 201);
      for (const [path, id] of [['subjects', s.id], ['courses', c.id], ['chapters', ch.id], ['lessons', l.id], ['sections', sec.id]]) {
        expectStatus(await admin.request('POST', `/admin/${path}/${id}/archive`), 201);
        expectStatus(await admin.request('POST', `/admin/${path}/${id}/restore`), 201);
      }
      // Delete a separate, leaf-first draft hierarchy so the move targets stay valid above.
      const dg = await create('/admin/academic-grades', { title: factory.localizedTitle('Delete grade'), slug: factory.slug('delete-grade') });
      const ds = await create('/admin/subjects', { title: factory.title('Delete subject'), slug: factory.slug('delete-subject'), academicGradeId: dg.id });
      const dc = await create('/admin/courses', { title: factory.title('Delete course'), slug: factory.slug('delete-course'), subjectId: ds.id, accessType: 'PUBLIC' });
      const dch = await create('/admin/chapters', { title: factory.title('Delete chapter'), slug: factory.slug('delete-chapter'), courseId: dc.id });
      const dl = await create('/admin/lessons', { title: factory.title('Delete lesson'), slug: factory.slug('delete-lesson'), chapterId: dch.id });
      const dsec = await create('/admin/sections', { title: factory.title('Delete section'), slug: factory.slug('delete-section'), lessonId: dl.id });
      for (const [path, id] of [['sections', dsec.id], ['lessons', dl.id], ['chapters', dch.id], ['courses', dc.id], ['subjects', ds.id], ['academic-grades', dg.id]])
        expectStatus(await admin.request('DELETE', `/admin/${path}/${id}`), 200);
    });

    await step('Covering question-bank source, bank, question, option, asset, and video-link endpoints', async () => {
      const source = await create('/admin/question-banks/sources', { type: 'PLATFORM', title: factory.localizedTitle('Coverage source') });
      const bank = await create('/admin/question-banks', { title: factory.title('Coverage bank') });
      expectStatus(await admin.request('GET', '/admin/question-banks/sources'), 200);
      expectStatus(await admin.request('GET', `/admin/question-banks/sources/${source.id}`), 200);
      expectStatus(await admin.request('PATCH', `/admin/question-banks/sources/${source.id}`, { title: factory.localizedTitle('Updated coverage source') }), 200);
      expectStatus(await admin.request('GET', '/admin/question-banks'), 200);
      expectStatus(await admin.request('GET', `/admin/question-banks/${bank.id}`), 200);
      expectStatus(await admin.request('PATCH', `/admin/question-banks/${bank.id}`, { description: 'covered' }), 200);
      expectStatus(await admin.request('POST', `/admin/question-banks/sources/${source.id}/archive`), 201);
      expectStatus(await admin.request('POST', `/admin/question-banks/sources/${source.id}/restore`), 201);
      expectStatus(await admin.request('POST', `/admin/question-banks/${bank.id}/archive`), 201);
      expectStatus(await admin.request('POST', `/admin/question-banks/${bank.id}/restore`), 201);
      expectStatus(await admin.request('POST', `/admin/question-banks/sources/${source.id}/publish`), 201);
      expectStatus(await admin.request('POST', `/admin/question-banks/${bank.id}/publish`), 201);
      const question = await create('/admin/questions', { bankId: bank.id, sourceId: source.id, courseId: course, placements: [{ chapterId: chapter }], body: 'Coverage question?' });
      expectStatus(await admin.request('GET', `/admin/questions/${question.id}`), 200);
      const first = await create(`/admin/questions/${question.id}/options`, { body: 'Correct', isCorrect: true });
      const second = await create(`/admin/questions/${question.id}/options`, { body: 'Other', isCorrect: false });
      expectStatus(await admin.request('PATCH', `/admin/questions/${question.id}/options/${second.options.find((x: any) => x.id !== first.options?.[0]?.id)?.id ?? second.options[1].id}`, { body: 'Updated option' }), 200);
      const options = (await admin.request<any>('GET', `/admin/questions/${question.id}`)).body.options as any[];
      expectStatus(await admin.request('POST', `/admin/questions/${question.id}/options/reorder`, { optionIds: options.map((option) => option.id).reverse() }), 201);
      const assets = await admin.request<any>('GET', '/admin/assets'); expectStatus(assets, 200);
      const pdf = assets.body.data.find((asset: any) => asset.kind === 'PDF' && asset.status === 'READY');
      const video = assets.body.data.find((asset: any) => asset.kind === 'VIDEO' && asset.status === 'READY');
      assert(pdf && video, 'CONTENT-007 must leave ready PDF and video assets for endpoint coverage');
      expectStatus(await admin.request('POST', `/admin/questions/${question.id}/assets`, { assetId: pdf.id }), 201);
      expectStatus(await admin.request('POST', `/admin/questions/${question.id}/assets/reorder`, { assetIds: [pdf.id] }), 201);
      expectStatus(await admin.request('DELETE', `/admin/questions/${question.id}/assets/${pdf.id}`), 200);
      expectStatus(await admin.request('POST', `/admin/questions/${question.id}/video-link`, { videoAssetId: video.id, timestampSeconds: 0 }), 201);
      expectStatus(await admin.request('DELETE', `/admin/questions/${question.id}/video-link`), 200);
      const remainingOptions = (await admin.request<any>('GET', `/admin/questions/${question.id}`)).body.options as any[];
      for (const option of remainingOptions)
        expectStatus(await admin.request('DELETE', `/admin/questions/${question.id}/options/${option.id}`), 200);
      expectStatus(await admin.request('DELETE', `/admin/questions/${question.id}`), 200);
      const deleteSource = await create('/admin/question-banks/sources', { type: 'PLATFORM', title: factory.localizedTitle('Delete source') });
      const deleteBank = await create('/admin/question-banks', { title: factory.title('Delete bank') });
      expectStatus(await admin.request('DELETE', `/admin/question-banks/sources/${deleteSource.id}`), 200);
      expectStatus(await admin.request('DELETE', `/admin/question-banks/${deleteBank.id}`), 200);
    });

    await step('Covering content attachments, delivery reads, entitlements, and publisher variants', async () => {
      const assets = await admin.request<any>('GET', '/admin/assets'); expectStatus(assets, 200);
      const pdf = assets.body.data.find((asset: any) => asset.kind === 'PDF' && asset.status === 'READY');
      const video = assets.body.data.find((asset: any) => asset.kind === 'VIDEO' && asset.status === 'READY');
      assert(pdf && video, 'Ready assets are required');
      const item = await create('/admin/content-items', { type: 'PDF', title: factory.title('Attachment content'), placement: { courseId: course } });
      expectStatus(await admin.request('PATCH', `/admin/content-items/${item.id}/access`, { accessType: 'PUBLIC' }), 200);
      expectStatus(await admin.request('POST', `/admin/content-items/${item.id}/primary-asset`, { assetId: pdf.id }), 201);
      expectStatus(await admin.request('POST', `/admin/content-items/${item.id}/attachments`, { assetId: pdf.id }), 201);
      expectStatus(await admin.request('POST', `/admin/content-items/${item.id}/attachments/reorder`, { assetIds: [pdf.id] }), 201);
      const adminDetail = await admin.request<any>('GET', `/admin/content-items/${item.id}`);
      expectStatus(adminDetail, 200);
      assert(
        Array.isArray(adminDetail.body.attachments) &&
          adminDetail.body.attachments.length === 1 &&
          adminDetail.body.attachments[0].id === pdf.id &&
          adminDetail.body.attachments[0].sortOrder === 1,
        'Admin content detail must return its ordered attachment metadata',
      );
      expectStatus(await admin.request('POST', `/admin/content-items/${item.id}/publish`), 201);
      expectStatus(await clients.public.request('GET', `/catalog/content-items/${item.id}`, undefined, { accessToken: catalogStudent.accessToken }), 200);
      expectStatus(await admin.request('PATCH', `/admin/content-items/${item.id}/access`, { accessType: 'PAID' }), 200);
      const login = await clients.public.request<any>('POST', '/auth/students/login', {
        phone: entitlementStudent.phone,
        password: entitlementStudent.password,
      });
      expectStatus(login, 201);
      assert(typeof login.body.accessToken === 'string', 'Entitlement student login must return an access token');
      const entitlement = await create('/admin/entitlements', { studentUserId: entitlementStudent.id, courseId: course });
      expectStatus(await admin.request('GET', `/admin/entitlements?studentUserId=${entitlementStudent.id}`), 200);
      const studentDetail = await clients.student.request<any>('GET', `/student/content-items/${item.id}`, undefined, { accessToken: login.body.accessToken });
      expectStatus(studentDetail, 200);
      assert(
        Array.isArray(studentDetail.body.attachments) &&
          studentDetail.body.attachments.length === 1 &&
          studentDetail.body.attachments[0].id === pdf.id &&
          studentDetail.body.attachments[0].sortOrder === 1,
        'Student content detail must return its ordered attachment metadata',
      );
      expectStatus(await admin.request('DELETE', `/admin/content-items/${item.id}/attachments/${pdf.id}`), 200);
      expectStatus(await admin.request('POST', `/admin/entitlements/${entitlement.id}/revoke`), 201);
      const agreement = await create('/admin/publisher-agreements', { lessonId: lesson, publisherUserId: String(context.partner.id), revenueShareBps: 1000, startsAt: new Date().toISOString(), isPrimary: false });
      expectStatus(await admin.request('PATCH', `/admin/publisher-agreements/${agreement.id}`, { revenueShareBps: 1200 }), 200);
      expectStatus(await admin.request('POST', `/admin/publisher-agreements/${agreement.id}/activate`), 201);
      expectStatus(await admin.request('POST', `/admin/publisher-agreements/${agreement.id}/end`, { endsAt: new Date().toISOString() }), 201);
      expectStatus(await admin.request('GET', `/admin/publisher-agreements/effective?lessonId=${lesson}`), 200);
      expectStatus(await admin.request('POST', `/admin/pricing/lesson/${lesson}`, { isPurchasable: false }), 201);
      const statement = await create('/admin/publisher-agreements/earnings-statements', { lessonId: lesson, periodStartsAt: new Date(Date.now() - 60_000).toISOString(), periodEndsAt: new Date().toISOString(), grossRevenueMinor: 1000, currency: 'EGP' });
      assert(statement.id, 'Statement creation must return an ID');
      expectStatus(await admin.request('GET', '/admin/publisher-agreements/earnings-statements'), 200);
      // Keep video referenced in the coverage record so the variable is intentionally checked.
      assert(typeof video.id === 'string', 'Video asset ID must be present');
    });

    await step('Deleting a disposable unreferenced Bunny video asset', async () => {
      const video = await create('/admin/video-assets', {
        title: factory.title('Coverage disposable video'),
      });
      expectStatus(await admin.request('DELETE', `/admin/video-assets/${video.id}`), 200);
    });

    await step('Calling the signed Bunny webhook directly and proving duplicate delivery is safe', async () => {
      const videoId = String(context.academic.coverageVideoAssetId ?? '');
      const bunnyVideoId = String(context.academic.coverageVideoBunnyId ?? '');
      assert(videoId && bunnyVideoId, 'CONTENT-007 must provide a Bunny video ID');
      expectStatus(await admin.request('GET', `/admin/video-assets/${videoId}`), 200);
      const delayedConfirmation = await admin.request<any>(
        'POST',
        `/admin/video-assets/${videoId}/upload-confirmation`,
      );
      expectStatus(delayedConfirmation, 201);
      assert(
        delayedConfirmation.body.status === 'READY',
        'A delayed client confirmation must not regress a Bunny-ready video',
      );
      const payload = JSON.stringify({ VideoGuid: bunnyVideoId, Status: 3, Length: 1 });
      const key = environment.bunnyReadOnlyKey;
      assert(key, 'JOURNEY_BUNNY_READ_ONLY_KEY is required for direct webhook coverage');
      const headers = { 'content-type': 'application/json', 'x-bunnystream-signature': createHmac('sha256', key).update(payload, 'utf8').digest('hex'), 'x-bunnystream-signature-version': 'v1', 'x-bunnystream-signature-algorithm': 'hmac-sha256' };
      expectStatus(await clients.public.request('POST', '/integrations/bunny-stream/webhook', undefined, { rawBody: payload, headers }), 201);
      expectStatus(await clients.public.request('POST', '/integrations/bunny-stream/webhook', undefined, { rawBody: payload, headers }), 201);
      expectStatus(await clients.public.request('POST', '/integrations/bunny-stream/webhook', undefined, { rawBody: payload, headers: { ...headers, 'x-bunnystream-signature': '0'.repeat(64) } }), 401);
    });
  },
};
