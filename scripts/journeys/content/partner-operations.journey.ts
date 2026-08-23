import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-022 — Phase 5 referral, allocation, settlement, export, and refund journey. */
export const partnerOperationsJourney: JourneyDefinition = {
  id: 'CONTENT-022',
  name: 'Partner finance and referral operations',
  category: 'content',
  dependsOn: ['CONTENT-005', 'CONTENT-012', 'CONTENT-018'],
  requiresBunny: true,
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const proofImage = await readFile(
      resolve(process.cwd(), 'test-files', 'G5LALx9a8AAH7PH.jpg'),
    );
    let referralPartnerId = '';
    let referralToken = '';
    let referralProgramId = '';
    let referralCodeId = '';
    let referralCode = '';
    let referralRuleId = '';
    let studentToken = '';
    let studentUserId = '';
    let orderId = '';
    let orderItemId = '';
    let referralAllocationId = '';
    let settlementId = '';
    let refundId = '';
    let reconciliationId = '';

    const student = <T>(
      method: 'GET' | 'POST',
      path: string,
      body?: unknown,
      headers?: Record<string, string>,
    ) =>
      clients.public.request<T>(method, path, body, {
        accessToken: studentToken,
        headers,
      });

    await step(
      'Creating and activating a referral program, code, and rule',
      async () => {
        const email = factory.email('phase5-referral');
        const password = factory.password('Phase5Referral');
        const partner = await admin.request<any>('POST', '/admin/partners', {
          email,
          password,
          partnerType: 'REFERRAL_PARTNER',
          displayName: factory.title('Phase 5 referral partner'),
        });
        expectStatus(partner, 201);
        referralPartnerId = partner.body.id;
        context.created.partners.push(referralPartnerId);

        const program = await admin.request<any>(
          'POST',
          '/admin/referral-programs',
          {
            name: factory.title('Phase 5 referral program'),
            partnerUserId: referralPartnerId,
            startsAt,
            appliesToAll: true,
          },
        );
        expectStatus(program, 201);
        referralProgramId = program.body.id;
        expectStatus(
          await admin.request('PATCH', `/admin/referral-programs/${referralProgramId}`, {
            name: factory.title('Phase 5 referral program updated'),
          }),
          200,
        );

        referralCode = factory.slug('phase5-referral').toUpperCase();
        const code = await admin.request<any>(
          'POST',
          `/admin/referral-programs/${program.body.id}/codes`,
          { code: referralCode },
        );
        expectStatus(code, 201);
        referralCodeId = code.body.id;
        expectStatus(
          await admin.request('PATCH', `/admin/referral-programs/codes/${referralCodeId}`, {
            usageLimit: 10,
          }),
          200,
        );
        expectStatus(
          await admin.request('POST', `/admin/referral-programs/codes/${referralCodeId}/suspend`),
          201,
        );
        expectStatus(
          await admin.request('POST', `/admin/referral-programs/codes/${referralCodeId}/resume`),
          201,
        );

        const rule = await admin.request<any>(
          'POST',
          `/admin/referral-programs/${program.body.id}/rules`,
          { kind: 'PERCENTAGE', percentageBps: 1_000, startsAt },
        );
        expectStatus(rule, 201);
        referralRuleId = rule.body.id;
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/referral-programs/${program.body.id}/rules/${referralRuleId}/activate`,
          ),
          201,
        );
        const reviewRule = await admin.request<any>(
          'POST',
          `/admin/referral-programs/${referralProgramId}/review-rules`,
          { name: factory.title('Phase 5 review rule'), kind: 'STUDENT_PROGRAM_APPROVED_SALES', action: 'QUEUE_REVIEW', threshold: 1 },
        );
        expectStatus(reviewRule, 201);
        expectStatus(
          await admin.request('PATCH', `/admin/referral-programs/review-rules/${reviewRule.body.id}`, {
            threshold: 1,
          }),
          200,
        );
        const activated = await admin.request<any>(
          'POST',
          `/admin/referral-programs/${program.body.id}/activate`,
        );
        expectStatus(activated, 201);
        assert(
          activated.body.status === 'ACTIVE',
          'Referral program must be active before a code can be used',
        );
        expectStatus(await admin.request('GET', '/admin/referral-programs?limit=100'), 200);
        expectStatus(await admin.request('GET', `/admin/referral-programs/${referralProgramId}`), 200);

        const login = await clients.public.request<any>(
          'POST',
          '/auth/partners/login',
          { email, password },
        );
        expectStatus(login, 201);
        referralToken = login.body.accessToken;
      },
    );

    await step(
      'Attributing an idempotent checkout and one approved allocation',
      async () => {
        const registration = await clients.public.request<any>(
          'POST',
          '/auth/students/register',
          {
            fullName: factory.title('Phase 5 referral student'),
            nationalId: factory.nationalId(),
            phone: `+20${factory.phone().slice(1)}`,
            parentPhone: factory.phone(),
            governorateId: String(context.academic.governorateId),
            academicGradeId: String(context.academic.gradeId),
            password: factory.password('Phase5Student'),
          },
        );
        expectStatus(registration, 201);
        studentToken = registration.body.accessToken;
        studentUserId = registration.body.user.id;

        const preview = await student<any>('POST', '/student/price-preview', {
          targets: [{ targetType: 'COURSE', targetId: courseId }],
          referralCode,
        });
        expectStatus(preview, 201);
        assert(
          preview.body.referral?.code === referralCode,
          'An allow-listed student must be able to validate the active referral code',
        );

        expectStatus(
          await student<any>('POST', '/student/cart/items', {
            targetType: 'COURSE',
            targetId: courseId,
          }),
          201,
        );
        const methods = await student<any>(
          'GET',
          '/student/manual-payment-methods?limit=100',
        );
        expectStatus(methods, 200);
        const method = methods.body.data[0];
        assert(
          method?.id,
          'A prior manual-commerce journey must provide a payment method',
        );

        const idempotencyKey = factory.slug('phase5-referral-checkout');
        const checkout = await student<any>(
          'POST',
          '/student/checkout',
          { manualPaymentMethodId: method.id, referralCode },
          { 'idempotency-key': idempotencyKey },
        );
        expectStatus(checkout, 201);
        orderId = checkout.body.id;
        orderItemId = checkout.body.items[0]?.id;
        assert(orderItemId, 'Checkout must retain an immutable order item ID');
        const replay = await student<any>(
          'POST',
          '/student/checkout',
          { manualPaymentMethodId: method.id, referralCode },
          { 'idempotency-key': idempotencyKey },
        );
        expectStatus(replay, 201);
        assert(
          replay.body.id === orderId,
          'A checkout replay must return the original order rather than creating another attribution',
        );

        const proof = await clients.public.upload<any>(
          `/student/orders/${orderId}/payment-proof`,
          {
            buffer: proofImage,
            filename: `${factory.slug('phase5-proof')}.jpg`,
            contentType: 'image/jpeg',
          },
          {
            accessToken: studentToken,
            fields: { transactionReference: factory.slug('phase5-transfer') },
            headers: { 'idempotency-key': factory.slug('phase5-proof') },
          },
        );
        expectStatus(proof, 201);
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/payment-submissions/${proof.body.id}/approve`,
          ),
          201,
        );

        const allocations = await admin.request<any>(
          'GET',
          `/admin/partner-finance/allocations?referralRuleId=${referralRuleId}&limit=100`,
        );
        expectStatus(allocations, 200);
        const matching = allocations.body.data.filter(
          (row: any) =>
            row.kind === 'REFERRAL_COMMISSION' &&
            row.referralRuleId === referralRuleId &&
            row.amountMinor > 0,
        );
        assert(
          matching.length === 1 &&
            matching[0].basisMinor ===
              checkout.body.items[0].price.amountMinor &&
            matching[0].amountMinor ===
              Math.floor(checkout.body.items[0].price.amountMinor / 10),
          'One referral allocation must be created from the immutable final order-item price',
        );
        referralAllocationId = matching[0].id;
      },
    );

    await step(
      'Settling, refunding, and reconciling the referral allocation',
      async () => {
        const settlement = await admin.request<any>(
          'POST',
          '/admin/partner-finance/settlements',
          {
            allocationIds: [referralAllocationId],
            paymentReference: factory.slug('phase5-settlement'),
          },
        );
        expectStatus(settlement, 201);
        settlementId = settlement.body.id;
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/partner-finance/settlements/${settlement.body.id}/mark-paid`,
          ),
          201,
        );

        const refund = await student<any>(
          'POST',
          `/student/orders/${orderId}/refund-requests`,
          {
            orderItemIds: [orderItemId],
            reason: 'Phase 5 end-to-end reversal',
          },
        );
        expectStatus(refund, 201);
        refundId = refund.body.id;
        assert(
          refund.body.status === 'PENDING',
          'Fresh unused content must be refund eligible',
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/refunds/${refund.body.id}/approve`,
            {
              manualRefundReference: factory.slug('phase5-reimbursement'),
            },
          ),
          201,
        );

        const reversed = await admin.request<any>(
          'GET',
          `/admin/partner-finance/allocations?referralRuleId=${referralRuleId}&limit=100`,
        );
        expectStatus(reversed, 200);
        const original = reversed.body.data.find(
          (row: any) => row.id === referralAllocationId,
        );
        const reversal = reversed.body.data.find(
          (row: any) =>
            row.reversedAllocationId === referralAllocationId &&
            row.amountMinor === -original.amountMinor,
        );
        assert(
          original?.state === 'REVERSED' && reversal?.state === 'PAYABLE',
          'A refund must preserve the original allocation and add a linked negative reversal',
        );

        const reconciliation = await admin.request<any>(
          'POST',
          '/admin/partner-finance/reconciliation-runs',
          {
            pilotLabel: factory.slug('phase5-reconciliation'),
            orderIds: [orderId],
          },
        );
        expectStatus(reconciliation, 201);
        reconciliationId = reconciliation.body.id;
        const run = await admin.request<any>(
          'POST',
          `/admin/partner-finance/reconciliation-runs/${reconciliation.body.id}/run`,
        );
        expectStatus(run, 201);
        assert(
          run.body.status === 'COMPLETED',
          'The persistent reconciliation run must finish for the refunded pilot order',
        );
      },
    );

    await step(
      'Proving partner isolation, cohort suppression, and secure export completion',
      async () => {
        expectStatus(await admin.request('GET', `/admin/partners/${referralPartnerId}/detail`), 200);
        expectStatus(await admin.request('GET', '/admin/referral-reporting'), 200);
        const flags = await admin.request<any>('GET', `/admin/referral-programs/review-flags?programId=${referralProgramId}&limit=100`);
        expectStatus(flags, 200);
        const flag = flags.body.data[0];
        assert(flag?.id, 'The threshold-one review rule must create an automated review flag');
        expectStatus(await admin.request('PATCH', `/admin/referral-programs/review-flags/${flag.id}/assign`, {
          assigneeUserId: String(context.admin.id),
        }), 200);
        expectStatus(await admin.request('POST', `/admin/referral-programs/review-flags/${flag.id}/notes`, {
          body: 'Phase 5 referral review coverage note',
        }), 201);
        expectStatus(await admin.request('PATCH', `/admin/referral-programs/review-flags/${flag.id}/resolve`, {
          status: 'ACCEPTED', disposition: 'NO_ACTION', note: 'Phase 5 referral review coverage resolved',
        }), 200);
        expectStatus(await admin.request('POST', '/admin/referral-programs/attributions/missing-attribution/review-flags', {
          type: 'COVERAGE', note: 'Missing attribution validation coverage',
        }), 404);
        expectStatus(await admin.request('GET', '/admin/partner-finance/settlements?limit=100'), 200);
        expectStatus(await admin.request('GET', '/admin/partner-finance/reconciliation-runs?limit=100'), 200);
        expectStatus(await admin.request('GET', `/admin/partner-finance/reconciliation-runs/${reconciliationId}`), 200);
        expectStatus(await admin.request('GET', `/admin/partner-finance/reconciliation-runs/${reconciliationId}/discrepancies?limit=100`), 200);
        expectStatus(await admin.request('PATCH', '/admin/partner-finance/reconciliation-discrepancies/missing-discrepancy/assign', {
          assigneeUserId: String(context.admin.id), notes: 'Missing discrepancy validation coverage',
        }), 404);
        expectStatus(await admin.request('PATCH', '/admin/partner-finance/reconciliation-discrepancies/missing-discrepancy/resolve', {
          status: 'ACCEPTED', resolutionNote: 'Missing discrepancy validation coverage',
        }), 404);
        expectStatus(await admin.request('POST', '/admin/partner-finance/usage-rollups/rebuild', {
          from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), publisherUserId: String(context.partner.id),
        }), 201);
        expectStatus(await admin.request('GET', '/admin/refunds?limit=100'), 200);
        const policy = await admin.request<any>('GET', '/admin/refunds/policy');
        expectStatus(policy, 200);
        expectStatus(await admin.request('PATCH', '/admin/refunds/policy', {
          eligibilityWindowDays: policy.body.eligibilityWindowDays,
          maximumConsumptionBps: policy.body.maximumConsumptionBps,
        }), 200);
        expectStatus(await student('GET', '/student/refund-requests?limit=100'), 200);
        // The completed refund cannot be rejected again; this verifies its
        // terminal-state protection while retaining endpoint coverage.
        expectStatus(await admin.request('POST', `/admin/refunds/${refundId}/reject`, {
          rejectionReason: 'Already completed refund coverage check',
        }), 409);
        for (const path of [
          '/admin/reports/commerce', '/admin/reports/revenue', '/admin/reports/refunds',
          '/admin/reports/payments', '/admin/reports/registrations', '/admin/reports/active-purchasers',
          '/admin/reports/entitlements', '/admin/reports/partner-obligations',
        ]) expectStatus(await admin.request('GET', path), 200);
        for (const suffix of ['', '/assessments', '/audit-events', '/entitlements', '/orders'])
          expectStatus(await admin.request('GET', `/admin/students/${studentUserId}/360${suffix}?reason=phase5-acceptance-coverage`), 200);
        const referralReport = await clients.public.request<any>(
          'GET',
          '/partners/referrals/report',
          undefined,
          { accessToken: referralToken },
        );
        expectStatus(referralReport, 200);
        expectStatus(
          await clients.public.request('GET', '/partners/referrals/settlements', undefined, { accessToken: referralToken }),
          200,
        );
        assert(
          referralReport.body.privacy?.suppressed === true &&
            !JSON.stringify(referralReport.body).includes(
              'Phase 5 referral student',
            ),
          'A small referral cohort must be fully suppressed without learner identity',
        );
        expectStatus(
          await clients.public.request<any>(
            'GET',
            '/partners/dashboard',
            undefined,
            { accessToken: referralToken },
          ),
          403,
        );
        expectStatus(
          await clients.partner.request<any>(
            'GET',
            '/partners/referrals/report',
          ),
          403,
        );

        const queued = await admin.request<any>(
          'POST',
          '/admin/reports/exports',
          {
            reportType: 'REFERRAL_ALLOCATIONS',
            columns: [
              'createdAt',
              'partnerUserId',
              'state',
              'basisMinor',
              'amountMinor',
              'currency',
            ],
            reason: 'Phase 5 referral allocation verification',
            partnerUserId: referralPartnerId,
          },
        );
        expectStatus(queued, 201);
        let exportJob: any;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const listed = await admin.request<any>(
            'GET',
            '/admin/reports/exports?limit=100',
          );
          expectStatus(listed, 200);
          exportJob = listed.body.data.find(
            (row: any) => row.id === queued.body.id,
          );
          if (
            exportJob?.status === 'COMPLETED' ||
            exportJob?.status === 'FAILED'
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        assert(
          exportJob?.status === 'COMPLETED',
          `Queued export must complete through the worker, received ${exportJob?.status ?? 'no job'}`,
        );
        const download = await admin.request<any>(
          'GET',
          `/admin/reports/exports/${queued.body.id}/download`,
        );
        expectStatus(download, 200);
        assert(
          typeof download.body.url === 'string' &&
            !download.body.url.includes('Phase 5 referral student'),
          'Export download must use a protected URL without learner identity',
        );
        expectStatus(
          await admin.request('POST', `/admin/reports/exports/${queued.body.id}/cancel`),
          409,
        );
        expectStatus(
          await admin.request('POST', `/admin/referral-programs/${referralProgramId}/suspend`),
          201,
        );
        expectStatus(
          await admin.request('POST', `/admin/referral-programs/${referralProgramId}/resume`),
          201,
        );
        expectStatus(
          await admin.request('POST', `/admin/referral-programs/${referralProgramId}/end`),
          201,
        );
      },
    );
  },
};
