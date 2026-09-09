# Referral partner user-story test report

**Status:** Ready for API testing; this report records implementation-backed test cases and does not claim they have been executed.

**Actor:** An active `PARTNER` account whose `PartnerProfile.partnerType` is `REFERRAL_PARTNER`. Partner type is a profile capability, not a separate login role.

**API base path:** `/api/v1`

**Implementation reviewed:** partner and shared authentication controllers/services, partner profile service, referral reporting service/controller, partner analytics allocation service/controller, commerce fulfilment/refund services, DTOs, schema, and Phase 5 journey. Reviewed 2026-09-10.

This is the implementation-backed test pack for the **Referral partner** section of [the user-story checklist](user-story-testing-checklist.md). It covers what this backend actually exposes to a referral partner. It intentionally does not turn admin-only programme, code, settlement, export, reconciliation, or fraud-review operations into partner capabilities.

## Test conventions

`REF_A_TOKEN` and `REF_B_TOKEN` are bearer access tokens for two active referral partners. `PUBLISHER_TOKEN` is an active `CONTENT_PUBLISHER` partner token. `ADMIN_TOKEN` is an administrator token used only to arrange data and perform the admin side of end-to-end checks. Use a fresh browser cookie jar for refresh/logout tests.

All protected user routes must reject an absent, malformed, expired, revoked, or wrong-role token with `401` or `403` as appropriate, without returning partner, learner, order, or ledger data. Assert the standard bilingual error envelope and `correlationId`, not only the English error text. Do not put bearer tokens, refresh cookies, student names, phones, national IDs, payment proof, or signed URLs into test evidence.

The referral and partner-ledger rollout switches are process-start configuration. Run enabled and disabled scenarios on separately configured/restarted disposable environments; do not infer either result from the other.

## Coverage and current product boundaries

| Checklist capability                                                                                                                   | Current backend support                                                                    | Coverage                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Partner email/password login, refresh, sign-out, session invalidation, and password change                                             | Yes                                                                                        | `REFERRAL-AUTH-001`                |
| Read and update own permitted profile fields                                                                                           | Yes: display name, legal name, phone only                                                  | `REFERRAL-PROFILE-001`             |
| Read own immutable allocation ledger                                                                                                   | Yes; any partner type may use this ledger route                                            | `REFERRAL-LEDGER-001`              |
| Read own privacy-safe conversion, sale, commission, trend, product, and category aggregates                                            | Yes, for `REFERRAL_PARTNER` only                                                           | `REFERRAL-REPORT-001`              |
| Read own privacy-safe settlement summaries                                                                                             | Yes, for `REFERRAL_PARTNER` only                                                           | `REFERRAL-SETTLEMENT-001`          |
| Referral attribution, commission calculation, retry safety, and refund reversal observed through the partner's results                 | Yes; the partner does not perform the underlying actions                                   | `REFERRAL-E2E-001`                 |
| Access isolation and denial of publisher/admin functions                                                                               | Yes; require cross-account execution                                                       | `REFERRAL-SECURITY-001`            |
| Partner self-service registration, password reset, changing email/partner type, account activation/suspension, or payout details/proof | No partner API                                                                             | Gap / admin or product decision    |
| View/copy referral programmes, codes, links, their lifecycle, referred learners, orders, review flags, or individual settlement rows   | No partner API; administration is admin-only and learner/order data is deliberately absent | Gap / intentional privacy boundary |
| Create/edit programmes, codes, rules, allocations, settlements, exports, finance reconciliation, content, or assets                    | No partner API; admin-only or not implemented                                              | Intentional restriction            |
| Partner-facing balance statement, downloadable export, notifications, audit-log view, UI loading/accessibility/localisation            | Not exposed/testable from this backend repository                                          | Gap / frontend or product scope    |

## Required test data

Create only synthetic data. Keep IDs and aliases, rather than personal data, in the run record.

| Alias                   | Required state                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REF_A`                 | Active `PARTNER` with `REFERRAL_PARTNER` profile, a known password, and two browser/device sessions. It owns `PROGRAM_A`.                                                                                                                                                                               |
| `REF_B`                 | Separate active referral partner with `PROGRAM_B`, referral attributions, allocations, and a settlement. It is the cross-partner privacy control.                                                                                                                                                       |
| `PUBLISHER_A`           | Active `CONTENT_PUBLISHER` partner. It proves partner type is checked: publisher-only analytics accept it and referral reporting rejects it.                                                                                                                                                            |
| `ADMIN_A`               | Active administrator able to create/suspend/reactivate partners, administer programmes/codes/rules, approve payment, settle allocations, and approve refunds.                                                                                                                                           |
| `PROGRAM_A` / `CODE_A`  | An active, time-valid programme and code owned by `REF_A`, with a current active commission rule. Also prepare draft, suspended, ended, not-yet-valid, expired, depleted, wrong-scope, and no-active-rule variants for the student/admin side of attribution checks.                                    |
| `RULE_*`                | Separate active rules for `PERCENTAGE`, `FIXED_PER_SALE`, and `PERCENTAGE_CAPPED`; use an amount that makes capping observable. Keep a replacement/newer rule to prove approved orders use the checkout snapshot, not later rule edits.                                                                 |
| `STUDENT_*`             | Distinct synthetic students: eligible referral users, a disallowed rollout user, and sufficient approved referred learners for a non-suppressed cohort. No learner identity should appear in partner responses.                                                                                         |
| `SELF_REFERRAL_CONTROL` | A focused service/integration fixture for the defensive self-referral check. Normal account creation makes a user either `STUDENT` or `PARTNER`, so this equality branch is not reachable through the ordinary public role model; record that limitation rather than fabricating an end-to-end account. |
| `ORDER_*`               | Referral-attributed orders in awaiting/submitted, approved, rejected/cancelled, and refunded states; include multiple items, final item prices after a coupon/promotion, an approval retry/webhook replay, and orders inside/outside chosen Cairo periods.                                              |
| `ALLOCATION_*`          | `REFERRAL_COMMISSION` rows for `REF_A` in `PAYABLE`, `PAID`, and refund-created reversal states, plus records for `REF_B`. Have enough settlement lines and approved distinct learners to exercise both visible and suppressed rows.                                                                    |
| `PERIOD_*`              | Dates around Cairo midnight, month boundaries, and a same-day range. Include a low approved-learner cohort below `REFERRAL_PARTNER_MINIMUM_COHORT` and a qualifying cohort at/above it.                                                                                                                 |

## User stories

### REFERRAL-AUTH-001 — Securely start, refresh, end, and replace a referral-partner session

**Priority/Risk:** Critical — account takeover and access to financial information

**Sources:** `POST /auth/partners/login`; `POST /auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/change-password`; `PartnerAuthController`, `SharedAuthController`, `AuthService`, `SessionService`, `UserAuthGuard`, and `AuthRateLimitService`.

**User story:** As a referral partner, I want to sign in and manage my sessions securely so that only I can view my organisation's permitted referral results.

**Acceptance criteria:**

- Given active `REF_A` and correct email/password, when `POST /auth/partners/login` is submitted with email case/whitespace variations, then it returns `201`, a `PARTNER` access token, the normalized login identifier, and an HttpOnly `refresh_token` cookie. It must not return a password hash, profile data beyond the documented user summary, or another partner's data.
- Given an unknown email, wrong password, non-partner account, suspended `REF_A`, or malformed/missing credentials, when login is attempted, then it returns the same safe `401 Invalid credentials` outcome. Given repeated bad attempts for the configured identifier/IP threshold, it returns `429`; a later permitted successful login clears the applicable failure state.
- Given a valid login refresh cookie, when `POST /auth/refresh` is called, then it returns `201`, rotates the cookie, and issues a usable replacement access token. A missing, expired, replayed/revoked, or wrong cookie returns `401` (or configured throttling `429`) without creating a session.
- Given a valid bearer token and its browser cookie, when `POST /auth/logout` is called, then it returns success, clears the cookie, revokes that session, and the same access token can no longer read `/partners/me`, allocations, or referral reports. Given two sessions, when `POST /auth/logout-all` is called from either session, then both are unusable.
- Given the correct old password and a new 8–128-character password, when `POST /auth/change-password` succeeds, then all sessions are revoked, the refresh cookie is cleared, and only the new password can create a new session. Wrong old password, missing/non-string values, and too-short/too-long new passwords fail without changing credentials. Exercise rate limiting without using shared/prod credentials.
- Given `ADMIN_A` suspends `REF_A`, when a previously issued access token, refresh cookie, or a fresh login is used, then no protected access is possible. After reactivation, a new successful login restores only the normal referral-partner capabilities; old revoked sessions remain invalid.

**Test type:** API, security, rate-limit, regression. **Dependencies:** Redis rate limiter, JWT/session configuration, cookie-aware client.

### REFERRAL-PROFILE-001 — View and maintain the permitted organisation profile

**Priority/Risk:** High — partner identity and ownership boundary

**Sources:** `GET|PATCH /partners/me`; `PartnersController`, `PartnersService.updateOwnProfile`, `UpdatePartnerDto`.

**User story:** As a referral partner, I want to view and update my permitted contact fields so that my organisation's referral account information remains current.

**Acceptance criteria:**

- Given `REF_A_TOKEN`, when `GET /partners/me` is called, then it returns only `REF_A`'s ID, status, login identifier, creation date, partner type, display name, legal name, and phone. `REF_B`'s fields, password/hash, session rows, creator/admin identity, programmes, allocations, and learner data are absent.
- Given valid optional `displayName`, `legalName`, and/or `phone` values, including `null` for nullable legal name/phone, when `PATCH /partners/me` is called, then it returns `200` with the persisted values and a subsequent `GET` agrees. Verify the server records `PARTNER_SELF_UPDATED` with the changed field names in the administrative audit trail.
- Given an empty update, an unknown field, or a non-string supplied field, when the patch is submitted, then DTO validation/business behaviour is returned safely and no unintended field changes. Record the observed empty-patch behaviour as a product decision if it is not specified by the API contract.
- Given attempts to send `id`, `loginIdentifier`, `email`, `role`, `status`, `partnerType`, `createdByAdminId`, password, allocation, settlement, or programme fields, then the request is rejected as unknown input or those immutable/admin-owned fields remain unchanged. No endpoint accepts another partner ID, so ownership is structural rather than client-selected.
- Given a student, publisher, admin, anonymous request, or revoked token, when it calls either endpoint, then it receives a safe denial and no `REF_A` profile data.

**Test type:** API, authorization, validation, audit. **Related regression:** admin partner management.

### REFERRAL-LEDGER-001 — Review only my immutable referral allocation entries

**Priority/Risk:** High — financial integrity and cross-partner privacy

**Sources:** `GET /partners/analytics/allocations`; `PartnerAnalyticsController.allocations`, `PartnerAnalyticsService.allocations`, `PartnerAllocation` schema.

**User story:** As a referral partner, I want to view my read-only allocation ledger so that I can understand the state of referral commissions without accessing learner or order records.

**Acceptance criteria:**

- Given ledger reporting is enabled for `REF_A` and `ALLOCATION_*` spans multiple states, when `GET /partners/analytics/allocations?from=...&to=...` is called, then it returns only rows whose `partnerUserId` is `REF_A` and whose `createdAt` is in the inclusive Cairo-date range. Rows are newest first by `createdAt`, then ID; an omitted range defaults to the current Cairo month.
- Given a returned row, then it exposes the documented immutable fields (`id`, kind, state, basis/amount minor units and money objects, currency, timestamps, and nullable publisher agreement ID) consistently. It must not expose `orderItemId`, order ID, referral code/rule snapshot, student ID/name/contact/national ID, payment proof, settlement ID/reference, or another partner's data.
- Given `PAYABLE`, `PAID`, original `REVERSED`, and negative compensating refund rows, when the list is read, then state, signed money, `paidAt`, and `reversedAt` reflect the ledger. The client must not infer payment from a row merely existing or calculate a balance from only one page.
- Given `page`/`limit` values across a final and empty page, then `data` and `meta` (`page`, `limit`, `total`, `totalPages`) are accurate and non-overlapping. `page < 1`, fractional/non-numeric values, or `limit` outside 1–100 returns `400` without data leakage. Invalid date text or an inverted range also returns `400`.
- Given `REF_B` allocations, ID substitution, a `PUBLISHER_TOKEN`, and non-partner/anonymous tokens, then `REF_A` never sees `REF_B` rows; the route scopes by the authenticated user and does not accept a partner ID. A valid publisher may use this generic own-ledger route but must only receive its own rows.
- Given partner-ledger reporting is disabled or `REF_A` is excluded by the rollout allow-list, when the route is requested, then it returns `409 Partner ledger reporting is disabled by rollout control`, not a misleading empty ledger.

**Test type:** API, authorization, finance-display, pagination, rollout regression.

### REFERRAL-REPORT-001 — View privacy-safe referral conversion and commission aggregates

**Priority/Risk:** Critical — learner privacy and commission reporting

**Sources:** `GET /partners/referrals/report`; `PartnerReferralReportingController.report`, `ReferralReportingService.report`; `ReferralReportingQueryDto`.

**User story:** As a referral partner, I want aggregate conversion and commission reporting for my referrals so that I can assess programme results without receiving learner-level data.

**Acceptance criteria:**

- Given ledger reporting is enabled, `REF_A` is a referral partner, and the selected Cairo period has at least `REFERRAL_PARTNER_MINIMUM_COHORT` distinct learners with approved referred orders, when the report is read, then it returns `200` with the selected/default period, `Africa/Cairo`, privacy metadata, conversion count, approved-order/learner/amount totals, commission states, and permitted day/month trends, products, and categories.
- Given attributions created in the range but not approved, approved orders whose `approvedAt` is in the range, and records outside the range, then `conversions` counts the in-range captured attributions while approved sales uses in-range order approval. Approved sales amount is the sum of final `OrderItem.priceMinor` values, not catalogue price, and commission states group immutable `REFERRAL_COMMISSION` allocation rows created in the range by current state/currency.
- Given a report period whose approved referred-learner cohort is below the configured minimum, when the report is read, then it returns the suppression response with `privacy.suppressed: true`, reason, and metric definitions only. It must not expose a zero disguised as a suppressed result, totals, trends, product/category breakdowns, allocation rows, or any learner identity.
- Given a qualifying total cohort but a trend, product, or category group below the threshold, when the report is read, then that small breakdown is omitted while the response says that small breakdowns are suppressed. Test thresholds exactly one below and exactly at the configured value.
- Given `from`, `to`, and `granularity=day|month`, then dates are interpreted as inclusive Cairo calendar dates and output bucket labels agree with Cairo boundaries. A same-day range is valid; invalid date strings, an end before the start, unsupported granularity, or unknown query fields return `400`. When granularity is omitted, the backend chooses day for periods of 93 days or less and month for longer periods.
- Given `REF_B`, a content publisher, student/admin, or unauthenticated token, when the route is called, then only `REF_A` can receive its own report. `PUBLISHER_A` receives `403` because it is not a referral partner; an admin uses the separate admin reporting route and is not a substitute for partner access.
- Given ledger reporting is disabled or `REF_A` is not allow-listed, then the route returns `409`, which is a feature-unavailable state rather than an empty/suppressed report.

**Test type:** API, privacy/security, calculation, date/time-zone, rollout regression. **Dependencies:** feature configuration and sufficiently large synthetic cohort.

### REFERRAL-SETTLEMENT-001 — View privacy-safe settlement summaries for referral commissions

**Priority/Risk:** High — payment-status integrity and privacy

**Sources:** `GET /partners/referrals/settlements`; `PartnerReferralReportingController.settlements`, `ReferralReportingService.partnerSettlements`, `PartnerSettlement`/`PartnerSettlementLine` schema.

**User story:** As a referral partner, I want to view safe summaries of my referral settlements so that I can see whether eligible commission groups have been paid without seeing order-level finance data.

**Acceptance criteria:**

- Given `REF_A` has settlements created in and outside the selected Cairo period, with lines for referral commissions and any other allocation kind, when the endpoint is called, then it returns only `REF_A` settlements created in range that contain referral-commission lines. Each visible row contains only `createdAt`, `paidAt`, currency, signed `totalMinor`, and referral allocation count; total excludes non-referral lines.
- Given a settlement has fewer referral-commission lines than `REFERRAL_PARTNER_MINIMUM_COHORT`, then the row is omitted. A qualifying line count is returned even when other settlement lines exist. An empty `data` array must be presented as either no visible settlements or privacy-limited data according to the accompanying privacy metadata—not assumed to mean zero earnings.
- Given paid and unpaid settlements plus a refund-created negative allocation, when rows are read, then `paidAt` reflects the admin mark-paid action and the total is the sum of returned referral allocation amounts. The partner cannot mutate payment state, create a settlement, or retrieve payment reference/order/learner/allocation IDs through this endpoint.
- Given invalid/inverted date inputs, unsupported granularity, disabled/not-allow-listed ledger reporting, a publisher token, `REF_B_TOKEN`, or no/invalid token, then validation, `409`, `403`, or `401` occurs safely and no other settlement data appears.

**Test type:** API, privacy/security, finance calculation, date/time-zone. **Dependencies:** admin-created settlements and rollout configuration.

### REFERRAL-E2E-001 — Reliably reflect referral attribution, approved-sale commission, and refund reversal

**Priority/Risk:** Critical — attribution, money, retry safety, and downstream reporting

**Sources:** student price preview/checkout endpoints; `CommerceService.resolveReferral`; `FulfilmentService.fulfil`; refund approval in `RefundsService.approve`; the three partner read endpoints above.

**User story:** As a referral partner, I want valid referred sales, reversals, and settlement status to be reflected accurately in my own reports so that the results represent approved business events rather than duplicate or stale calculations.

**Acceptance criteria:**

- Given `ADMIN_A` creates an active programme/code/current rule for `REF_A` and a rollout-allowed student submits the code at price preview/checkout, when the code is valid for the target and the student is not the referring partner, then checkout captures an immutable attribution snapshot. It is rejected before checkout for disabled rollout, inactive/suspended/expired/not-yet-valid/ended code or programme, missing active rule, mismatched scope, exhausted programme/code/per-student limit, and configured fraud block. Verify the defensive self-referral rejection with `SELF_REFERRAL_CONTROL`; it is not reachable via normal public account creation because roles are mutually exclusive.
- Given an attributed order with multiple order items is approved, when fulfilment completes, then exactly one `REFERRAL_COMMISSION` allocation per eligible item is created for `REF_A`, based on each final immutable item price. A percentage uses `floor(priceMinor × percentageBps / 10,000)`; a fixed rule uses its fixed minor-unit amount; a capped rule uses the lower of percentage result and cap. An amount of zero or above the item price is not created. Later changes to the live rule do not rewrite the checkout snapshot/result.
- Given manual approval is retried or a payment webhook is delivered again, when fulfilment is repeated, then status claim/idempotency leaves one allocation per eligible order item and one attribution effect. Verify `REF_A`'s ledger and report do not double count it.
- Given an admin creates a settlement from `REF_A`'s payable rows and marks it paid, then the partner can only observe the resulting appropriate ledger state/timestamps and privacy-safe settlement summary. Attempts by `REF_A` to call `/admin/partner-finance/settlements` or `mark-paid` are denied.
- Given an approved refund for an order item with a referral allocation, when the refund is approved once, then the original allocation becomes `REVERSED` and one linked compensating negative referral allocation is created; the original is retained. A repeated/refused terminal refund action does not create another reversal. Partner ledger/report/settlement read models show the resulting signed/state changes only within their documented date rules.
- Given an attribution/allocation belongs to `REF_B`, when `REF_A` reads every partner route before and after the above lifecycle, then no name, identifier, code, order, item, payment, or financial result from `REF_B` is visible.

**Test type:** End-to-end API, integration, calculation, concurrency/retry, privacy. **Dependencies:** feature-enabled disposable environment, checkout/payment approval fixture, refund administration.

### REFERRAL-SECURITY-001 — Remain confined to referral-partner capabilities

**Priority/Risk:** Critical — least privilege and financial/privacy boundary

**Sources:** `RolesGuard`, `UserAuthGuard`, partner/referral controllers, admin referral/finance/report/export controllers, and `PartnerAnalyticsService` type checks.

**User story:** As the platform, I want a referral partner confined to its own allowed data and read operations so that it cannot administer the platform, alter finance, publish content, or identify learners.

**Acceptance criteria:**

- Given `REF_A_TOKEN`, when all admin referral programme/code/rule/review-flag routes, admin partner management, partner finance/settlement/reconciliation routes, report export routes, student administration, content authoring, asset upload, and academic hierarchy routes are attempted, then each is denied (`403` after valid authentication) and no state changes or privileged response body result.
- Given `REF_A_TOKEN`, when publisher-only `/partners/dashboard`, `/partners/analytics/earnings`, content, and question-usage routes are attempted, then each returns `403`. Conversely, `PUBLISHER_A` cannot use the referral report or referral settlement endpoints.
- Given requests try query/body/path ID substitution, guessed allocation IDs, referral code/programme IDs, repeated/unknown fields, or an `X-Forwarded` identity/header trick, then the server derives ownership from the authenticated session and returns only permitted data or a safe denial. The partner routes do not accept a target partner ID.
- Given every successful partner self-update and every relevant admin-side programme/allocation/settlement/refund action in the end-to-end fixture, then the administrative audit trail records the actor/action/target as implemented. The referral partner itself has no audit-log viewing endpoint and must not receive audit metadata beyond documented result fields.
- Given expired/revoked/suspended sessions and role/type changes made by an administrator, when old deep links or API requests are retried, then they fail safely with no cached protected data. Verify browser/UI handling separately for loading, localisation, keyboard/accessibility, and stale-result clearing because this backend does not expose a frontend.

**Test type:** API, authorization, IDOR, privacy, regression. **Related roles:** content publisher, student, admin, super admin.

## Tester handoff notes

- Money is integer EGP minor units. Render `12550` as EGP 125.50 only in the client; use integers in assertions and never use floating-point commission calculations.
- The partner-facing report is not a list of referred students or orders. Cohort suppression is a privacy feature; omitted results must not be reconstructed from another endpoint or interpreted as a definitive zero.
- Referral partners cannot obtain or copy their codes/links through any partner route. Arrange those data through `ADMIN_A`, then test the partner's downstream read-only view.
- Feature-disabled (`409`), empty, suppressed, unauthorized, and forbidden are distinct outcomes. Keep them distinct in test evidence and UI acceptance tests.
- The existing Phase 5 partner operations journey exercises a small cohort suppression path. Add a qualifying-cohort fixture for the non-suppressed report and visible settlement-row paths; neither should use real learners.
