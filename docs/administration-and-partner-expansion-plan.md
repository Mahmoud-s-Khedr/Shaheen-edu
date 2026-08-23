# Administration, reporting, and partner expansion plan

**Status:** Foundation implemented and migrated locally — the assessment
attribution backfill completed with 12 resolvable snapshots and zero unknown
rows. Controlled pilot rollout, live reconciliation data, refunds/reversals,
and broader reporting remain.  
**Date:** 2026-08-23  
**Scope:** Student administration, platform reporting/exports, content-publisher
contracts and analytics, and referral partners.

## Decisions captured in this plan

1. A content-publisher agreement pays either a percentage of the applicable
   sale value or a fixed EGP amount for each applicable purchased content item.
   It never uses both methods in one agreement version.
2. A fixed publisher amount means **per approved order item**. It is not a
   monthly retainer and is not a payment per question answered. Those two
   business models require separate payable/usage-rate models if needed later.
3. One assessment can contain questions from many sources and publishers.
   Attribution is retained per frozen assessment question, then aggregated at
   the assessment, source, publisher, and content levels. This avoids assuming
   that an assessment has one publisher.
4. Referral code attribution and student coupons are independent. A checkout
   can apply one eligible coupon discount and one eligible referral code. A
   referral code does not discount the student unless a future product decision
   explicitly adds a linked benefit.
5. Partner-facing reporting remains aggregate-only: no learner names, contact
   details, national IDs, individual order records, or learner-level activity.

## Current-state corrections and risks

- [x] Publisher agreements now support fixed-per-sale and percentage payout
  data, version metadata, fulfilment-time allocations, and an immutable
  successor replacement workflow.
- [x] New approved orders produce immutable allocations rather than relying on
  mutable agreement resolution. Legacy statements and the existing estimated
  earnings view remain until ledger-backed settlement/reporting replaces them.
- [x] New assessment snapshots retain source/publisher attribution. Historical
  assessment attribution backfill has been applied: 12 resolved, 0 unknown.
- An assessment already supports multiple question sources; the new snapshot
  structure must retain one or more attributions for every frozen question and
  aggregate them for the assessment. The current authored `Question.sourceId`
  is singular, but the snapshot model deliberately leaves room for future
  shared/contributor attribution.
- Lesson-level publisher agreements can be created, but sales analytics only
  resolves course and chapter data. Since only courses and chapters are
  purchasable, lesson coverage should be reported as usage coverage, not as a
  direct sale target unless the commercial model changes.

## Target architecture

```text
Approved payment / fulfilment
  -> immutable publisher sale allocation(s)
  -> immutable referral attribution + commission allocation
  -> entitlement grant + receipt
  -> later refund: compensating reversal allocation(s)

Assessment generation
  -> frozen question-attribution rows (source + publisher snapshots)
  -> assessment attempt / answer activity
  -> aggregate publisher usage reporting
```

All money remains integer EGP minor units. `100 EGP` is `10_000` minor units.

## Implementation status — 2026-08-23

### Completed

Completed in migration `20260823100000_administration_partner_expansion` and
the backend application:

- [x] Additive partner ledger schema: immutable `PartnerAllocation` rows,
  allocation states, idempotency keys, reversal linkage, and settlement
  headers/lines.
- [x] Extend publisher agreements with payout kind, fixed-per-sale amount,
  currency, contract metadata, version, and supersession fields; validate
  percentage versus fixed-per-sale draft data.
- [x] Create publisher allocations at approved-order fulfilment using the
  immutable order-item final price and one allocation per order item.
- [x] Add referral program, code, rule, and provisional order-attribution
  schema; accept and validate optional referral codes in price preview and
  checkout; prevent self-referral; create referral commission allocations only
  at fulfilment.
- [x] Add frozen assessment-question source/publisher attribution at
  assessment generation.
- [x] Add a publisher-scoped ledger-allocation read endpoint and preserve the
  existing partner authorization boundary.
- [x] Add agreement replacement, referral-program/code/rule administration,
  usage-limit enforcement, and referral-partner ledger access.
- [x] Add admin allocation filters, immutable settlement selection/payment
  controls, ledger dashboard totals, and aggregate-only usage endpoints.
- [x] Add audited Student 360 composition/subresources, a dry-run/apply
  historical attribution backfill script, aggregate platform reports, and a
  queued private CSV export worker with expiry/cancellation/audit behavior.
- [x] Recheck referral-code usage limits at fulfilment under transaction-scoped
  advisory locks, preventing concurrent approvals from exceeding a limit.
- [x] Make export cancellation and completion state-conditional; cancelled
  jobs cannot become completed, and the worker deletes expired files and marks
  their jobs `EXPIRED`.
- [x] Add database checks for agreement/rule/allocation economics and origin
  consistency; allocation economics and commission-rule terms have database
  immutability triggers.
- [x] Add default-off referral, partner-ledger, and report-export rollout
  controls, including partner/student allow-lists where needed.
- [x] Add a read-only allocation reconciliation command and a staging runbook.
- [x] Apply the migration locally, validate it on disposable PostgreSQL, and
  apply the assessment-attribution backfill (12 rows resolved, 0 unknown).
- [x] Add focused unit coverage for referral limits/allocation idempotency,
  export lifecycle, settlements, agreement replacement, Student 360, and
  attribution backfill. The current suite has 50 suites / 323 tests.

### Still missing / next work

- [ ] Run a controlled pilot with an approved purchase, then reconcile actual
  publisher/referral allocations and compare them with legacy earnings
  statements before widening allow-lists.
- [ ] Add dual-calculation comparison and durable discrepancy-investigation
  tooling; the current reconciliation script checks allocation integrity but
  cannot compare legacy statements until pilot data exists.
- [ ] Implement refunds, partial-refund policy, payment-provider integration,
  and linked publisher/referral reversal allocations, including settlement
  behavior for already-paid allocations.
- [ ] Expand partner administration with detailed partner history, agreement /
  program history, allocation totals, and audit summaries.
- [ ] Finish ledger-backed publisher reporting: agreement/target breakdowns,
  statement retirement/reconciliation, and finance-specific allocation /
  settlement exports.
- [ ] Add publisher usage daily/monthly trends, hierarchy filters, zero-solved
  earnings indicators, and rollups for ranges beyond 93 days.
- [ ] Add referral conversion/product reporting, privacy bucketing, fraud
  review flags/rules, and referral-specific settlement/reporting views.
- [ ] Harden Student 360 policy with configurable required reasons and
  field/section-level PII enforcement tests.
- [ ] Expand platform report families and filters (refunds, payments,
  registrations, hierarchy, geography, promotions, coupons, referrals), plus
  PII export retention/watermark controls.
- [ ] Add e2e coverage for the new referral, allocation, settlement, export,
  backfill, and rollout paths; only the health e2e smoke test has exercised
  the migrated application so far.

## Workstream A — Partner-domain foundation

### A1. Keep a common partner account and add partner-specific entities

Retain `PartnerProfile` as the common partner identity. Keep its current
content-publisher and referral-partner capabilities separate in their related
models rather than putting accounting fields directly on the profile.

Add a capability/eligibility validation layer so that:

- publisher agreements and question-source ownership require a content
  publisher;
- referral programs/codes require a referral partner;
- a future decision to allow one legal partner to perform both roles can add
  a join table without rewriting financial history.

Add to the partner admin detail endpoint/list filters:

- partner type/capability, account status, legal/display data;
- current and historical agreements or referral programs;
- aggregate payable, paid, and reversed amounts;
- audit event summaries.

All admin mutations and privileged reads must write audit events.

### A2. Payout terminology and ledgers

Use allocation/ledger records as the financial source of truth. Do not use a
mutable dashboard query or manually typed aggregate statement as the source
of truth.

Every allocation carries:

- partner and source agreement/program IDs;
- immutable partner, contract/rule, currency, and target snapshots;
- calculation base and formula inputs;
- earned/commission amount;
- state (`PENDING`, `PAYABLE`, `PAID`, `REVERSED`), timestamps, and reversal
  linkage;
- original order item and a unique idempotency key.

Existing `PublisherEarningsStatement` becomes an imported/legacy settlement
record or is replaced by a statement generated from ledger lines. It must not
remain a second, competing earnings calculation.

## Workstream B — Content-publisher contracts and sales earnings

### B1. Versioned publisher agreements

Extend `PublisherAgreement` (or introduce a versioned `PublisherContract` and
`PublisherAgreementVersion`) with:

- `payoutKind`: `PERCENTAGE` or `FIXED_PER_SALE`;
- `revenueShareBps` required only for `PERCENTAGE`;
- `fixedPayoutMinor` and `currency` required only for `FIXED_PER_SALE`;
- effective window, draft/active/ended lifecycle, primary coverage flag;
- contract reference, optional signed-document asset, internal note, and
  immutable version number;
- target coverage: course, chapter, or lesson; exactly one target per
  agreement version.

Validation rules:

- percentage is `0..10,000` BPS; fixed payout is positive EGP minor units;
- active primary agreements cannot overlap for the same exact coverage target;
- resolving coverage follows lesson -> chapter -> course;
- only approved purchasable order items can create sale allocations;
- a fixed payout cannot exceed the sale basis unless finance explicitly
  permits loss-making allocations;
- activating, ending, or replacing a contract never modifies prior allocation
  rows.

### B2. Immutable publisher sale allocations

At the same transactional boundary that fulfils an approved order:

1. Resolve the effective publisher agreement for each order item.
2. Snapshot the matched agreement/version and exact revenue basis.
3. Calculate one allocation:
   - percentage: `floor(basisMinor * revenueShareBps / 10,000)`;
   - fixed: `fixedPayoutMinor` per applicable order item.
4. Insert it idempotently with the order item as the natural uniqueness key.

The recommended publisher basis is the order item’s final price after the
student coupon/campaign discount and before payment-provider fees. This makes
publisher cost proportional to money collected for the item and is auditable
from the immutable order snapshot.

When refunds arrive in the later refund workstream, create a linked,
proportional negative/reversal allocation. Do not update the original row.

### B3. Publisher sales and settlement APIs

Admin APIs:

- create, version, activate, end, and retrieve agreements;
- list allocations with agreement, date, target, and state filters;
- mark a selected, immutable set of `PAYABLE` allocations paid; generate a
  payout statement and payment reference;
- export allocations/settlements with privileged audit logging.

Publisher APIs (authenticated publisher, own data only):

- earnings dashboard: pending, payable, paid, reversed, and net totals;
- daily/monthly sales and earnings trend;
- agreement/target breakdown and payout statement list;
- no learner identifiers or raw order records.

## Workstream C — Publisher question attribution and usage analytics

### C1. Freeze attribution at assessment generation

Add `AssessmentQuestionAttribution` rows when each assessment question is
created. Each row snapshots:

- assessment-question ID;
- source ID and source title/type at generation time;
- publisher user ID and display name at generation time, nullable for
  non-publisher sources;
- attribution role/weight (initially `PRIMARY`, weight `10,000`).

This supports an assessment made from many sources: each frozen question has
its source/publisher rows, and an assessment’s publisher set is simply the
union of its question attributions. It also supports future co-authored
questions without reworking historical data.

Existing historical assessment questions are backfilled from their still-live
`sourceQuestionId` -> `Question` -> `QuestionSource` relationship. Mark rows
whose source can no longer be resolved as `UNKNOWN_LEGACY`; do not invent an
owner.

### C2. Metric definitions

Partner-facing reports must label these clearly:

| Metric | Definition |
| --- | --- |
| Available questions | Published, attributed questions eligible in the selected scope at report time. |
| Presented questions | Frozen publisher-attributed questions in an assessment attempt that a learner started. |
| Solved questions | Presented questions with a submitted answer. |
| Unique solvers | Distinct students with at least one submitted answer to an attributed question. |
| Correct rate | Correct final answers / graded solved questions; pending/ungraded answers excluded. |
| Reattempts | Answer attempts after the learner’s first solved occurrence of that frozen/source question. |
| Usage rate | Solved questions / presented questions, always shown with numerator and denominator. |

The report must distinguish questions that generated earnings from questions
that were used. Publisher payment stays contract/sale based unless a future
contract expressly introduces usage-based compensation.

### C3. Publisher analytics APIs

Add aggregate-only endpoints, all restricted to the authenticated content
publisher’s attributed sources:

- `GET /v1/partners/analytics/question-usage` — summary and daily/monthly
  trend, filterable by date, source, and content hierarchy;
- `GET /v1/partners/analytics/question-usage/sources` — paginated source
  breakdown;
- `GET /v1/partners/analytics/question-usage/questions` — paginated question
  breakdown, including use/correctness counts but no learner identity;
- dashboard extension combining earnings and usage, with an explicit
  “earnings despite zero solved questions” indicator.

Use database aggregation or a scheduled rollup table for large periods;
retain raw attempt data as the audit source. Enforce date-range limits for
on-demand aggregation and use cursor/page pagination for breakdowns.

## Workstream D — Referral partners

### D1. Referral program and code model

Add:

- `ReferralProgram` — partner, active date range, status, attribution policy,
  eligibility targets, and fraud/usage limits;
- `ReferralCode` — globally unique normalized code, program, status, optional
  code-specific date/usage limits;
- `ReferralCommissionRule` — immutable versioned rule with one of:
  `PERCENTAGE`, `FIXED_PER_SALE`, or `PERCENTAGE_CAPPED`;
- `OrderReferralAttribution` — the code/program snapshot selected at checkout;
- `ReferralCommissionAllocation` — ledger line created only at fulfilment.

For `PERCENTAGE_CAPPED`, calculate:

`min(floor(commissionBaseMinor * percentageBps / 10,000), maximumCommissionMinor)`.

Thus 10% capped at EGP 100 is `percentageBps=1,000` and
`maximumCommissionMinor=10,000`.

### D2. Checkout and attribution rules

Add an optional `referralCode` to price preview and checkout.

- A valid referral code may be recorded even if it does not alter pricing.
- Coupon and referral-code namespaces are separate; the frontend may show two
  inputs or one clearly labelled flow that resolves both independently.
- Validate the code, active rule, scope, dates, usage limits, and target
  eligibility during checkout.
- Create a provisional order attribution in the checkout transaction.
- Create commission allocation only when the order is approved/fulfilled.
- Failed, expired, cancelled, or rejected orders earn no commission.
- A later refund creates a linked reversal allocation.
- Prevent self-referral, duplicate commissions, and repeated checkout retries
  with unique keys and configurable fraud checks.

Default attribution policy: the explicitly supplied valid code applies to each
eligible approved order. If the business instead wants first-purchase-only,
first-touch registration attribution, or lifetime assignment, add that as a
separate policy before implementation; it changes the data and privacy model.

### D3. Referral reporting and privacy

Referral partners receive aggregated conversions, approved sales, commission
pending/payable/paid/reversed totals, trends, and product/category breakdowns.
They never receive student or order-level PII. Suppress or bucket very small
breakdowns where necessary to reduce learner re-identification risk.

Admins receive operational views, code/program management, fraud flags,
commission ledger/settlement controls, and full audit trails.

## Workstream E — Student 360 view

Create an admin-only composition API rather than exposing a large unbounded
join:

- `GET /v1/admin/students/:id/360` returns profile summary, account status,
  academic/geographic metadata, current access summary, commerce summary, and
  performance summary;
- subresources use independent pagination/cursors:
  `/orders`, `/entitlements`, `/assessments`, `/audit-events`;
- response fields have an explicit PII policy: administrators can view contact
  data necessary for support, but national ID is masked to last four digits;
  encrypted/raw national ID is never returned;
- every 360 view and export request writes an audit event containing actor,
  target, fields/section requested, and reason where configured.

Do not make partner reports depend on this endpoint or expose it to partners.

## Workstream F — Platform reporting and secure exports

### F1. Platform reports

Add admin-only, filtered aggregate reports for:

- revenue, discounts, approved sales, payment-channel status, and refunds;
- entitlement grants, revocations, expiry/access counts;
- student registrations and active purchasers;
- publisher/referral obligations, paid amounts, and reversals;
- filters: Cairo date range, product hierarchy, grade, governorate/center,
  payment channel/status, promotion/coupon/referral code, and partner.

Specify a reporting retention policy before launch. Recommended defaults:
financial allocations/receipts and audit events for seven years; raw learner
attempt data under the product privacy policy; derived rollups retained for as
long as the corresponding raw or financial record is retained.

### F2. Export pipeline

Use asynchronous `ReportExportJob` records rather than synchronous downloads:

- requesting admin, report type, normalized filters, selected columns,
  format (`CSV` initially; XLSX only when a required formatting use case is
  confirmed), state, row count, expiry, and failure metadata;
- worker/queue writes a private object-store file;
- authorized requester receives a short-lived signed download URL;
- download, expiry, cancellation, and failed generation are audited;
- exports containing PII use tighter expiry, visible watermark/metadata, and
  column allowlists.

Never place report data in a public URL or application logs.

## Delivery sequence

1. **Foundation and migration:** **partially complete** — partner ledger
   schema, contract payout kinds, validation, referral schema, and frozen
   assessment attribution are delivered; audit expansion and feature flags are pending.
2. **Publisher finance:** **partially complete** — fulfilment-time allocation
   creation is delivered; historical backfill/reconciliation and settlement
   administration remain pending.
3. **Publisher usage:** **partially complete** — new assessment-attribution
   snapshots are delivered; backfill and
   usage aggregations, partner dashboards and pagination.
4. **Referral model:** referral programs/codes/rules, checkout attribution,
   fulfilment commission allocations, aggregate referral reports.
5. **Administration:** student 360 composition/subresources and audit policy.
6. **Platform reporting:** report aggregates, export-job worker, signed
   delivery, retention and operational runbook.
7. **Refund integration:** add compensating publisher/referral reversals when
   the refund lifecycle is implemented.

## Migration and rollout safeguards

- Deploy additive schema first; do not alter existing statement history in
  place.
- Backfill publisher allocation rows only after producing a discrepancy report
  against existing approved orders/statements; preserve a source marker on
  imported rows.
- Keep legacy earnings screens read-only during reconciliation, then switch
  dashboards to ledger-backed data behind a feature flag.
- Backfill assessment attribution only where a live source can be resolved;
  preserve unknown legacy attribution explicitly.
- Run dual calculations for publisher estimates during a bounded verification
  window and investigate every variance before enabling payout operations.
- Enable referral programs only after the checkout idempotency and code
  collision tests pass.

## Required verification

- Contract activation, overlap, versioning, fixed/percentage calculation, and
  no-retroactive-change unit/e2e tests.
- Fulfilment idempotency tests proving one allocation per order item despite
  webhook/manual-approval retries.
- Refund/reversal tests once refunds exist, including partial refunds.
- Assessment tests with questions from multiple sources/publishers, historical
  source changes, deleted sources, pending grading, and no-attempt cases.
- Authorization tests proving publishers/referral partners cannot access each
  other’s data or any learner identity.
- Export authorization, expiring URL, audit, filter/column allowlist, and
  large-data pagination/worker tests.
- Reconciliation fixture comparing approved sales, allocations, payout
  statements, receipts, and platform totals.

## Acceptance criteria

- Changing or ending a publisher/referral rule never changes a historical
  allocation.
- Every approved eligible order item produces at most one publisher and one
  referral allocation for the selected rules.
- A publisher can see contract terms, earned/payout state, sales aggregates,
  and question use/correctness data without learner PII.
- A multi-source assessment attributes each frozen question independently and
  aggregates accurately across all sources.
- Referral commission calculation exactly supports percentage, fixed, and
  capped-percentage rules, including a 10%-up-to-EGP-100 example.
- Admins can retrieve a properly audited Student 360 view and request secure,
  expiring platform exports.
