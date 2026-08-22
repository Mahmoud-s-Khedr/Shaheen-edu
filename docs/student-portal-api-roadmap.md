# Student Portal API Roadmap

> **Status: implementation inventory plus remaining roadmap.** Reviewed
> 2026-08-10 against the NestJS controllers/services, Prisma schema, tests,
> journey scripts, and the checked-in OpenAPI document. This file is no
> longer a proposal-only contract: `[x]` entries are implemented API/data
> capabilities, while `[ ]` and `[-]` entries are the remaining roadmap.

The current OpenAPI document contains **223 paths and 276 operations**. All
versioned routes use `/api/v1`; `GET /health` and `GET /health/ready` are
intentionally unversioned.
For request-level schemas and examples, use the [compact API reference](api-reference-compact.md),
[detailed API reference](api-reference-detailed.md), [catalogue guide](student-content-catalog-api-guide.md),
[assessment reference](assessments-api-reference.md), and [video reference](video-api-reference.md).

## Status legend

- [x] Implemented and represented in the current runtime API.
- [-] Partially implemented; the remaining limitation is recorded explicitly.
- [ ] Planned or absent from the current codebase.

## Product and security invariants

The following rules are implemented and should remain stable as new routes are
added:

- A student has one profile `academicGradeId`. Student catalogue and question
  eligibility derive grade from the authenticated profile; the client cannot
  select another grade through a query parameter.
- Published visibility and delivery access are separate decisions. Public and
  student catalogue responses expose previews, access/lock state, effective
  price, and `hasChildren`; protected content bodies and asset URLs require
  their dedicated delivery/access route.
- The hierarchy is `AcademicGrade → Subject → Course → Chapter → Lesson →
  Section`. Course and chapter are the purchasable entitlement targets. A
  course entitlement covers its descendants; a chapter entitlement covers
  that chapter and its descendants.
- A grade change changes future catalogue discovery but does not revoke active
  paid access. `/student/library` remains cross-grade so purchased content is
  not hidden after a profile change.
- Assessment questions/options/placement labels are frozen snapshots. Student
  assessments are private; published admin assessments are visible only when
  the student can access all of their target scopes.
- Checkout and payment-proof upload/resubmission require `Idempotency-Key`.
  Assessment answer autosave and submission are idempotent by persisted state,
  but do not use that header.
- Student responses never expose National ID plaintext, passwords, question
  answer keys before the appropriate reveal point, or raw storage keys. Parent
  access is a separate session model with explicit selected-child checks.

## Current implementation inventory

### Identity, sessions, and roles

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `POST /auth/students/register`, `POST /auth/students/login` | Student registration, login, profile, grade selection, geography fields, and protected National ID handling. |
| [x] | `POST /auth/admins/login`, `POST /auth/partners/login` | Admin/super-admin and partner login with role-based authorization. |
| [x] | `POST /auth/parents/login`, `/auth/parents/children`, `/select-child`, `/selected-child` | Lightweight parent session, linked-child discovery, and selected-child authorization. This is not a parent User account. |
| [x] | `/auth/refresh`, `/logout`, `/logout-all`, `/me`, `/change-password` | Opaque refresh-token rotation, reuse detection, revocation, password change, throttling, and forced password-change support. |
| [x] | `/admin/admins/*`, `/admin/students/*`, `/admin/partners/*` | Super-admin admin lifecycle; admin/super-admin student and partner lifecycle; safe student detail; suspension, reactivation, soft deletion, and password reset. |

### Public and student catalogue

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `GET /academic-grades`, `GET /geography/governorates` | Published registration selectors. |
| [x] | `GET /catalog/subjects`, `GET /catalog/courses`, `GET /catalog/courses/:id` | Published public subject/course discovery, optional grade/subject filters, course detail, and effective public pricing. |
| [x] | `GET /catalog/courses/:id/chapters`, `/catalog/chapters/:id/lessons`, `/catalog/lessons/:id/sections` | Stable cursor-paginated child traversal. |
| [x] | `GET /catalog/:resource/:id/content-items`, `/catalog/content-items/:id`, and public asset access | Direct content previews and access to assets attached to public content. |
| [x] | `GET /student/catalog`, `/student/catalog/subjects`, `/student/catalog/subjects/:id/courses` | Current-grade student catalogue with server-resolved access, lock, entitlement, and price state. |
| [x] | `/student/catalog/courses/:id`, child traversal, direct content previews | Grade-scoped student course detail and cursor-paginated hierarchy/content traversal. |
| [x] | `GET /student/catalog/search` | Arabic-aware search for published chapter/lesson/section nodes within a subject, with breadcrumbs and access state. |
| [x] | `GET /student/library`, `/student/my-subjects`, `/student/entitlements` | Cross-grade active library, subject-grouped owned access/progress, and raw active entitlement views. |

### Content delivery and learning

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `GET /student/content-items/:id` and asset access | Entitled published content delivery with completion and study state, plus short-lived asset/video access. |
| [x] | `POST /student/content-items/:id/complete` | Idempotent completion of one accessible content item. Higher-level completion is derived, not directly commanded. |
| [x] | `PUT /student/content-items/:id/study-state`, `GET /student/learning/continue` | Last-opened state and optional video playback position, with inaccessible/unpublished items skipped. |
| [x] | `GET /student/progress`, `/student/library/:targetType/:targetId/progress` | Current-grade and owned course/chapter content rollups for course, chapter, lesson, and section. |
| [x] | `/student/practice/questions*`, `/student/performance` | Entitled published direct-practice questions, immediate answer feedback, immutable retry history, question assets, and basic practice summary. |
| [x] | `GET /parent/selected-child/performance` | Selected-child content progress plus direct-practice summary. Assessment/order/entitlement parent views are not included. |

### Commerce and entitlements

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `/student/cart/*`, `/student/manual-payment-methods` | One active cart per student, course/chapter targets, overlap checks, and active transfer instructions. |
| [x] | `POST /student/checkout`, `/student/orders*` | Serializable, idempotent checkout; immutable EGP totals, payment-method snapshots, order items, cancellation, and purchase history. |
| [x] | `/student/orders/:id/payment-proof*` | Direct-upload authorization plus proof completion; initial submission, rejected-proof resubmission, transaction reference, note, and idempotency. |
| [x] | `/admin/manual-payment-methods*`, `/admin/payment-submissions*` | Payment instruction administration and review queue; approval atomically grants one entitlement per order item, rejection retains history. |
| [x] | `/admin/entitlements*` | Manual grant, revoke, archived-access revoke, and paginated administration. |
| [-] | Commercial lifecycle | No PSP/card/webhook payment, subject-level purchase, refunds, coupons, timed discounts, payment expiry, or automated entitlement expiry job. Lesson pricing can be configured, but the purchase/entitlement model sells courses and chapters. |

### Authoring, question banks, and media

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `/admin/question-banks/sources*`, `/admin/question-banks*` | Source and bank CRUD, bilingual metadata, source type, publisher association, publication lifecycle. |
| [x] | `/admin/questions*` | Question CRUD/review lifecycle, single/multiple-choice options, hierarchy placements, attachments, question video links/timestamps, and learner-safe delivery. |
| [x] | Student marks and question discovery | `/student/assessments/question-banks`, `/question-sources`, `/question-marks*` expose eligible banks/sources and private marks. |
| [x] | Community statistics | Practice attempts update incorrect-rate aggregates and A+–D difficulty bands used by assessment filtering. No ranked community-incorrect feed exists. |
| [x] | `/admin/assets*`, covers, `/admin/video-assets*` | General file/cover upload authorization, protected access, Bunny Stream direct upload, confirmation, playback, retry, archive/delete, and webhook processing. |
| [ ] | Automated question extraction | No PDF-to-question generation, AI question selection, AI explanation, or question-report/moderation workflow. |

### Assessments and results

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `POST /student/assessments` | Private random-sample assessment. Supports question bank, multiple hierarchy scopes, source IDs/types, A+–D difficulty bands, `UNUSED`/`USED`/`CORRECT`/`INCORRECT`/`OMITTED`/`ALL`, marked-only, count 1–50, TUTOR/EXAM mode, timer, duration, and title. |
| [x] | Student assessment history/actions | `GET/PATCH/DELETE /student/assessments`, detail, search/status filters, rename, and visibility-safe merging of own/private and accessible public assessments. |
| [x] | Attempt lifecycle | Start/resume, current state, per-question autosave, monotonic active-time reporting, timer expiry, submit, immutable score/result, omitted outcome, and mode-aware answer reveal. One attempt per assessment/student. |
| [x] | Results and assessment analytics | Full question review; frozen hierarchy/source/placement context; platform comparison; subject/chapter/topic rollups; chapter attempt drill-down. |
| [x] | Admin assessment authoring | Standard random and custom hand-picked generation, draft list/detail/edit, publish/archive, and draft-only delete. |
| [ ] | Deferred assessment features | AI prompt generation, AI explanations, assessment snapshot video timestamps, multiple attempts, and question reports remain absent. |

### Performance and leaderboard

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `GET /student/performance/overview` | Date-filterable test totals, completed/suspended counts, eligible/used/unused question-bank metrics, usage percentage, assessment outcomes, and practice metrics. |
| [x] | `GET /student/performance/analysis` | Searchable subject/chapter/lesson rollups from completed assessment answers. |
| [x] | `GET /student/performance/trends` | Date/test-filterable completed-assessment outcome trends. |
| [-] | `GET /student/performance/peers` | Grade cohort average, median, percentile, and minimum sample are implemented for course/optional chapter; bell curves and arbitrary topic-level cohorts are not. |
| [x] | `GET /student/performance/answer-changes` | Assessment answer-change counts and rows for correct→incorrect and incorrect→correct. Direct practice remains immutable-attempt based. |
| [-] | Smart Score | Leaderboard computes and stores a Smart Score, but the formula currently uses raw correct-question and total-question counts rather than a normalized accuracy percentage. |
| [x] | `/student/leaderboard/current`, `/history/:weekKey` | Friday/Cairo weekly windows, lazy previous-week finalization, top-five honor board, full pagination, current rank, history, and top-three award labels. |
| [ ] | Prize/reward operations | No configurable prizes, reward ledger, notification, or fulfilment workflow. |

### Pricing, publisher, and operations

| Status | API surface | Implementation |
| --- | --- | --- |
| [x] | `/admin/pricing/*` | Course, chapter, lesson pricing and effective-price resolution; chapter inheritance is surfaced for admin UI. |
| [x] | `/admin/publisher-agreements/*` | Draft/active/ended publisher agreements, effective agreement lookup, and earnings-statement creation/listing. |
| [x] | Academic/content administration | Grade/subject/course/chapter/lesson/section/content-item CRUD, move/reorder, publication/archive/restore, access types, and audit records. |
| [x] | Geography and account support | Governorate/center management, public registration geography, admin student support, partner account lifecycle. |
| [-] | Reporting/export | Content-publisher partners have a self-scoped dashboard, content agreements, statement history, and approved-order estimates. Excel export, consolidated admin reporting, referral-partner reporting, parent directory, and admin cross-domain student dashboard remain absent. |

## Remaining roadmap

### Priority 0 — resolve contract gaps before frontend freeze

1. Decide whether the required Smart Score is the original normalized
   percentage formula. If yes, change the leaderboard calculation and add
   regression tests for ties, zero-answer students, and ranking stability.
2. Decide whether assessment review must preserve question video-link metadata.
   If yes, copy timestamp/link data into the immutable assessment snapshot and
   expose it only at the appropriate reveal point.
3. Define whether analytics are assessment-only or must combine direct practice
   and assessments. The current `analysis`, `trends`, `peers`, and
   `answer-changes` views are assessment-based, while `overview` combines
   practice and assessment data in selected metrics.

### Priority 1 — missing product capabilities

1. Add a parent domain or explicitly document parent as a session-only role;
   then add selected-child orders, entitlements, assessment results, and
   richer progress views if required.
2. Add referral-partner reporting and any approved learner-level publisher
   reporting; the content-publisher aggregate financial dashboard is delivered.
3. Add admin reporting/export, including consolidated student purchase,
   entitlement, learning, and performance views.
4. Add configurable leaderboard prize/reward records and fulfilment if
   medals are meant to carry real benefits.

### Priority 2 — commercial and learning extensions

1. Add refunds/cancellations with entitlement reversal rules, payment expiry,
   coupons, timed discounts, and PSP integration only after the manual-payment
   operating process is settled.
2. Add structured video topics/concepts and a direct higher-level completion
   command only if the client needs server-authored node completion rather than
   derived progress.
3. Add AI question generation/explanations, automated PDF extraction, and
   question reporting/moderation behind explicit product and safety decisions.

## Verification sources

The implementation review used:

- runtime route inventory from [`docs-json.json`](../docs-json.json);
- controllers/services under [`src/modules`](../src/modules);
- persistence and lifecycle models in [`prisma/schema.prisma`](../prisma/schema.prisma);
- focused e2e coverage under [`test`](../test) and acceptance journeys under
  [`scripts/journeys`](../scripts/journeys);
- the detailed endpoint guides linked at the top of this document.

When routes change, regenerate `docs-json.json` with `pnpm api:docs:generate` and
revisit this inventory so implemented status does not drift from the runtime
contract.
