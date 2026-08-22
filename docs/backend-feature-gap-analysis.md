# Backend Feature Gap Analysis

**Review date:** 2026-08-22  
**Scope:** Backend only. Frontend/UI requirements are deliberately excluded.

## Completion assessment

The backend is approximately **83% complete**, weighted against the functional
requirements in `docs/MohamedDiab-Req.pdf`.

- **35 of 49** capability areas are fully implemented.
- **11 of 49** are partially implemented.
- **3 of 49** are absent.

This includes the current implementation, rather than every statement in
`docs/original.md`: recent code adds scanned-PDF OCR and visual review for AI
question import, per-item AI-import accept/reject controls, and assessment
question video-timestamp snapshots.

The codebase builds successfully and its unit suite passes: **305 tests in 43
suites**.

## Missing and partial backend features

### 1. Course subscription and learning

| Feature                                       | Current state                                                                                        | Required backend work                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject-level subscription                    | Course and chapter purchases are supported.                                                          | Deliberately deferred: subjects are not purchasable products in the current commercial model.                                                 |
| Complete chapter, lesson, or section directly | Individual content-item completion is persisted; hierarchy completion is derived automatically.      | No direct hierarchy-completion command is required. A populated node is complete when every accessible published descendant item is complete. |
| Video topics and concepts                     | Optional ordered video outlines are admin-authored and can include timestamped topics plus concepts. | Clients opt in through `includeVideoOutline=true`; ordinary delivery remains unchanged.                                                       |

### 2. AI quiz and question-bank intelligence

| Feature                                   | Current state                                                     | Required backend work                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-prompt quiz                            | Implemented.                                                      | A student prompt is constrained to entitled, published questions; the normalized selection, rationale, model output, and frozen assessment are retained.                            |
| Reusable AI question explanations         | Admin-controlled generation and re-answer review are implemented. | Explanations are generated once per question/import, reviewed by admins, and reused through normal answer-reveal rules; per-student AI chat/hints remain deliberately out of scope. |
| Ranked community-most-incorrect questions | Implemented.                                                      | Student-safe question cards require 20 responses, use a smoothed incorrect-rate rank, respect entitlement/scope filters, and can become a tutor assessment.                         |
| Student question reporting                | Implemented.                                                      | Students can report six issue types; admins moderate through recorded state transitions and resolution notes.                                                                       |

PDF/scanned-document OCR, AI question import, visual extraction, and human
accept/reject review are implemented. Assessment snapshots now also retain
linked video timestamps.

Long-answer assessments additionally accept an editable OpenRouter-transcribed
voice response. The raw recording is sent directly to transcription and not
retained. Rubric-backed responses are AI-graded in either assessment mode,
with student-directed feedback and non-overlapping correct/language/factual
highlight spans. Failed runs remain retriable and an admin can override every
AI score with an audit record.

### 3. Leaderboard

| Feature                    | Current state                                                              | Required backend work                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smart Score formula parity | The current formula is `correctAnswers * 0.6 + totalQuestions * 0.4`.      | Align it with the requirement's normalized accuracy component and define a normalized questions-solved component, caps, and historic-data migration rules. |
| Top-five reward system     | A top-five honor board exists, but only the first three have medal labels. | Add prize configuration, winner eligibility, reward ledger, fulfilment status, audit trail, and notification hooks.                                        |

### 4. Performance and peer analytics

| Feature                               | Current state                                                                                                                        | Required backend work                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Unified performance history           | Implemented. Overview, analysis, trends, peers, and insights use completed assessment answers plus every direct-practice submission. | Accuracy is consistently `correct / answered`; omissions remain explicit.                 |
| Topic-level peer comparison           | Implemented using the existing curriculum section as the topic level.                                                                | Video-outline topics are not question scopes and remain excluded.                         |
| Bell-curve/distribution data          | Implemented. Peer comparison returns a privacy-safe ten-point histogram and student-vs-cohort metrics.                               | Raw peer scores and identities are deliberately not returned.                             |
| Best/worst/needs-improvement insights | Implemented at `GET /student/performance/insights`.                                                                                  | Includes strongest/weakest scopes, omissions, repeated errors, and recommendation labels. |
| Richer trend insights                 | Implemented. Unified daily trends include 28-day improving/stable/declining classification.                                          | Both windows require sufficient answered activity.                                        |

### 5. Parent features

| Feature                           | Current state                                                                       | Required backend work                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Registered parent accounts        | Parent access is a lightweight session based on child National ID and parent phone. | Add parent account lifecycle, registration/login/recovery, and durable parent-child relationships.      |
| Parent relationship field         | Not stored.                                                                         | Capture relationship type, consent/verification state, and relationship changes.                        |
| Parent assessment monitoring      | Basic selected-child content progress and direct-practice summary are available.    | Add assessment history/results, weak-area and activity summaries, with appropriate authorization.       |
| Parent subscriptions and payments | Not available.                                                                      | Expose authorized child orders, active entitlements, payment status/history, and receipts.              |
| Admin parent management           | Not implemented.                                                                    | Add parent directory/detail, linked-child management, suspension/revocation, and support audit actions. |

### 6. Administration and reporting

| Feature                                | Current state                                                              | Required backend work                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Consolidated student admin dashboard   | Student, payments, entitlements, and performance data are separate APIs.   | Provide an authorized student 360-degree endpoint joining profile, access, orders, performance, and audit data.        |
| Subscriber Excel export                | Not implemented.                                                           | Add filtered CSV/XLSX export jobs, secure expiring downloads, access controls, and audit logs.                         |
| Platform payment/revenue reports       | Manual-payment review and content-publisher estimates exist.               | Add platform-level revenue, payment-status, refund, sales, entitlement, and period-based reporting/export APIs.        |
| Referral-partner reporting             | Content-publisher reporting exists; referral network reporting does not.   | Model referral attribution and expose partner-scoped student counts, conversion, payment, and revenue-share reporting. |
| Partner assigned subject/student views | Content-publisher agreements are covered; referral network data is absent. | Add explicit partner assignment/attribution views when required by the business model.                                 |

### 7. Commerce lifecycle

| Feature                                | Current state                                                                | Required backend work                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Online payment provider                | Manual payment proof and admin approval are implemented.                     | Integrate PSP checkout, signed webhooks, transaction records, retry/recovery, and reconciliation.                |
| Subject purchases                      | Only courses and chapters are purchasable.                                   | Add subject product, pricing, cart, and entitlement support.                                                     |
| Coupons                                | Not implemented.                                                             | Add coupon validation, scope, expiry, usage limits, discount calculation, and audit data.                        |
| Timed discounts                        | Not implemented.                                                             | Add effective-date pricing rules, precedence rules, and immutable order-price snapshots.                         |
| Refunds                                | Not implemented.                                                             | Add refund request/approval/provider flows, entitlement reversal rules, partial-refund handling, and audit data. |
| Payment expiry                         | No complete commercial expiry workflow.                                      | Expire unpaid orders/payment instructions, define cart/stock behaviour, and add scheduled cleanup.               |
| Automated entitlement expiry           | Entitlements have `expiresAt`, but there is no complete automatic lifecycle. | Add scheduled expiry enforcement, renew/reactivate rules, reporting, and notification hooks.                     |
| Invoices, receipts, and reconciliation | Manual proof records exist only.                                             | Produce immutable receipt/invoice references and reconciliation/reporting workflows.                             |

## Recommended operational backlog

These items are not direct requirements in the PDF, so they are not included
in the 78% completion score. They are nevertheless important before a public
launch:

- Notification service, opt-in preferences, and delivery audit records.
- Product, error, latency, media-provider, and queue monitoring/alerting.
- Scheduled reports, backup/restore verification, and operational runbooks.
- Production acceptance tests for payments and Bunny media.
- Load testing for concurrent timed assessments.
- Curriculum versioning and learning-objective mapping if adaptive learning or
  annual Egyptian curriculum changes are in scope.

## Recommended implementation order

1. Correct Smart Score and add the ranked community-incorrect feed.
2. Implement PSP commerce, refunds, discounts, expiry, and reconciliation.
3. Complete parent accounts, parent monitoring, and consolidated admin reports.
4. Add AI-prompt quiz generation and student AI explanations with safety/audit controls.
5. Unified performance analytics, richer peer comparison, and insights are implemented.
