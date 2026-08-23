# Administration, reporting, and partner expansion plan

**Status:** The financial/referral foundation, manual refund lifecycle,
reconciliation tooling, Student 360 baseline, and private CSV-export baseline
are implemented and migrated locally. The assessment-attribution backfill
completed with 12 resolvable snapshots and zero unknown rows. The phased plan
below takes the implementation from this foundation to operational completion.
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
      mutable agreement resolution. Ledger allocations are now the reporting
      source of record; legacy statements and estimate calculations have been
      retired.
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
      controls, including partner/student allow-lists where needed. Partner-ledger
      controls gate partner-facing publisher and referral ledger/reporting reads;
      immutable allocation creation remains enabled so financial history is never
      made conditional on a reporting rollout.
- [x] Add a read-only allocation reconciliation command and a staging runbook.
- [x] Add a manual refund-request lifecycle: configurable time and consumption
      eligibility checks, automatic rejection of ineligible requests, admin
      approval/rejection, manual reimbursement references, entitlement revocation,
      and immutable publisher/referral compensating allocations. Refunds are
      intentionally not sent through Paymob.
- [x] Apply the migration locally, validate it on disposable PostgreSQL, and
      apply the assessment-attribution backfill (12 rows resolved, 0 unknown).
- [x] Add focused unit coverage for referral limits/allocation idempotency,
      export lifecycle, settlements, agreement replacement, Student 360, and
      attribution backfill. The current suite has 52 suites / 330 tests.

### Phased completion plan

The phases below are ordered by dependency and risk. A phase is not complete
when its code merges; it is complete only when its exit criteria have been
met in the intended environment. End-to-end coverage is added with each phase,
then exercised together in Phase 5.

#### Phase 0 — Operational baseline and controlled pilot

**Goal:** Prove that the already-implemented financial lifecycle is safe with
realistic data before expanding feature allow-lists or exposing finance
operations broadly.

- [ ] Set and review the active production refund policy. Train administrators
      to record the off-platform reimbursement reference and document that a
      request can refund whole order items only; fractional item refunds are out
      of scope.
- [ ] Run a controlled approved-purchase pilot using the intended payment
      channel(s). Reconcile publisher and referral allocations, entitlement,
      receipt, settlement state, and any refund reversal using the persistent
      reconciliation run.
- [ ] Record finance and engineering sign-off for the pilot, resolve every
      discrepancy, and define the rollback/incident owner before widening the
      referral and partner-ledger allow-lists.
- [ ] Complete Paymob sandbox and live acceptance: callback reachability,
      HMAC validation, retry/timeout behaviour, expiry, and a provider-settlement
      comparison. Provider refunds remain out of scope because reimbursement is
      manual.

**Exit criteria:** An approved purchase and a refund reversal have been
reconciled end-to-end; no unexplained allocation or entitlement discrepancy
remains; the active refund policy, runbook, owners, and signed pilot record
are available to operations.

#### Phase 1 — Privacy-safe administration and export controls

**Goal:** Establish the access and PII controls that later reporting and
support features rely on.

- [x] Make support reasons configurable and mandatory for sensitive Student
      360 views and privileged exports where policy requires them.
- [x] Define and enforce a field- and section-level Student 360 PII policy;
      retain masked national ID behaviour and prohibit raw/encrypted national-ID
      disclosure. Audit the actor, target, sections, and reason.
- [x] Add policy tests for role, section, field, reason, and audit behaviour.
- [x] Add PII export classifications, report-specific column allowlists,
      shorter retention/URL expiry, watermark/metadata, and audited download and
      expiry behaviour. Do not add learner/contact-data exports until these
      controls exist.

**Implementation status (2026-08-23):** Code and unit coverage are complete;
deploy the additive `20260823110000_privacy_safe_administration_exports`
migration before enabling report exports in an environment.

The current enforced policy is:

- `PROFILE`, `CONTACT`, `ACCESS`, `COMMERCE`, `PERFORMANCE`, and
  `AUDIT_EVENTS` are explicit Student 360 sections. `ADMIN` can request every
  section except `AUDIT_EVENTS`; `SUPER_ADMIN` can request all sections, with
  audit events exposed through the paginated audit-events subresource.
- `CONTACT`, `COMMERCE`, and `AUDIT_EVENTS` require a support reason by
  default. `PRIVACY_REQUIRE_SENSITIVE_360_REASON`,
  `PRIVACY_REQUIRE_PRIVILEGED_EXPORT_REASON`, and the optional comma-separated
  `PRIVACY_SUPPORT_REASON_ALLOWLIST` make the requirement and approved reason
  values operationally configurable.
- Contact fields are returned only in the `CONTACT` section. The response can
  contain `nationalIdLast4`, but the raw and encrypted national-ID fields are
  not selected or represented by the policy for any role.
- Every Student 360 read records the actor, student target, requested sections,
  and supplied reason. The paginated commerce, access, performance, and audit
  subresources apply the same section policy.
- Current export types are explicitly `NON_PII`; there is no learner or contact
  export. Each type has a fixed column allowlist and role policy. Commerce and
  partner-obligation exports are privileged and require a reason by default.
  A `PII_RESTRICTED` classification is persisted for any future PII report,
  which must first receive an explicit policy entry.
- Private export artifacts expire after 24 hours and signed download URLs after
  15 minutes. CSVs and object metadata carry a requester/job/classification
  watermark; request, download, cancellation, and expiry are audited.

Verification completed in the repository: Student 360 role/section/field/reason
and audit tests, export allowlist/classification/watermark/download-expiry and
cancellation-race tests, the full 336-test unit suite, and a production build.

**Exit criteria:** Sensitive views and PII exports are denied without the
required policy context; tests prove that no prohibited field reaches an
unauthorized role or export; operations can audit every privileged access.

#### Phase 2 — Publisher finance operations and usage analytics

**Goal:** Make the ledger useful for finance and publishers without creating a
second mutable earnings source of truth.

- [x] Add an admin partner detail/history view: capability and account state,
      current and historical agreements/programs, allocation totals by state, and
      audit summary. Keep raw learner/order data out of partner-facing responses.
- [x] Add finance-specific allocation and settlement exports, using the Phase
      1 export controls and immutable allocation/settlement rows as the source of
      truth.
- [x] Extend publisher **usage** analytics with daily/monthly trends,
      hierarchy filters, zero-usage/zero-solved earnings indicators, and range
      rollups beyond the current 93-day on-demand limit.
- [x] Define rollup freshness, correction/rebuild, retention, and drill-down
      rules. Earnings trends and agreement/target ledger breakdowns already exist;
      this phase extends usage reporting rather than duplicating them.

**Exit criteria:** Finance can export and reconcile a settlement from ledger
rows; a publisher can view aggregate usage and earnings across supported date
ranges and hierarchy scopes without learner PII; rollup totals agree with raw
attribution data for representative fixtures.

**Implementation status (2026-08-23):** The code, schema migration, focused
fixtures, full unit suite (56 suites / 347 tests), and production build are
complete. `GET /admin/partners/:id/detail` is an audited administrative
history view with partner capability/account state, agreement/program history,
allocation-state totals, and recent audit summary. The private export worker
now supports `PUBLISHER_ALLOCATIONS` and `PUBLISHER_SETTLEMENTS`; both are
non-PII, reason-gated privileged exports with fixed columns, watermarking,
short-lived artifacts/URLs, cancellation, expiry, and audit behaviour. Their
rows come only from immutable allocation, settlement, and settlement-line
records, never orders or learner data.

Publisher question usage now returns aggregate daily/monthly trends and
supports source plus frozen subject/course/chapter/lesson/section filters.
Short question-level drill-down remains deliberately capped at 93 days;
long-range summaries and source breakdowns use rebuildable Cairo-day rollups.
The response marks `zeroUsage`, `zeroSolved`, and publisher-wide ledger
`earningsDespiteZeroSolved` explicitly, so usage is never mistaken for a
usage-based payout. `PublisherUsageDailyRollup` is derived from frozen
attribution/attempt/answer rows, while an internal HMAC-fingerprint presence
index preserves exact distinct-solver counts across periods without exposing
learner identity. The hourly refresh includes the current and prior two Cairo
days for late-grading correction; privileged range rebuilds are audited and
bounded to 367 days. The full operational policy is in
[`publisher-usage-rollups.md`](publisher-usage-rollups.md).

Compose migration output currently reports all 62 migrations and no pending
migrations. Phase exit is still operationally pending until finance records a
representative settlement-export reconciliation and the staging run records
raw-attribution versus rollup totals for the representative fixtures.

#### Phase 3 — Referral operations and reporting

**Goal:** Turn the existing referral attribution and commission foundation
into a supportable partner program.

- [x] Add referral conversion, approved-sales, commission-state, trend, and
      product/category reporting for partners and administrators.
- [x] Add referral-specific allocation/settlement views and exports, reusing
      the same immutable ledger and export controls as Phase 2.
- [x] Apply small-cohort suppression or bucketing to partner-facing breakdowns
      and test that learner or order-level data cannot be inferred.
- [x] Add fraud flags, configurable review rules, code/program suspension,
      assignee, disposition, notes, and audited operator workflow. Define which
      checks block checkout versus merely queue review.

**Exit criteria:** Referral partners receive privacy-safe aggregate reporting;
administrators can investigate and resolve a flagged referral without editing
historical allocations; settlement and reporting totals reconcile to approved
orders and reversal rows.

**Implementation status (2026-08-23):** Complete in code, pending migration
deployment and operational rollout. Partner reporting is aggregate-only and
suppresses the entire period below `REFERRAL_PARTNER_MINIMUM_COHORT` (default
5), then omits any smaller product, category, or trend breakdown. Admins can
filter the existing immutable ledger/settlement views to referral commissions
and request `REFERRAL_ALLOCATIONS` or `REFERRAL_SETTLEMENTS` through the
existing audited private-export workflow. Automated review rules are scoped to
a referral program and support `BLOCK_CHECKOUT` or `QUEUE_REVIEW`; self-
referral remains an unconditional checkout block. Queued flags are assigned,
noted, resolved or accepted with a disposition, and every operator action is
audited. Program and code suspend/resume actions do not modify any existing
attribution or allocation.

#### Phase 4 — Complete platform reporting and export catalogue

**Goal:** Provide the operations and finance report set on top of the Phase 1
privacy model and Phases 2–3 ledger reporting.

- [x] Add aggregate report families for refunds, payments, registrations,
      active purchasers, entitlement grants/revocations/expiry, and platform
      revenue/discounts.
- [x] Add supported filters for Cairo date range, product hierarchy, grade,
      governorate/center, payment channel/status, promotion, coupon, referral
      code, and partner. Specify metric definitions, empty-result behaviour, and
      pagination/rollup boundaries for every report.
- [x] Make each approved report exportable through the private asynchronous
      export pipeline, with normalized filters and a report-specific column
      policy. CSV remains the initial format; add XLSX only for a confirmed
      formatting requirement.
- [x] Publish retention and deletion runbooks: financial allocations/receipts
      and audit events for seven years; learner and derived-report data according
      to the approved privacy policy.

**Implementation status (2026-08-23):** Complete in code and documented in
[`platform-reporting-and-retention-runbook.md`](platform-reporting-and-retention-runbook.md).
The catalogue is aggregate-only, Cairo-calendar based, rejects filters a report
cannot apply, and exports only approved non-PII columns through the existing
private worker. Deploy the already-required privacy/export migration and keep
the export rollout control disabled until the Phase 0 finance sign-off.

**Exit criteria:** The approved operational report catalogue is documented,
authorized, auditable, reproducible from its source records, and exportable
without creating public URLs or logging report contents.

#### Phase 5 — End-to-end hardening, rollout, and handover

**Goal:** Verify the complete system in a production-like environment and
make its operation repeatable.

- [ ] Complete the automated acceptance matrix in
      [`phase-5-hardening-handover.md`](phase-5-hardening-handover.md): referral
      program/code/rule creation and use, checkout attribution, allocation
      idempotency, settlement creation/payment, export lifecycle,
      assessment-attribution backfill, feature-control/allow-list paths, and the
      full refund-reversal journey. Record the revision and redacted test report.
- [ ] Complete the publisher/referral authorization matrix from the same
      runbook. It must prove that neither capability can access another partner's
      data or learner identity, and that small referral cohorts are suppressed.
- [ ] Complete the staging drill sequence: migrations, worker/queue recovery,
      export cancellation and expiry, reconciliation, feature rollback, failed
      webhook/HMAC, retries, and partial operational failures. Preserve each drill
      record even when it initially fails.
- [ ] Roll out in named cohorts behind the existing controls. Monitor agreed
      reconciliation, export, payment, and access-denial thresholds throughout the
      observation window; widen an allow-list only after the recorded sign-off.

**Execution status (2026-08-23):** The repository foundation, focused unit
coverage, regression suite, and runbooks are in place. Phase 5 operational
evidence is intentionally **not yet claimed**: it requires a configured
production-like staging environment, provider/worker access, named owners,
and signed cohort decisions. The executable evidence checklist, drill order,
monitoring ownership, rollback test, and handover checklist are in
[`phase-5-hardening-handover.md`](phase-5-hardening-handover.md). The Phase 0
pilot record remains a prerequisite and is not replaced by this document.

**Exit criteria:** The Phase 5 runbook's automated and staging gates pass; the
controlled pilot and cohort rollout are signed off; runbooks, dashboards,
alert owners, and rollback steps are handed to the operating team.

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

| Metric              | Definition                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Available questions | Published, attributed questions eligible in the selected scope at report time.              |
| Presented questions | Frozen publisher-attributed questions in an assessment attempt that a learner started.      |
| Solved questions    | Presented questions with a submitted answer.                                                |
| Unique solvers      | Distinct students with at least one submitted answer to an attributed question.             |
| Correct rate        | Correct final answers / graded solved questions; pending/ungraded answers excluded.         |
| Reattempts          | Answer attempts after the learner’s first solved occurrence of that frozen/source question. |
| Usage rate          | Solved questions / presented questions, always shown with numerator and denominator.        |

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

The implemented admin-only composition API avoids a large unbounded join:

- `GET /v1/admin/students/:id/360` returns profile summary, account status,
  academic/geographic metadata, current access summary, commerce summary, and
  performance summary;
- subresources use independent pagination/cursors:
  `/orders`, `/entitlements`, `/assessments`, `/audit-events`;
- response fields have an explicit section policy: `PROFILE` is field-minimized
  and `CONTACT` contains the support contact fields. National ID is limited to
  its stored last four digits; encrypted/raw national ID is never selected or
  returned;
- every 360 view and subresource read writes an audit event containing actor,
  target, requested sections, and reason where configured.

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

The implemented export baseline uses asynchronous `ReportExportJob` records
rather than synchronous downloads:

- requesting admin, report type, normalized filters, selected columns,
  format (`CSV` initially; XLSX only when a required formatting use case is
  confirmed), state, row count, expiry, and failure metadata;
- worker/queue writes a private object-store file;
- authorized requester receives a short-lived signed download URL;
- download, expiry, and cancellation are audited; failed generation is
  retained as job state/error metadata, with a separate audit event to be
  added if operational review requires one;
- report classification and report-specific column allowlists are persisted and
  enforced before queueing. Current reports are `NON_PII`; a future
  `PII_RESTRICTED` report must add an explicit policy entry before it can be
  requested;
- private artifacts currently expire after 24 hours and signed URLs after 15
  minutes. CSVs/object metadata carry a visible classification/requester/job
  watermark.

Never place report data in a public URL or application logs.

## Phase dependencies and release boundaries

| Phase                      | Depends on                                             | May be released when                                                           | Must not wait for                                                      |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 0 — Operational baseline   | Existing foundation                                    | Pilot/sign-off exit criteria are met; allow-lists remain narrow until then.    | No later reporting UI or export work.                                  |
| 1 — Privacy controls       | Existing Student 360/export baseline                   | Policy enforcement and PII tests pass.                                         | Phase 0's live-payment sign-off, although both should run in parallel. |
| 2 — Publisher operations   | Phase 1 for exports; Phase 0 for wider finance rollout | Ledger exports and aggregate usage reports reconcile.                          | Referral reporting.                                                    |
| 3 — Referral operations    | Phase 0; Phase 1 for privacy/export controls           | Aggregate reports, suppression, and fraud workflow pass their tests.           | Broader platform-report catalogue.                                     |
| 4 — Platform reports       | Phase 1; reuse Phase 2/3 sources where applicable      | Each report has definitions, authorization, retention, and export policy.      | The Phase 5 final rollout gate.                                        |
| 5 — Hardening and handover | Phases 0–4                                             | Staging verification, cohort rollout, and operational handover are signed off. | Nothing; this is the completion gate.                                  |

Phases 2 and 3 can proceed in parallel after their shared prerequisites. Phase
4 can add independent report families incrementally, but must not expose PII
until Phase 1 is complete.

## Migration and rollout safeguards

- For any new schema work, deploy additive schema first; do not alter financial
  history in place.
- If historical publisher allocation import is ever approved, first produce a
  discrepancy report against approved orders and preserve a source marker on
  imported rows. It is not part of the current rollout by default.
- Ledger allocations are the reporting source of record. Do not introduce a
  mutable earnings calculation or restore legacy statements as a competing
  source.
- Backfill assessment attribution only where a live source can be resolved;
  preserve unknown legacy attribution explicitly.
- Use the reconciliation run and representative pilot orders to investigate
  every variance before enabling or widening payout operations; do not revive
  a mutable estimate calculation for this purpose.
- Keep referral programs behind their rollout control until checkout
  idempotency, code-collision, privacy, and controlled-pilot checks pass.

## Required verification

Run the phase-specific exit checks above, plus the following regression suite
before every rollout expansion:

- Contract activation, overlap, replacement/versioning, fixed/percentage
  calculation, and no-retroactive-change tests.
- Fulfilment idempotency proving at most one allocation per eligible order item
  despite webhook/manual-approval retries; full refund/reversal coverage for
  whole order items.
- Assessment attribution tests with multiple sources/publishers, historical
  source changes, deleted sources, pending grading, no-attempt cases, and
  long-range usage rollups.
- Authorization/isolation tests proving publishers and referral partners
  cannot access another partner's data, learner identity, or a disclosure-prone
  small cohort.
- Student 360 and export policy tests for field/section access, required
  reasons, masking, audit records, column allowlists, retention, expiry, and
  cancellation races.
- Report metric fixtures comparing approved sales, refunds, allocations,
  settlements, receipts, entitlement state, and platform totals.
- Staging e2e journeys for feature flags/allow-lists, queue/worker recovery,
  payment retries, reconciliation discrepancies, and rollback.

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
- Admins can retrieve a policy-enforced, properly audited Student 360 view and
  request secure, expiring platform exports only within their approved PII
  permissions.
- Finance can trace every settlement and exported total to immutable ledger
  rows, and controlled-pilot reconciliation has recorded no unexplained
  discrepancy.
- Publisher and referral reporting remains aggregate-only, applies small
  cohort protection, and has an audited fraud-review workflow.
- The complete phased e2e suite and the production-like rollout drill have
  passed before unrestricted feature enablement.
