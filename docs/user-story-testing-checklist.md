# User-story checklist for software testing

Use this checklist when writing user stories for the tester. It is a coverage guide, not a substitute for product requirements: only mark an item complete after confirming that the feature exists, its intended behaviour is agreed, and the story can be tested.

## How to write each story

- [ ] Give the story a stable ID, for example `STUDENT-CATALOG-001`.
- [ ] State the actor, goal, and user benefit: **As a _[role]_, I want _[action]_ so that _[outcome]_**.
- [ ] Link the source (screen, API endpoint, design, ticket, or product decision).
- [ ] Describe clear acceptance criteria using observable Given / When / Then statements.
- [ ] Include the happy path, input validation, empty state, loading state, and recoverable error state.
- [ ] State required setup: accounts, roles, permissions, published data, payment state, and test files.
- [ ] Identify data visibility rules: what must be visible, hidden, redacted, or downloadable.
- [ ] Identify authorization expectations for every affected role, including unauthenticated users.
- [ ] Include relevant boundary cases: duplicate data, invalid/missing fields, expired or suspended accounts, stale links/tokens, and concurrent or repeated submissions.
- [ ] Specify expected audit trail, notifications, calculations, exports, or integrations when applicable.
- [ ] Record priority, risk, dependencies, and test type (UI, API, integration, security, regression, accessibility, or performance).

## Common test criteria for every role

- [ ] Registration, sign-in, sign-out, session refresh, password change/reset, and expired-session behaviour.
- [ ] Profile read/update, validation, normalization (email/phone), and protection of immutable fields.
- [ ] Role-based access: permitted action succeeds; an unpermitted role receives a safe denial and no data leak.
- [ ] Suspended/deactivated user behaviour, including invalidation of existing sessions.
- [ ] Pagination, search, sorting, filters, empty results, and invalid query parameters where lists exist.
- [ ] Arabic/English or other supported localisation, time zone, currency, and mobile/responsive behaviour where applicable.
- [ ] Accessibility basics: keyboard path, focus order, labels, error announcements, contrast, and non-text alternatives.
- [ ] Security/privacy: no passwords, national IDs, payment details, storage keys, or another user's private data in UI, API, URLs, logs, or exports.
- [ ] Reliable retry behaviour: a double click, browser refresh, or API retry does not create duplicates or double-charge users.

## Public user (unauthenticated)

- [ ] Browse published academic grades, subjects, courses, chapters, and public content previews.
- [ ] Search, filter, paginate, and open public catalogue details.
- [ ] See accurate course availability, pricing, discounts/coupons where public, and locked/unlocked indicators.
- [ ] Register as a student with valid demographic and academic details.
- [ ] Receive useful validation for invalid, missing, duplicate, or malformed registration data without exposing existing-account details.
- [ ] Use a referral code or link, when available, and see a clear valid/invalid/expired/usage-limit outcome.
- [ ] Be blocked from student-only, parent-only, partner, admin, unpublished, and protected content.
- [ ] Verify public responses show only safe previews—not lesson bodies, answer keys, private assets, or internal storage information.

## Student

- [ ] Sign in and manage own profile, location, grade, parent phone, and password within allowed rules.
- [ ] Browse the catalogue personalized to the student's grade and see entitlement/access status correctly.
- [ ] View owned library items, course/chapter details, lesson outlines, and protected content only when entitled.
- [ ] Consume each supported item type: text, external link, PDF/document, video, image/asset, and any optional topics/concepts.
- [ ] Track learning progress/completion; verify persistence across refresh, device/session changes, and reordered content.
- [ ] Take practice/questions/assessments: start, answer, save/submit, time limits if any, results, explanations, and re-answer/review flow.
- [ ] Verify answer correctness, score, attempts, ranking/leaderboard, and performance analytics calculations.
- [ ] Buy a course or chapter through every supported payment path; apply coupons/referrals and see the final payable amount.
- [ ] Submit payment proof/manual payment when supported; view pending, approved, rejected, refunded, and entitlement outcomes.
- [ ] Ensure students cannot access another student's profile, library, assessment attempt, order, payment proof, or answer data by changing IDs/URLs.
- [ ] Verify access after course/content archive or entitlement changes follows the agreed retention policy.

## Parent

- [ ] Sign in using the supported child/parent verification details.
- [ ] See only children linked to the parent account, including correct active/suspended status.
- [ ] Select and switch the active child; all subsequent data/actions use that child only.
- [ ] View the selected child's allowed progress, performance, catalogue/library, purchases, and/or assessment information.
- [ ] Be denied access to unrelated children, including via direct IDs, altered requests, old sessions, or deep links.
- [ ] Handle a child profile's changed parent phone, suspension, reactivation, or removed association correctly.
- [ ] Verify sensitive child information is limited to the approved parent scope and is not exposed for other children.

## Referral partner

- [ ] Sign in, sign out, change password, and manage permitted partner profile fields.
- [ ] View only referral programs, codes, links, referred students/orders, allocations, and analytics belonging to that partner.
- [ ] Retrieve/copy referral links or codes and see code lifecycle status: draft, active, suspended, expired, depleted, or invalid.
- [ ] Verify attribution works through the expected registration/purchase journey and is not overwritten incorrectly.
- [ ] Verify commission/allocation calculations for percentage/fixed rules, discounts, refunds, cancellations, caps, and date ranges.
- [ ] View finance records, settlement status, balance, exports, and reconciliation outcomes where provided.
- [ ] Submit or view required payout information/proof only within approved permissions.
- [ ] Be unable to create/manage another partner's programs, view unrelated financial data, upload protected content, or perform admin actions.

## Content publisher partner

- [ ] Sign in and update permitted organisation/contact profile fields; protected partner type and administrative fields remain immutable.
- [ ] View own dashboard, published catalogue presence, learner/sales metrics, earnings, allocations, and agreement terms as applicable.
- [ ] Verify attribution and earnings are correct for owned/published content, sales, coupons, refunds, and settlement status.
- [ ] Access only their own analytics/finance records and not another publisher's data.
- [ ] Verify their permitted operations and restrictions explicitly: content/asset upload, content approval/publishing, pricing, and agreements as implemented.
- [ ] Be unable to access administrator endpoints, change platform academic hierarchy, manage users/partners, or access unrelated assets/content.

## Admin

- [ ] Sign in, manage own permitted profile/password, and follow forced-password-change flow when issued a temporary password.
- [ ] Manage student records: search/list/detail, suspend/reactivate, and verify effects on student and parent sessions/access.
- [ ] Create, edit, publish, archive, reorder, and search academic hierarchy: grades, subjects, courses, chapters, and content.
- [ ] Create and manage content items, assets, covers, documents, videos, links, and text; validate file type/size/upload failure and protected delivery.
- [ ] Manage question banks, questions, answer options, answers/explanations, review/approval, importing, and generated assessment configuration.
- [ ] Manage pricing, price inheritance/overrides, publisher agreements, campaigns, coupons, manual payments, payment proof review, refunds, and entitlements.
- [ ] Manage referral programs, rules, codes, fraud/review queues, allocations, settlements, exports, and reconciliation.
- [ ] View operational, learning, partner, financial, and leaderboard analytics with accurate scopes/filters.
- [ ] Manage testimonials and public presentation content: upload, publish/unpublish, order, and visibility.
- [ ] Confirm an admin cannot create/suspend/reset other admins, bootstrap a super admin, or perform any super-admin-only action.
- [ ] Confirm destructive/state-changing actions require the intended confirmation, version/concurrency protection, audit record, and safe error handling.

## Super admin

- [ ] Bootstrap/sign in securely; verify seed/default credentials are changed, protected, or unavailable in normal environments.
- [ ] Create, view, update, search, suspend/reactivate, and reset passwords for administrators.
- [ ] Verify a password reset revokes prior sessions, issues a temporary credential safely, and forces password change before normal work.
- [ ] Verify suspension immediately prevents login, refresh, and privileged actions; reactivation restores only intended access.
- [ ] View and operate only super-admin controls; ensure every other role is denied these operations.
- [ ] Confirm auditability for admin-account and high-impact configuration changes, including actor, timestamp, target, and before/after values where required.
- [ ] Confirm there is no unsafe last-super-admin lockout path, if the system supports changing super-admin accounts.

## Cross-role end-to-end stories

- [ ] Admin publishes academic structure/content → public user can discover only published previews → eligible student obtains entitlement → student consumes protected content.
- [ ] Student registration with parent details → parent signs in → parent sees/selects only linked children → student status change updates parent access.
- [ ] Admin creates referral partner/program/code → student uses code → order is approved → allocation is calculated → partner sees it → refund/reversal adjusts it → settlement/export reconciles it.
- [ ] Admin creates content/publisher agreement and pricing → content is sold → publisher analytics/earnings reflect the correct net result.
- [ ] Admin creates questions/assessment → student completes it → scores/explanations/performance/leaderboard update according to rules.
- [ ] Admin suspends a student, partner, or admin → all active sessions and relevant dependent access behave safely → reactivation is verified.
- [ ] Content is unpublished/archived/replaced → public visibility, student ownership/retention, assets, and analytics follow the agreed business rule.

## Definition of ready for a tester

- [ ] The role and exact permissions are known.
- [ ] Business rule, source of truth, and acceptance criteria are unambiguous.
- [ ] Required test data and external dependencies are available or mocked.
- [ ] Expected error messages/statuses and post-action state are defined.
- [ ] The story identifies affected roles and regression areas.
- [ ] The story is small enough to test and report independently; split it if it combines unrelated outcomes.

## Suggested story format

```md
### [ID] [Short title]

**Role:** Student
**Priority/Risk:** High — payment and entitlement
**Preconditions:** Published paid course; active student account; valid coupon.

**User story:** As a student, I want to pay for a course using a valid coupon so that I can access its protected lessons at the discounted price.

**Acceptance criteria:**
- Given an active student and a valid coupon, when the student checks out, then the displayed total includes the correct discount.
- Given approved payment, when the order completes, then the course entitlement is active and protected lessons open.
- Given an expired or ineligible coupon, when the student applies it, then checkout is not completed with that coupon and a clear error is shown.
- Given the payment request is retried, when the same transaction is submitted again, then no duplicate order, charge, or entitlement is created.

**Test data / notes:** [accounts, course ID, payment method, referral code]
**Related roles / regression:** Public user, admin, referral partner, content publisher partner
```
