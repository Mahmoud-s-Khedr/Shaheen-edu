# Administrator user-story test report

**Status:** Ready for API testing. This is an implementation-backed test pack; it describes the backend that exists and does not claim the scenarios have been run.

**Actor:** An active `ADMIN` account. Most routes below also accept `SUPER_ADMIN`, but this report tests the normal administrator boundary and explicitly checks that an administrator cannot use super-admin account administration.

**API base path:** `/api/v1`

**Implementation reviewed:** admin/shared authentication, students, academic hierarchy, content, assets/video, question banks, assessments/AI, commerce/refunds, entitlements, partners, publisher agreements/pricing, referrals, partner finance, reports, testimonials, DTOs, services, schema, and the related journey/e2e tests. Reviewed 2026-09-10.

This report turns the **Admin** section of [the user-story checklist](user-story-testing-checklist.md) into independently testable backend stories. A route is only claimed where it is exposed by this backend; browser layout, loading states, responsive behaviour, and accessibility require the consuming frontend to be tested separately.

## Test conventions

`ADMIN_A_TOKEN` is a normal active administrator token; `ADMIN_B_TOKEN` is a second administrator used for export ownership checks. `SUPER_ADMIN_TOKEN`, `STUDENT_A_TOKEN`, `PARENT_TOKEN`, `REFERRAL_TOKEN`, and `PUBLISHER_TOKEN` are wrong-role controls. Use separate cookie jars for every login/session scenario.

Use synthetic accounts, labels, receipts, answers, and files. Do not retain bearer tokens, refresh cookies, temporary passwords, student names, phone numbers, national-ID fragments, raw answers, payment-proof contents, or signed URLs in evidence. For every protected endpoint, assert `401` for missing/invalid/revoked authentication and `403` for an authenticated wrong role, with the standard bilingual error envelope and `correlationId`; do not assert only the English message.

Unless a more specific criterion says otherwise, test list endpoints for valid search/filter/sort/page/limit boundaries, final and empty pages, malformed/unknown query values, and stable ordering. Test state changes twice and with a stale version where the DTO requires `version`; expected safe outcomes are normally `400` (validation), `404` (missing resource), or `409` (duplicate/invalid transition/concurrency conflict). Verify successful high-impact writes create the documented `AdminAuditLog` event by database fixture/query or the relevant Student 360 audit view—there is no generic audit-log listing endpoint for a normal administrator.

## Coverage and current product boundaries

| Checklist capability | Current backend support | Coverage |
| --- | --- | --- |
| Administrator login, refresh, logout, logout-all, own password change, session revocation, temporary-password enforcement | Yes | `ADMIN-AUTH-001` |
| Student search/detail, audited Student 360, suspend/reactivate, soft delete, password reset | Yes | `ADMIN-STUDENTS-001` |
| Create/manage/publish/archive/reorder grade through section hierarchy | Yes | `ADMIN-HIERARCHY-001` |
| Create/manage/reorder/publish/archive content and restricted access | Yes | `ADMIN-CONTENT-001` |
| Direct asset upload authorization/completion, covers, attachments, protected access, and Bunny Stream video lifecycle | Yes | `ADMIN-ASSETS-001` |
| Question sources/banks/contexts/questions/options/assets/video link; review states | Yes | `ADMIN-QUESTIONS-001` |
| AI question import, media mapping/retry, candidate accept/reject, answer/explanation runs; student-report and written-answer moderation | Yes | `ADMIN-AI-001` |
| Generate/manage assessments and review assessment operations | Yes | `ADMIN-ASSESSMENTS-001` |
| Manual payment methods/proofs, campaigns, coupons, approval and entitlement result | Yes | `ADMIN-COMMERCE-001` |
| Versioned refund policy and manual approval/rejection | Yes | `ADMIN-REFUNDS-001` |
| Partner accounts, publisher agreements, price overrides, manual entitlements | Yes | `ADMIN-PARTNERS-001` |
| Referral programmes/codes/rules and fraud/review queue | Yes | `ADMIN-REFERRALS-001` |
| Partner allocations, settlements, usage-rollup rebuild, and reconciliation workflow | Yes | `ADMIN-FINANCE-001` |
| Aggregate commerce/learning-adjacent operational reports and secure CSV exports | Yes; no generic dashboard endpoint | `ADMIN-REPORTS-001` |
| Testimonial CRUD, publish state, ordering, screenshot access | Yes | `ADMIN-TESTIMONIALS-001` |
| Create/suspend/reset another administrator or bootstrap a super admin | No for `ADMIN`; intentionally `SUPER_ADMIN` only | `ADMIN-BOUNDARY-001` |
| Generic audit-log browser, notification centre, bulk content import other than AI question import, generic operational/learning/leaderboard dashboard, or frontend UI/accessibility/localisation | Not exposed as admin APIs in this repository | Product/frontend gap |

## Required test data

| Alias | Required state |
| --- | --- |
| `ADMIN_A` / `ADMIN_B` | Two active normal administrators with known passwords. Give A two sessions; B owns a report-export job. |
| `SUPER_ADMIN_A` | Active super admin, solely for proving `/admin/admins` remains inaccessible to `ADMIN_A`. |
| `STUDENT_A` / `STUDENT_B` | Active students; A has parent access, orders, entitlements, attempts, audit events, and two sessions. B is the privacy/isolation control. Also prepare suspended and disabled variants. |
| `HIERARCHY_*` | Draft and published grade → subject → course → chapter → lesson → section chain, sibling collections for reorder, cross-parent move targets, stale versions, and a child-bearing draft deletion control. |
| `CONTENT_*` / `ASSET_*` / `VIDEO_*` | Each supported content type, attachment/primary asset/cover, a valid small file, disallowed type/oversized file, failed/incomplete upload, and a Bunny video in created/uploading/ready/failed/archived states. |
| `SOURCE_*` / `BANK_*` / `QUESTION_*` | Draft/published/archived sources and banks; questions in draft/submitted/published/rejected/archived states; options, rich content blocks, linked assets/video, and student reports/written answers. |
| `ASSESSMENT_*` | Draft standard/custom/published/archived assessments, sufficient eligible frozen questions, invalid selection and timer fixtures, submitted pending-written answer, and a stale/invalid state fixture. |
| `ORDER_*` / `PAYMENT_*` / `REFUND_*` | Student cart/orders, an idempotent checkout key, pending/approved/rejected manual proofs, valid/invalid payment methods, coupon/campaign combinations, Paymob callback fixture, and eligible/ineligible refund requests. |
| `PARTNER_*` / `AGREEMENT_*` / `ALLOCATION_*` | Referral and publisher partners; draft/current/future/ended agreements; course/chapter/lesson price overrides; payable/paid/reversed allocations; settlement and reconciliation discrepancy fixtures. |
| `PROGRAM_*` / `CODE_*` / `RULE_*` | Draft/active/suspended/ended referral programmes; active/inactive/depleted codes; commission and review rules; open/assigned/resolved flags and notes. |
| `EXPORT_*` / `TESTIMONIAL_*` | Aggregate report data across Cairo date boundaries, export jobs in queued/processing/completed/failed/expired states, and draft/published/unpublished/archived testimonials with screenshots. |

## User stories

### ADMIN-AUTH-001 — Securely operate an administrator session

**Priority/Risk:** Critical — privileged account takeover.

**Sources:** `POST /auth/admins/login`; `GET /auth/me`; `POST /auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/change-password`; `AdminAuthController`, `SharedAuthController`, `AuthService`, `SessionService`, and `AuthRateLimitService`.

**User story:** As an administrator, I want to securely sign in and manage my sessions and password so that only I can perform platform operations.

**Acceptance criteria:**

- Given active `ADMIN_A` and correct credentials with email case/whitespace variations, when `POST /auth/admins/login` is called, then it returns `201`, an `ADMIN` access token, normalized login identifier, and an HttpOnly `refresh_token` cookie—not a hash, other-admin data, or private profile data.
- Given an unknown email, wrong password, student/partner credentials, a suspended account, or malformed fields, when login is attempted, then the outcome is the same safe `401 Invalid credentials`. Repeated failures reach configured `429` throttling; a later successful permitted login clears the applicable failure state.
- Given a valid refresh cookie, when refresh is called, then it rotates the cookie and returns a usable replacement token. Missing, expired, replayed, revoked, or wrong-session cookies fail safely without minting a session.
- Given a current bearer and cookie, when logout is called, then that session/cookie is unusable. Given two sessions, when logout-all or a successful password change occurs, then both sessions are revoked and only the new 8–128-character password works. Wrong old password and invalid new-password input do not change credentials.
- Given a temporary password from an authorised reset flow, when `ADMIN_A` first accesses normal privileged routes, then the forced-password-change guard permits only the intended password-change/session endpoints until it is changed. Verify no bypass through refresh, direct deep link, or stale token.
- Given suspension or revocation, when old bearer tokens, refresh cookies, and a fresh login are tried, then access fails. A later reactivation permits a new login only; it must not resurrect old sessions.

**Test type:** API, security, rate-limit, regression. **Dependencies:** JWT/session configuration, Redis throttling, cookie-aware client.

### ADMIN-STUDENTS-001 — Safely investigate and administer student accounts

**Priority/Risk:** Critical — student privacy, account recovery, and parental access.

**Sources:** `GET /admin/students`, `/:id`, `/:id/360`, `/:id/360/orders`, `/:id/360/entitlements`, `/:id/360/assessments`, `/:id/360/audit-events`; `POST /:id/suspend`, `/:id/reactivate`, `/:id/reset-password`; `DELETE /:id`; `AdminStudentsController`, `StudentsService`, `PrivacyPolicy`.

**User story:** As an administrator, I want to find a student and perform support actions with audited, minimised visibility so that I can resolve account and access issues safely.

**Acceptance criteria:**

- Given matching and nonmatching synthetic students, when the list/detail routes use their documented filters, pagination, and search, then only student records appear with stable pagination. A non-student or nonexistent ID returns `404`, and no password hash, session token, full national ID, parent secret, or another role’s record is exposed.
- Given `STUDENT_A`, when Student 360 is requested with allowed `sections` and a required policy reason where applicable, then summary/order/entitlement/performance/audit responses are scoped to A. The summary reveals only the stored national-ID last four digits; paged subresources return only their named section. Missing/invalid sections or insufficient/too-long reason are safely rejected according to the privacy policy.
- Given B’s ID substituted into every 360 route, then the returned data is B’s only after A’s explicit target selection and separate audit; it never leaks A’s data. Confirm each 360 read emits its `STUDENT_360_*_VIEWED` audit event with actor, target, requested section/page, and reason when supplied.
- Given active or suspended A, when suspension is posted, then status becomes `SUSPENDED`, all A auth sessions and parent sessions whose active child is A are revoked, and new login/refresh/protected reads fail. Repeating an already-final transition, targeting a disabled student, or racing two changes returns `409` safely. Reactivation works only from suspended and requires a new login.
- Given active A, when password reset succeeds, then it returns a one-time temporary password only to the authorised caller, sets `mustChangePassword`, revokes sessions, and audits `STUDENT_PASSWORD_RESET`. Resetting suspended/disabled A fails without credential change. Do not persist the temporary password in test evidence.
- Given a nonblank deletion reason, when delete succeeds, then A becomes `DISABLED`, is soft-deleted with actor/reason audit metadata, and all student/parent sessions are revoked. Missing/blank reason, repeated delete, and post-delete suspend/reactivate/reset fail safely; records remain available only according to the documented retention model.

**Test type:** API, privacy, authorization, lifecycle, audit, regression.

### ADMIN-HIERARCHY-001 — Build and control the academic hierarchy

**Priority/Risk:** High — catalogue integrity and downstream learner visibility.

**Sources:** `/admin/academic-grades`, `/admin/subjects`, `/admin/courses`, `/admin/chapters`, `/admin/lessons`, `/admin/sections` (create/list/get/patch/reorder/move/publish/archive/restore/delete); respective controllers/services and hierarchy DTOs.

**User story:** As an administrator, I want to manage the ordered grade-to-section hierarchy so that educational content has a valid, publishable structure.

**Acceptance criteria:**

- Given a valid parent at each level, when a title/optional supported metadata is created, then the child is attached to the stated immediate parent in draft state, has a unique appropriate slug/order/version, and appears in the admin list/detail only at that location. Missing, archived/wrong-type parent, duplicate slug, empty/overlong text, unknown fields, and invalid IDs fail without a partial child.
- Given an item and its current `version`, when patch, move, reorder, publish, archive, restore, or deletion is requested, then its returned version/state/order persists and an audit event identifies actor, target, and action. A stale version or simultaneous update yields `409` rather than overwriting the other change.
- Given a sibling group, when reorder is called with the complete valid sibling ID/version set, then every sibling gets the requested order exactly once. Missing/duplicate/foreign IDs, a partial list, stale version, or repeat retry changes no order.
- Given a valid cross-parent target and current version, when move is called, then the item changes only its permitted parent and gets a consistent destination order; invalid parent level, self/cyclic move, archived target, and stale/duplicate retry fail safely.
- Given the required hierarchy is publishable, when each item is published in order, then it becomes available only through the public/student routes that honour publication/access rules. Attempt to publish an incomplete/invalid ancestor chain, archive a needed parent, delete a non-eligible or child-bearing record, and restore from an invalid state; verify the documented `409`/safe state result and no orphaned catalogue records.

**Test type:** API, data integrity, concurrency, audit, public/student regression.

### ADMIN-CONTENT-001 — Author, place, and protect learning content

**Priority/Risk:** Critical — protected educational material and content integrity.

**Sources:** `POST|GET /admin/content-items`, `GET|PATCH|DELETE /admin/content-items/:id`, `PUT /:id/video-outline`, `PATCH /:id/access`, `POST /reorder`, `/:id/move`, `/:id/publish`, `/:id/archive`, `/:id/restore`, `/:id/primary-asset`, `/:id/attachments`, `/:id/attachments/reorder`, `DELETE /:id/attachments/:assetId`; `ContentItemsService`.

**User story:** As an administrator, I want to create and organise valid protected learning items so that entitled learners receive the right content in the right order.

**Acceptance criteria:**

- Given each supported type (text, link, document/image asset, video, and configured rich blocks), when a content item is created at exactly one allowed placement, then type-valid body/asset/video fields are persisted with item and placement IDs/versions. Missing or multiple placement targets, incompatible body/type, invalid URL, unpublished/archived dependency, or unknown field returns `400`/`409` without a partial item.
- Given current item/placement versions, when title/body/access/video outline/placement is updated, moved, or reordered, then current values and versions agree on reread. Exercise stale versions, foreign siblings, duplicate/missing reorder IDs, and retry safety.
- Given a restricted item, when its access policy is changed/published, then an entitled active student can use the corresponding student content/asset route and an anonymous, wrong-grade, unentitled, suspended, or revoked student cannot. Publishing must not disclose raw storage keys or protected asset/video URLs.
- Given primary asset and attachment changes, then only completed/non-archived compatible assets attach; attachment ordering is complete and stable; duplicate attachment, primary-as-invalid attachment, foreign asset, stale version, and removal of absent attachment are safe. Archive/restore/delete obeys lifecycle and dependency rules and records the associated audit events.

**Test type:** API, authorization, validation, content-delivery integration, concurrency, audit.

### ADMIN-ASSETS-001 — Deliver assets and video through controlled upload workflows

**Priority/Risk:** Critical — arbitrary upload and protected-media exposure.

**Sources:** `POST /admin/assets/upload`, `/:id/complete`, `GET /admin/assets`, `/:id`, `/:id/access`, `/:id/archive`, `DELETE /:id`, `POST|DELETE /admin/assets/covers/:resource/:id`; `POST|GET /admin/video-assets/:id`, `/:id/playback`, `/:id/upload-authorization`, `/:id/upload-confirmation`, `/:id/retry`, `/:id/archive`, `DELETE /:id`; `AssetsService`, `VideosService`, Bunny webhook integration.

**User story:** As an administrator, I want to upload and manage educational assets and videos through secure, recoverable workflows so that only completed approved media can be delivered.

**Acceptance criteria:**

- Given a valid file metadata request, when upload is authorised, then it returns a short-lived direct-upload instruction for a private generated key and an asset in the expected pending state. Invalid filename/MIME/size, unsupported type, malformed checksum, oversized input, and repeated completion are rejected without accepting content or exposing arbitrary storage paths.
- Given a successful direct upload, when completion is confirmed, then server-side metadata/state is verified before the asset is usable. Failed/missing/expired upload, object mismatch, archived/deleted asset, or an upload-service error leaves no falsely completed/deliverable asset; test retry and cleanup behaviour.
- Given a completed asset, when admin access or a student entitlement-specific access route is requested, then signed URLs expire and are scoped to the authorised resource. Verify missing/wrong role/unentitled student gets no URL, and returned data never reveals permanent keys, credentials, or another asset’s URL.
- Given a resource with a compatible completed image, when cover is set/replaced/removed, then only that resource’s cover changes. Invalid resource type/ID, incompatible or foreign asset, and archive/delete while referenced follow safe dependency rules.
- Given a video asset, when create → upload authorization → upload confirmation → provider-ready webhook completes, then only `READY` video receives admin playback and can be linked to valid content. Test failed processing, unsigned/bad/replayed webhook, retry, archive/delete, and provider outage; no public/learner access is issued before entitlement and readiness checks.

**Test type:** API, integration, security, file validation, recovery, audit.

### ADMIN-QUESTIONS-001 — Govern question sources, banks, questions, and answer content

**Priority/Risk:** Critical — assessment correctness and answer-key protection.

**Sources:** `/admin/question-banks/sources`, `/admin/question-banks`, `/admin/questions/contexts`, `/admin/questions` and their item/options/assets/video-link/reorder/state routes; `QuestionBanksController`, `QuestionsController`, services and DTOs.

**User story:** As an administrator, I want to create and review structured question material so that published assessments use valid, traceable questions.

**Acceptance criteria:**

- Given a source, bank, and optional shared context with valid hierarchy/publisher attribution, when each is created/updated/published/archived/restored/deleted, then its lifecycle and relationships persist, are paginatable/searchable where exposed, and obey draft/dependency/delete restrictions. Verify status transitions and audit events, including duplicate/stale/invalid-state attempts.
- Given a valid question payload, when a question, options, rich content blocks, linked assets, or a video link are created/updated/reordered, then there is a deterministic order and exactly the permitted shape for the question type. Reject duplicate/invalid option IDs, malformed answer configuration, incompatible answer type, missing correct answer, foreign/archived asset, and unsupported content blocks without corrupting the question.
- Given a question lifecycle, when submit, publish, reject, archive, or delete is invoked, then only valid state transitions succeed. Published/frozen questions retain the expected immutable assessment snapshot behaviour; a later edit/delete must not silently change a started/submitted learner attempt.
- Given an admin question detail, then correct answers/explanations are visible to the authorised administrator only. Given a student/public/parent/partner token or no token, then admin sources/banks/questions and their correct answers, private media, prompt text, and source material are denied.

**Test type:** API, validation, authorization, data integrity, assessment regression, audit.

### ADMIN-AI-001 — Review AI-assisted imports, explanations, and learner moderation work

**Priority/Risk:** High — generated-content quality, privacy, and retried asynchronous work.

**Sources:** `/admin/ai/question-imports` (create/list/detail/source text/media/retry/item accept/reject); `/admin/questions/:questionId/ai/re-answer` (run/list/get/apply/reject); `/admin/assessments/grading/pending`, `/grading/answers/:answerId/retry-ai`, `/question-reports`, `/question-reports/:reportId/review`; AI import/explanation and assessment services.

**User story:** As an administrator, I want to inspect, correct, accept, reject, and retry AI-assisted question work so that generated material becomes controlled published content rather than automatic truth.

**Acceptance criteria:**

- Given a permitted import source and target settings, when an import is created, then it has a traceable queued/processing/result lifecycle. List/detail/source-text/items/media routes show only the selected import; invalid source, target, option, or another import ID does not create/cross-link work.
- Given a failed import, chunk/page/child/item, or media mapping, when the matching retry/patch route is used, then only that retryable unit is reset/requeued and duplicate requests do not create duplicate questions/assets. Provider/queue failure becomes an observable safe error/status, not a completed-looking result.
- Given generated candidate items, when accept is posted, then one valid reviewed question is created/linked exactly once; when reject is posted, it cannot enter the bank. Test incompatible media, malformed candidate, repeated accept/reject, stale import state, and review audit metadata.
- Given a question explanation/re-answer run, when run results are read then apply/reject is called, then only an explicit apply changes the question/explanation and a rejected run leaves it unchanged. Repeat apply/reject and wrong-question/run substitutions must fail safely with a full audit trail.
- Given pending written answers and student question reports, when the admin lists and retries/reviews them, then state/assignee/review result persists and raw learner answers are disclosed only at the minimum route scope needed for moderation. Wrong role, anonymous use, invalid review transition, and AI-provider failure must not disclose another learner’s work or mutate grading twice.

**Test type:** API, asynchronous integration, idempotency, moderation/privacy, audit.

### ADMIN-ASSESSMENTS-001 — Configure and operate secure assessments

**Priority/Risk:** Critical — scoring, answer security, and learner fairness.

**Sources:** `POST /admin/assessments/standard`, `/custom`; `GET|PATCH|DELETE /admin/assessments/:id`; `GET /admin/assessments`, `POST /:id/publish`, `/:id/archive`; `AdminAssessmentsController`, `AssessmentsService`.

**User story:** As an administrator, I want to build, publish, and retire assessments from approved questions so that learners receive valid assessments with consistent rules.

**Acceptance criteria:**

- Given enough eligible published questions and valid scope, when a standard assessment is generated, then the random sample meets requested counts/rules without duplicate/ineligible questions. Insufficient pool, incompatible filters, invalid mode/timer/marks, and retry do not yield a partial or different duplicate assessment.
- Given a deliberate valid question selection, when a custom assessment is created, then only selected allowed question snapshots appear in detail. Empty, duplicate, foreign, archived, unpublished, or wrong-scope question IDs are rejected.
- Given a draft and required current version, when title/mode/timer/settings are patched, then persisted detail agrees and stale/invalid edits return `409`/`400`. A published assessment cannot be modified or deleted through the draft-only path; deletion is limited to never-published eligible drafts.
- Given a valid completed draft, when publish succeeds, then the student-facing assessment route exposes it only to eligible entitled/current-grade learners and never leaks correct answers, unpublished questions, other students’ attempts, or admin-only generation configuration. Archive removes future availability according to service rules without corrupting historical attempts/results.
- Given list filters/page bounds and state transitions, then list counts/order are accurate, publish/archive retry is idempotently safe or conflicts explicitly, and each privileged write is auditable.

**Test type:** API, assessment integrity, authorization, concurrency, student regression, audit.

### ADMIN-COMMERCE-001 — Control manual payments, promotions, and fulfilment safely

**Priority/Risk:** Critical — money, entitlement, and payment-proof privacy.

**Sources:** `/admin/manual-payment-methods`, `/admin/payment-submissions`, `/admin/discount-campaigns`, `/admin/coupons`; `ManualPaymentAdminController`, `CommerceService`, fulfilment and Paymob webhook services.

**User story:** As an administrator, I want to administer payment methods, review manual proofs, and manage promotions so that approved purchases yield exactly the intended learner access.

**Acceptance criteria:**

- Given payment methods with different active/order states, when they are created, patched, listed, and reordered, then students see only active methods in the approved order while admins see all. Invalid instructions/type, duplicate/missing reorder ID, stale target, and a method in use follow validation/dependency rules without partial reorder.
- Given a pending manual submission, when an admin views it, then the response is limited to the authorised payment-review scope and protected proof access remains short-lived. Approval changes the submission/order exactly once, creates the intended entitlement and partner allocations, and is safe against double click/retry. Rejection requires valid reason/state, creates no entitlement, and supports the student resubmission path only as designed.
- Given campaigns/coupons with percentages/fixed amounts, dates, audience/scope, priority, limits, active/inactive status, and a discounted target, when they are created/updated/activated/deactivated, then price preview/checkout uses the correct current eligible rule and final saved item price. Test case-insensitive duplicate code, invalid range/amount/scope, expired/depleted/inactive/ineligible code, overlapping campaign priority, and state-change retry.
- Given a student checkout/payment callback is retried, then idempotency keys and provider event handling prevent a duplicate order, approval, entitlement, allocation, or discount consumption. An invalid/replayed Paymob HMAC must be denied without order mutation.
- Given any payment proof, order, coupon, referral, or partner allocation, when a student/parent/partner/anonymous token calls an admin route, then it receives no payment-review data; test direct IDs and pagination/search filters.

**Test type:** API, finance calculation, payment integration, idempotency, privacy, audit.

### ADMIN-REFUNDS-001 — Apply versioned refund policy and reverse access correctly

**Priority/Risk:** Critical — financial correction and access revocation.

**Sources:** `GET /admin/refunds`, `/policy`; `PATCH /admin/refunds/policy`; `POST /admin/refunds/:id/approve`, `/:id/reject`; `AdminRefundsController`, `RefundsService`.

**User story:** As an administrator, I want to review refund requests using a versioned policy so that valid refunds revoke access and reverse financial obligations exactly once.

**Acceptance criteria:**

- Given an approved policy and requests inside/outside its eligibility conditions, when requests are listed with filters/pagination, then status, policy snapshot, order/item scope, and reviewer state are accurate. Existing request eligibility remains tied to its saved policy snapshot after a new policy version is activated.
- Given a valid policy DTO, when it is patched, then a new active version is recorded and invalid dates/limits/unknown fields do not replace the prior policy. Check audit data and concurrent update behaviour.
- Given an eligible pending request, when approval succeeds, then its refund state/reviewer/payment reference are recorded, affected entitlement/access is revoked according to the item scope, and associated referral/publisher ledger reversal is created once. Duplicate approval/retry, already-refunded item, and an invalid transition must not double-reimburse, double-revoke, or double-reverse.
- Given a pending eligible request, when rejection with valid reason succeeds, then it remains non-refunded with a clear review result and no access/ledger mutation. Invalid reason, wrong ID, and rejected/approved repeat transitions fail safely.

**Test type:** API, financial integrity, entitlement integration, idempotency, audit.

### ADMIN-PARTNERS-001 — Manage partners, commercial agreements, pricing, and exceptional access

**Priority/Risk:** Critical — third-party identity, revenue share, and access grants.

**Sources:** `/admin/partners` (CRUD/lifecycle); `/admin/publisher-agreements` (create/update/activate/replace/end/list/effective); `/admin/pricing/course/:id`, `/chapter/:id`, `/lesson/:id`, `/effective`; `/admin/entitlements`; respective services.

**User story:** As an administrator, I want to manage partner accounts and commercial rules while granting only deliberate learner access so that commercial obligations and learning access remain correct.

**Acceptance criteria:**

- Given valid partner type and unique credentials, when a referral or publisher partner is created/listed/read/updated, then permitted fields and type/status are correct, secrets are absent from lists, and audit records identify actor/target. Duplicate identifier, invalid partner type, malformed profile, foreign role, and invalid pagination/search fail safely.
- Given an active/suspended partner, when suspend/reactivate is requested, then current sessions are revoked on suspension and new login is required after reactivation. Repeated/invalid lifecycle actions cannot silently change state or restore old tokens.
- Given a draft agreement, when it is created/updated/activated/replaced/ended, then publisher, target, payout/share terms, effective dates, and primary/current relationship are validated. Overlapping/current conflicts, future/ended/draft agreement at sale time, and replace retry must not create ambiguous or duplicate obligations.
- Given course/chapter/lesson price overrides and inherited pricing, when prices are set and effective price is queried/used by checkout, then the most specific valid override wins and invalid price/currency/target/state is rejected. Record the current product limit that lessons may be price-configurable/agreement-covered but direct lesson commerce is not implemented.
- Given a manual entitlement grant/revoke (including archived-access revoke), then only the selected student and valid course/chapter target receives/loses access, with reason/expiry as required. Duplicate grants, wrong student/target, expired/archived conditions, and retry must not expose or grant unrelated access.

**Test type:** API, authorization, commercial calculation, lifecycle, entitlement integration, audit.

### ADMIN-REFERRALS-001 — Govern referral programmes and fraud-review work

**Priority/Risk:** High — attribution/commission accuracy and controlled review.

**Sources:** `/admin/referral-programs`, `/:id/codes`, `/:id/rules`, `/:id/review-rules`, `/codes/:id`, `/review-rules/:id`, `/review-flags`, `/attributions/:id/review-flags`, `/review-flags/:id/{assign,notes,resolve}`; `ReferralsController`, `ReferralsService`.

**User story:** As an administrator, I want to operate referral programmes and review suspicious attribution so that legitimate referrals are rewarded and exceptions are traceable.

**Acceptance criteria:**

- Given a referral partner and valid programme settings, when a draft programme is created/updated/activated/suspended/resumed/ended, then transitions follow the implemented lifecycle and a partner/code/rule cannot be changed in an impermissible final state. Repeat actions and invalid date/status transitions yield safe conflicts.
- Given a programme, when codes and commission rules are created/updated/activated/suspended/resumed, then normalization/uniqueness, date window, scope, quota, commission kind/rate/cap, and active-rule constraints are enforced. A new rule must not rewrite the snapshot already captured by an approved order.
- Given review rules and referral attribution, when manual/automatic flags are listed, assigned, noted, and resolved, then state, assignee, notes, resolution, actor and timestamps are traceable. Invalid assignment/transition, duplicate note retry, or another attribution ID cannot corrupt/merge cases.
- Given a student redemption and subsequent approved/refunded order, then attribution occurs only for eligible code/programme/rule and produces/reverses one ledger obligation as appropriate. Check disabled rollout/control cases separately where configured; admin endpoints must not let a partner perform these staff operations.

**Test type:** API, finance attribution, fraud workflow, idempotency, audit, cross-role regression.

### ADMIN-FINANCE-001 — Settle partner obligations and reconcile discrepancies

**Priority/Risk:** Critical — financial reporting and payout correctness.

**Sources:** `GET /admin/partner-finance/allocations`; `POST /settlements`, `/:id/mark-paid`; `GET /settlements`; `POST /usage-rollups/rebuild`; `POST|GET /reconciliation-runs`, `POST /reconciliation-runs/:id/run`, `GET /:id`, `/:id/discrepancies`; `PATCH /reconciliation-discrepancies/:id/{assign,resolve}`; `PartnerFinanceService`.

**User story:** As an administrator, I want to settle immutable partner allocations and investigate reconciliation issues so that payouts and reports match approved transactions.

**Acceptance criteria:**

- Given allocation rows across partner types, currencies, dates, and states, when listed, then filters/pagination return the intended immutable rows and calculated sums without exposing non-authorised proof or learner data beyond the staff scope. Verify payable, paid, reversed, and refund compensation rows are not conflated.
- Given eligible payable rows for one compatible partner/currency, when a settlement is created then marked paid, then each row is claimed once, the settlement total/reference/payment date are correct, and rows transition to paid once. Empty, mixed partner/currency, already settled/reversed row, concurrent settlement creation, and double mark-paid fail without duplicate payout.
- Given usage-rollup rebuild and reconciliation run requests, when queued/run, then only the requested scope is processed, status/results are observable, and provider/queue/retry failure remains recoverable. A repeated runner must not duplicate derived records.
- Given a discrepancy, when assigned/resolved, then its state/assignee/resolution metadata persist with audit trail. Invalid transitions, foreign IDs, and a simultaneous resolver are safely rejected; resolved data remains historically traceable.

**Test type:** API, financial integrity, asynchronous integration, concurrency, audit.

### ADMIN-REPORTS-001 — Read aggregate operations reports and export data safely

**Priority/Risk:** Critical — privacy-sensitive reporting/export.

**Sources:** `GET /admin/reports/commerce`, `/revenue`, `/refunds`, `/payments`, `/registrations`, `/active-purchasers`, `/entitlements`, `/partner-obligations`; `POST|GET /admin/reports/exports`, `GET /exports/:id/download`, `POST /exports/:id/cancel`; `ReportsService`, report export worker/policy.

**User story:** As an administrator, I want aggregate operational reporting and controlled CSV exports so that I can make decisions without uncontrolled disclosure of source data.

**Acceptance criteria:**

- Given report data across Cairo day/month boundaries and each supported filter, when an aggregate route is called, then totals use the selected inclusive Cairo dates and only documented hierarchy, geography, payment, promotion/coupon, referral, and partner filters. Invalid/inverted dates, invalid enums, unknown IDs/fields, and incompatible filters fail safely rather than silently broadening results.
- Given commerce/revenue, refunds, payments, registrations, active purchasers, entitlement lifecycle, and partner obligations fixtures, then each report’s counts/amounts/status groups reconcile with its authoritative records. `/revenue` intentionally delegates to the commerce aggregate; record this equivalence rather than expecting a different calculation.
- Given an export request with an allowed report type and allowed unique columns, when queued, then it stores canonical filters, classification and actor, queues once, and audits `REPORT_EXPORT_REQUESTED`. Empty/duplicate-disallowed columns, unallowed column/type/filter, excessive result size, missing reason for PII-restricted export, disabled rollout, or unavailable queue fails without producing a downloadable file.
- Given `ADMIN_A` owns an export and `ADMIN_B` owns another, when list/download/cancel are used, then a normal admin sees/operates only their own job; `SUPER_ADMIN` may see all. Download succeeds only for a completed, unexpired owned job and returns a short-lived URL; queued/processing/failed/cancelled/expired jobs do not return storage keys or URLs. Cancellation only affects queued/processing jobs.
- Given completed output, then CSV contains the approved columns/rows only, carries the generated retention/watermark header, and expires/deletes through the worker policy. Verify request/download/cancel/expiry audit events and that aggregate JSON reports do not accidentally contain row-level PII.

**Test type:** API, analytics calculation, privacy, async export, authorization, audit.

### ADMIN-TESTIMONIALS-001 — Curate public testimonials without leaking private media

**Priority/Risk:** Medium — public presentation integrity.

**Sources:** `POST|GET /admin/testimonials`, `GET|PATCH|DELETE /admin/testimonials/:id`, `POST /reorder`, `/:id/publish`, `/:id/unpublish`, `/:id/archive`, `/:id/restore`; public testimonial/screenshot access routes; `TestimonialsService`.

**User story:** As an administrator, I want to curate ordered, publishable testimonials so that the public site displays only approved material.

**Acceptance criteria:**

- Given valid testimonial text/author metadata and compatible completed screenshot asset, when created or patched, then draft values persist and invalid/foreign/archived asset, invalid text, and unknown fields are rejected without a partial public item.
- Given sibling testimonials, when reordered with the complete expected IDs/versions, then public/admin order is deterministic. Missing/duplicate/foreign IDs and stale/repeated requests leave existing order intact.
- Given draft/published/unpublished/archived states, when publish/unpublish/archive/restore/delete is called, then only valid lifecycle transitions succeed. The public route exposes only published non-archived data, and screenshot access is appropriately controlled/short-lived.
- Given student, parent, partner, anonymous, or revoked credentials, when an admin route is called, then no draft/unpublished/archived testimonial or mutable data leaks. Confirm create/update/reorder/lifecycle audit events.

**Test type:** API, public-content regression, validation, authorization, concurrency, audit.

### ADMIN-BOUNDARY-001 — Remain within normal administrator authority

**Priority/Risk:** Critical — privilege escalation.

**Sources:** `POST|GET /admin/admins`, `GET|PATCH /admin/admins/:id`, `POST /admin/admins/:id/suspend`, `/:id/reactivate`; `AdminsController`, `SuperAdminGuard`; all normal admin route guards.

**User story:** As the platform, I want an administrator to have operational authority but not super-admin account authority so that a compromised admin cannot escalate or lock out governance.

**Acceptance criteria:**

- Given `ADMIN_A_TOKEN`, when every `/admin/admins` route is called—including create, list, read, patch, suspend, and reactivate—with guessed IDs/payloads, then it returns `403` and creates/changes nothing. Check that response contains no admin list, email, status, temporary password, or seeded-account information.
- Given `ADMIN_A`, when bootstrap/seed/super-admin-only configuration paths and `SUPER_ADMIN` account credentials are attempted, then normal runtime APIs provide no escalation route. Confirm this against the production configuration: seed/default credentials must not be usable outside explicit bootstrap conditions.
- Given student, parent, referral partner, publisher, anonymous, suspended, revoked, and forced-password-change sessions, when each calls representative normal admin routes, then all are denied before data/action. Given `SUPER_ADMIN_TOKEN`, normal admin routes continue to work only where explicitly allowed.
- Given a destructive/state-changing representative action from each domain, then invalid confirmation/version/state/race conditions return safe errors, do not partially mutate records, and retain auditability. This backend has no universal confirmation field: UI confirmation is a frontend/product requirement; API safety is supplied by lifecycle guards, DTO validation, transactions, idempotency where implemented, and version checks on versioned resources.

**Test type:** API, authorization, security, regression, operational configuration.

## Cross-role end-to-end regression set

- `ADMIN-E2E-001`: Admin publishes hierarchy/content with protected asset → public catalogue shows only permitted preview → eligible student receives entitlement through approved payment/manual grant → student opens the protected item/asset → suspension/refund revokes the intended access.
- `ADMIN-E2E-002`: Admin creates source/bank/question and publishes assessment → eligible student attempts/submits it → pending AI grading and question reports enter the admin moderation queue → review/retry changes only the intended answer/report and preserves scoring/audit history.
- `ADMIN-E2E-003`: Admin activates partner agreement, price, referral programme/code/rule → student checkout is approved once → publisher/referral allocation appears once → settlement is paid → approved refund revokes access and creates exactly one financial reversal.
- `ADMIN-E2E-004`: Admin creates a PII-restricted export with a justified reason → worker completes it → owner gets an expiring URL → another admin is denied → expiry deletes the object and records audit history.

## Tester handoff notes

- Run real provider/webhook, storage, queue, AI, and export scenarios only in a disposable environment with the relevant secrets and rollout switches configured. Simulate negative provider responses rather than sending malformed production callbacks.
- The API uses Cairo calendar semantics for reporting/date filters where stated. Explicitly include `Africa/Cairo` midnight and daylight-offset boundary fixtures rather than relying on machine local time.
- Do not infer a product rule that has no endpoint. In particular, a generic admin dashboard, audit-log browser, notification centre, broad learner/leaderboard analytics, frontend confirmation modal, accessibility, and responsive/localised UI remain separate work.
