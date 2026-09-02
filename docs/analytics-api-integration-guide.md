# Analytics API Integration Guide

This is the frontend contract for the implemented learning, publisher, referral,
and platform reporting APIs. It is organized by the application that consumes
the data: student, parent, partner, and administrator.

Use Swagger at `/api/docs` for the generated request/response schemas. The
controllers and DTOs remain the implementation source of truth.

## 1. Foundation

### Base URL and request rules

All documented URLs are relative to the API version prefix:

```text
${API_ORIGIN}/api/v1
```

For all authenticated calls, send the access token returned at login:

```http
Authorization: Bearer <accessToken>
Accept: application/json
```

Send `Content-Type: application/json` only on requests with a JSON body. All
analytics reads in this guide are `GET` requests and have no request body.

- Put the API origin in an environment variable; do not hard-code a host in a
  feature or component.
- Build URLs with `URLSearchParams` so IDs and search text are encoded safely.
- The backend rejects unknown query/body fields and converts numeric query
  values such as `page` and `limit` to numbers.
- Date filters use Cairo calendar dates in `YYYY-MM-DD` form and are inclusive.
- Monetary values are EGP **minor units**. For display, divide `amountMinor`
  by 100 using a currency formatter; do not use binary floating-point values
  for finance calculations.

### User token refresh

Student, partner, and admin logins return a bearer access token and set an
HttpOnly `refresh_token` cookie. Browser clients must call the API with
credentials enabled so the cookie is sent on refresh:

```ts
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_ORIGIN}/api/v1`,
  withCredentials: true,
});
```

On one `401`, call `POST /auth/refresh`, replace the in-memory access token
with the returned `accessToken`, and retry the original request once. If the
refresh fails, clear the session and return to login. Do not retry a failed
refresh request or enter a refresh loop.

Parent sessions are different: `POST /auth/parents/login` returns a parent
access token and does not use the user refresh-cookie flow. Store it only as
long as needed for that parent session; a new parent login is required after
expiry.

### Error handling

Errors have a stable envelope like this:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": { "ar": "...", "en": "Validation failed" },
  "error": { "ar": "...", "en": "Bad Request" },
  "details": [{ "field": "page", "message": "..." }],
  "correlationId": "..."
}
```

`details` is optional. Use the localized `message` matching the current UI
language, render field errors next to applicable controls, and retain the
`correlationId` in frontend error logging/support reports.

| Status | Frontend behavior |
| --- | --- |
| `400` | Correct invalid filters/fields; do not retry automatically. |
| `401` | Run the single refresh flow for user accounts, or return a parent user to login. |
| `403` | Show the account/role/selected-child/access restriction; do not treat it as empty data. |
| `404` | The requested purchased scope or resource is no longer available; refresh the surrounding list. |
| `409` | Show a temporary feature/state message. Publisher ledger reporting can be disabled by rollout control. |
| `429` | Respect the `Retry-After` header when present. |

### Pagination

List endpoints accept `page` (one-based, default `1`) and `limit` (default
`20`, maximum `100`) unless stated otherwise. A normal response is:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Keep the currently applied filters when changing pages. Analytics data can
legitimately be empty, so render an empty state after a successful `200`, not
an error state.

## 2. Access and screen map

| App area | Required identity | Intended screens |
| --- | --- | --- |
| Student analytics | `STUDENT` | Assessment analytics and personal performance dashboard. |
| Parent analytics | Parent access token **and** a selected child | Purchased-content progress and child performance dashboard. |
| Publisher analytics | `PARTNER` with `CONTENT_PUBLISHER` profile | Earnings, content coverage, and question-usage dashboard. |
| Partner allocations | `PARTNER` | Allocation-ledger history for the authenticated partner. |
| Referral analytics | `PARTNER` with `REFERRAL_PARTNER` profile | Referral conversions, commissions, and settlements. |
| Platform reporting | `ADMIN` or `SUPER_ADMIN` | Finance, operations, and downloadable reporting. |

Do not use an endpoint from another app area as a substitute for a role-specific
screen. In particular, publisher question metrics and referral reports are
privacy-safe aggregates rather than student drill-down APIs.

## 3. Student analytics

### Assessment analytics

```http
GET /student/assessments/analytics/summary
```

This aggregates **completed** assessment answers. With no scope filters it
groups results by subject. Supplying `subjectId` changes the grouping to
chapters; adding `chapterId` changes it to the topic level and also returns
completed assessment attempts for that chapter.

| Query parameter | Use |
| --- | --- |
| `subjectId` | Narrow to one subject. |
| `chapterId` | Narrow to one chapter; use with `subjectId` for the chapter/topic drill-down. |
| `q` | Optional case-insensitive group/assessment-title search. |
| `page`, `limit` | Paginate both group rows and chapter attempts. |

Example:

```http
GET /student/assessments/analytics/summary?subjectId=sub_123&chapterId=chapter_456&page=1&limit=20
```

Response shape:

```json
{
  "level": "topic",
  "data": [
    {
      "id": "section_789",
      "title": "Cell division",
      "subjectId": "sub_123",
      "chapterId": "chapter_456",
      "total": 12,
      "correct": 9,
      "incorrect": 2,
      "omitted": 1,
      "answered": 11,
      "percentage": 75
    }
  ],
  "attempts": [],
  "meta": {
    "groups": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
    "attempts": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

Use `percentage` as the correct-answer percentage out of all questions,
including omissions. Do not derive it from `answered`.

### Personal performance API

These endpoints power the broader student dashboard. All accept `from` and
`to` (`YYYY-MM-DD`) where their table says “period.” Scope filters are the
academic IDs `subjectId`, `courseId`, `chapterId`, `lessonId`, and `sectionId`
where supported.

| Endpoint | Job | Key query parameters |
| --- | --- | --- |
| `GET /student/performance/overview` | Headline performance metrics for the chosen period. | `from`, `to` |
| `GET /student/performance/analysis` | Paginated performance by a curriculum level. | Required `level` = `subject`, `course`, `chapter`, `lesson`, or `section`; optional period, scope, `q`, pagination. |
| `GET /student/performance/trends` | Time-series data for charting. | Period and optional scope. |
| `GET /student/performance/insights` | Weak/strong-area insights and recommendations. | Period and optional scope. |
| `GET /student/performance/peers` | Privacy-safe peer comparison. | Required `subjectId`, `courseId`; optional lower scope and period. |
| `GET /student/performance/answer-changes` | Statistics about changed answers. | Period and optional scope. |
| `GET /student/performance` | Current-grade direct-practice summary. | None. |

For peer comparison, suppress the comparison card when the API indicates no
eligible cohort instead of assuming that zero means the student performed at
zero percent.

## 4. Parent analytics

Parent endpoints require the parent token and a selected child. Run this flow
after parent login and whenever the parent changes the active child:

```text
POST /auth/parents/login
  → GET /auth/parents/children
  → POST /auth/parents/select-child { "studentUserId": "..." }
  → call parent analytics endpoints
```

`select-child` returns a replacement parent access token. Replace the token
before requesting analytics. A `403` from a parent analytics route usually
means that no child is selected or the selection is not linked to the parent.

### Active-entitlement analytics

First load the scopes:

```http
GET /parent/selected-child/analytics/scopes?page=1&limit=20
```

Each scope response provides the child identity plus active access grants grouped
by subject. A grant identifies its `entitlementId`, `source`, target, and any
linked `orderId`/`orderItemId` (both are `null` for a non-order grant). Revoked,
expired, future, and otherwise inactive entitlements are never returned. Course
access hides chapter grants in that same course to prevent overlapping analytics.

Every detail endpoint requires **exactly one** of `subjectId`, `entitlementId`,
or `orderItemId`. `entitlementId` is the preferred exact selector. `orderItemId`
is retained temporarily for backward compatibility and resolves only to a
currently active entitlement. Passing neither or more than one is a `400`.
Detail rows are paginated; their maximum effective `limit` is `50`.

| Endpoint | Job | Required scope query |
| --- | --- | --- |
| `GET /parent/selected-child/analytics/content` | Completion, total items, completion percentage, and recent activity for accessible content. | `subjectId`, `entitlementId`, or legacy `orderItemId` |
| `GET /parent/selected-child/analytics/assessments` | Completed-assessment counts and correct/incorrect/omitted score metrics. | `subjectId`, `entitlementId`, or legacy `orderItemId` |
| `GET /parent/selected-child/analytics/practice` | Direct-practice attempts, accuracy, first-attempt success, retry success, and recent activity. | `subjectId`, `entitlementId`, or legacy `orderItemId` |

Example:

```http
GET /parent/selected-child/analytics/practice?entitlementId=entitlement_123&page=1&limit=20
```

All three detail responses follow this pattern:

```json
{
  "scope": { "type": "COURSE", "id": "course_123", "title": "Biology", "entitlementId": "entitlement_123", "source": "PAYMENT", "orderId": "order_123", "orderItemId": "order_item_123" },
  "summary": { "...": "aggregate for the complete selected scope" },
  "data": [{ "type": "COURSE", "id": "course_123", "title": "Biology", "...": "per-target metrics" }],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

For content, `completionPercent` is `null` when the scope has no content; show
“No content available” rather than `0%`. For assessment scores, and practice
accuracy, the APIs similarly use `null` where a percentage is undefined.

### Parent performance API

This is the parent equivalent of the student performance dashboard and applies
to the selected child. It does not require a purchased-scope filter.

| Endpoint | Job |
| --- | --- |
| `GET /parent/selected-child/performance` | Unified child performance overview. |
| `GET /parent/selected-child/performance/analysis` | Child performance grouped by academic hierarchy. |
| `GET /parent/selected-child/performance/trends` | Child performance over time. |
| `GET /parent/selected-child/performance/insights` | Child insights and recommendations. |

Query parameters are the same as the corresponding student performance route,
except parent routes do not expose peer comparison or answer-change statistics.

## 5. Partner and content-publisher analytics

All routes in this section require a `PARTNER` token. Allocation history is
available to any partner account. The dashboard, earnings, question usage, and
content routes additionally require a partner profile of type
`CONTENT_PUBLISHER`. The ledger reporting feature may be disabled or
allowlisted during rollout; this returns `409`, not an empty result.

Date queries default to the current Cairo calendar month. For earnings and
question-usage trends, `granularity` may be `day` or `month`; omit it to let
the server select daily data for ranges up to 93 days and monthly data for
longer periods.

| Endpoint | Job | Query parameters |
| --- | --- | --- |
| `GET /partners/dashboard` | Dashboard metrics plus a compact daily earnings trend. | `from`, `to` |
| `GET /partners/analytics/earnings` | Earnings totals/trend from immutable ledger allocations. | `from`, `to`, `granularity` |
| `GET /partners/analytics/allocations` | Paginated allocation ledger entries for the authenticated partner. | `from`, `to`, `page`, `limit` |
| `GET /partners/analytics/content` | Agreement-covered content available to the publisher. | `status`, `page`, `limit` |
| `GET /partners/analytics/question-usage` | Aggregate usage and correctness trend for publisher-owned questions. | Period, granularity, curriculum filters, optional `sourceId`, pagination. |
| `GET /partners/analytics/question-usage/sources` | Paginated question-usage breakdown by source. | Same as question usage. |
| `GET /partners/analytics/question-usage/questions` | Paginated question-usage breakdown by frozen question. | Same as question usage. |

The question-usage curriculum filters are `subjectId`, `courseId`,
`chapterId`, `lessonId`, and `sectionId`. Metrics intentionally omit learner
identity. Never add a UI path that attempts to display individual student names
or raw attempts from these responses.

Finance display rules:

- Render every returned money object using its `currency`; do not assume a
  hard-coded decimal representation from an integer field name alone.
- Ledger entries may be reversed or unpaid. Display their returned `state`,
  `paidAt`, and `reversedAt`; do not label an allocation as paid merely because
  it exists.
- Treat returned ledger totals as authoritative. Do not recalculate earnings
  by summing only the current page of allocation rows.

## 6. Referral analytics

These routes require a partner profile of type `REFERRAL_PARTNER`; a content
publisher partner cannot use them.

| Endpoint | Audience | Job |
| --- | --- | --- |
| `GET /partners/referrals/report` | `PARTNER` with `REFERRAL_PARTNER` profile | Privacy-safe aggregate conversions, sales, commissions, trends, products, and categories. |
| `GET /partners/referrals/settlements` | `PARTNER` with `REFERRAL_PARTNER` profile | Privacy-safe aggregate settlement summaries without order rows. |
| `GET /admin/referral-reporting` | `ADMIN` or `SUPER_ADMIN` | Aggregate reporting for a selected referral partner; administrative results are not cohort-suppressed. |

Use the report endpoint for dashboard cards/charts and the settlements endpoint
for payment-history cards. Partner responses are cohort-protected: absence of a
small cohort must be rendered as unavailable/suppressed data, not as an exact
zero.

## 7. Administrator reporting and exports

All routes in this section require `ADMIN` or `SUPER_ADMIN`. They return
aggregate operational data and support the standard reporting filters:
`from`, `to`, academic scope IDs, `gradeId`, `governorateId`, `centerId`,
payment/order status, payment channel, promotion/coupon/referral code, and
`partnerUserId` where applicable. Offer only filters relevant to the report
screen rather than exposing an unbounded generic filter form.

| Endpoint | Job |
| --- | --- |
| `GET /admin/reports/commerce` | Platform commerce totals. |
| `GET /admin/reports/revenue` | Approved revenue and discount totals. |
| `GET /admin/reports/refunds` | Refund-request and approved-reimbursement totals. |
| `GET /admin/reports/payments` | Payment-attempt totals. |
| `GET /admin/reports/registrations` | Student-registration totals. |
| `GET /admin/reports/active-purchasers` | Approved-purchaser and current-access totals. |
| `GET /admin/reports/entitlements` | Entitlement grant, revocation, expiry, and active-access totals. |
| `GET /admin/reports/partner-obligations` | Publisher and referral obligation totals. |

### CSV export workflow

Exports are asynchronous. Do not try to construct a CSV in the browser from a
dashboard response: an export is the secure source-record report for a chosen
report type and column set.

1. Request a job with `POST /admin/reports/exports`.
2. Poll `GET /admin/reports/exports?page=1&limit=20` while the job is queued
   or processing. Use a moderate interval such as 2–5 seconds and stop polling
   when the page unmounts.
3. When the job reports completion, open/download through
   `GET /admin/reports/exports/:id/download` using the authenticated client.
4. Allow cancellation only for jobs that are not terminal, using
   `POST /admin/reports/exports/:id/cancel`.

Export request example:

```http
POST /admin/reports/exports
Content-Type: application/json

{
  "reportType": "COMMERCE",
  "columns": ["orderId", "approvedAt", "amountMinor", "currency"],
  "from": "2026-08-01",
  "to": "2026-08-31",
  "reason": "Monthly finance reconciliation"
}
```

The permitted `reportType` values are `COMMERCE`, `PLATFORM_REVENUE`,
`REFUNDS`, `PAYMENTS`, `REGISTRATIONS`, `ACTIVE_PURCHASERS`,
`ENTITLEMENT_LIFECYCLE`, `PARTNER_OBLIGATIONS`, `PUBLISHER_ALLOCATIONS`,
`PUBLISHER_SETTLEMENTS`, `REFERRAL_ALLOCATIONS`, `REFERRAL_SETTLEMENTS`, and
`ENTITLEMENTS`.

Some exports may be classified as restricted/PII. Never put their download
URLs into application logs, analytics events, client-side error reporting, or
shareable browser history links.

## 8. Recommended frontend implementation

Keep analytics data separate by identity/session type to prevent a stale
student or parent selection from appearing in another person’s dashboard.

```text
analytics cache key
  = [feature, role/session type, selected child ID if parent, filters]
```

Recommended behavior:

- Invalidate parent analytics queries when the selected child changes.
- Invalidate or refetch all protected analytics on token refresh/logout rather
  than serving a previous user’s cached response.
- Debounce text search (`q`) and reset `page` to `1` when any filter changes.
- Preserve server-returned dates as ISO timestamps and format them in the UI;
  do not reinterpret them as local date-only values.
- Use loading skeletons for first load, retain the prior result while changing
  a chart filter when practical, and distinguish an empty successful response
  from access errors.
- Keep raw responses out of third-party client analytics, especially partner,
  parent, referral, and export data.

## 9. Pre-release checklist

- [ ] API origin and `/api/v1` prefix come from environment configuration.
- [ ] Protected requests attach the correct token for the active role.
- [ ] User refresh uses credentialed requests and retries once at most.
- [ ] Parent login → children → select-child flow is complete before rendering parent data.
- [ ] Parent analytics detail calls pass exactly one of `subjectId`, `entitlementId`, or legacy `orderItemId`.
- [ ] Money is displayed from minor units with the returned currency.
- [ ] `null` percentages and cohort-suppressed data have intentional UI states.
- [ ] Pagination, empty state, `400`, `401`, `403`, `404`, `409`, and `429` are handled.
- [ ] CSV export polling stops when no longer needed and restricted links are never logged.


## 10. Captured request and response examples

The following examples come from the full API verification report dated 25 August 2026: `reports/api-tests/api-2026-08-25T05-57-00-240Z.json`. Authorization values, cookies, correlation IDs, and the signed export URL are intentionally redacted. Where a response contains a multi-row array, the example retains its first captured item only to keep this guide usable; the endpoint can return additional items as indicated by its pagination or totals.

Test-record IDs in request URLs are historical and may have been removed by test cleanup. They demonstrate the request shape only—always use IDs returned by the active environment.

### `GET /api/v1/student/assessments/analytics/summary`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/assessments/analytics/summary?subjectId=cmt893lj100umtd01osahnw8m
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "level": "chapter",
  "data": [
    {
      "id": "cmt893mc400v0td01ulb2poi9",
      "title": "Assessments chapter journey-20260825054824-b27b-181",
      "subjectId": "cmt893lj100umtd01osahnw8m",
      "chapterId": "cmt893mc400v0td01ulb2poi9",
      "lessonId": null,
      "sectionId": null,
      "total": 2,
      "correct": 1,
      "incorrect": 0,
      "omitted": 1,
      "answered": 1,
      "percentage": 50
    }
  ],
  "attempts": [],
  "meta": {
    "groups": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### `GET /api/v1/student/performance/overview`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance/overview
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": null,
    "to": null
  },
  "total": 3,
  "correct": 2,
  "incorrect": 0,
  "omitted": 1,
  "answered": 2,
  "accuracyPercent": 100,
  "uniqueQuestionsAttempted": 2,
  "questionBank": {
    "eligible": 2,
    "used": 2,
    "unused": 0,
    "usagePercent": 100
  },
  "sources": {
    "assessment": {
      "total": 2,
      "correct": 1,
      "incorrect": 0,
      "omitted": 1,
      "answered": 1,
      "accuracyPercent": 100
    },
    "practice": {
      "total": 1,
      "correct": 1,
      "incorrect": 0,
      "omitted": 0,
      "answered": 1,
      "accuracyPercent": 100
    }
  },
  "lastActivityAt": "2026-08-25T05:55:56.220Z"
}
```

### `GET /api/v1/student/performance/analysis`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance/analysis?level=section&subjectId=cmt894dg2016ztd010pbtp2go&sectionId=cmt894ewr017ptd01o3xb2umq
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "level": "section",
  "data": [
    {
      "id": "cmt894ewr017ptd01o3xb2umq",
      "title": "Performance section journey-20260825054824-b27b-204",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "sources": {
        "assessment": {
          "total": 2,
          "correct": 1,
          "incorrect": 0,
          "omitted": 1,
          "answered": 1,
          "accuracyPercent": 100
        },
        "practice": {
          "total": 1,
          "correct": 1,
          "incorrect": 0,
          "omitted": 0,
          "answered": 1,
          "accuracyPercent": 100
        }
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/student/performance/trends`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance/trends
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "date": "2026-08-25",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "sources": {
        "assessment": {
          "total": 2,
          "correct": 1,
          "incorrect": 0,
          "omitted": 1,
          "answered": 1,
          "accuracyPercent": 100
        },
        "practice": {
          "total": 1,
          "correct": 1,
          "incorrect": 0,
          "omitted": 0,
          "answered": 1,
          "accuracyPercent": 100
        }
      }
    }
  ],
  "trend": {
    "status": "INSUFFICIENT_DATA",
    "recent": {
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100
    },
    "previous": {
      "total": 0,
      "correct": 0,
      "incorrect": 0,
      "omitted": 0,
      "answered": 0,
      "accuracyPercent": 0
    },
    "changePoints": null
  }
}
```

### `GET /api/v1/student/performance/insights`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance/insights?sectionId=cmt894ewr017ptd01o3xb2umq
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "status": "INSUFFICIENT_DATA",
  "minimumAnsweredAttempts": 10,
  "strengths": [],
  "weaknesses": [],
  "limitedPractice": [
    {
      "id": "cmt894ewr017ptd01o3xb2umq",
      "title": "Performance section journey-20260825054824-b27b-204",
      "level": "section",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "recommendation": "PRACTICE_MORE"
    }
  ],
  "omissions": [
    {
      "id": "cmt894ewr017ptd01o3xb2umq",
      "title": "Performance section journey-20260825054824-b27b-204",
      "level": "section",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "recommendation": "COMPLETE_SKIPPED"
    }
  ],
  "repeatedErrors": [],
  "trend": {
    "status": "INSUFFICIENT_DATA",
    "recent": {
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100
    },
    "previous": {
      "total": 0,
      "correct": 0,
      "incorrect": 0,
      "omitted": 0,
      "answered": 0,
      "accuracyPercent": 0
    },
    "changePoints": null
  },
  "recommendations": [
    "PRACTICE_MORE"
  ]
}
```

### `GET /api/v1/student/performance/peers`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance/peers?subjectId=cmt894dg2016ztd010pbtp2go&courseId=cmt894dm70173td012n0x1ygf&sectionId=cmt894ewr017ptd01o3xb2umq
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "status": "INSUFFICIENT_DATA",
  "scope": {
    "subjectId": "cmt894dg2016ztd010pbtp2go",
    "courseId": "cmt894dm70173td012n0x1ygf",
    "chapterId": null,
    "lessonId": null,
    "sectionId": "cmt894ewr017ptd01o3xb2umq"
  },
  "cohort": {
    "type": "GRADE_SHARED_SCOPE",
    "sampleSize": 0,
    "minimumSampleSize": 10,
    "minimumAnsweredAttempts": 10
  },
  "student": null,
  "peers": null,
  "distribution": null,
  "comparison": null
}
```

### `GET /api/v1/student/performance/answer-changes`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance/answer-changes?sectionId=cmt894ewr017ptd01o3xb2umq
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "totalChanges": 1,
  "correctToIncorrect": 0,
  "incorrectToCorrect": 1,
  "data": [
    {
      "id": "cmt894ip201abtd01yyhv8lme",
      "fromOutcome": "INCORRECT",
      "toOutcome": "CORRECT",
      "changedAt": "2026-08-25T05:55:54.663Z"
    }
  ]
}
```

### `GET /api/v1/student/performance`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/student/performance
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "totalQuestions": 1,
  "attemptedQuestions": 1,
  "solvedQuestions": 1,
  "totalAttempts": 2,
  "accuracyPercent": 50,
  "firstTryCorrect": 0,
  "lastActivityAt": "2026-08-25T05:55:01.570Z"
}
```

### `GET /api/v1/parent/selected-child/analytics/scopes`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/analytics/scopes
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "child": {
    "userId": "cmt88ym7i00nbtd0110ojxrnb",
    "fullName": "Manual payment student journey-20260825054824-b27b-140"
  },
  "data": [
    {
      "subject": {
        "id": "cmt88ve3c002utd010b06ph0h",
        "title": "Covered subjects journey-20260825054824-b27b-92"
      },
      "accessGrants": [
        {
          "entitlementId": "cmt_active_entitlement",
          "source": "PAYMENT",
          "orderId": "cmt88yqtc00outd01243zzdyb",
          "orderItemId": "cmt88yqtc00owtd0109mbj6d6",
          "target": {
            "type": "CHAPTER",
            "id": "cmt88veyb0032td01ubdgqwq9",
            "title": "Covered chapters journey-20260825054824-b27b-94"
          }
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/parent/selected-child/analytics/content`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/analytics/content?entitlementId=cmt_active_entitlement
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "scope": {
    "type": "CHAPTER",
    "id": "cmt88veyb0032td01ubdgqwq9",
    "title": "Covered chapters journey-20260825054824-b27b-94",
    "entitlementId": "cmt_active_entitlement",
    "source": "PAYMENT",
    "orderId": "cmt88yqtc00outd01243zzdyb",
    "orderItemId": "cmt88yqtc00owtd0109mbj6d6"
  },
  "summary": {
    "completedItems": 0,
    "totalItems": 1,
    "completionPercent": 0,
    "lastActivityAt": null
  },
  "data": [
    {
      "type": "CHAPTER",
      "id": "cmt88veyb0032td01ubdgqwq9",
      "title": "Covered chapters journey-20260825054824-b27b-94",
      "completedItems": 0,
      "totalItems": 1,
      "completionPercent": 0,
      "lastActivityAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/parent/selected-child/analytics/assessments`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/analytics/assessments?entitlementId=cmt_active_entitlement
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "scope": {
    "type": "CHAPTER",
    "id": "cmt88veyb0032td01ubdgqwq9",
    "title": "Covered chapters journey-20260825054824-b27b-94",
    "entitlementId": "cmt_active_entitlement",
    "source": "PAYMENT",
    "orderId": "cmt88yqtc00outd01243zzdyb",
    "orderItemId": "cmt88yqtc00owtd0109mbj6d6"
  },
  "summary": {
    "completedAssessments": 0,
    "correct": 0,
    "incorrect": 0,
    "omitted": 0,
    "scorePercent": null,
    "accuracyPercent": null,
    "omissionPercent": null,
    "lastCompletedAt": null
  },
  "data": [
    {
      "type": "CHAPTER",
      "id": "cmt88veyb0032td01ubdgqwq9",
      "title": "Covered chapters journey-20260825054824-b27b-94",
      "completedAssessments": 0,
      "correct": 0,
      "incorrect": 0,
      "omitted": 0,
      "scorePercent": null,
      "accuracyPercent": null,
      "omissionPercent": null,
      "lastCompletedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/parent/selected-child/analytics/practice`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/analytics/practice?entitlementId=cmt_active_entitlement
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "scope": {
    "type": "CHAPTER",
    "id": "cmt88veyb0032td01ubdgqwq9",
    "title": "Covered chapters journey-20260825054824-b27b-94",
    "entitlementId": "cmt_active_entitlement",
    "source": "PAYMENT",
    "orderId": "cmt88yqtc00outd01243zzdyb",
    "orderItemId": "cmt88yqtc00owtd0109mbj6d6"
  },
  "summary": {
    "uniqueQuestionsAttempted": 0,
    "totalAttempts": 0,
    "correctAttempts": 0,
    "attemptAccuracyPercent": null,
    "firstAttemptCorrectQuestions": 0,
    "solvedAfterRetryQuestions": 0,
    "lastActivityAt": null
  },
  "data": [
    {
      "type": "CHAPTER",
      "id": "cmt88veyb0032td01ubdgqwq9",
      "title": "Covered chapters journey-20260825054824-b27b-94",
      "uniqueQuestionsAttempted": 0,
      "totalAttempts": 0,
      "correctAttempts": 0,
      "attemptAccuracyPercent": null,
      "firstAttemptCorrectQuestions": 0,
      "solvedAfterRetryQuestions": 0,
      "lastActivityAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/parent/selected-child/performance`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/performance
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": null,
    "to": null
  },
  "total": 3,
  "correct": 2,
  "incorrect": 0,
  "omitted": 1,
  "answered": 2,
  "accuracyPercent": 100,
  "uniqueQuestionsAttempted": 2,
  "questionBank": {
    "eligible": 2,
    "used": 2,
    "unused": 0,
    "usagePercent": 100
  },
  "sources": {
    "assessment": {
      "total": 2,
      "correct": 1,
      "incorrect": 0,
      "omitted": 1,
      "answered": 1,
      "accuracyPercent": 100
    },
    "practice": {
      "total": 1,
      "correct": 1,
      "incorrect": 0,
      "omitted": 0,
      "answered": 1,
      "accuracyPercent": 100
    }
  },
  "lastActivityAt": "2026-08-25T05:55:56.220Z"
}
```

### `GET /api/v1/parent/selected-child/performance/analysis`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/performance/analysis?level=section&sectionId=cmt894ewr017ptd01o3xb2umq
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "level": "section",
  "data": [
    {
      "id": "cmt894ewr017ptd01o3xb2umq",
      "title": "Performance section journey-20260825054824-b27b-204",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "sources": {
        "assessment": {
          "total": 2,
          "correct": 1,
          "incorrect": 0,
          "omitted": 1,
          "answered": 1,
          "accuracyPercent": 100
        },
        "practice": {
          "total": 1,
          "correct": 1,
          "incorrect": 0,
          "omitted": 0,
          "answered": 1,
          "accuracyPercent": 100
        }
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/parent/selected-child/performance/trends`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/performance/trends
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "date": "2026-08-25",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "sources": {
        "assessment": {
          "total": 2,
          "correct": 1,
          "incorrect": 0,
          "omitted": 1,
          "answered": 1,
          "accuracyPercent": 100
        },
        "practice": {
          "total": 1,
          "correct": 1,
          "incorrect": 0,
          "omitted": 0,
          "answered": 1,
          "accuracyPercent": 100
        }
      }
    }
  ],
  "trend": {
    "status": "INSUFFICIENT_DATA",
    "recent": {
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100
    },
    "previous": {
      "total": 0,
      "correct": 0,
      "incorrect": 0,
      "omitted": 0,
      "answered": 0,
      "accuracyPercent": 0
    },
    "changePoints": null
  }
}
```

### `GET /api/v1/parent/selected-child/performance/insights`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/parent/selected-child/performance/insights
Authorization: Bearer <parent-access-token>
Accept: application/json
```

**Response**

```json
{
  "status": "INSUFFICIENT_DATA",
  "minimumAnsweredAttempts": 10,
  "strengths": [],
  "weaknesses": [],
  "limitedPractice": [
    {
      "id": "cmt894ewr017ptd01o3xb2umq",
      "title": "Performance section journey-20260825054824-b27b-204",
      "level": "section",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "recommendation": "PRACTICE_MORE"
    }
  ],
  "omissions": [
    {
      "id": "cmt894ewr017ptd01o3xb2umq",
      "title": "Performance section journey-20260825054824-b27b-204",
      "level": "section",
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100,
      "recommendation": "COMPLETE_SKIPPED"
    }
  ],
  "repeatedErrors": [],
  "trend": {
    "status": "INSUFFICIENT_DATA",
    "recent": {
      "total": 3,
      "correct": 2,
      "incorrect": 0,
      "omitted": 1,
      "answered": 2,
      "accuracyPercent": 100
    },
    "previous": {
      "total": 0,
      "correct": 0,
      "incorrect": 0,
      "omitted": 0,
      "answered": 0,
      "accuracyPercent": 0
    },
    "changePoints": null
  },
  "recommendations": [
    "PRACTICE_MORE"
  ]
}
```

### `GET /api/v1/partners/dashboard`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/dashboard
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "timeZone": "Africa/Cairo"
  },
  "granularity": "day",
  "metricDefinitions": {
    "earned": "Positive immutable publisher allocation rows.",
    "reversals": "Absolute value of compensating negative allocation rows.",
    "net": "Signed financial allocations; reversed original rows are audit-only and excluded."
  },
  "totals": {
    "earned": {
      "amountMinor": 2500,
      "currency": "EGP"
    },
    "reversals": {
      "amountMinor": 0,
      "currency": "EGP"
    },
    "net": {
      "amountMinor": 2500,
      "currency": "EGP"
    },
    "payable": {
      "amountMinor": 2500,
      "currency": "EGP"
    },
    "paid": {
      "amountMinor": 0,
      "currency": "EGP"
    },
    "pending": {
      "amountMinor": 0,
      "currency": "EGP"
    }
  },
  "trend": [
    {
      "period": "2026-08-25",
      "earned": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "reversals": {
        "amountMinor": 0,
        "currency": "EGP"
      },
      "net": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "payable": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "paid": {
        "amountMinor": 0,
        "currency": "EGP"
      }
    }
  ],
  "agreements": [
    {
      "agreementId": "cmt88wk640096td018lzp56zk",
      "version": 1,
      "contractReference": null,
      "target": {
        "type": "CHAPTER",
        "id": "cmt88veyb0032td01ubdgqwq9"
      },
      "earned": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "reversals": {
        "amountMinor": 0,
        "currency": "EGP"
      },
      "net": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "payable": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "paid": {
        "amountMinor": 0,
        "currency": "EGP"
      }
    }
  ]
}
```

### `GET /api/v1/partners/analytics/earnings`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/analytics/earnings?granularity=month
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "timeZone": "Africa/Cairo"
  },
  "granularity": "month",
  "metricDefinitions": {
    "earned": "Positive immutable publisher allocation rows.",
    "reversals": "Absolute value of compensating negative allocation rows.",
    "net": "Signed financial allocations; reversed original rows are audit-only and excluded."
  },
  "totals": {
    "earned": {
      "amountMinor": 2500,
      "currency": "EGP"
    },
    "reversals": {
      "amountMinor": 0,
      "currency": "EGP"
    },
    "net": {
      "amountMinor": 2500,
      "currency": "EGP"
    },
    "payable": {
      "amountMinor": 2500,
      "currency": "EGP"
    },
    "paid": {
      "amountMinor": 0,
      "currency": "EGP"
    },
    "pending": {
      "amountMinor": 0,
      "currency": "EGP"
    }
  },
  "trend": [
    {
      "period": "2026-08",
      "earned": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "reversals": {
        "amountMinor": 0,
        "currency": "EGP"
      },
      "net": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "payable": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "paid": {
        "amountMinor": 0,
        "currency": "EGP"
      }
    }
  ],
  "agreements": [
    {
      "agreementId": "cmt88wk640096td018lzp56zk",
      "version": 1,
      "contractReference": null,
      "target": {
        "type": "CHAPTER",
        "id": "cmt88veyb0032td01ubdgqwq9"
      },
      "earned": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "reversals": {
        "amountMinor": 0,
        "currency": "EGP"
      },
      "net": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "payable": {
        "amountMinor": 2500,
        "currency": "EGP"
      },
      "paid": {
        "amountMinor": 0,
        "currency": "EGP"
      }
    }
  ]
}
```

### `GET /api/v1/partners/analytics/allocations`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/analytics/allocations?limit=100
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "id": "cmt88yy1u00pktd013x21qx1r",
      "kind": "PUBLISHER_SALE",
      "state": "PAYABLE",
      "basisMinor": 10000,
      "amountMinor": 2500,
      "currency": "EGP",
      "createdAt": "2026-08-25T05:51:34.626Z",
      "paidAt": null,
      "reversedAt": null,
      "publisherAgreementId": "cmt88wk640096td018lzp56zk",
      "basis": {
        "amountMinor": 10000,
        "currency": "EGP"
      },
      "amount": {
        "amountMinor": 2500,
        "currency": "EGP"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/partners/analytics/content`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/analytics/content?limit=100
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "id": "cmt88yiwv00mstd01zz18fqug",
      "status": "ENDED",
      "revenueShareBps": 1300,
      "startsAt": "2026-08-25T05:51:14.918Z",
      "endsAt": "2026-08-25T05:51:15.138Z",
      "isCurrentlyActive": false,
      "target": {
        "type": "LESSON",
        "id": "cmt88vf6c0036td01zuz1z8yt",
        "title": "Covered lessons journey-20260825054824-b27b-95",
        "chapterName": "Covered chapters journey-20260825054824-b27b-94",
        "courseName": "Covered courses journey-20260825054824-b27b-93",
        "subjectName": "Covered subjects journey-20260825054824-b27b-92"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 6,
    "totalPages": 1
  }
}
```

### `GET /api/v1/partners/analytics/question-usage`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/analytics/question-usage
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "timeZone": "Africa/Cairo"
  },
  "availableQuestions": 1,
  "sourceId": "all",
  "sourceTitle": null,
  "presented": 1,
  "solved": 0,
  "correct": 0,
  "graded": 0,
  "unique": {},
  "reattempts": 0,
  "uniqueSolvers": 0,
  "usageRate": {
    "numerator": 0,
    "denominator": 1,
    "value": 0
  },
  "correctRate": {
    "numerator": 0,
    "denominator": 0,
    "value": null
  },
  "trend": [
    {
      "period": "2026-08-22",
      "presented": 0,
      "solved": 0,
      "correct": 0,
      "graded": 0,
      "unique": {},
      "reattempts": 0,
      "uniqueSolvers": 0,
      "usageRate": {
        "numerator": 0,
        "denominator": 0,
        "value": 0
      },
      "correctRate": {
        "numerator": 0,
        "denominator": 0,
        "value": null
      }
    }
  ],
  "rolledUp": false,
  "freshness": null,
  "indicators": {
    "zeroUsage": false,
    "zeroSolved": true,
    "earningsDespiteZeroSolved": true,
    "earningsScope": "ALL_PUBLISHER_LEDGER"
  },
  "metricDefinitions": {
    "presented": "Frozen publisher-attributed assessment questions in started attempts.",
    "solved": "Presented questions with a submitted answer.",
    "uniqueSolvers": "Distinct students with at least one submitted answer.",
    "correctRate": "Correct final answers divided by graded answers.",
    "usageRate": "Solved questions divided by presented questions."
  }
}
```

### `GET /api/v1/partners/analytics/question-usage/sources`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/analytics/question-usage/sources?limit=100
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "sourceId": "cmt88xixl00cotd01j18txm89",
      "sourceTitle": "Phase 9 source journey-20260825054824-b27b-85",
      "presented": 1,
      "solved": 0,
      "correct": 0,
      "graded": 0,
      "unique": {},
      "reattempts": 0,
      "uniqueSolvers": 0,
      "usageRate": {
        "numerator": 0,
        "denominator": 1,
        "value": 0
      },
      "correctRate": {
        "numerator": 0,
        "denominator": 0,
        "value": null
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/partners/analytics/question-usage/questions`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/analytics/question-usage/questions?limit=100
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "sourceId": "cmt88xixl00cotd01j18txm89",
      "sourceTitle": "Phase 9 source journey-20260825054824-b27b-85",
      "sourceQuestionId": "cmt88xjl400d0td01k1uve938",
      "presented": 1,
      "solved": 0,
      "correct": 0,
      "graded": 0,
      "unique": {},
      "reattempts": 0,
      "uniqueSolvers": 0,
      "usageRate": {
        "numerator": 0,
        "denominator": 1,
        "value": 0
      },
      "correctRate": {
        "numerator": 0,
        "denominator": 0,
        "value": null
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/partners/referrals/report`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/referrals/report
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "timeZone": "Africa/Cairo"
  },
  "privacy": {
    "minimumCohort": 1,
    "suppressed": true,
    "reason": "The selected period has too few approved referred learners."
  },
  "metricDefinitions": {
    "conversions": "Orders that captured a referral attribution in the selected Cairo date range, whether or not later approved.",
    "approvedSales": "Referral-attributed orders approved in the selected Cairo date range.",
    "commissionStates": "Immutable referral commission allocation rows created in the selected range, grouped by current ledger state. Reversal rows are represented through their ledger state and amount.",
    "productsAndCategories": "Approved order-item sales; partner-facing rows with fewer than the configured number of distinct referred learners are omitted."
  }
}
```

### `GET /api/v1/partners/referrals/settlements`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/partners/referrals/settlements
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "timeZone": "Africa/Cairo"
  },
  "privacy": {
    "minimumCohort": 1,
    "settlementRowsBelowMinimumAreOmitted": true
  },
  "data": []
}
```

### `GET /api/v1/admin/referral-reporting`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/referral-reporting?partnerUserId=cmt894mf201bdtd01yxf72f22
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "period": {
    "from": "2026-08-01",
    "to": "2026-08-31",
    "timeZone": "Africa/Cairo"
  },
  "privacy": {
    "minimumCohort": 1,
    "suppressed": false,
    "breakdownsSuppressSmallCohorts": false
  },
  "conversions": 1,
  "approvedSales": {
    "orders": 1,
    "learners": 1,
    "amountMinor": 19000,
    "currency": "EGP"
  },
  "commissionStates": [
    {
      "state": "PAYABLE",
      "allocations": 1,
      "amountMinor": -1900,
      "basisMinor": -19000,
      "currency": "EGP"
    }
  ],
  "trends": [
    {
      "period": "2026-08-25",
      "conversions": 1,
      "approvedSales": 1,
      "approvedSalesMinor": 19000,
      "learners": 1
    }
  ],
  "products": [
    {
      "productId": "cmt88ven9002ytd01kvj8vs1q",
      "productTitle": "Covered courses journey-20260825054824-b27b-93",
      "approvedSales": 1,
      "approvedSalesMinor": 19000,
      "learners": 1
    }
  ],
  "categories": [
    {
      "categoryId": "cmt88ve3c002utd010b06ph0h",
      "categoryTitle": "Covered subjects journey-20260825054824-b27b-92",
      "approvedSales": 1,
      "approvedSalesMinor": 19000,
      "learners": 1
    }
  ],
  "metricDefinitions": {
    "conversions": "Orders that captured a referral attribution in the selected Cairo date range, whether or not later approved.",
    "approvedSales": "Referral-attributed orders approved in the selected Cairo date range.",
    "commissionStates": "Immutable referral commission allocation rows created in the selected range, grouped by current ledger state. Reversal rows are represented through their ledger state and amount.",
    "productsAndCategories": "Approved order-item sales; partner-facing rows with fewer than the configured number of distinct referred learners are omitted."
  }
}
```

### `GET /api/v1/admin/reports/commerce`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/commerce
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "PLATFORM_REVENUE",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "orders": "Orders grouped by current order status and selected payment channel; date filtering uses approvedAt.",
    "subtotalMinor": "Sum of immutable order subtotal snapshots in EGP minor units.",
    "discountMinor": "Sum of immutable order discount snapshots in EGP minor units.",
    "totalMinor": "Sum of immutable order total snapshots in EGP minor units. Approved rows are recognized revenue."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": [
    {
      "_count": 24,
      "_sum": {
        "subtotalMinor": 303000,
        "discountMinor": 7000,
        "totalMinor": 296000
      },
      "status": "APPROVED",
      "paymentChannel": "MANUAL",
      "currency": "EGP",
      "orders": 24,
      "subtotalMinor": 303000,
      "discountMinor": 7000,
      "totalMinor": 296000
    }
  ],
  "retention": "Financial source records are retained for seven years."
}
```

### `GET /api/v1/admin/reports/revenue`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/revenue
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "PLATFORM_REVENUE",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "orders": "Orders grouped by current order status and selected payment channel; date filtering uses approvedAt.",
    "subtotalMinor": "Sum of immutable order subtotal snapshots in EGP minor units.",
    "discountMinor": "Sum of immutable order discount snapshots in EGP minor units.",
    "totalMinor": "Sum of immutable order total snapshots in EGP minor units. Approved rows are recognized revenue."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": [
    {
      "_count": 24,
      "_sum": {
        "subtotalMinor": 303000,
        "discountMinor": 7000,
        "totalMinor": 296000
      },
      "status": "APPROVED",
      "paymentChannel": "MANUAL",
      "currency": "EGP",
      "orders": 24,
      "subtotalMinor": 303000,
      "discountMinor": 7000,
      "totalMinor": 296000
    }
  ],
  "retention": "Financial source records are retained for seven years."
}
```

### `GET /api/v1/admin/reports/refunds`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/refunds
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "REFUNDS",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "requests": "Refund requests created in the selected Cairo period, grouped by current request status.",
    "approvedAmountMinor": "Sum of complete order-item reimbursement amounts for approved requests; no fractional item refunds exist."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": [
    {
      "status": "APPROVED",
      "requests": 7
    }
  ],
  "approvedAmounts": [
    {
      "currency": "EGP",
      "refundedItems": 7,
      "approvedAmountMinor": 133000
    }
  ]
}
```

### `GET /api/v1/admin/reports/payments`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/payments
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "PAYMENTS",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "attempts": "Payment attempts initiated in the selected Cairo period, grouped by channel and current provider/manual status.",
    "status": "The latest persisted payment-attempt status; an order can have retry attempts."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": []
}
```

### `GET /api/v1/admin/reports/registrations`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/registrations
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "REGISTRATIONS",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "registrations": "Student profile records created in the selected Cairo period, grouped by their current grade and managed geography IDs."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": [
    {
      "_count": 2,
      "academicGradeId": "cmt5vnn71015wlw01q9emacgq",
      "governorateId": "cmt5veoin00cllw01t80pdknd",
      "centerId": null,
      "registrations": 2
    }
  ]
}
```

### `GET /api/v1/admin/reports/active-purchasers`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/active-purchasers
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "ACTIVE_PURCHASERS",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "approvedPurchasers": "Distinct students with an approved order in the selected Cairo period.",
    "purchasersWithCurrentAccess": "Approved purchasers from the selected period who have one or more effective, non-expired active entitlements at report time."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": [
    {
      "approvedPurchasers": 24,
      "purchasersWithCurrentAccess": 17
    }
  ]
}
```

### `GET /api/v1/admin/reports/entitlements`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/entitlements
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "report": "ENTITLEMENT_LIFECYCLE",
  "period": {
    "timeZone": "Africa/Cairo"
  },
  "metricDefinitions": {
    "grants": "Entitlement rows created in the selected Cairo period, grouped by source.",
    "revocations": "Entitlement rows whose revokedAt falls in the selected Cairo period.",
    "expiries": "Entitlement rows whose expiresAt falls in the selected Cairo period. Expiry is access-time derived, not a mutable state transition.",
    "currentActive": "Effective active entitlement rows at report time, independent of the selected period."
  },
  "emptyResultBehavior": "Returns data: [] and zero-valued totals; it never substitutes a prior period.",
  "pagination": "Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.",
  "rollup": "No derived rollup is used. Results are reproducible from the referenced source records at request time.",
  "data": {
    "grants": [
      {
        "source": "ADMIN",
        "grants": 101
      }
    ],
    "revocations": 20,
    "expiries": 0,
    "currentActive": 105
  }
}
```

### `GET /api/v1/admin/reports/partner-obligations`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/partner-obligations
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "_count": 20,
      "_sum": {
        "amountMinor": 14700
      },
      "kind": "PUBLISHER_SALE",
      "state": "PAYABLE",
      "currency": "EGP",
      "allocations": 20,
      "amountMinor": 14700
    }
  ]
}
```

### `POST /api/v1/admin/reports/exports`

Captured successful response — `201`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
POST /api/v1/admin/reports/exports
Authorization: Bearer <access-token>
Accept: application/json
Content-Type: application/json
```

```json
{
  "reportType": "REFERRAL_ALLOCATIONS",
  "columns": [
    "createdAt",
    "partnerUserId",
    "state",
    "basisMinor",
    "amountMinor",
    "currency"
  ],
  "reason": "Phase 5 referral allocation verification",
  "partnerUserId": "cmt894mf201bdtd01yxf72f22"
}
```

**Response**

```json
{
  "id": "cmt8952bt01fgtd014d697ujp",
  "requestedById": "cmt88uzrr0009td01zbgllwyd",
  "reportType": "REFERRAL_ALLOCATIONS",
  "filters": {
    "partnerUserId": "cmt894mf201bdtd01yxf72f22"
  },
  "columns": [
    "createdAt"
  ],
  "reason": "Phase 5 referral allocation verification",
  "containsPii": false,
  "classification": "NON_PII",
  "status": "QUEUED",
  "storageKey": null,
  "rowCount": null,
  "error": null,
  "expiresAt": null,
  "downloadedAt": null,
  "cancelledAt": null,
  "createdAt": "2026-08-25T05:56:20.106Z",
  "updatedAt": "2026-08-25T05:56:20.106Z"
}
```

### `GET /api/v1/admin/reports/exports`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/exports?limit=100
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "data": [
    {
      "id": "cmt8952bt01fgtd014d697ujp",
      "reportType": "REFERRAL_ALLOCATIONS",
      "classification": "NON_PII",
      "status": "COMPLETED",
      "rowCount": 2,
      "expiresAt": "2026-08-26T05:56:20.148Z",
      "createdAt": "2026-08-25T05:56:20.106Z",
      "cancelledAt": null,
      "error": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "totalPages": 1
  }
}
```

### `GET /api/v1/admin/reports/exports/:id/download`

Captured successful response — `200`. The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
GET /api/v1/admin/reports/exports/cmt8952bt01fgtd014d697ujp/download
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "url": "<short-lived signed URL redacted>",
  "expiresAt": "2026-08-25T06:11:21.663Z"
}
```

### `POST /api/v1/admin/reports/exports/:id/cancel`

Captured response — `409` (no successful call was recorded for this endpoint). The test URL below includes historical test-record IDs; use IDs returned by the current environment instead.

**Request**

```http
POST /api/v1/admin/reports/exports/cmt8952bt01fgtd014d697ujp/cancel
Authorization: Bearer <access-token>
Accept: application/json
```

**Response**

```json
{
  "statusCode": 409,
  "code": "CONFLICT.ONLY_QUEUED_OR_PROCESSING_EXPORTS_CAN_BE_CANCELLED",
  "message": {
    "en": "Only queued or processing exports can be cancelled",
    "ar": "تعذر تنفيذ الطلب: تعارض"
  },
  "error": {
    "ar": "تعارض",
    "en": "Conflict"
  }
}
```
