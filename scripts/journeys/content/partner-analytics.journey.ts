import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-018 — Content publisher dashboard, financial reporting, and isolation. */
export const partnerAnalyticsJourney: JourneyDefinition = {
  id: 'CONTENT-018',
  name: 'Content publisher dashboard and analytics',
  category: 'content',
  dependsOn: ['CONTENT-005', 'CONTENT-012'],
  async run({ clients, context, factory, step }) {
    const partner = clients.partner;
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const chapterId = String(context.academic.chapterId);

    await step(
      'Reading self-scoped dashboard metrics and the earnings trend',
      async () => {
        const dashboard = await partner.request<any>(
          'GET',
          '/partners/dashboard',
        );
        expectStatus(dashboard, 200);
        assert(
          dashboard.body.period?.timeZone === 'Africa/Cairo',
          'Dashboard must state that reporting dates use Cairo time',
        );
        assert(
          dashboard.body.totals?.earned?.amountMinor >= 2_500 &&
            dashboard.body.totals?.net?.amountMinor >= 2_500,
          'Dashboard must derive earned and net amounts from publisher allocation rows',
        );
        assert(
          Array.isArray(dashboard.body.trend) &&
            dashboard.body.trend.some(
              (row: any) =>
                row.earned?.currency === 'EGP' && row.net?.currency === 'EGP',
            ),
          'Dashboard trend must expose ledger-earned and net EGP amounts',
        );
        assert(
          !JSON.stringify(dashboard.body).includes('Manual payment student'),
          'Partner analytics must not expose learner identity data',
        );

        const earnings = await partner.request<any>(
          'GET',
          '/partners/analytics/earnings?granularity=day',
        );
        expectStatus(earnings, 200);
        assert(
          earnings.body.granularity === 'day' &&
            earnings.body.metricDefinitions?.net?.includes('Signed financial'),
          'Earnings endpoint must document signed ledger netting',
        );
      },
    );

    await step(
      'Listing agreement-covered content and ledger agreement breakdowns',
      async () => {
        const content = await partner.request<any>(
          'GET',
          '/partners/analytics/content?limit=100',
        );
        expectStatus(content, 200);
        assert(
          content.body.data.some(
            (item: any) =>
              item.target?.id === courseId &&
              item.target?.type === 'COURSE' &&
              item.revenueShareBps === 1_000,
          ) &&
            content.body.data.some(
              (item: any) =>
                item.target?.id === chapterId &&
                item.target?.type === 'CHAPTER' &&
                item.revenueShareBps === 2_500,
            ),
          'Publisher content must include its course and higher-precedence chapter agreements',
        );
        assert(
          content.body.meta.limit === 100,
          'Publisher content must retain pagination metadata',
        );

        const earnings = await partner.request<any>('GET', '/partners/analytics/earnings?granularity=month');
        expectStatus(earnings, 200);
        assert(
          earnings.body.agreements.some(
            (agreement: any) => agreement.net?.currency === 'EGP',
          ),
          'Publisher earnings must include an agreement-level ledger breakdown',
        );
      },
    );

    await step(
      'Rejecting a referral partner from content-publisher reporting',
      async () => {
        const email = factory.email('referral-reporting');
        const password = factory.password('Referral');
        const created = await admin.request<any>('POST', '/admin/partners', {
          email,
          password,
          partnerType: 'REFERRAL_PARTNER',
          displayName: factory.title('Referral reporting partner'),
        });
        expectStatus(created, 201);
        context.created.partners.push(created.body.id);
        const login = await clients.public.request<any>(
          'POST',
          '/auth/partners/login',
          {
            email,
            password,
          },
        );
        expectStatus(login, 201);
        const denied = await clients.public.request<any>(
          'GET',
          '/partners/dashboard',
          undefined,
          { accessToken: login.body.accessToken },
        );
        expectStatus(denied, 403);
      },
    );
  },
};
