import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-005 — Pricing inheritance, publisher resolution, and earnings reporting. */
export const pricingPublisherAgreementsJourney: JourneyDefinition = {
  id: 'CONTENT-005',
  name: 'Pricing inheritance and publisher earnings agreements',
  category: 'content',
  dependsOn: ['CONTENT-001', 'AUTH-003'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
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
      const override = await admin.request<any>('POST', `/admin/pricing/chapter/${chapterId}`, { isPurchasable: false });
      expectStatus(override, 201);
      assert(override.body.isPurchasable === false && override.body.resolvedFrom.chapterId === chapterId, 'Chapter override must supersede course pricing');
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
      assert(resolved.body.agreement?.id === chapter.body.id && resolved.body.agreement.revenueShareBps === 2_500 && resolved.body.resolvedFrom.chapterId === chapterId, 'Chapter agreement must override the active course agreement');
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
      assert(history.body.some((agreement: any) => agreement.id === courseAgreementId), 'Agreement history must retain the course agreement');
    });
  },
};
