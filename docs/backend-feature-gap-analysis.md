# Backend Feature Gap Analysis

**Review date:** 2026-08-24
**Reviewed revision:** `69609e2`
**Scope:** backend source code, schema, and automated tests. UI composition,
live provider credentials, and deployment environment are outside this feature
coverage count.

## Executive summary

The current code implements **43 of the 49 original backend requirement rows**:

| Status | Count | Meaning |
| --- | ---: | --- |
| Complete | 43 | Controller/service/schema support exists in the current revision. |
| Partial | 5 | A material product or data-model portion is absent. |
| Not implemented | 1 | No backend equivalent exists. |

This is **approximately 88% backend feature coverage**. The rows overlap, so
the percentage is an orientation aid rather than a delivery forecast.

The prior analysis was stale in several material areas. The current code now
includes Paymob checkout/webhooks, promotions/coupons, payment expiry,
receipts, manual refunds, AI-prompt quizzes, ranked community-question
discovery, AI question explanation review, Student 360, secure report exports,
referral operations, visual/scanned-PDF OCR, and candidate accept/reject
controls.

## Confirmed current implementation

| Capability | Code evidence |
| --- | --- |
| Online and manual commerce | [`commerce.controller.ts`](../src/modules/commerce/commerce.controller.ts), [`paymob.service.ts`](../src/modules/commerce/paymob.service.ts), [`refunds.controller.ts`](../src/modules/commerce/refunds.controller.ts) expose Paymob attempts/webhooks, manual proof flows, promotions/coupons, receipt-backed fulfilment, expiry, and manual refund handling. |
| Student administration and reports | [`students.controller.ts`](../src/modules/students/students.controller.ts) exposes audited Student 360 and its paginated domains; [`reports.controller.ts`](../src/modules/reports/reports.controller.ts) exposes aggregate reports and protected CSV export jobs. |
| Assessment intelligence | [`assessments.controller.ts`](../src/modules/assessments/assessments.controller.ts) exposes AI-prompt generation, ranked community questions, tutor quizzes, question reports, and assessment lifecycle APIs. |
| Reviewable question imports | [`question-import.controller.ts`](../src/modules/ai-question-import/question-import.controller.ts) exposes OCR/import progress, page retries, candidate media review, and `accept`/`reject` actions. [`question-import.worker.ts`](../src/modules/ai-question-import/question-import.worker.ts) implements visual PDF OCR. |
| Leaderboard parity | [`leaderboard.service.ts`](../src/modules/leaderboard/leaderboard.service.ts) uses the percentage-based Smart Score formula, Friday/Cairo weeks, persisted history, a top-five honor board, and medal labels. |
| Parent monitoring | [`parent-auth.controller.ts`](../src/modules/auth/controllers/parent-auth.controller.ts), [`learning.controller.ts`](../src/modules/learning/learning.controller.ts), and [`parent-performance.controller.ts`](../src/modules/performance/parent-performance.controller.ts) provide selected-child sessions and learning/performance reads. |
| Publisher/referral finance | [`partner-analytics.controller.ts`](../src/modules/partner-analytics/partner-analytics.controller.ts), [`partner-finance.controller.ts`](../src/modules/partner-finance/partner-finance.controller.ts), and [`referral-reporting.controller.ts`](../src/modules/referrals/referral-reporting.controller.ts) provide aggregate partner reporting, allocations, settlements, reconciliation, and referral reporting. |

## Remaining backend feature gaps

### Partial features

| Priority | Gap | Present in code | Missing work |
| --- | --- | --- | --- |
| P1 | Durable parent identity and administration | Parent sessions authenticate with a child National ID and shared parent phone; selected-child learning/performance reads work. | Parent account entity, parent-child relationship and consent model, registration/recovery, history/revocation, parent directory/support view, and admin lifecycle controls. |
| P1 | Parent commerce visibility | Parent session has learning/performance routes. | Selected-child authorized order, payment-status, entitlement, and receipt read APIs. |
| P1 | Top-five leaderboard rewards | Weekly board, top-five honor board, and top-three medal labels work. | AI-credit account, immutable idempotent credit ledger, charging/reservation model, and top-five reward grants. |
| P2 | Subject-level product | Course/chapter targets are implemented end-to-end. | A product decision, then `SUBJECT` pricing/cart/order/entitlement/access/promotion coverage if required. |
| P2 | Full per-student partner model | Publisher/referral partners have agreements, allocations, settlements, and privacy-safe aggregate reports. | Any business-approved partner-to-learner relationship/view; current code deliberately avoids exposing learner identities. |

### Not implemented

| Priority | Gap | Evidence |
| --- | --- | --- |
| P1 | Admin parent management | [`schema.prisma`](../prisma/schema.prisma) has `ParentAccessSession`, but no durable `Parent` or parent-child relationship model; no parent admin controller exists. |

## Production-readiness work, not missing backend features

These items cannot be established by repository inspection alone and should not
be counted as unimplemented features:

1. Configure Paymob merchant secrets, integration IDs, callback URLs, and run
   sandbox then live provider acceptance, webhook, retry, and reconciliation
   checks.
2. Configure and supervise Redis/BullMQ workers and external AI/OCR models for
   import and AI-assisted assessment flows.
3. Apply migrations and rollout controls in the target environment, then run
   report-export and finance-reconciliation drills.
4. Establish production monitoring, backup/restore tests, provider incident
   procedures, and load tests for timed assessments and queues.

## Explicit scope decisions

- No per-student AI chat, hint, or on-demand explanation service.
- No subject product/subscription unless the business adopts that commercial
  model.
- No learner identity disclosure in partner dashboards.
- Video outlines are delivery metadata rather than assessment scopes.

## Verification performed on the reviewed revision

- `pnpm exec prisma validate` passed.
- `pnpm build` passed.
- `pnpm exec jest --runInBand` passed: **58 suites, 357 tests**.
