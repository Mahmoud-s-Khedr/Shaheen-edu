# Backend Feature Gap Analysis

**Review date:** 2026-08-23

**Reviewed revision:** `ce1b3723`, plus the uncommitted leaderboard formula
correction described below.

**Scope:** Backend implementation only. UI composition, player rendering, client
navigation, and operational deployment configuration are excluded unless they
prevent a backend flow from operating.

## Executive summary

The previous report was materially stale. It correctly described the older
manual-payment implementation, but the current codebase now also contains
Paymob checkout attempts and signed webhooks, promotions and coupons, unpaid
order expiry, immutable receipts, AI-prompt quizzes, ranked community
incorrect-question discovery, question reporting, and parent performance
analytics.

Consequently, **do not plan Paymob, coupons, timed discounts, payment expiry,
AI-prompt quizzes, community-most-incorrect, or parent assessment/performance
monitoring as new backend features**. They are implemented in code. Paymob
still needs production credentials, URLs, and a provider acceptance test before
launch.

The material remaining work is concentrated in these areas:

1. AI-credit infrastructure before leaderboard credit rewards.
2. Refunds and the remaining post-payment commercial lifecycle.
3. Durable parent accounts/relationships, parent commerce views, and parent
   administration.
4. Consolidated admin reporting/exports, Student 360, and the remaining
   referral-partner administration/reporting work. The financial/referral
   attribution foundation is now implemented.
5. A business decision on subject-level products; the current commercial model
   deliberately sells courses and chapters only.

No replacement percentage is stated here. The former `49 capability areas`
denominator combines overlapping PDF statements with deliberate product-scope
choices, so a percentage would obscure the actionable backlog below.

## Verified delivered since the previous report

| Capability                             | Evidence in the current backend                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosted online payment                  | Student checkout accepts `PAYMOB`, creates retryable payment attempts, and `POST /payments/paymob/webhook` verifies the provider HMAC, records an idempotent webhook event, fulfils the order, and grants entitlements. See [`commerce.controller.ts`](../src/modules/commerce/commerce.controller.ts), [`commerce.service.ts`](../src/modules/commerce/commerce.service.ts), and [`paymob.service.ts`](../src/modules/commerce/paymob.service.ts).                                                                |
| Discounts and coupons                  | Admin CRUD/activation routes, date windows, priorities, product targeting, usage/per-student limits, server-side previews, reservation/release/redeem handling, and immutable order-item promotion snapshots are implemented. See [`pricing.service.ts`](../src/modules/commerce/pricing.service.ts).                                                                                                                                                                                                              |
| Payment expiry and receipts            | A five-minute scheduled job expires unpaid/rejected orders and pending attempts, releases coupon reservations, and order fulfilment creates one immutable receipt snapshot/reference. See [`commerce-expiry.service.ts`](../src/modules/commerce/commerce-expiry.service.ts) and [`fulfilment.service.ts`](../src/modules/commerce/fulfilment.service.ts).                                                                                                                                                         |
| AI quiz and question intelligence      | Student AI-prompt assessment generation, constrained to permitted questions; a ranked, entitlement-safe community-incorrect feed; tutor assessment creation; and student question reporting/admin moderation are implemented. See [`assessments.controller.ts`](../src/modules/assessments/assessments.controller.ts), [`question-intelligence.controller.ts`](../src/modules/assessments/question-intelligence.controller.ts), and [`assessments.service.ts`](../src/modules/assessments/assessments.service.ts). |
| AI explanation and review support      | Admin-generated/reviewed question explanations, AI re-answer review, long-answer transcription/grading, and video-timestamp snapshots are implemented. This is not a per-student AI chat/hint service. See [`ai-question-explanations`](../src/modules/ai-question-explanations) and [`assessments.service.ts`](../src/modules/assessments/assessments.service.ts).                                                                                                                                                |
| Parent learning/performance monitoring | A selected-child parent session can retrieve progress, assessment/practice analytics, unified performance overview, analysis, trends, and insights. See [`learning.controller.ts`](../src/modules/learning/learning.controller.ts) and [`parent-performance.controller.ts`](../src/modules/performance/parent-performance.controller.ts).                                                                                                                                                                          |
| Partner finance and referral foundation | Additive schema/migration now provides partner allocations/settlements, fixed or percentage publisher payout data, referral programs/codes/rules, provisional order referral attribution, and frozen assessment source/publisher attribution. Fulfilment creates idempotent publisher/referral allocations from approved order items. See [`fulfilment.service.ts`](../src/modules/commerce/fulfilment.service.ts), [`commerce.service.ts`](../src/modules/commerce/commerce.service.ts), and [`schema.prisma`](../prisma/schema.prisma). |

## Remaining feature gaps

### 1. Leaderboard parity

| Priority | Gap                        | Current state                                                                                                                                                                                   | Required backend work                                                                                                                                                                   |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Smart Score formula parity | Implemented as `accuracyPercent * 0.6 + totalQuestions * 0.4`, matching the PDF's percentage-based accuracy component. Rankings are platform-wide, rather than grade-scoped.                    | Release after migration and verification.                                                                                                                                               |
| P2       | Top-five AI-credit rewards | Friday/Cairo weekly windows, persisted history, honor board, and gold/silver/bronze labels for the top three exist. AI credits, their ledger, and student AI-service charging do not yet exist. | Defer credit awards until the AI-credit system is available. Then grant the top five through its immutable, idempotent ledger rather than creating a separate reward-fulfilment system. |

Evidence: [`leaderboard.service.ts`](../src/modules/leaderboard/leaderboard.service.ts).

#### Smart Score implementation decisions

The source PDF defines Smart Score as `(Accuracy × 60%) + (Total Questions
Solved × 40%)`, and defines Accuracy as `(Correct Answers / Answered
Questions) × 100`. The implementation adopts the following unambiguous backend
contract:

- The `totalQuestions` snapshot from completed assessments is the existing
  representation of the PDF's "Total Questions Solved" term. It remains an
  uncapped raw-volume component, as specified by the formula.
- Accuracy is calculated at full precision for ranking; `accuracyPercent` is
  rounded to one decimal place only for the API response and stored snapshot.
  A student with no answered questions has zero accuracy.
- The ranking is platform-wide, as required by the PDF. Ties are ordered by
  Smart Score, full-precision accuracy, correct-answer count, total-question
  count, then stable student ID.
- Completed attempts containing answers pending human or AI grading are not
  eligible until every answer has a final outcome. This avoids freezing a
  weekly result using an ungraded answer as incorrect.
- There is no historical leaderboard data to preserve. The corrected,
  platform-wide calculation applies to current and historical views after this
  deployment; no formula versioning or backfill is required.

Medals remain recognition only. The live board derives gold, silver, and bronze
labels from ranks one through three, while finalized history retains its
persisted labels.

#### Deferred AI-credit reward design

Do not create credit awards until students have a usable credit balance. The
future credit system must provide a per-student account, immutable and
idempotent grant/consumption/reversal entries, atomic reservation or debit
around AI-service calls, service pricing, and admin audit/support visibility.
Once it exists, a rank-one-through-five rule can create a ledger grant keyed by
week, rank, and student; retries must never double-credit a winner.

### 2. Parent identity and administration

| Priority | Gap                                       | Current state                                                                                                                                                                             | Required backend work                                                                                                                                                      |
| -------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Durable parent accounts and relationships | Parent access is a short-lived session authenticated with a child National ID plus parent phone. The child record stores the shared parent phone; there is no parent user/account entity. | Model parent accounts, registration/login/recovery, durable parent-child links, relationship type, consent/verification state, and relationship change/revocation history. |
| P1       | Parent payments, orders, and entitlements | Parent monitoring now covers learning and performance, but parents cannot view an authorized child's orders, active access, payment state, or receipt details.                            | Add selected-child, authorization-checked commerce read routes and define which financial information is visible to each parent relationship.                              |
| P2       | Parent administration                     | No parent directory, support detail view, link management, or account/session revocation workflow exists for admins.                                                                      | Add an admin parent directory/detail, linked-child management, suspension/revocation, support actions, and audit records.                                                  |

Evidence: [`parent-auth.controller.ts`](../src/modules/auth/controllers/parent-auth.controller.ts), [`parent-session.service.ts`](../src/modules/auth/services/parent-session.service.ts), and the parent controllers listed above.

### 3. Administration, exports, and partner model

| Priority | Gap                                       | Current state                                                                                                                                                           | Required backend work                                                                                                                                                                          |
| -------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Consolidated student 360 view             | Student administration, orders, entitlements, audit records, and performance are separate APIs.                                                                         | Add an authorized student-detail composition endpoint with explicit PII rules, summary/performance/access/orders data, pagination for large collections, and audit logging.                    |
| P1       | Subscriber export and platform reporting  | There is no CSV/XLSX export or platform-wide revenue/payment/refund/sales/entitlement report. Publisher reporting is separate and partner-scoped.                       | Specify report dimensions and retention; add filtered export jobs, secure expiring download delivery, authorization/audit logs, and platform financial aggregates.                             |
| P1       | Referral-partner administration/reporting | Referral program/code/rule administration, usage limits, checkout attribution, immutable commissions/reversals, referral-only ledger/settlement filters and exports, aggregate reporting, cohort suppression, and audited fraud review are implemented. | Deploy the Phase 3 migration, retain the operational runbook, and validate reconciliation on the controlled pilot before broad enablement. |

Evidence: [`students.controller.ts`](../src/modules/students/students.controller.ts), [`partner-analytics.controller.ts`](../src/modules/partner-analytics/partner-analytics.controller.ts), and [`publisher-agreements.controller.ts`](../src/modules/publisher-agreements/publisher-agreements.controller.ts).

### 4. Commerce gaps

| Priority | Gap                                 | Current state                                                                                                                                                                                                                          | Required backend work                                                                                                                                                                                  |
| -------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Manual refunds and reversals        | Students can request refunds for complete approved order items. Configurable time and content-completion thresholds automatically reject ineligible requests; an admin records an off-platform reimbursement reference when approving. Approval revokes the purchased entitlement and appends idempotent negative publisher/referral allocations. | Configure the production thresholds and operating procedure. Provider refund/void integration is intentionally out of scope because reimbursement is manual. |
| P2       | Subject-level subscription/product  | Courses and chapters are intentionally the only purchasable target types. A `Subject` is not priced, cartable, or grantable.                                                                                                           | Make a product decision. If subjects must be sold, extend pricing, cart/order item, promotion target, entitlement, coverage/access policy, and overlap rules to `SUBJECT`.                             |
| P2       | Entitlement-expiry lifecycle        | Access is already denied automatically when `expiresAt` has passed, and new fulfilment replaces expired matching access. There is no scheduled state transition, renewal/reactivation workflow, reporting event, or notification hook. | Add these only for time-limited subscriptions: expiry job/state policy, renewal/reactivation rules, reporting/audit events, and notifications. Do not duplicate the existing access-time expiry check. |
| P2       | Reconciliation and receipt delivery | Payment attempts, signed webhook events, order snapshots, immutable receipt references/snapshots, and a persistent admin reconciliation run exist. The run checks lifecycle, allocation, settlement, refund-reversal, manual-payment, and Paymob callback evidence; it does not replace finance's provider-settlement/deposit comparison or provide receipt-document download. | Run the controlled pilot, retain the provider settlement comparison in the signed record, and add receipt rendering/download only if operations requires it. |
| Launch   | Paymob production validation        | The integration is implemented, but correctness against a live merchant configuration is not established by the repository's unit suite.                                                                                               | Configure secrets/integration IDs/callback URLs, run sandbox then live acceptance tests, verify webhook reachability/HMAC fields, retry/timeout paths, and reconciliation.                             |

### 5. Explicit product-scope decisions, not defects

These features are absent by design today. Keep them out of sprint work unless
the business confirms that they are required:

| Item                                                  | Current decision                                                                                |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Per-student AI chat, hints, or explanation generation | AI explanations are generated and reviewed by admins, then reused through normal answer reveal. |
| Subject products                                      | The commercial model sells courses/chapters rather than a subject subscription.                 |
| Referral network                                      | The attribution and commission foundation exists; administration, reporting, and operational controls remain pending. |
| Video-outline topics as assessment scopes             | Curriculum sections are the supported topic scope; video outlines are delivery metadata.        |

## Recommended implementation order

1. Specify and implement refunds/reversals, then perform Paymob sandbox/live
   acceptance and reconciliation work.
2. Build parent accounts/relationships and parent commerce views, followed by
   admin parent management.
3. Add the student 360 view and platform reporting/export pipeline.
4. Make a product decision on subject subscriptions and referral partners before
   designing their data models.
5. Build the AI-credit ledger and student AI-service charging path. Only then
   enable top-five leaderboard credit awards.

## Verification performed

- `pnpm build` passed on the reviewed revision.
- `pnpm exec jest --runInBand` passed: **45 suites, 308 tests**.
- After the leaderboard formula correction: local `prisma migrate deploy`,
  `pnpm exec prisma validate`, the full unit suite (**45 suites, 312 tests**),
  `pnpm build`, and the local `CONTENT-017` leaderboard/performance journey
  passed. The journey verifies the exact PDF Smart Score arithmetic returned by
  the live API.

## Operational backlog (outside the PDF feature checklist)

- Notification preferences/delivery records and production alerts for errors,
  latency, queue workers, and media/payment providers.
- Backup/restore verification, scheduled-report runbooks, and payment/media
  incident procedures.
- Load testing for concurrent timed assessments and full provider/media
  acceptance journeys.
- Curriculum versioning and learning-objective mapping if annual curriculum
  changes or adaptive learning enter scope.
