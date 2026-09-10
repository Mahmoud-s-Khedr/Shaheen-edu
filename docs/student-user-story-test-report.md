# Student user-story test report

**Status:** Ready for API testing; this report does not claim the tests have been executed.

**Actor:** An authenticated, active `STUDENT` user.

**API base path:** `/api/v1`

**Implementation reviewed:** student/auth, students, catalog, entitlements, learning, assessments, commerce/refunds, performance, leaderboard, and student-workspace controllers/services/DTOs; current API reference and acceptance journeys. Reviewed 2026-09-10.

This is the implementation-backed test pack for the **Student** section of [the user-story checklist](user-story-testing-checklist.md). It describes behaviour the backend exposes today. It does not invent frontend screens, payment methods, or retention rules that are not represented by the API.

## Test conventions

Unless a story says otherwise, every protected call needs `Authorization: Bearer $STUDENT_A_TOKEN`. A successful state-changing request must be verified with a follow-up read. For every negative API test, assert the standard error envelope (`statusCode`, `code`, localized `message`/`error`, and `correlationId`) without depending solely on English wording.

All student-only paths must return `401` with no bearer token or an expired/revoked token, and `403` for a valid parent, partner, admin, or other non-student token. Where a resource belongs to another student, the expected safe result is the route's authorization/not-found response with no private fields leaked. Exercise the same cases through deep links or altered IDs in a browser client when one exists.

## Coverage and known product boundaries

| Checklist capability | Current backend support | Coverage |
| --- | --- | --- |
| Student session, profile, grade/location, password | Yes | `STUDENT-AUTH-001`–`002` |
| Grade-scoped catalogue, access state, library, entitlement list | Yes | `STUDENT-CATALOG-001`–`002` |
| Protected text, link, PDF/document, image/asset, video delivery | Yes; assets use temporary access credentials | `STUDENT-CONTENT-001` |
| Study state, completion, resume and roll-up progress | Yes | `STUDENT-LEARNING-001` |
| Direct practice, answer history and private question tools | Yes | `STUDENT-PRACTICE-001`–`002` |
| Generated/admin assessments, timed attempts, review and analytics | Yes | `STUDENT-ASSESS-001`–`003` |
| Voice-to-text for written assessment answers | Yes; no audio retained by the route | `STUDENT-ASSESS-003` |
| Leaderboard and performance analytics | Yes | `STUDENT-ANALYTICS-001` |
| Cart, price preview, coupons, manual payment, XPay | Yes | `STUDENT-COMMERCE-001`–`003` |
| Refund request and student-visible refund status | Yes | `STUDENT-REFUND-001` |
| Another student's data, expired/revoked access, suspension | Yes; require cross-account execution | `STUDENT-SECURITY-001` |
| Referral entry/attribution during registration or checkout | No student-facing input is exposed in the reviewed routes | Gap |
| Student self-service password reset | No endpoint; administrators can reset a student password | Gap |
| UI loading, responsive, localization, and accessibility behaviour | Not testable from this backend repository | Frontend scope |

## Required test data

Create isolated records; keep IDs in the run log but redact tokens, phone numbers, national IDs, payment references, signed URLs, and upload keys.

| Alias | Required state |
| --- | --- |
| `STUDENT_A` / `STUDENT_B` | Two active students in `GRADE_A`; retain independent browser sessions. `STUDENT_SUSPENDED` is initially active, then suspended by an admin during `STUDENT-SECURITY-001`. |
| `GRADE_A` / `GRADE_B` | Published grades. `SUBJECT_A` is assigned to `GRADE_A`; `SUBJECT_B` is assigned only to `GRADE_B`. Include draft/archived hierarchy controls. |
| `COURSE_A`, `CHAPTER_A` | Published, paid course and chapter under `SUBJECT_A`; `COURSE_B` is published but grade-ineligible. Create active course and chapter entitlements for `STUDENT_A`, and none for `STUDENT_B` unless a test says otherwise. |
| `CONTENT_*` | Published accessible items for `TEXT`, `EXTERNAL_LINK`, `PDF`/document, image/asset, and `VIDEO`; plus an item with a video outline and a protected/expired/revoked counterpart. Attach ready assets and retain an unattached asset ID. |
| `QUESTION_*` | Published eligible single-choice, multiple-choice, and written questions with known answers, explanation, attachment/video fixture, and a question outside `STUDENT_A`'s entitlement. Include an exact text slice for highlight tests. |
| `ASSESSMENT_*` | One visible admin assessment, one private generated assessment, a timed assessment, a tutor assessment with written-answer feedback, and a non-owned/private assessment. Include completed, suspended/resumable, and not-started attempts. |
| `PAYMENT_METHOD`, `COUPON_*`, `CAMPAIGN_*` | Active and inactive manual methods; valid, expired, exhausted, ineligible, and inactive coupon/campaign variants; a purchasable course/chapter with known EGP base price. |
| `ORDER_*` | Orders owned by each student in `AWAITING_PAYMENT`, rejected-proof, approved, cancelled, and ineligible-for-cancellation/refund states. Prepare a safe supported proof file, unsupported file, oversized file, and upload-service test fixture. |
| `PEER_DATA` | Enough completed assessment/practice attempts across eligible students and two finalized leaderboard weeks to make ranking, trend, peer, and empty-state assertions meaningful. |

## User stories

### STUDENT-AUTH-001 — Sign in, renew, and end a student session

**Priority/Risk:** High — account security

**Sources:** `POST /auth/students/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`; `StudentAuthController`, `SharedAuthController`, session service.

**User story:** As a student, I want to sign in and safely manage my sessions so that only I can continue learning and purchasing.

**Acceptance criteria:**

- Given `STUDENT_A`'s normalized Egyptian phone and correct password, when logging in, then the API returns `201`, an access token identifying role `STUDENT`, and an HttpOnly `refresh_token` cookie; no password hash or national ID occurs in body or cookie values.
- Given whitespace or a supported alternate phone representation, when login is submitted, then normalization has the same valid outcome. Given malformed phone, wrong password, a non-student account, or repeated failures beyond the route throttle, then it returns the documented safe `400`/`401`/`429` outcome without confirming account existence.
- Given a valid refresh cookie, when `POST /auth/refresh` is called, then it returns a new access token and rotates the refresh cookie. Reuse of the rotated cookie, a missing cookie, and a revoked session must return `401`; a successful retry must not create an additional usable session unexpectedly.
- Given a signed-in student, when `GET /auth/me` is called, then it returns only that user's safe identity/session fields. When `logout` is called, the current bearer session and cookie are revoked/cleared; when `logout-all` is called from another active session, every session becomes unusable.

**Test type:** API, security, regression. **Dependencies:** auth rate limiting, cookies, clock.

### STUDENT-AUTH-002 — Read and update only the mutable student profile; change password

**Priority/Risk:** High — PII and account recovery

**Sources:** `GET|PATCH /students/me`, `POST /auth/change-password`; `StudentsService`, `UpdateStudentDto`.

**User story:** As a student, I want to maintain my permitted personal and academic details and password so that my account remains accurate and secure.

**Acceptance criteria:**

- Given `STUDENT_A`, when reading `/students/me`, then the returned profile is A's and includes the supported name, parent phone, governorate, optional center, and grade fields; it never returns the national ID, password/hash, another student's data, or admin-only audit data.
- Given valid changes to name, normalized parent phone, a published grade, governorate, and a center belonging to that governorate, when PATCH is made, then `200` persists the values. `centerId: null` clears the center. Changing the parent phone invalidates the old parent session and permits a new verified parent session only with the new number.
- Given a draft/unknown grade, unknown governorate, center from another governorate, malformed parent phone, oversized name, or non-whitelisted fields (`role`, `status`, `nationalId`, `password`), when PATCH is made, then it returns `400`/`404` and leaves the profile unchanged. Verify a grade change recalculates grade-scoped catalogue visibility rather than preserving `GRADE_A` access as catalogue eligibility.
- Given the correct old password and a valid 8–128-character new password, when changed, then all active sessions are revoked, the refresh cookie is cleared, the old password and prior token fail, and login with the new password works. A wrong old password, short/oversized password, and retry must not change credentials.

**Test type:** API, security, integration. **Related regression:** parent login and selected-child sessions.

### STUDENT-CATALOG-001 — Browse the catalogue personalized to the student's grade

**Priority/Risk:** High — curriculum correctness and conversion

**Sources:** `GET /student/catalog`, `/student/catalog/subjects`, `/subjects/:subjectId/courses`, `/courses/:courseId`, hierarchy child routes, `/catalog/search`; `StudentCatalogService`.

**User story:** As a student, I want to browse my grade's published learning hierarchy and see its lock state so that I can find content I can study or purchase.

**Acceptance criteria:**

- Given `STUDENT_A` in `GRADE_A`, when summary, subjects, course, hierarchy, and search routes are called, then only published entities eligible for `GRADE_A` are returned. `SUBJECT_B`/`COURSE_B`, draft/archived nodes, and their titles/breadcrumbs do not appear and direct requests are safely denied.
- Given a course/chapter with active access and a purchasable sibling, when listing courses, hierarchy nodes, search results, and directly placed content previews, then access state and `isLocked` are consistent. A course entitlement unlocks inherited chapters; a chapter entitlement unlocks only its intended scope.
- Given list/search data spanning pages, when valid `page`/`limit` or opaque `cursor` values are used, then ordering is stable, records do not repeat, and the correct meta/pageInfo is supplied. Empty valid searches return `200` with an empty collection. Invalid resource type, invalid pagination, malformed cursor, missing required `subjectId`/`q`, or a cursor reused with changed query must return validation error without partial leakage.
- Given Arabic/English titles and Arabic character variants, when searching, then normalized matching and whitespace handling agree with the shared search contract. Assert returned nodes are previews: no lesson body, answer key, asset URL, storage key, or entitlement belonging to another student.

**Test type:** API, authorization, search/pagination, regression.

### STUDENT-CATALOG-002 — See owned access in library and entitlement views

**Priority/Risk:** High — entitlement visibility

**Sources:** `GET /student/library`, `/student/my-subjects`, `/student/entitlements`, `/student/library/:targetType/:targetId/progress`.

**User story:** As a student, I want to see the courses and chapters I currently own, including progress, so that I can resume the right material.

**Acceptance criteria:**

- Given active course and chapter entitlements, when library and entitlement routes are called, then they contain only A's active, non-revoked, in-window grants, with the expected target, owning `courseId`, access dates/status, and API-calculated `progress` rounded from 0–100.
- Given active access in several subjects, when `my-subjects` is called, then it groups only subjects with active course/chapter access and returns calculated accessible/published-content progress; it does not create a separate subject purchase.
- Given a revoked, expired, not-yet-started, archived-access, or B-owned entitlement, when the same routes are called, then it is absent from the active library/subjects/entitlements and its progress endpoint/content delivery is denied according to the access policy. Check ordinary empty library and invalid `targetType`/ID behavior.
- Given a purchase, manual entitlement grant/revoke, or approved refund, when the follow-up read is made, then library, entitlement, lock state, and target progress converge without duplicate rows.

**Test type:** API, integration, authorization. **Dependencies:** entitlement clock and fulfilment.

### STUDENT-CONTENT-001 — Consume only authorized learning content and short-lived assets

**Priority/Risk:** Critical — paid-content protection

**Sources:** `GET /student/content-items/:id`, `/student/content-items/:contentItemId/assets/:assetId/access`, `/student/video-assets/:assetId/playback`; `ContentAccessPolicyService`, `LearningService`.

**User story:** As a student, I want to open my authorized text, links, documents, images, and videos so that I can learn from my purchased material.

**Acceptance criteria:**

- Given each `CONTENT_*` item A can access, when its delivery route is called, then it returns the correct type-specific metadata/body and A's private `progress` and `studyState`. With `includeVideoOutline=true` for a video, ordered topics/concepts are returned; absent/false does not add the outline.
- Given an attached ready document/image, when its student asset route is called, then it returns a temporary `url` and future `expiresAt`; a video asset returns temporary playback/embed data instead. The credential must be for the requested attached asset only, should work before expiry, and must not be cached or constructed by the client after expiry.
- Given a non-existent, unattached, unready, mismatched, B-only, expired/revoked, unpublished, or protected-without-entitlement item/asset, when delivery or asset access is requested, then it is denied without body text, filename/storage key, signed URL, or ancestry disclosure. Repeat after entitlement revocation and content archive to verify access is evaluated at request time.
- Given public content, when the public content route is used it may work without a token; the student route remains valid. Public access must not make sibling protected content or a protected asset retrievable by ID substitution.

**Test type:** API, integration, security, performance (signed-URL expiry).

### STUDENT-LEARNING-001 — Persist study state, completion, resume, and roll-up progress

**Priority/Risk:** High — learner progress integrity

**Sources:** `PUT /student/content-items/:id/study-state`, `POST /student/content-items/:id/complete`, `GET /student/learning/continue`, `/student/progress`, library progress; `LearningService`.

**User story:** As a student, I want study position and completion to persist so that I can resume learning and accurately track progress.

**Acceptance criteria:**

- Given accessible uncompleted content, when study state is saved, then `lastOpenedAt` is updated and a non-negative integer video position is persisted; `null` clears the position. Negative, decimal, non-numeric, inaccessible, or B-owned targets are rejected without state change.
- Given no eligible study activity, when `learning/continue` is requested, then it returns the documented empty data state. Given multiple opened items, it returns the newest item still accessible with its context and state; after its access is revoked/expired/unpublished it must not return stale protected data.
- Given accessible content, when completion is posted twice, then the item is completed exactly once and remains complete after refresh/new session. A completion call on inaccessible content is denied. Confirm the completion timestamp is stable on a repeat unless product requirements explicitly say otherwise.
- Given partial, full, reordered, and zero-content hierarchy cases, when progress, library progress, catalogue search/content preview, library, my-subjects, and continue-learning are read, then their `isCompleted`/percent roll-ups agree. A container is complete only when all relevant accessible published descendants are completed; a node with no content is not complete.

**Test type:** API, regression, concurrency/retry. **Dependencies:** time ordering and content hierarchy.

### STUDENT-PRACTICE-001 — Practise entitled questions and retain an immutable answer history

**Priority/Risk:** High — score correctness

**Sources:** `GET /student/practice/questions`, `POST /practice/questions/:questionId/attempts`, `GET /attempts`, question asset/video access, `GET /student/performance`; `LearningService`.

**User story:** As a student, I want to practise questions within content I can access and review my own attempts so that I can improve.

**Acceptance criteria:**

- Given one valid entitled hierarchy scope, when eligible questions are listed, then question cards have no answer key and pagination is correct. The request requires exactly one of course/chapter/lesson/section; none, multiple, malformed pagination, B scope, or unentitled scope is safely rejected.
- Given a known single/multiple-choice question and valid option IDs, when an attempt is submitted, then a new immutable attempt records the selected options, correctness, score/explanation visibility as designed, and appears only in A's attempt history/performance. A re-answer creates another attempt rather than altering historical results.
- Given an empty option list, duplicate/foreign option, option from another question, ineligible question, or an altered A/B question ID, when submitted/read, then it is rejected with no attempt created and no answer key leaked. Verify question attachment/video credentials use the same entitlement checks and reject mismatched asset IDs.
- Given concurrent clicks/retries, when identical attempt requests reach the API, then the observed history and scoring follow the explicitly agreed product rule. The current endpoint models attempts as immutable and has no idempotency header; record the resulting count as a decision/risk if duplicate submissions are possible from the UI.

**Test type:** API, authorization, calculation, concurrency. **Related regression:** performance and leaderboard.

### STUDENT-PRACTICE-002 — Keep private marks, notes, highlights, and question reports

**Priority/Risk:** Medium/High — private learning data and moderation

**Sources:** assessment question mark/note/report routes; `GET|POST|DELETE /student/questions/:questionId/highlights`; `AssessmentsService`, `StudentWorkspaceService`.

**User story:** As a student, I want to annotate, mark, and report accessible questions privately so that I can revise and alert the team to a problem.

**Acceptance criteria:**

- Given an accessible question, when A marks it, saves a 1–10,000-character note, or submits a report with a valid enum type and optional ≤4,000-character note, then each item persists only for A. Repeating mark/save follows the service's idempotent/upsert semantics; unmark/delete removes only A's data.
- Given the question body and an exact slice, when A creates a highlight with matching zero-based offsets and optional ≤64-character color, then `201` returns it and list returns A's highlights. Invalid reversed/out-of-range offsets or nonmatching selected text return `400`; another student's highlight cannot be read or deleted.
- Given inaccessible, altered, snapshot/source question, missing record, invalid report type, empty/oversized note, or duplicate report, then behavior is safe and no private note/highlight/report data is disclosed. Test both report aliases (`/student/questions/:id/reports` and `/student/assessments/question-reports/:id`) for consistent authorization and moderation creation.
- Given an admin reviews a report, when A's data is re-read, then only approved student-visible status/details, if any, appear; admin assignment/internal notes must not leak unless explicitly designed.

**Test type:** API, security/privacy, integration. **Dependencies:** published question access and moderation workflow.

### STUDENT-ASSESS-001 — Generate, organize, and discover authorized assessments

**Priority/Risk:** High — scope and question-access controls

**Sources:** `POST /student/assessments`, `/ai-prompt`, `/community-tutor`, `GET` list/detail/question banks/sources/community cards, `PATCH|DELETE /:id`; `AssessmentsService`.

**User story:** As a student, I want to create and organize practice assessments from scopes I can access so that I can revise in a structured way.

**Acceptance criteria:**

- Given accessible banks/scopes and enough published eligible questions, when A generates a standard assessment (1–50 questions), then it is private to A, has only eligible snapshot questions, honors requested supported filters, and exposes no answer key before submission. A missing/invalid scope, unentitled bank/source/filter, no eligible questions, invalid count/title, or timed assessment without `durationSeconds` returns a safe validation/business error.
- Given a valid 3–2,000-character AI prompt and one or more accessible scopes, when A generates an AI-prompt assessment, then its source/scope and error handling are recorded as the AI integration contract requires. Test timeout/provider failure/retry with a mock; no other student's prompt or generated question is exposed.
- Given entitled community-most-incorrect cards or selected tutor questions, when A lists/cards creates a tutor assessment, then cards omit answers, selected IDs must be accessible, unique, and 1–50, and the resulting assessment is A's. Question-bank/source lists likewise expose only accessible published records.
- Given A's and B's private assessments and a visible admin assessment, when listing, filtering (`NOT_STARTED`, `SUSPENDED`, `COMPLETED`), reading, renaming, and deleting are exercised, then A can manage only A-owned private assessments; B's ID and non-owned edits/deletes are denied. Deleting an assessment with attempts and the expected result/history retention must be confirmed against the service/business rule.

**Test type:** API, authorization, integration, AI-mocked regression.

### STUDENT-ASSESS-002 — Complete and review a resumable assessment attempt

**Priority/Risk:** Critical — timing, scores, and answer integrity

**Sources:** `POST /student/assessments/:id/attempts/start`, current/answer/active-time/submit/result routes; `AssessmentsService`.

**User story:** As a student, I want to start, resume, answer, submit, and review an assessment so that I receive a trustworthy result.

**Acceptance criteria:**

- Given an available assessment, when A starts it, then `201` creates or resumes A's single current attempt and supplies safe question state. Refresh/device/session change followed by `current` or repeated `start` resumes that same attempt without duplicating it. B, a hidden assessment, or an unavailable/revoked scope cannot access its attempt.
- Given objective, multiple-choice, and written questions, when A autosaves a valid answer, then only the current attempt/question is updated and restored after refresh. Validate empty/foreign option IDs, wrong question/assessment pair, a text response >100,000, invalid input method/language/confidence, and post-submit edits. Voice-transcribed text follows the same answer validation.
- Given active time is reported as a monotonic total, when A sends increasing and then lower values, then stored `activeSeconds` never decreases. Reject negative, non-integer, >86,400, foreign, expired, or completed attempts. Given a timed assessment, its server-calculated `expiresAt` is enforced even if the client clock is changed; after expiry it is suspended/submitted according to the implemented rule and cannot accept new answers.
- Given a completed attempt, when A submits (including double click/retry), then it is scored once, status becomes `COMPLETED`, list/detail score and percentage agree, and `result` returns only after submission. Result/review must show the agreed answers, explanations, written-grade state/feedback, active time, and optional comparison only to A; it must not disclose B's attempts or raw answer keys before completion.

**Test type:** API, calculations, security, time-based integration, concurrency. **Dependencies:** deterministic question fixtures and test clock.

### STUDENT-ASSESS-003 — Use voice transcription and view assessment analytics

**Priority/Risk:** Medium/High — third-party privacy and calculations

**Sources:** `POST /student/voice/transcriptions`, `GET /student/assessments/analytics/summary`; question attachment access; `AssessmentsService`.

**User story:** As a student, I want to dictate a written answer and inspect my completed-assessment performance so that I can respond accessibly and focus revision.

**Acceptance criteria:**

- Given a supported audio fixture and optional language, when A uploads multipart `file`, then the transcription response is usable as editable answer text and does not retain/return the audio bytes or storage URL. Missing file, truncated/oversized upload, unsupported MIME, invalid language, provider failure, and retry return useful safe errors; inspect logs/queues to ensure audio is not persisted.
- Given completed assessments across subjects/chapters/topics, when analytics summary is requested with valid filters/pagination, then aggregates and attempt rows include only A's completed data and match independently calculated fixtures. Empty data returns a successful empty state.
- Given an unentitled/foreign chapter/subject, invalid queries, B's IDs, or raw assessment-question asset IDs, then analytics and attachment routes do not leak questions, responses, comparison data, or protected temporary URLs.

**Test type:** API, integration, privacy/security, calculation. **Dependencies:** transcription provider mock and completed fixtures.

### STUDENT-ANALYTICS-001 — View personal performance and weekly leaderboard safely

**Priority/Risk:** Medium — analytics accuracy and peer privacy

**Sources:** `GET /student/performance/{overview,analysis,trends,insights,peers,answer-changes}`, `GET /student/leaderboard/{current,history/:weekKey}`.

**User story:** As a student, I want to see my performance, trends, recommendations, peers, and ranking so that I can plan my study time without exposing private learner data.

**Acceptance criteria:**

- Given `PEER_DATA`, when overview, hierarchy analysis (each supported level), trends, insights, and answer-change routes are called with valid date/scope/page queries, then values reconcile to the fixture assessment/practice attempts and exclude A's inaccessible/expired-scope data. Empty periods are successful and do not fabricate recommendations.
- Given an entitled subject/course scope, when peers is requested, then its comparison is scoped to the requested eligible population and exposes only the designed aggregate/ranking fields—not peer answer text, national IDs, phone numbers, or private assessment IDs. Missing required subject/course and invalid/foreign scopes are rejected safely.
- Given current and finalized historical weeks, when leaderboard pagination and valid `weekKey` are requested, then rank/order, A's position, totals, ties, and history snapshots are stable. Invalid/missing/non-finalized week, bad pagination, and a student with no score use the documented safe empty/not-found result.
- Given new answers or a repeated finalization job, when analytics/leaderboard are recalculated, then no score is double-counted and a finalized historical week is immutable. Confirm expected timezone/week boundary with the product owner.

**Test type:** API, calculations, privacy, scheduled-job integration.

### STUDENT-WORKSPACE-001 — Manage private notebook pages

**Priority/Risk:** Medium — private student content

**Sources:** `GET|POST /student/notebook/pages`, `GET|PATCH|DELETE /student/notebook/pages/:pageId`; `StudentWorkspaceService`.

**User story:** As a student, I want to keep private notebook pages so that I can organize revision notes.

**Acceptance criteria:**

- Given A has no pages, when listing, then `200` returns `{ data: [] }`. Given valid title (1–500 chars) and content (up to 1,000,000 chars), when creating, then `201` returns A-owned page and it appears in the list/read response.
- Given A's page, when updating title and/or content, then `200` persists only supplied valid fields and changes `updatedAt`; a PATCH with no mutable field, blank title, oversized fields, unknown properties, or malformed body returns `400` without mutation.
- Given A attempts B's `pageId` through read/update/delete, then the API returns safe `404`/denial and B's title/content never occurs. Deleting A's page removes it exactly once; retry and subsequent read/list behave consistently.
- If notebook content is rendered as HTML/rich text by a frontend, run XSS sanitization and accessibility tests there; this API stores and returns content and is not a rendering security boundary.

**Test type:** API, authorization, privacy, frontend security follow-up.

### STUDENT-COMMERCE-001 — Price an eligible purchase and maintain an idempotent cart/order

**Priority/Risk:** Critical — money, discounts, and entitlement creation

**Sources:** manual payment methods/cart/price preview/checkout/orders/cancel routes; `CommerceService`.

**User story:** As a student, I want to price and order eligible courses or chapters so that I can purchase access at the correct final amount.

**Acceptance criteria:**

- Given active/inactive manual methods, when A lists methods, then only active methods are visible, ordered/searchable/paginated as supported, with safe instructions. A must not receive administrator-only method state or configuration.
- Given a purchasable course/chapter plus active campaign/coupon variants, when price preview is requested, then base price, campaign/coupon discounts, final EGP amount, eligibility, and coupon outcome match an independently calculated fixture. Expired, inactive, exhausted, ineligible, malformed, or conflicting coupon input cannot lower the payable amount. Verify the server recalculates price at checkout rather than trusting the preview.
- Given an empty cart, valid target, existing cart item, already owned target, invalid target type/ID, or a B-only/unpublished/grade-ineligible target, when adding/removing/listing, then A sees only A's cart and duplicate/ownership behavior follows the documented `409`/safe response. Removal by B's item ID is denied.
- Given a valid cart/method and unique `idempotency-key`, when checkout is retried concurrently with the same key, then it produces/retrieves one immutable order with one server-calculated total and no duplicate order/items. Missing/blank/reused-with-different-payload key, empty cart, inactive method, changed price/coupon, and duplicate target must not charge or grant access. A can list/read only A's orders and can cancel only the implemented eligible statuses; repeated/noneligible cancellation does not change a paid order.

**Test type:** API, financial calculation, integration, concurrency/security.

### STUDENT-COMMERCE-002 — Submit, replace, and track manual payment proof

**Priority/Risk:** Critical — receipt privacy and fulfilment

**Sources:** payment-proof authorization/complete/resubmission routes; payment-submission review and fulfilment services.

**User story:** As a student, I want to submit or replace proof for my manual payment so that an administrator can approve my order.

**Acceptance criteria:**

- Given A's eligible awaiting-payment order and a supported proof file, when the multipart authorization route is called with a unique idempotency key, then it returns the direct-upload authorization only for that order. The client uploads to the returned authorized destination and confirms via `/complete`; the resulting submission/order state is visible to A without exposing permanent object keys or another student's proof.
- Given missing file, truncated/oversized or unsupported type, missing/duplicate/conflicting idempotency key, B's order, cancelled/paid/expired order, altered upload reference, or repeated completion, then it returns the documented `400`/`403`/`404`/`409` and creates neither an unsafe submission nor duplicate review item.
- Given an admin rejects a proof with a student-visible reason, when A reads the order then resubmits and completes a replacement, then only the rejected submission may be replaced, status history is correct, and the old proof cannot be used to approve a different order. Retry of the same authorization/completion is idempotent.
- Given admin approval, when A refreshes orders, library, entitlements, and protected delivery, then every approved order item is fulfilled exactly once and access becomes active. Verify a rejected/pending proof grants no access, and record any email/push notification expectation separately because no notification API was reviewed.

**Test type:** API, storage integration, security/privacy, financial regression.

### STUDENT-COMMERCE-003 — Complete or retry hosted XPay payment safely

**Priority/Risk:** Critical — external payment integrity

**Sources:** `POST /student/orders/:id/xpay/attempt`, `POST /payments/xpay/webhook`; `CommerceService`.

**User story:** As a student, I want to open or retry a hosted payment attempt so that a successful provider callback grants my order once.

**Acceptance criteria:**

- Given A owns an unpaid XPay order and sends a unique idempotency key, when a payment attempt is created, then the response supplies the expected hosted checkout attempt/expiry for that order only. Repeating the same key does not create a second provider attempt; B, paid/cancelled/expired orders and missing keys are denied safely.
- Given a provider-approved callback with valid HMAC, when the webhook is delivered once or repeatedly/out of order, then the order reaches the expected final state and fulfilment/entitlements occur exactly once. Invalid HMAC, altered amount/order reference, rejected/expired payment, and duplicate callbacks must not approve or grant access.
- Given a failed/expired attempt, when A creates a fresh permitted retry then receives a valid completion webhook, then stale attempt data does not settle the order and A's order/library/entitlement status is accurate. Test this against XPay sandbox or a verified provider mock; never place provider secrets in evidence.

**Test type:** Integration, security, financial calculation, webhook idempotency.

### STUDENT-REFUND-001 — Request and follow a refund without retaining revoked access

**Priority/Risk:** High — financial and access reversal

**Sources:** `POST /student/orders/:orderId/refund-requests`, `GET /student/refund-requests`; `RefundsService`.

**User story:** As a student, I want to request a refund for an eligible approved order and see its status so that I understand whether access and payment will be reversed.

**Acceptance criteria:**

- Given A's eligible approved order containing complete order items, when A submits a valid reason, then a request with policy snapshot/status is created and appears only in A's paginated/filterable refund list. Verify the API's automatic ineligible rejection for partial/ineligible orders and the precise status exposed to A.
- Given B's order, unknown/cancelled/unpaid/refunded order, duplicate pending request, invalid/oversized reason, or a policy boundary (window, usage/progress if configured), when requesting, then it is denied/rejected without creating a request for the wrong student. Repeated request must not create duplicate financial reversals.
- Given an admin approves the request, when follow-up reads occur, then refund status is visible, associated access is revoked, protected content fails, library/entitlements update, and partner-ledger reversal is created once. A rejected request leaves eligible access intact; a later retry follows the product policy.
- Validate pagination/search/status filters, empty list, invalid query, and that administration-only policy/decision notes or other students' requests never appear in A's response.

**Test type:** API, financial/access integration, authorization, regression.

### STUDENT-SECURITY-001 — Prevent cross-student access and invalidate access on suspension/change

**Priority/Risk:** Critical — privacy and authorization

**Sources:** all student routes above; admin student suspension/reactivation, entitlement/access policy, session service.

**User story:** As a student, I expect my profile, learning, assessment, workspace, order, receipt, and answer data to remain private and unavailable when my account or access is no longer active.

**Acceptance criteria:**

- Given A and B each own profile, cart/order/proof/refund, library/entitlement/content, practice attempt/note/mark/highlight, notebook, assessment/current attempt/result, and analytics data, when A substitutes every B ID/URL/path asset ID, then each route returns only safe `403`/`404`/`401` as designed. Capture and inspect bodies to prove no B title, answer, proof URL, parent phone, national ID, storage credential, or internal audit record leaks.
- Given a valid student token, when it is used against parent, partner, admin, super-admin, publication, entitlement-management, payment-review, and direct storage/provider callback paths, then it is denied. Conversely, parent/admin/partner tokens cannot call student-only endpoints as A.
- Given A has active access then an admin revokes/expires entitlement, archives/unpublishes related content, approves a refund, or suspends A, when A retries delivery, asset/video playback, practice, assessment, cart/order, refresh, and existing bearer calls, then authorization follows the applicable policy and no stale private delivery continues. Existing refresh sessions must be invalidated on suspension; reactivation restores only intended future access, not revoked entitlements.
- Given malformed/expired tokens, stale signed URLs, concurrent repeat state changes, and error conditions, then no sensitive values occur in URLs, standard API responses, or test logs. Verify request/response evidence redacts secrets and correlation IDs before sharing.

**Test type:** Security, API, integration, regression.

## Open decisions and risks to resolve before sign-off

| ID | Finding | Required decision or follow-up |
| --- | --- | --- |
| STUDENT-RISK-001 | Direct-practice answer submissions deliberately create immutable attempts but have no idempotency key. | Decide whether a double-click/retry is allowed to create multiple attempts; add an idempotency mechanism if not. |
| STUDENT-RISK-002 | The backend supports XPay and manual payment, while the checklist says “every supported payment path.” | Confirm production-enabled methods, webhook sandbox, and the exact retry/expiry/charge reconciliation expectations. |
| STUDENT-RISK-003 | Referral code/link input is not present on student registration or reviewed checkout inputs. | Confirm that referral attribution is intentionally absent from the student flow or provide the missing route/UI contract. |
| STUDENT-RISK-004 | The implementation distinguishes active entitlements from archived access and filters delivery at request time. | Agree retention behaviour for historical orders/progress/results after content archive, entitlement revoke/expiry, refund, and grade change. |
| STUDENT-RISK-005 | Voice transcription forwards audio to an integration but the API report alone cannot prove vendor retention/log handling. | Obtain provider DPA/configuration and execute a privacy/log-retention check with non-production audio. |
| STUDENT-RISK-006 | UI loading, recoverable errors, keyboard/focus/contrast, Arabic layout, responsive behaviour, and safe rich-text rendering are not contained in this API repository. | Add frontend stories/tests before user-acceptance sign-off. |
| STUDENT-RISK-007 | Weekly leaderboard boundaries/finalization depend on application time and a scheduled process. | Specify the timezone, tie-breakers, snapshot timing, and late-answer rule, then add deterministic clock/job tests. |

## Evidence required when tests execute

- Redacted HTTP captures for every happy path and representative `400`, `401`, `403`, `404`, `409`, `429`, and provider-failure case.
- Database/event assertions for profile normalization, session revocation, cart/order/payment/submission/refund state, entitlement grants/revocations, completion, attempts, scores, and leaderboard finalization.
- Storage/provider evidence proving asset and proof links are temporary, unauthorized access fails, webhooks are HMAC-verified/idempotent, and voice audio is not retained.
- Two-account ID-substitution matrix covering every resource with student-owned data.
- Independent calculation worksheets for prices/discounts, scores/percentages, progress, analytics, ranking/ties, and refund reversals.
- Frontend evidence, if applicable, for loading/empty/error/retry states, Arabic/English and Egyptian EGP presentation, mobile/responsive behaviour, accessibility, and no sensitive data in browser storage, URLs, logs, or analytics.
