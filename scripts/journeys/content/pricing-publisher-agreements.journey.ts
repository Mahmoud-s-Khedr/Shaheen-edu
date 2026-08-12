import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-005 — Pricing inheritance, publisher resolution, and earnings reporting. */
export const pricingPublisherAgreementsJourney: JourneyDefinition = {
  id: 'CONTENT-005',
  name: 'Pricing inheritance and publisher earnings agreements',
  category: 'content',
  dependsOn: ['CONTENT-001', 'AUTH-003'],
  async run({ clients, context, step }) {
    const admin = clients.admin;
    const subjectId = String(context.academic.subjectId);
    const courseId = String(context.academic.courseId);
    const chapterId = String(context.academic.chapterId);
    const lessonId = String(context.academic.lessonId);
    const publisherUserId = String(context.partner.id);
    const startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const periodStartsAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const periodEndsAt = new Date().toISOString();
    let courseAgreementId = '';

    await step('Configuring inherited course pricing and a chapter override', async () => {
      const price = await admin.request<any>('POST', `/admin/pricing/course/${courseId}`, { isPurchasable: true, priceMinor: 20_000, currency: 'EGP' });
      expectStatus(price, 201);
      const inherited = await admin.request<any>('GET', `/admin/pricing/effective?lessonId=${lessonId}`);
      expectStatus(inherited, 200);
      assert(inherited.body.priceMinor === 20_000 && inherited.body.resolvedFrom.courseId === courseId, 'Lesson must inherit its course pricing');

      const courseDetail = await admin.request<any>('GET', `/admin/courses/${courseId}`);
      const courseList = await admin.request<any>('GET', `/admin/courses?subjectId=${subjectId}`);
      expectStatus(courseDetail, 200);
      expectStatus(courseList, 200);
      const listedCourse = courseList.body.data.find((course: any) => course.id === courseId);
      assert(courseDetail.body.pricing?.isPurchasable === true && courseDetail.body.pricing.priceMinor === 20_000 && courseDetail.body.pricing.currency === 'EGP' && courseDetail.body.pricing.resolvedFrom.courseId === courseId, 'Course detail must expose its effective pricing');
      assert(listedCourse?.pricing?.isPurchasable === true && listedCourse.pricing.priceMinor === 20_000 && listedCourse.pricing.currency === 'EGP' && listedCourse.pricing.resolvedFrom.courseId === courseId, 'Course list must expose its effective pricing');

      const chapterDetail = await admin.request<any>('GET', `/admin/chapters/${chapterId}`);
      const chapterList = await admin.request<any>('GET', `/admin/chapters?courseId=${courseId}`);
      expectStatus(chapterDetail, 200);
      expectStatus(chapterList, 200);
      const listedChapter = chapterList.body.data.find((chapter: any) => chapter.id === chapterId);
      assert(chapterDetail.body.pricing?.isPurchasable === true && chapterDetail.body.pricing.priceMinor === 20_000 && chapterDetail.body.pricing.currency === 'EGP' && chapterDetail.body.pricing.resolvedFrom.courseId === courseId, 'Chapter detail must expose inherited course pricing');
      assert(listedChapter?.pricing?.isPurchasable === true && listedChapter.pricing.priceMinor === 20_000 && listedChapter.pricing.currency === 'EGP' && listedChapter.pricing.resolvedFrom.courseId === courseId, 'Chapter list must expose inherited course pricing');

      const override = await admin.request<any>('POST', `/admin/pricing/chapter/${chapterId}`, { isPurchasable: false });
      expectStatus(override, 201);
      assert(override.body.isPurchasable === false && override.body.resolvedFrom.chapterId === chapterId && typeof override.body.resolvedFrom.chapterName === 'string', 'Chapter override must return the effective pricing source ID and name');

      const overriddenDetail = await admin.request<any>('GET', `/admin/chapters/${chapterId}`);
      const overriddenList = await admin.request<any>('GET', `/admin/chapters?courseId=${courseId}`);
      expectStatus(overriddenDetail, 200);
      expectStatus(overriddenList, 200);
      const listedOverride = overriddenList.body.data.find((chapter: any) => chapter.id === chapterId);
      assert(overriddenDetail.body.pricing?.isPurchasable === false && overriddenDetail.body.pricing.priceMinor === null && overriddenDetail.body.pricing.currency === null && overriddenDetail.body.pricing.resolvedFrom.chapterId === chapterId, 'Chapter detail must expose its non-purchasable override');
      assert(listedOverride?.pricing?.isPurchasable === false && listedOverride.pricing.priceMinor === null && listedOverride.pricing.currency === null && listedOverride.pricing.resolvedFrom.chapterId === chapterId, 'Chapter list must expose its non-purchasable override');
    });

    await step('Activating course and chapter publisher agreements with chapter precedence', async () => {
      const course = await admin.request<any>('POST', '/admin/publisher-agreements', { courseId, publisherUserId, revenueShareBps: 1_000, startsAt, isPrimary: true });
      expectStatus(course, 201); courseAgreementId = course.body.id;
      expectStatus(await admin.request<any>('POST', `/admin/publisher-agreements/${courseAgreementId}/activate`), 201);
      const chapter = await admin.request<any>('POST', '/admin/publisher-agreements', { chapterId, publisherUserId, revenueShareBps: 2_500, startsAt, isPrimary: true });
      expectStatus(chapter, 201);
      expectStatus(await admin.request<any>('POST', `/admin/publisher-agreements/${chapter.body.id}/activate`), 201);
      const resolved = await admin.request<any>('GET', `/admin/publisher-agreements/effective?lessonId=${lessonId}`);
      expectStatus(resolved, 200);
      assert(resolved.body.agreement?.id === chapter.body.id && resolved.body.agreement.revenueShareBps === 2_500 && resolved.body.agreement.publisherUserId === publisherUserId && typeof resolved.body.agreement.publisherName === 'string' && resolved.body.resolvedFrom.chapterId === chapterId && typeof resolved.body.resolvedFrom.chapterName === 'string', 'Chapter agreement must return paired publisher and resolved-target labels');
    });

    await step('Rejecting an overlapping primary agreement and calculating publisher earnings', async () => {
      const overlapping = await admin.request<any>('POST', '/admin/publisher-agreements', { chapterId, publisherUserId, revenueShareBps: 3_000, startsAt, isPrimary: true });
      expectStatus(overlapping, 201);
      expectStatus(await admin.request<any>('POST', `/admin/publisher-agreements/${overlapping.body.id}/activate`), 409);
      const statement = await admin.request<any>('POST', '/admin/publisher-agreements/earnings-statements', { lessonId, periodStartsAt, periodEndsAt, grossRevenueMinor: 8_000, currency: 'EGP' });
      expectStatus(statement, 201);
      assert(statement.body.publisherEarningsMinor === 2_000 && statement.body.revenueShareBps === 2_500, 'Earnings statement must calculate the chapter publisher share');
      const history = await admin.request<any>('GET', '/admin/publisher-agreements?history=true');
      expectStatus(history, 200);
      assert(history.body.data.some((agreement: any) => agreement.id === courseAgreementId && agreement.courseId === courseId && typeof agreement.courseName === 'string' && agreement.publisherUserId === publisherUserId && typeof agreement.publisherName === 'string') && history.body.meta.total >= 1, 'Agreement history must retain related IDs with display names');
      const statements = await admin.request<any>('GET', '/admin/publisher-agreements/earnings-statements?limit=1');
      expectStatus(statements, 200);
      assert(statements.body.data.length >= 1 && statements.body.meta.limit === 1, 'Earnings statements must be paginated');
    });
  },
};
