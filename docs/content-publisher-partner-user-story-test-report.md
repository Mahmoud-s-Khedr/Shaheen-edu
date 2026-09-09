# Content publisher partner user-story test report

**Status:** Ready for API testing. This is an implementation-backed test pack; it does not claim the scenarios have been executed.

**Actor:** An active `PARTNER` account whose `PartnerProfile.partnerType` is `CONTENT_PUBLISHER`. Content publisher is a partner capability, not a separate login role.

**API base path:** `/api/v1`

**Implementation reviewed:** partner/shared authentication, partner profile, partner analytics and ledger services, publisher-agreement and finance controllers, fulfilment/refund services, DTOs, schema, and `CONTENT-018` journey. Reviewed 2026-09-10.

This report turns the **Content publisher partner** section of [the user-story checklist](user-story-testing-checklist.md) into testable backend stories. It deliberately distinguishes the publisher's existing reporting portal from staff/admin commercial and content-management operations.

## Test conventions

`PUBLISHER_A_TOKEN` and `PUBLISHER_B_TOKEN` are bearer tokens for two active content-publisher partners. `REFERRAL_TOKEN` is an active `REFERRAL_PARTNER` token. `ADMIN_TOKEN` is used only to arrange data and perform the staff-side steps in end-to-end scenarios. Use a separate cookie jar for each authentication session.

Use synthetic accounts, labels, and content only. Never retain bearer tokens, refresh cookies, learner names, phones, national IDs, payment proof, raw answers, or signed asset URLs in test evidence. Protected-route denials must expose neither another publisher's data nor an implementation stack trace. Check the bilingual standard error envelope and `correlationId`, rather than asserting only the English message.

Partner-ledger reporting is controlled at process start. Run the enabled and disabled/allow-list cases in separately configured disposable environments; a `409` rollout response is not an empty report.

## Coverage and current product boundaries

| Checklist capability | Current backend support | Coverage |
| --- | --- | --- |
| Partner email/password login, refresh, sign-out, session invalidation, and password change | Yes | `PUBLISHER-AUTH-001` |
| Read/update own permitted organisation profile | Yes — `displayName`, `legalName`, and `phone` only | `PUBLISHER-PROFILE-001` |
| Dashboard, earnings trend, agreement/version breakdown, ledger, and payout-state totals | Yes; immutable ledger-derived reporting | `PUBLISHER-EARNINGS-001` |
| View own agreement-covered course/chapter/lesson catalogue presence | Yes | `PUBLISHER-CONTENT-001` |
| Aggregate publisher-attributed question usage and source/question drill-down | Yes; no learner/attempt/answer views | `PUBLISHER-USAGE-001` |
| Correct publisher allocation creation, idempotency, settlement state, and refund reversal visible in reporting | Yes; publisher observes these outcomes but does not perform the actions | `PUBLISHER-E2E-001` |
| Self-scoping and denial of referral, admin, pricing, agreement, authoring, asset, and finance operations | Yes | `PUBLISHER-SECURITY-001` |
| Publisher registration, password reset, email/partner-type/status changes, account activation/suspension, or payout-detail/proof management | No partner API; staff-managed | Gap / intentional restriction |
| Create/edit/publish/archive content; upload assets/videos; set price; create/edit/activate/end agreements; create sources/questions; settle or export finance data | No partner API; admin-only | Intentional restriction |
| Publisher-visible agreement document, full terms, signed asset, settlement statement/reference, balance export, notifications, audit-log view, UI loading/accessibility/localisation | Not exposed as publisher APIs in this repository | Gap / frontend or product scope |
| Direct lesson sales | Not implemented: agreements may cover lessons but checkout/fulfilment currently sells only courses and chapters | Product limitation |

## Required test data

| Alias | Required state |
| --- | --- |
| `PUBLISHER_A` | Active `CONTENT_PUBLISHER`, known password, two browser sessions, and agreements/ledger rows described below. |
| `PUBLISHER_B` | Separate active content publisher with distinct agreement, source, allocations, and usage. It is the cross-publisher privacy control. |
| `REFERRAL_A` | Active `REFERRAL_PARTNER`; confirms partner role alone does not grant publisher reporting. |
| `ADMIN_A` | Administrator able to create/suspend/reactivate partners, create pricing/agreement/source/question data, approve manual payment, settle allocations, and approve refunds. |
| `AGREEMENT_*` | `PUBLISHER_A` has DRAFT, current ACTIVE, ended, course, chapter, lesson, percentage, and fixed-payout agreements. Give `PUBLISHER_B` a separate active agreement. Use a course and chapter pair to prove the chapter agreement takes precedence at fulfilment. |
| `CONTENT_*` | Published course/chapter data for the agreements and an unrelated hierarchy target. Make target labels safely distinguishable without real learner data. |
| `ORDER_*` / `ALLOCATION_*` | Approved publisher-covered course/chapter orders with positive `PUBLISHER_SALE` rows in `PAYABLE` and `PAID`; a refunded item with its original row `REVERSED` plus a negative compensating `PAYABLE` row; out-of-period and `PUBLISHER_B` rows. Include a coupon/discounted item so final item price differs from catalogue price. |
| `SOURCE_*` / `QUESTION_*` / `ATTEMPT_*` | Published `CONTENT_PUBLISHER` question sources attributed separately to A and B, frozen questions, attempts with presented-only, solved/graded correct, incorrect, and reattempted answers, plus a source/placement outside the requested filters. |
| `PERIOD_*` | Same-day, Cairo-midnight, month-boundary, 93-day, 94-day, valid long-range, inverted, and malformed date windows. |

## User stories

### PUBLISHER-AUTH-001 — Securely start, refresh, end, and replace a publisher session

**Priority/Risk:** Critical — access to organisation and financial reporting.

**Sources:** `POST /auth/partners/login`; `POST /auth/refresh`, `/auth/logout`, `/auth/logout-all`, and `/auth/change-password`; `PartnerAuthController`, `SharedAuthController`, `AuthService`, `SessionService`, and `AuthRateLimitService`.

**User story:** As a content publisher partner, I want to manage my authenticated sessions securely so that only I can access my organisation's publisher reporting.

**Acceptance criteria:**

- Given active `PUBLISHER_A` and valid credentials, when email whitespace/case variations are submitted to `POST /auth/partners/login`, then it returns `201`, a `PARTNER` access token, normalized login identifier, and HttpOnly `refresh_token` cookie; it returns no password hash or another partner's data.
- Given an unknown email, wrong password, non-partner account, suspended publisher, or missing/malformed credentials, when login is attempted, then it returns the same safe `401` credentials outcome. Repeated failures reach configured `429` throttling; a permitted later login clears the applicable failure state.
- Given a valid refresh cookie, when `POST /auth/refresh` is called, then it returns `201`, rotates the cookie, and provides a usable replacement token. Missing, expired, replayed, revoked, or wrong cookies return safe `401`/configured `429` without creating a session.
- Given the access token and cookie, when `POST /auth/logout` is called, then it clears the cookie and invalidates that session; the same bearer token cannot subsequently read `/partners/me` or publisher reports. Given two sessions, when either calls `/auth/logout-all`, then both are unusable.
- Given the correct old password and an 8–128-character new password, when `POST /auth/change-password` succeeds, then all sessions are revoked and only the new password can log in. Wrong old password, missing/non-string input, or out-of-range password fails without changing credentials.
- Given `ADMIN_A` suspends the publisher, when an existing bearer token, refresh cookie, or fresh login is used, then protected access is denied. Reactivation permits a new normal login only; prior revoked sessions remain invalid.

**Test type:** API, security, rate-limit, regression. **Dependencies:** Redis rate limiter, JWT/session configuration, cookie-aware client.

### PUBLISHER-PROFILE-001 — View and maintain only permitted organisation contact details

**Priority/Risk:** High — identity integrity and ownership boundary.

**Sources:** `GET|PATCH /partners/me`; `PartnersController`, `PartnersService.getOwnProfile` / `updateOwnProfile`, `UpdatePartnerDto`.

**User story:** As a content publisher partner, I want to maintain permitted organisation contact fields so that the platform has current contact information without letting me alter administrative account settings.

**Acceptance criteria:**

- Given `PUBLISHER_A_TOKEN`, when `GET /partners/me` is called, then it returns only A's ID, status, login identifier, creation date, partner type, display name, legal name, and phone. Password/hash, sessions, creator identity, allocations, agreements, learner data, and B's details are absent.
- Given valid optional strings for `displayName`, `legalName`, and/or `phone` (including `null` for nullable fields), when `PATCH /partners/me` is called, then it returns `200` with persisted values and a subsequent GET agrees. Verify `PARTNER_SELF_UPDATED` records the actor, target, and submitted field names in the staff audit trail.
- Given unknown fields, non-string supplied values, an empty patch, or attempts to supply `id`, `loginIdentifier`, email, role, status, `partnerType`, password, allocations, agreements, or settlements, then validation safely rejects unknown/invalid input or immutable administrative fields remain unchanged. Record the observed empty-patch outcome if product policy has not fixed it.
- Given a student, referral partner, admin, anonymous request, or revoked token, when it calls the profile endpoint, then it receives safe denial and no A profile data. The route must never accept another publisher ID; ownership is structural from the token.

**Test type:** API, authorization, validation, audit. **Related regression:** admin partner management.

### PUBLISHER-EARNINGS-001 — Review self-scoped immutable earnings and allocation history

**Priority/Risk:** Critical — financial correctness and privacy.

**Sources:** `GET /partners/dashboard`, `GET /partners/analytics/earnings`, `GET /partners/analytics/allocations`; `PartnerAnalyticsController`, `PartnerAnalyticsService`, `LedgerPublisherEarningsService`, `PartnerAllocation` schema.

**User story:** As a content publisher partner, I want to review my ledger-derived earnings, status, and agreement breakdown so that I can understand what is payable or paid without seeing learner or order records.

**Acceptance criteria:**

- Given reporting is enabled and A has in-period `PUBLISHER_SALE` rows, when dashboard is requested with omitted dates, then it defaults to the current Cairo month and returns `period.timeZone: "Africa/Cairo"`, day granularity, totals, trend, agreement breakdown, and money in EGP minor units. `GET /partners/analytics/earnings` returns the same ledger report shape for its selected period and supports `granularity=day|month`.
- Given positive rows, an original `REVERSED` row, and a negative compensating refund row, then `earned` totals only positive financial rows; `reversals` is the absolute negative compensation; `net` is signed financial allocations; and the original reversed row is audit history excluded from financial totals. `PAYABLE`, `PAID`, and `PENDING` totals/trends reflect their current states.
- Given an approved discounted item with final `priceMinor` 10,000 and a 2,500-bps agreement, then its ledger allocation basis is 10,000 and its amount is 2,500, rather than using catalogue price or order total. A fixed agreement uses its fixed minor-unit payout only when positive and no greater than item price.
- Given `from`/`to` across Cairo midnight and boundaries, then the range is inclusive Cairo calendar dates (`createdAt >= from`, `< day after to`). Same-day is valid; malformed dates and an end before start return `400` without data. Omitted earnings granularity is day through 93 days and month thereafter.
- Given `GET /partners/analytics/allocations?page=&limit=&from=&to=`, then only A's rows are newest-first by `createdAt`, then ID, and include only documented ledger fields plus `basis`/`amount` money objects and pagination metadata. Verify final/empty pages, no overlap, and `400` for page less than one, fractional/non-numeric values, or limits outside 1–100.
- Given A's allocation response, then it does not expose order/order-item IDs, purchaser identity/contact/national ID, payment proof, referral code/rule, settlement ID/reference, signed asset URL, or B's data. A ledger row existing is not proof it was paid; `state` and `paidAt` remain authoritative.
- Given ledger reporting is disabled or A is outside its rollout allow-list, when any of these report endpoints is requested, then it returns `409 Partner ledger reporting is disabled by rollout control`, not fabricated zeros or an empty dataset.

**Test type:** API, finance calculation, privacy, pagination, rollout regression.

### PUBLISHER-CONTENT-001 — Discover only my agreement-covered catalogue targets

**Priority/Risk:** High — commercial scope and cross-publisher isolation.

**Sources:** `GET /partners/analytics/content`; `PartnerAnalyticsController.content`, `PartnerAnalyticsService.content`, `PublisherAgreement` schema.

**User story:** As a content publisher partner, I want to see the course, chapter, and lesson targets covered by my agreements so that I can understand my catalogue presence without managing academic content.

**Acceptance criteria:**

- Given A's draft, active/current, future, and ended course/chapter/lesson agreements, when `GET /partners/analytics/content` is called, then it returns only A's agreements, newest `startsAt` first then ID, with status, `revenueShareBps`, dates, current-activity flag, and the applicable target labels/hierarchy.
- Given `status=DRAFT|ACTIVE|ENDED`, when the list is filtered, then it returns only that status and retains accurate one-based pagination. Invalid status, malformed page/limit, unknown query fields, and final/empty pages behave safely according to DTO validation/pagination rules.
- Given a current ACTIVE agreement and dates just before/equal to `startsAt`, at `endsAt`, and after `endsAt`, then `isCurrentlyActive` is true only for active agreements already started and not ended. This is reporting visibility, not a promise that the target is purchasable.
- Given B's agreements or an unrelated target, when A calls the endpoint, then they are absent. The request must not accept a `publisherUserId` selector.
- Given a fixed-payout agreement, document the observed response: this endpoint exposes `revenueShareBps` (zero when absent) but not `payoutKind`/`fixedPayoutMinor`; confirm the portal does not invent percentage terms. A lesson agreement can appear here, but must not be represented as sale-enabled while lesson commerce is unimplemented.

**Test type:** API, authorization, pagination, commercial-boundary regression.

### PUBLISHER-USAGE-001 — Review aggregate publisher-question usage without learner disclosure

**Priority/Risk:** High — learner privacy and analytics correctness.

**Sources:** `GET /partners/analytics/question-usage`, `/question-usage/sources`, `/question-usage/questions`; `PartnerAnalyticsService.questionUsage*`, `PublisherUsageDailyRollup`, `PublisherUsageDailySolver`.

**User story:** As a content publisher partner, I want aggregate usage and correctness insights for questions attributed to me so that I can evaluate licensed question content without identifying learners.

**Acceptance criteria:**

- Given A's published attributed source/questions and attempts spanning presented-only, solved/correct, solved/incorrect, graded/ungraded, and repeated attempts, when aggregate usage is requested, then it returns the selected Cairo period, available published question count, totals, trend, indicators, and metric definitions. Verify `usageRate = solved / presented`, `correctRate = correct / graded` (or `null` when no graded answers), distinct `uniqueSolvers`, and reattempt counts.
- Given a `sourceId` and valid subject/course/chapter/lesson/section filters, when usage is requested, then only A's matching attributed questions and placements contribute. A source ID belonging to B or a nonmatching placement returns no A leakage.
- Given source and question drill-down requests, then rows are ordered by solved count descending and stable ID tie-breaker, with correct page metadata. Source drill-down is aggregate-only; question drill-down uses frozen source-question IDs rather than learner attempts or answer text.
- Given a period through 93 days with no hierarchy filter, then non-rolled-up usage supports daily/monthly output. Given a period over 93 days or a hierarchy filter, then aggregate/source reporting uses rollups and reports `rolledUp`/freshness. Given question drill-down over 93 days, then it returns `400` directing callers to aggregate trends. Malformed/inverted dates, invalid granularity, and invalid pagination return `400`.
- Given any successful response, then it contains no student ID, name, contact, national ID, answer text, attempt ID, raw fingerprint, or per-learner sequence. `earningsDespiteZeroSolved` is an all-publisher-ledger indicator and must not be misrepresented as earnings attributable to a particular question source.
- Given `REFERRAL_A`, B, a student, admin, anonymous request, a disabled rollout, or excluded allow-list partner, then publisher-only endpoints deny access safely (`403` for wrong partner type; `409` for rollout control as applicable) without analytic data.

**Test type:** API, analytics calculation, privacy, authorization, performance/rollup regression.

### PUBLISHER-E2E-001 — Observe a correct publisher obligation from sale through settlement and refund

**Priority/Risk:** Critical — revenue integrity and retry safety.

**Sources:** Admin publisher-agreement/pricing and payment-approval routes; student checkout/manual-payment/refund routes; `FulfilmentService.fulfil`; `RefundsService`; publisher ledger/report endpoints.

**User story:** As a content publisher partner, I want approved sales, settlement status, and approved refunds to be reflected accurately in my immutable reports so that reported earnings match my commercial agreement.

**Acceptance criteria:**

- Given `ADMIN_A` creates/activates a primary A agreement effective at approval time and prices a covered course/chapter, when a student completes checkout and staff approves payment, then one `PUBLISHER_SALE` allocation is created for A using the final saved order-item price and the most-specific effective agreement (chapter before course). A draft, ended, future, non-primary, or no effective agreement creates no publisher allocation.
- Given the same provider webhook/manual-approval action is retried, then the order claim and `publisher-sale:<orderItemId>` idempotency key prevent a second publisher allocation. Verify the publisher ledger/report contains exactly one original positive row.
- Given a payable A allocation is placed by `ADMIN_A` in a settlement and marked paid, when A refreshes dashboard/earnings/ledger, then its financial value is retained and appears in `PAID` total/state with `paidAt`. A cannot create, mark paid, or alter the settlement itself.
- Given staff approves a valid refund for the covered item, when A refreshes reporting, then the original allocation is `REVERSED` and a negative compensating allocation is present; financial net declines once, not twice. Refund retries must not add duplicate compensating rows.
- Given a coupon/discount and agreement replacement, then allocation basis remains the final order-item price and allocation uses the effective agreement at fulfilment/approval time. Historical report rows retain agreement/version-linked history rather than being recalculated from later terms.
- Given a lesson-only agreement, record the current implementation limitation: the agreement is reportable but current checkout/fulfilment has no lesson purchase path and does not select a lesson agreement for sale allocation.

**Test type:** Integration, API, finance calculation, idempotency, refund regression. **Related roles:** student, admin, referral partner.

### PUBLISHER-SECURITY-001 — Enforce a reporting-only publisher boundary

**Priority/Risk:** Critical — privilege escalation, data leakage, and commercial integrity.

**Sources:** `RolesGuard`; partner analytics/profile controllers; admin publisher-agreement/pricing/finance/content/asset/video/question-bank/question controllers.

**User story:** As a content publisher partner, I need the portal to expose only my permitted reporting and profile actions so that commercial administration and platform data remain protected.

**Acceptance criteria:**

- Given `PUBLISHER_A_TOKEN`, `PUBLISHER_B_TOKEN`, and `REFERRAL_TOKEN`, execute every self-service analytics route and confirm results are scoped to the authenticated ID. A never receives B records even when IDs/query values from B are supplied; referral partner receives `403` from dashboard, earnings, content, and question-usage routes. The generic allocations endpoint may serve either partner type, but only its own ledger rows.
- Given `PUBLISHER_A_TOKEN`, when it attempts `POST|PATCH /admin/publisher-agreements/*`, `POST /admin/pricing/*`, `POST /admin/partner-finance/settlements`, `POST /admin/partner-finance/settlements/{id}/mark-paid`, admin content/asset/video endpoints, and admin question-bank/question endpoints, then each returns `403` and creates/changes no data.
- Given an unauthenticated, student, parent, referral-partner, expired/revoked-token, and malformed-token request to each publisher route, then it returns `401` or `403` as appropriate with no profile, agreement, ledger, reporting, learner, asset, or admin information.
- Given attempts to change academic hierarchy, users/partners, partner type/status/email, agreement coverage/terms, pricing, content, source attribution, question data, allocations, settlement, or another publisher's contact details, then there is no publisher route that performs the action. Confirm denied write requests leave data unchanged and do not create audit events implying success.
- Given expected safe errors, then no response URL/body/loggable detail contains access tokens, refresh tokens, payment proof storage keys, learner private data, or signed asset delivery data.

**Test type:** API, authorization, negative security, privacy, regression.

## Cross-role regression scenarios

- `ADMIN_A` creates A's account, price, active agreement, and publisher-attributed source → A signs in and sees profile/reporting only → A cannot author content or alter commercial configuration.
- Student buys an agreement-covered course/chapter → staff approves payment → A sees exactly one payable allocation calculated from final item price → settlement moves it to paid → approved refund creates a single compensating reversal and correct net result.
- Admin creates equivalent data for A and B → each publisher sees only its own covered targets, sales ledger, earnings, and question usage → referral partner is denied publisher-only reports.
- Publisher is suspended → active tokens and refresh sessions fail → reactivation allows a new session only → historical reports remain self-scoped and no data becomes visible to another partner.

## Definition of ready to execute

- [ ] Ledger reporting configuration and allow-list scenario are known for the environment.
- [ ] Synthetic A/B publisher, referral-partner, student, and administrator credentials are provisioned.
- [ ] Active/draft/ended agreements, pricing, source/question attribution, attempts, orders, allocations, settlement, and refund fixtures are available.
- [ ] Cairo timezone, test date boundaries, EGP minor-unit expectations, and agreement payout terms are recorded.
- [ ] The expected standard error envelope/status for validation and authorization cases is agreed.
- [ ] Evidence storage has a redaction procedure for cookies, tokens, learner data, payment proof, and signed URLs.
