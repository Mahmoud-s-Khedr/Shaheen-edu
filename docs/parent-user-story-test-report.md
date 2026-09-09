# Parent user-story test report

**Status:** Ready for API testing; this report does not claim that the tests have been executed.

**Actor:** A parent authenticated through a child's Egyptian national ID and the parent phone number recorded on that child's profile. A parent is represented by a short-lived `parent_access` session, not a `USER` record or a normal student/admin session.

**API base path:** `/api/v1`

**Implementation reviewed:** parent authentication/session guards, parent performance and learning-analytics controllers/services/DTOs, parent E2E tests, and the API reference. Reviewed 2026-09-10.

This is the implementation-backed test pack for the **Parent** section of [the user-story checklist](user-story-testing-checklist.md). It covers only capabilities the backend currently exposes. The parent role is read-only after child selection: it cannot alter child data, consume protected content, make purchases, or submit learning work.

## Test conventions

`PARENT_TOKEN` means the token issued by `POST /auth/parents/login`; it has no active child. `PARENT_CHILD_A_TOKEN` means the replacement token issued by `POST /auth/parents/select-child` for `CHILD_A`. Every selected-child endpoint requires the latter form of token.

For protected calls, assert `401` for no, malformed, expired, revoked, or non-parent bearer token. A valid parent token without a selected child must receive `400` from selected-child routes. Assert the standard error envelope without relying only on its English text, and never include a token, national ID, normalized phone number, or private signed URL in test evidence.

## Coverage and current product boundaries

| Checklist capability | Current backend support | Coverage |
| --- | --- | --- |
| Verification login and throttling | Yes; child national ID + linked parent phone | `PARENT-AUTH-001` |
| List linked children and select/switch active child | Yes | `PARENT-CHILD-001`–`002` |
| Selected-child identity/status | Yes; limited to name, governorate, center, status | `PARENT-CHILD-002` |
| Selected-child unified performance, analysis, trends, and insights | Yes; read-only and no peer-comparison route | `PARENT-PERFORMANCE-001`–`002` |
| Selected-child active-access discovery and content/assessment/practice analytics | Yes; active entitlements only | `PARENT-ANALYTICS-001`–`002` |
| Unrelated-child / cross-role / changed-link protection | Yes; require cross-account execution | `PARENT-SECURITY-001` |
| Parent registration, profile, password, password reset, logout, refresh | No parent API | Gap |
| Parent catalogue/library browsing, order/payment history, lesson access, assessment answers | No parent API; only aggregate analytics is exposed | Gap |
| Notifications, exports, audit views, UI loading/accessibility/localization | Not exposed/testable from this backend repository | Gap / frontend scope |

## Required test data

Create isolated data and retain only aliases/IDs in the run log.

| Alias | Required state |
| --- | --- |
| `PARENT_A` | Uses `PARENT_PHONE_A`; authenticate using the national ID of either linked active child. Keep a browser/API session before and after each selection. |
| `CHILD_A`, `CHILD_B` | Active students sharing `PARENT_PHONE_A`, with distinct names. `CHILD_A` has performance data and active access; `CHILD_B` supports switch and suspension tests. |
| `CHILD_C` | Active student with `PARENT_PHONE_C` and its own content, attempts, and entitlement. It is the ID-substitution/privacy control. |
| `CHILD_SUSPENDED` | A linked child initially active, then suspended and reactivated by an admin. Keep a token which had this child selected before suspension. |
| `ENTITLEMENT_*` | For `CHILD_A`: active course and chapter grants in at least two subjects, a duplicate chapter grant covered by a course grant, and payment/admin sources. Also create revoked, expired, and future grants, plus active grants for `CHILD_B` and `CHILD_C`. |
| `LEARNING_*` | Published content with no activity, opened-only, completed, and partial-completion states; completed assessment answers with correct/incorrect/omitted outcomes; direct-practice attempts including first-try correct, solved-after-retry, and repeated incorrect. Place data in multiple curriculum levels and dates. |
| `PERIOD_*` | Enough activity in the two 28-day windows to exercise `IMPROVING`, `DECLINING`, `STABLE`, and `INSUFFICIENT_DATA` trend outcomes. Include Arabic titles for analysis search. |

## User stories

### PARENT-AUTH-001 — Verify identity and start a parent session

**Priority/Risk:** Critical — child-data privacy and account takeover

**Sources:** `POST /auth/parents/login`; `ParentAuthController`, `ParentSessionService`, `ParentAuthGuard`, `AuthRateLimitService`.

**User story:** As a parent, I want to verify with a linked child's national ID and my phone number so that I can securely view my linked children's approved information.

**Acceptance criteria:**

- Given `CHILD_A` is active and linked to `PARENT_PHONE_A`, when its valid 14-digit national ID and the phone are submitted, then the API returns `201` and only an `accessToken` for a parent session with no active child.
- Given the same phone is formatted with supported Egyptian country-code/spacing variants, when it normalizes to the recorded number, then login succeeds. A malformed phone returns `400`.
- Given a wrong, malformed, or unknown national ID, a wrong phone, or a national ID belonging to `CHILD_C`, when login is attempted, then it returns the same safe `401 Invalid credentials` outcome without revealing whether a child, phone, or association exists.
- Given repeated failed attempts for the same identifier or source IP, when the configured threshold is crossed, then login is throttled with `429`; a valid login after an allowed failure clears the applicable failure state. Do not use production identities in this test.
- Given the token is expired, revoked, signed with the normal user secret, or absent, when it is used on a parent route, then it is rejected with `401` and does not produce child data. Verify that parent tokens also cannot authenticate to a normal `/admin/*` route.

**Test type:** API, security, rate-limit, regression. **Dependencies:** Redis rate limiter, JWT clock/configuration.

### PARENT-CHILD-001 — View only linked children

**Priority/Risk:** Critical — family association privacy

**Sources:** `GET /auth/parents/children?page=&limit=`; `ParentSessionService.listChildren`.

**User story:** As a verified parent, I want to see the children currently linked to my phone number so that I can choose whose information to review.

**Acceptance criteria:**

- Given `PARENT_TOKEN` and two linked children, when `GET /auth/parents/children` is called, then it returns `200`, only `CHILD_A` and `CHILD_B`, ordered newest first, and the safe fields `userId`, `fullName`, `governorate`, `center`, and account `status`.
- Given linked active and suspended children, when the list is read, then both are visible with their correct status; `CHILD_C` is never present. Verify national ID, parent phone, password/hash, student phone, entitlements, orders, attempts, and internal session data are absent.
- Given valid pagination, including a final/empty page, when `page` and `limit` are used, then `data` and `meta` (`page`, `limit`, `total`, `totalPages`) are accurate and non-overlapping. Given `page=0`, non-integers, negative values, or `limit` outside 1–100, then validation fails with `400` and no partial list.
- Given no current linked children can be represented by the test environment, when the route is called with a valid session, then it returns a normal empty collection and accurate zero metadata rather than an authorization failure.

**Test type:** API, authorization, pagination, privacy. **Dependencies:** parent session and student association data.

### PARENT-CHILD-002 — Select and switch the active child

**Priority/Risk:** Critical — scope isolation

**Sources:** `POST /auth/parents/select-child`, `GET /auth/parents/selected-child`; `ParentSessionService.selectChild`, `ParentSelectedChildGuard`.

**User story:** As a parent, I want to select one active linked child and switch deliberately so that every following dashboard read is scoped to that child.

**Acceptance criteria:**

- Given `PARENT_TOKEN`, when `CHILD_A.userId` is selected, then `201` returns a replacement parent token. With that returned token, `GET /auth/parents/selected-child` returns `200` with only A's safe identity/location/status fields.
- Given the new token selects A, when B is selected using it, then another token is returned and selected-child reads/analytics resolve to B only. Retest the original A-selected token after switching: the persisted session's active child is B, so it must not keep accessing A.
- Given a missing/empty/non-string `studentUserId`, then selection returns `400`. Given `CHILD_C.userId`, a deleted/non-student record, or a linked suspended child, then selection returns `403` without exposing profile fields.
- Given a valid parent token with no selected child, when `/auth/parents/selected-child`, performance, or analytics routes are called, then they return `400 No child selected for this session`; the children list remains available.
- Given the selected child is suspended after selection, when the old selected-child token is used, then parent access is blocked safely (`401` if the admin suspension revokes the session; otherwise do not accept stale child data). After reactivation, verify the product's current flow: sign in and select again before continuing.

**Test type:** API, authorization, security, regression. **Related roles:** student, admin.

### PARENT-PERFORMANCE-001 — View the selected child's unified performance overview and analysis

**Priority/Risk:** High — correct interpretation of learning data

**Sources:** `GET /parent/selected-child/performance`, `GET /parent/selected-child/performance/analysis`; `ParentPerformanceController`, `PerformanceService`.

**User story:** As a parent, I want to see my selected child's aggregate results and curriculum breakdown so that I can understand progress without accessing private learning actions.

**Acceptance criteria:**

- Given A has known direct-practice and completed-assessment activity, when overview is requested with no dates and with inclusive valid `from`/`to` ISO dates, then the period echo, totals, accuracy/score metrics, question-bank usage, source breakdown, and `lastActivityAt` match the seeded activities. An empty valid period returns the documented zero/empty metrics, not another child's history.
- Given A has activity across subjects, courses, chapters, lessons, and sections, when analysis is requested for each supported `level`, then rows aggregate only the requested level and active selected child. `q` performs trimmed, case-insensitive/Arabic-normalized filtering, and valid pagination has accurate metadata and stable non-overlapping results.
- Given malformed dates, an invalid level, invalid page/limit, an overlong/blank search query, or incompatible scope IDs, when submitted, then the API returns validation/safe error response and does not return a broadened dataset.
- Given A and C have distinguishable scores, when A is selected and A's, C's, or arbitrary curriculum IDs are substituted in the request, then the response contains only activities whose student is A. It must not disclose C's metrics or identities.
- Confirm that no parent peer-comparison endpoint exists: never substitute student `/performance/peers` routes for a parent feature, because peer data is intentionally excluded from the parent API.

**Test type:** API, calculation, authorization, pagination/search. **Dependencies:** deterministic attempt timestamps and known outcomes.

### PARENT-PERFORMANCE-002 — Review trends and actionable performance insights

**Priority/Risk:** High — reporting accuracy

**Sources:** `GET /parent/selected-child/performance/trends`, `GET /parent/selected-child/performance/insights`; `PerformanceService.trends`, `PerformanceService.insights`.

**User story:** As a parent, I want to review my selected child's trend and insight summaries so that I can identify strengths and areas needing support.

**Acceptance criteria:**

- Given dated A activities, when trends is requested with optional valid period and curriculum scope filters, then daily rows, source breakdown, recent/previous 28-day metrics, and the derived `IMPROVING`/`DECLINING`/`STABLE` classification match the fixtures. With fewer than 10 answered activities in either comparison window, the trend is `INSUFFICIENT_DATA` and `changePoints` is null.
- Given sufficient and insufficient activity by chapter/lesson/section, when insights is read, then its `status`, strengths (>=80%), weaknesses (<60%), limited-practice, omissions, repeated errors, recommendations, and trend are derived only from A's data. It must use the documented minimum of 10 answered attempts for full insight availability.
- Given no activity or no matching scoped activity, then both endpoints return their valid empty/insufficient-data shapes without null-pointer failures or invented recommendations.
- Given invalid dates or malformed scope filters, then the request fails safely. Given B is selected after A, then no cached response or token reuse returns A's trend/insights under B's selection.

**Test type:** API, calculation, authorization, regression. **Dependencies:** clock-controlled activity dates.

### PARENT-ANALYTICS-001 — Discover only the selected child's current learning-access scopes

**Priority/Risk:** High — purchase/access privacy

**Sources:** `GET /parent/selected-child/analytics/scopes?page=&limit=`; `LearningService.parentAnalyticsScopes` and entitlement policy.

**User story:** As a parent, I want to see the selected child's current course/chapter access grouped by subject so that I can choose a permitted scope for progress reporting.

**Acceptance criteria:**

- Given A has active course and chapter entitlements in multiple subjects, when scopes are requested, then the response contains A's safe identity, subject groups ordered by title, and each active access grant's entitlement ID, source, nullable order/order-item IDs, and course/chapter target.
- Given one active course grant and an active chapter grant within that same course, then the course grant is shown and the covered chapter grant is suppressed. Duplicate grants for the same target resolve to one representative. A standalone chapter grant remains visible.
- Given revoked, expired, future, non-active, B-owned, and C-owned entitlements, when scopes are requested, then none is returned. This is an active-access view, not a full commerce/order history.
- Given valid pagination including a requested limit greater than 50, then the endpoint reports correct total subjects and returns at most 50 subject groups per page. Invalid pagination returns `400` without scope data.

**Test type:** API, entitlement-policy, privacy, pagination. **Dependencies:** entitlement status and clock.

### PARENT-ANALYTICS-002 — View entitlement-scoped content, assessment, and practice summaries

**Priority/Risk:** High — aggregation and authorization

**Sources:** `GET /parent/selected-child/analytics/content`, `/analytics/assessments`, `/analytics/practice`; `LearningService.parentAnalyticsContent`, `parentAnalyticsAssessments`, `parentAnalyticsPractice`.

**User story:** As a parent, I want to inspect learning summaries for one active subject or access grant so that I can understand progress without seeing protected lesson bodies or answers.

**Acceptance criteria:**

- Given exactly one active `subjectId`, `entitlementId`, or legacy `orderItemId` belonging to A, when each endpoint is called, then it returns `200`, a scope matching that selector, aggregate summary, target rows, and correct pagination. A subject selector aggregates A's active targets in that subject; exact selectors resolve only their currently active entitlement.
- Given the seeded content state, when content analytics is read, then total/completed counts, one-decimal completion percent (or null for zero denominator), and last activity reflect only published content in the selected active targets. It must return no lesson body, asset URL, storage key, or individual study state.
- Given completed assessment answers, when assessment analytics is read, then completed assessment count, correct/incorrect/omitted counts, score/accuracy/omission percentages, and last completion date match known outcomes. Given direct-practice attempts, when practice analytics is read, then unique-question, total/correct attempt, attempt-accuracy, first-attempt-correct, solved-after-retry, and last-activity metrics match the immutable attempt history.
- Given none, more than one, blank, or malformed selector, then the API returns `400`. Given an unknown, B/C-owned, revoked, expired, or future entitlement/order item, then it returns `404 Active analytics entitlement not found`, with no target or metrics leaked.
- Given a course entitlement covers chapters, then chapter-level data must not be double-counted. Repeat the same selector after revocation/expiry and verify it becomes unavailable rather than exposing historic access analytics.

**Test type:** API, calculation, authorization, pagination, regression. **Dependencies:** published placements, entitlement clock, assessment/practice fixtures.

### PARENT-SECURITY-001 — Preserve parent scope when child association or status changes

**Priority/Risk:** Critical — privacy and session invalidation

**Sources:** parent guards/services; student profile update and administrative suspend/reactivate flows; `test/parent.e2e-spec.ts` and `scripts/journeys/auth/parent-multiple-children.journey.ts`.

**User story:** As a family, we need parent access to stop or change immediately when the selected child is no longer active or no longer linked, so that historic tokens cannot expose the child's information.

**Acceptance criteria:**

- Given A is selected, when an admin suspends A, then selected-child reads and every selected-child analytics/performance endpoint deny access and disclose no cached A data. Confirm the suspension flow revokes the existing parent session where implemented; its subsequent use must be `401`.
- Given A's parent phone is changed through the permitted student profile update, when the update succeeds, then active sessions associated with the old normalized phone are revoked. A parent cannot continue with an old token or log in using the old phone; the new verified phone can create a new session using A's national ID.
- Given the association is no longer the session's phone, when a stale selected-child token calls a protected parent endpoint, then the defense-in-depth parent-phone check returns a safe denial. Changing an ID, query selector, deep link, or old token must not bypass this check.
- Given a parent bearer token is sent to student, partner, admin, or super-admin endpoints, and normal-role tokens are sent to parent endpoints, then authentication is rejected safely and nothing is disclosed. Verify unauthenticated requests likewise.
- Given concurrent select-child requests for A and B in the same parent session, record and approve the product's expected last-write-wins result: the stored active child and any subsequently accepted token must agree; no request may obtain C's data. This is a concurrency risk to retain in regression coverage.

**Test type:** API, security, integration, concurrency, regression. **Related roles:** student, admin, public user, partner, super admin.

## Open product decisions / gaps

- A parent has no registration, profile, password, password reset, logout, logout-all, or refresh-token route. Parent access is a bearer-only verification session; confirm whether a client should offer any session-end control beyond discarding the token.
- Parent-facing catalogue/library, purchase/payment/refund history, lesson delivery, assessment attempts/answers, student profile editing, messaging, notifications, export, and audit-log screens have no parent endpoints. The approved scope today is aggregate analytics and the limited child identity record above.
- The parent login design permits a person with a child's national ID and linked parent phone to view every child sharing that phone. Product/security owners should explicitly approve this recovery/verification model and its token lifetime/rate-limit settings.
- API tests cannot establish browser loading/retry treatment, Arabic/English presentation, responsive layout, accessibility, or secure client-side token storage. Add UI stories when a parent frontend and its product requirements exist.
