# Partner API frontend integration guide

This guide describes the frontend integration for partner accounts, content-publisher reporting, referral programmes, finance, and reconciliation.

All endpoint paths below are relative to the API base URL: `/api/v1`.

The generated OpenAPI document in [`../docs-json.json`](../docs-json.json) is the canonical source for response schemas. This guide is deliberately organised by the order in which resources become available in the UI.

## 1. Authentication and shared conventions

### Authentication

1. A partner is created by an administrator.
2. The partner signs in with `POST /auth/partners/login`.
3. Store the returned `accessToken` according to the application's existing auth strategy and send it with every protected request:

   ```http
   Authorization: Bearer <accessToken>
   ```

4. The login response also sets an HTTP-only `refresh_token` cookie. Use the existing refresh/logout endpoints from the shared auth client; do not attempt to read this cookie from JavaScript.

### Roles and partner types

| Actor                   | Permitted areas                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `PARTNER`               | Own profile, partner analytics, and partner referral reporting.                                                   |
| `ADMIN` / `SUPER_ADMIN` | Partner management, referral programme management, partner finance, reconciliation, and administrative reporting. |
| `CONTENT_PUBLISHER`     | Partner dashboard, earnings, agreement content, and question-usage analytics.                                     |
| `REFERRAL_PARTNER`      | Partner referral report and settlement summary.                                                                   |

`CONTENT_PUBLISHER` and `REFERRAL_PARTNER` are partner _types_, not separate login roles. Build the partner portal after loading `GET /partners/me`, then show only the screens compatible with that type. The server remains the authority: hide unavailable screens but also handle `403` responses.

### Dates, currency, pagination, and errors

- Use `YYYY-MM-DD` for `from` and `to` query values. Partner reporting treats these as Cairo calendar dates.
- Monetary values are integer minor units. For example, `12550` EGP minor units should be rendered as `EGP 125.50`; do not use floating-point arithmetic for totals.
- Standard list pagination is one-based: `page` defaults to `1`, `limit` defaults to `20`, and `limit` may not exceed `100`.
- Collection responses provide pagination metadata. Preserve the current filters when changing pages.
- Errors use the shared API error envelope: `{ statusCode, code, message: { ar, en }, error: { ar, en }, details?, correlationId }`. Display the appropriate localized message and retain `correlationId` in support logs.
- A `409` on a finance/reporting endpoint can mean the partner-ledger rollout is disabled for that partner. Treat it as a feature-unavailable state, not as an empty result.

## 2. Dependency map

```text
Admin creates partner
  ├─ Content publisher ──> agreement/content + learner activity ──> publisher analytics
  └─ Referral partner ──> referral programme ──> codes/rules ──> activation
                                                           └─ checkout attribution ──> referral reporting/review

Approved order / fulfilment / refund
  └─ immutable partner allocations ──> finance review ──> settlement ──> mark paid
                                             └─ reconciliation run ──> discrepancies
```

Some prerequisites in this diagram are created by commerce and content APIs, not by the partner endpoint group. In particular, the frontend must not expect a partner allocation immediately after creating a partner or referral programme.

## 3. Recommended frontend journeys

### A. Partner portal bootstrap

1. Sign in with `POST /auth/partners/login`.
2. Fetch `GET /partners/me`.
3. Route a `CONTENT_PUBLISHER` to publisher analytics and a `REFERRAL_PARTNER` to referral reporting.
4. On `401`, use the shared token-refresh flow; on `403`, clear the protected view and show an access message.

### B. Admin creates a referral programme

1. Find or create a referral partner.
2. Create a draft programme.
3. Add at least the intended referral code(s) and commission rule(s).
4. Activate the commission rule, then activate the programme when it is ready.
5. Once learners use the code through checkout, display reports and investigate any flags.

### C. Admin settlement workflow

1. Filter allocation rows for `PAYABLE` entries.
2. Let the operator select allocation IDs and supply a payment reference.
3. Create the settlement.
4. Only after the external payment is confirmed, call `mark-paid`.
5. Refresh allocation and settlement lists. Ledger rows are immutable; never offer inline editing of an allocation amount or state.

## 4. Endpoint catalogue

### 4.1 Partner account lifecycle

All admin account endpoints require an `ADMIN` or `SUPER_ADMIN` token.

| Endpoint                               | Job                                                                 | Frontend inputs / dependency                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /admin/partners`                 | Creates a partner account.                                          | Body: `email`, `password` (8–128 chars), `partnerType`, `displayName`, optional `legalName`, `phone`. Choose `CONTENT_PUBLISHER` or `REFERRAL_PARTNER`. |
| `GET /admin/partners`                  | Lists partner accounts.                                             | Query: `page`, `limit`, optional `q` text search, and `partnerType` (`CONTENT_PUBLISHER` or `REFERRAL_PARTNER`).                                        |
| `GET /admin/partners/{id}`             | Gets one partner profile.                                           | Requires an existing partner ID.                                                                                                                        |
| `PATCH /admin/partners/{id}`           | Updates partner profile fields.                                     | Body accepts optional `displayName`, `legalName`, and `phone`; send `null` to clear nullable values.                                                    |
| `GET /admin/partners/{id}/detail`      | Gets administrative aggregate programme, ledger, and audit history. | Requires an existing partner; response intentionally excludes learner identities and order records.                                                     |
| `POST /admin/partners/{id}/suspend`    | Suspends a partner and revokes their sessions.                      | Confirmation action; partner cannot continue using protected APIs.                                                                                      |
| `POST /admin/partners/{id}/reactivate` | Reactivates a suspended partner.                                    | Requires a suspended partner.                                                                                                                           |
| `POST /auth/partners/login`            | Authenticates a partner.                                            | Public body: `email`, `password`; returns an access token and sets refresh cookie.                                                                      |
| `GET /partners/me`                     | Gets the signed-in partner profile.                                 | `PARTNER` token; call during portal bootstrap.                                                                                                          |
| `PATCH /partners/me`                   | Updates the signed-in partner profile.                              | `PARTNER` token; optional `displayName`, `legalName`, `phone`.                                                                                          |

### 4.2 Content-publisher analytics

These endpoints require a `PARTNER` token for a `CONTENT_PUBLISHER`. Their data becomes available only after the underlying agreements, content, learner activity, and allocation ledger rows exist.

| Endpoint                                           | Job                                                              | Query / UI notes                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /partners/dashboard`                          | Returns headline publisher metrics and a compact earnings trend. | Optional `from`, `to`. Use as the publisher portal landing request.                                                     |
| `GET /partners/analytics/earnings`                 | Returns immutable-ledger earnings totals and trends.             | Optional `from`, `to`, `granularity=day                                                                                 | month`; the server selects a default granularity when omitted. |
| `GET /partners/analytics/allocations`              | Lists the partner’s immutable allocation entries.                | Optional `from`, `to`, `page`, `limit`. Present this as a read-only ledger.                                             |
| `GET /partners/analytics/content`                  | Lists agreement-covered publisher content.                       | Optional `status=DRAFT                                                                                                  | ACTIVE                                                         | ENDED`, `page`, `limit`. |
| `GET /partners/analytics/question-usage`           | Returns aggregate question-use and correctness metrics.          | Optional `from`, `to`, `granularity`, `sourceId`, curriculum filters, `page`, `limit`. Never expect learner-level data. |
| `GET /partners/analytics/question-usage/sources`   | Returns paginated usage grouped by source.                       | Same filters as question usage. Use for source drill-down.                                                              |
| `GET /partners/analytics/question-usage/questions` | Returns paginated usage grouped by frozen question.              | Same filters as question usage. Use for question drill-down.                                                            |

The valid curriculum filters for question-usage endpoints are `subjectId`, `courseId`, `chapterId`, `lessonId`, and `sectionId`. Apply only filters that match the current frontend hierarchy selection.

### 4.3 Referral programme administration

All endpoints in this section require an `ADMIN` or `SUPER_ADMIN` token. A programme must reference an existing `REFERRAL_PARTNER` through `partnerUserId`.

| Endpoint                                                     | Job                                          | Frontend inputs / dependency                                                                |
| ------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /admin/referral-programs`                              | Creates a draft referral programme.          | Body: `name`, `partnerUserId`, `startsAt`, optional `endsAt`, scope and usage-limit fields. |
| `GET /admin/referral-programs`                               | Lists referral programmes.                   | Query: `page`, `limit`, optional `partnerUserId`.                                           |
| `GET /admin/referral-programs/{id}`                          | Gets one programme with its codes and rules. | Requires an existing programme.                                                             |
| `PATCH /admin/referral-programs/{id}`                        | Updates a draft programme.                   | Send only changed fields; nullable optional fields may be cleared with `null`.              |
| `POST /admin/referral-programs/{id}/activate`                | Activates a configured programme.            | Use a confirmation action; programme must be ready for checkout usage.                      |
| `POST /admin/referral-programs/{id}/suspend`                 | Temporarily suspends a programme.            | Stops use without ending it.                                                                |
| `POST /admin/referral-programs/{id}/resume`                  | Resumes a suspended programme.               | Requires a suspended programme.                                                             |
| `POST /admin/referral-programs/{id}/end`                     | Ends a programme.                            | Destructive business action; require confirmation.                                          |
| `POST /admin/referral-programs/{id}/codes`                   | Creates a referral code.                     | Body: `code`, optional active state, dates, and usage limits. Requires a programme.         |
| `PATCH /admin/referral-programs/codes/{id}`                  | Updates a referral code.                     | Send dates, active state, or limits as needed.                                              |
| `POST /admin/referral-programs/codes/{id}/suspend`           | Disables a code.                             | Requires an existing code.                                                                  |
| `POST /admin/referral-programs/codes/{id}/resume`            | Re-enables a suspended code.                 | Requires a suspended code.                                                                  |
| `POST /admin/referral-programs/{id}/rules`                   | Creates a commission rule.                   | Body: `kind`, commission amount fields, optional `currency`, `startsAt`, optional `endsAt`. |
| `POST /admin/referral-programs/{id}/rules/{ruleId}/activate` | Activates a commission rule.                 | Requires a rule created for that programme.                                                 |
| `POST /admin/referral-programs/{id}/review-rules`            | Creates automatic referral review criteria.  | Body: `name`, `kind`, `action`, `threshold`.                                                |
| `PATCH /admin/referral-programs/review-rules/{id}`           | Updates a review rule.                       | Body can change `name`, `action`, `threshold`, and `isActive`.                              |

#### Referral form enum values

| Field                       | Allowed values                                                  |
| --------------------------- | --------------------------------------------------------------- |
| `kind` for commission rules | `PERCENTAGE`, `FIXED_PER_SALE`, `PERCENTAGE_CAPPED`             |
| `kind` for review rules     | `STUDENT_PROGRAM_APPROVED_SALES`, `STUDENT_CODE_APPROVED_SALES` |
| `action` for review rules   | `BLOCK_CHECKOUT`, `QUEUE_REVIEW`                                |

For percentage commissions, send `percentageBps` in basis points: `1000` means 10%. For fixed and capped rules, money fields are EGP minor units.

### 4.4 Referral review and reporting

Review endpoints require an `ADMIN` or `SUPER_ADMIN` token. Partner report endpoints require a `PARTNER` token for a `REFERRAL_PARTNER`.

| Endpoint                                                       | Job                                                                        | Frontend inputs / dependency                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /admin/referral-programs/review-flags`                    | Lists activity flagged for referral review.                                | Query: `page`, `limit`, optional `status`, `programId`, `assigneeUserId`.         |
| `POST /admin/referral-programs/attributions/{id}/review-flags` | Manually flags an existing checkout attribution.                           | Body: `type`, `note`; an attribution comes from checkout, outside this API group. |
| `PATCH /admin/referral-programs/review-flags/{id}/assign`      | Assigns a review flag.                                                     | Body: `assigneeUserId`.                                                           |
| `POST /admin/referral-programs/review-flags/{id}/notes`        | Adds an investigation note.                                                | Body: `body` (up to 4,000 characters).                                            |
| `PATCH /admin/referral-programs/review-flags/{id}/resolve`     | Resolves or accepts a review flag.                                         | Body: `status`, `disposition`, `note`; require a resolution note.                 |
| `GET /partners/referrals/report`                               | Returns privacy-safe aggregate conversion, sale, and commission reporting. | `REFERRAL_PARTNER`; optional `from`, `to`, `granularity=day                       | month`. |
| `GET /partners/referrals/settlements`                          | Returns privacy-safe referral settlement summaries.                        | `REFERRAL_PARTNER`; optional `from`, `to`, `granularity`.                         |
| `GET /admin/referral-reporting`                                | Returns uncensored aggregate reporting for a selected referral partner.    | Query requires `partnerUserId`; optional `from`, `to`, `granularity`.             |

Valid review-resolution values are:

- `status`: `RESOLVED` or `ACCEPTED`
- `disposition`: `CLEARED`, `CONFIRMED_FRAUD`, `NO_ACTION`, or `ESCALATED`

Partner-facing referral reporting is privacy protected. Do not create UI logic that assumes every low-volume cohort or settlement row will appear.

### 4.5 Partner finance, settlements, and reconciliation

All endpoints in this section require an `ADMIN` or `SUPER_ADMIN` token. Allocation rows are created by approved order, fulfilment, referral, and refund flows outside this group.

| Endpoint                                                                 | Job                                                   | Frontend inputs / dependency                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /admin/partner-finance/allocations`                                 | Lists allocation-ledger rows.                         | Query: pagination plus optional `partnerUserId`, `kind`, `state`, `publisherAgreementId`, `referralRuleId`, `from`, `to`.                                                                                          |
| `POST /admin/partner-finance/settlements`                                | Creates a settlement from payable allocations.        | Body: non-empty `allocationIds`, `paymentReference` (max 160 chars). Show selected IDs before submission.                                                                                                          |
| `GET /admin/partner-finance/settlements`                                 | Lists created settlements.                            | Query: pagination plus optional `partnerUserId`, `kind`, `from`, `to`.                                                                                                                                             |
| `POST /admin/partner-finance/settlements/{id}/mark-paid`                 | Marks all allocations in a settlement paid.           | Call only after external payment confirmation; require an explicit confirmation UI.                                                                                                                                |
| `POST /admin/partner-finance/usage-rollups/rebuild`                      | Rebuilds derived publisher usage data.                | Body: inclusive `from`, `to`, optional `publisherUserId`; an operational/admin action, not a normal dashboard refresh.                                                                                             |
| `POST /admin/partner-finance/reconciliation-runs`                        | Creates a reconciliation run.                         | Body: `pilotLabel`, non-empty `orderIds`.                                                                                                                                                                          |
| `POST /admin/partner-finance/reconciliation-runs/{id}/run`               | Executes a created reconciliation run.                | Requires a created run; disable duplicate clicks while pending.                                                                                                                                                    |
| `GET /admin/partner-finance/reconciliation-runs`                         | Lists reconciliation runs.                            | Query: `page`, `limit`.                                                                                                                                                                                            |
| `GET /admin/partner-finance/reconciliation-runs/{id}`                    | Gets a reconciliation run and its discrepancies.      | Use for a run detail screen.                                                                                                                                                                                       |
| `GET /admin/partner-finance/reconciliation-runs/{id}/discrepancies`      | Lists a run’s discrepancies.                          | Query: `page`, `limit`, optional `status`.                                                                                                                                                                         |
| `PATCH /admin/partner-finance/reconciliation-discrepancies/{id}/assign`  | Assigns a discrepancy to an administrator.            | Body: `assigneeUserId`, optional `notes`.                                                                                                                                                                          |
| `PATCH /admin/partner-finance/reconciliation-discrepancies/{id}/resolve` | Resolves or accepts a discrepancy.                    | Body: `status=RESOLVED                                                                                                                                                                                             | ACCEPTED`, required `resolutionNote`. |
| `GET /admin/reports/partner-obligations`                                 | Returns aggregate publisher and referral obligations. | Use for an admin financial overview after allocations and settlements exist; supports the shared reporting filters, including `from`, `to`, curriculum, geography, payment, referral, and `partnerUserId` filters. |

Finance filters use the following values:

| Filter             | Allowed values                           |
| ------------------ | ---------------------------------------- |
| Allocation `kind`  | `PUBLISHER_SALE`, `REFERRAL_COMMISSION`  |
| Allocation `state` | `PENDING`, `PAYABLE`, `PAID`, `REVERSED` |

## 5. Suggested screen-to-endpoint mapping

| Screen                    | First request                                         | Follow-up requests                                                     |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Admin partner directory   | `GET /admin/partners`                                 | Partner details, update, suspend/reactivate.                           |
| Create partner            | `POST /admin/partners`                                | Redirect to the partner detail page.                                   |
| Partner portal            | `GET /partners/me`                                    | Type-specific analytics or referral pages.                             |
| Publisher dashboard       | `GET /partners/dashboard`                             | Earnings, allocations, content, and question-usage drill-downs.        |
| Referral programme detail | `GET /admin/referral-programs/{id}`                   | Add/edit codes, commission rules, review rules, and lifecycle actions. |
| Referral review queue     | `GET /admin/referral-programs/review-flags`           | Assign, note, resolve, or manually flag an attribution.                |
| Partner finance workbench | `GET /admin/partner-finance/allocations`              | Create settlement, view settlements, then mark paid.                   |
| Reconciliation detail     | `GET /admin/partner-finance/reconciliation-runs/{id}` | Run checks, list discrepancies, assign, and resolve.                   |

## 6. Frontend guardrails

- Never expose learner identity, raw order data, or unsuppressed cohort results in partner-facing screens; partner APIs intentionally return aggregates only.
- Do not let a partner choose another partner ID in self-service requests. Partner endpoints derive ownership from the bearer token.
- Treat ledger allocations as append-only records. Refunds and corrections appear as compensating/reversed entries rather than edits.
- For `suspend`, `end`, `mark-paid`, and resolution actions, use an explicit confirmation dialog and refresh the relevant list/detail query on success.
- Prefer server-side filtering and pagination; do not download all allocation, usage, or review data to filter in the browser.
- Use the exact enum strings shown in this guide. Do not transform them to display labels when sending requests.

## 7. Recorded request and response examples

The following examples were derived from `reports/api-tests/api-2026-08-28T08-51-47-172Z.json`, recorded on 2026-08-28. They use the real test paths, query values, request bodies, statuses, and response shapes. Credentials and tokens are redacted. IDs, dates, and emails belong to the disposable test fixture: replace them with values from the current environment. For list responses, only the first recorded array item is shown to keep this guide readable; the response structure and item shape are unchanged.

#### `POST /api/v1/auth/partners/login`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/auth/partners/login
Content-Type: application/json

{
  "email": "partner-journey-20260828084459-e330-6@example.test",
  "password": "<redacted>"
}
```

**Response**

```json
{
  "accessToken": "<redacted>",
  "user": {
    "id": "cmtcphpj003i0nz01pzduxumw",
    "role": "PARTNER",
    "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
    "mustChangePassword": "<redacted>"
  }
}
```

#### `POST /api/v1/admin/partners`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partners
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "email": "partner-journey-20260828084459-e330-6@example.test",
  "password": "<redacted>",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner journey-20260828084459-e330-7",
  "phone": "01015743235"
}
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner journey-20260828084459-e330-7",
  "legalName": null,
  "phone": "01015743235"
}
```

#### `GET /api/v1/admin/partners`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partners?q=partner&limit=1
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcphpj003i0nz01pzduxumw",
      "status": "ACTIVE",
      "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
      "createdAt": "2026-08-28T08:45:08.604Z",
      "partnerType": "CONTENT_PUBLISHER",
      "displayName": "Partner journey-20260828084459-e330-7",
      "legalName": null,
      "phone": "01015743235"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 1,
    "total": 50,
    "totalPages": 50
  }
}
```

#### `GET /api/v1/admin/partners/{id}`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partners/cmtcphpj003i0nz01pzduxumw
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner self update journey-20260828084459-e330-9",
  "legalName": null,
  "phone": null
}
```

#### `PATCH /api/v1/admin/partners/{id}`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/admin/partners/cmtcphpj003i0nz01pzduxumw
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "displayName": "Updated partner journey-20260828084459-e330-8"
}
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Updated partner journey-20260828084459-e330-8",
  "legalName": null,
  "phone": "01015743235"
}
```

#### `GET /api/v1/admin/partners/{id}/detail`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partners/cmtcpoxdk04sznz01lkcihtyv/detail
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "account": {
    "id": "cmtcpoxdk04sznz01lkcihtyv",
    "status": "ACTIVE",
    "loginIdentifier": "phase5-referral-journey-20260828084459-e330-210@example.test",
    "createdAt": "2026-08-28T08:50:45.368Z",
    "partnerType": "REFERRAL_PARTNER",
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211",
    "legalName": null,
    "phone": null
  },
  "capability": {
    "partnerType": "REFERRAL_PARTNER",
    "canPublishContent": false,
    "canReferCustomers": true
  },
  "publisherAgreements": [],
  "referralPrograms": [
    {
      "id": "cmtcpoxju04t3nz01s6ylz96u",
      "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
      "status": "ACTIVE",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "usageLimit": null,
      "perStudentUsageLimit": null,
      "appliesToAll": true,
      "createdAt": "2026-08-28T08:50:45.594Z",
      "course": null,
      "chapter": null,
      "_count": {
        "codes": 1,
        "rules": 1
      },
      "isCurrent": true,
      "target": {
        "type": "ALL_CONTENT"
      }
    }
  ],
  "allocationTotalsByState": [
    {
      "state": "PENDING",
      "currency": "EGP",
      "allocationCount": 0,
      "basisMinor": 0,
      "amountMinor": 0
    }
  ],
  "auditSummary": {
    "recentEvents": [
      {
        "id": "cmtcpoxe104t1nz01l26qnjf2",
        "action": "PARTNER_CREATED",
        "targetType": "User",
        "createdAt": "2026-08-28T08:50:45.385Z",
        "correlationId": "891c948d-7262-4ca0-b7b7-f39d730c60db",
        "actorUserId": "cmtcphm6k03hhnz01kvxon5f4"
      }
    ],
    "limit": 20
  }
}
```

#### `POST /api/v1/admin/partners/{id}/suspend`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partners/cmtcphpj003i0nz01pzduxumw/suspend
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "SUSPENDED",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner self update journey-20260828084459-e330-9",
  "legalName": null,
  "phone": null
}
```

#### `POST /api/v1/admin/partners/{id}/reactivate`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partners/cmtcphpj003i0nz01pzduxumw/reactivate
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner self update journey-20260828084459-e330-9",
  "legalName": null,
  "phone": null
}
```

#### `GET /api/v1/partners/me`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/me
Authorization: Bearer <partner-access-token>
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Updated partner journey-20260828084459-e330-8",
  "legalName": null,
  "phone": "01015743235"
}
```

#### `PATCH /api/v1/partners/me`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/partners/me
Authorization: Bearer <partner-access-token>
Content-Type: application/json

{
  "displayName": "Partner self update journey-20260828084459-e330-9",
  "legalName": null,
  "phone": null
}
```

**Response**

```json
{
  "id": "cmtcphpj003i0nz01pzduxumw",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260828084459-e330-6@example.test",
  "createdAt": "2026-08-28T08:45:08.604Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner self update journey-20260828084459-e330-9",
  "legalName": null,
  "phone": null
}
```

#### `GET /api/v1/partners/dashboard`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/dashboard
Authorization: Bearer <partner-access-token>
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
      "period": "2026-08-28",
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
      "agreementId": "cmtcpj2v403qenz01j59qshch",
      "version": 1,
      "contractReference": null,
      "target": {
        "type": "CHAPTER",
        "id": "cmtcpi0o803kanz01e8ek8ko5"
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

#### `GET /api/v1/partners/analytics/earnings`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/analytics/earnings?granularity=day
Authorization: Bearer <partner-access-token>
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
      "period": "2026-08-28",
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
      "agreementId": "cmtcpj2v403qenz01j59qshch",
      "version": 1,
      "contractReference": null,
      "target": {
        "type": "CHAPTER",
        "id": "cmtcpi0o803kanz01e8ek8ko5"
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

#### `GET /api/v1/partners/analytics/allocations`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/analytics/allocations?limit=100
Authorization: Bearer <partner-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcplimc046snz01gypgom4d",
      "kind": "PUBLISHER_SALE",
      "state": "PAYABLE",
      "basisMinor": 10000,
      "amountMinor": 2500,
      "currency": "EGP",
      "createdAt": "2026-08-28T08:48:06.276Z",
      "paidAt": null,
      "reversedAt": null,
      "publisherAgreementId": "cmtcpj2v403qenz01j59qshch",
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

#### `GET /api/v1/partners/analytics/question-usage`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/analytics/question-usage
Authorization: Bearer <partner-access-token>
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

#### `GET /api/v1/partners/analytics/question-usage/sources`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/analytics/question-usage/sources?limit=100
Authorization: Bearer <partner-access-token>
```

**Response**

```json
{
  "data": [
    {
      "sourceId": "cmtcpk6bh03twnz01o0us9mhj",
      "sourceTitle": "Phase 9 source journey-20260828084459-e330-85",
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

#### `GET /api/v1/partners/analytics/question-usage/questions`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/analytics/question-usage/questions?limit=100
Authorization: Bearer <partner-access-token>
```

**Response**

```json
{
  "data": [
    {
      "sourceId": "cmtcpk6bh03twnz01o0us9mhj",
      "sourceTitle": "Phase 9 source journey-20260828084459-e330-85",
      "sourceQuestionId": "cmtcpk6z303u8nz01vynzo5bl",
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

#### `GET /api/v1/partners/analytics/content`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/analytics/content?limit=100
Authorization: Bearer <partner-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpl5fq0440nz01hgxcz4ct",
      "status": "ENDED",
      "revenueShareBps": 1300,
      "startsAt": "2026-08-28T08:47:49.100Z",
      "endsAt": "2026-08-28T08:47:49.308Z",
      "isCurrentlyActive": false,
      "target": {
        "type": "LESSON",
        "id": "cmtcpi0uv03kenz0180t7tus8",
        "title": "Covered lessons journey-20260828084459-e330-95",
        "chapterName": "Covered chapters journey-20260828084459-e330-94",
        "courseName": "Covered courses journey-20260828084459-e330-93",
        "subjectName": "Covered subjects journey-20260828084459-e330-92"
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

#### `POST /api/v1/admin/referral-programs`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "name": "Phase 5 referral program journey-20260828084459-e330-212",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "appliesToAll": true
}
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program journey-20260828084459-e330-212",
  "status": "DRAFT",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:50:45.594Z",
  "codes": [],
  "rules": [],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `GET /api/v1/admin/referral-programs`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/referral-programs?limit=100
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpoxju04t3nz01s6ylz96u",
      "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
      "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
      "status": "ACTIVE",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "usageLimit": null,
      "perStudentUsageLimit": null,
      "appliesToAll": true,
      "courseId": null,
      "chapterId": null,
      "createdById": "cmtcphm6k03hhnz01kvxon5f4",
      "createdAt": "2026-08-28T08:50:45.594Z",
      "updatedAt": "2026-08-28T08:50:47.589Z",
      "partner": {
        "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
      },
      "_count": {
        "codes": 1,
        "rules": 1,
        "attributions": 0
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 10,
    "totalPages": 1
  }
}
```

#### `GET /api/v1/admin/referral-programs/{id}`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
  "status": "ACTIVE",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:50:47.589Z",
  "codes": [
    {
      "id": "cmtcpoxut04t9nz01mbmjp70g",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
      "isActive": true,
      "startsAt": null,
      "endsAt": null,
      "usageLimit": 10,
      "perStudentUsageLimit": null,
      "createdAt": "2026-08-28T08:50:45.990Z",
      "updatedAt": "2026-08-28T08:50:46.568Z"
    }
  ],
  "rules": [
    {
      "id": "cmtcpoyfv04tjnz01jy7rdsxy",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "version": 1,
      "kind": "PERCENTAGE",
      "percentageBps": 1000,
      "fixedCommissionMinor": null,
      "maximumCommissionMinor": null,
      "currency": "EGP",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "isActive": true,
      "createdAt": "2026-08-28T08:50:46.748Z"
    }
  ],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `PATCH /api/v1/admin/referral-programs/{id}`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213"
}
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
  "status": "DRAFT",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:50:45.802Z",
  "codes": [],
  "rules": [],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `POST /api/v1/admin/referral-programs/{id}/activate`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/activate
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
  "status": "ACTIVE",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:50:47.589Z",
  "codes": [
    {
      "id": "cmtcpoxut04t9nz01mbmjp70g",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
      "isActive": true,
      "startsAt": null,
      "endsAt": null,
      "usageLimit": 10,
      "perStudentUsageLimit": null,
      "createdAt": "2026-08-28T08:50:45.990Z",
      "updatedAt": "2026-08-28T08:50:46.568Z"
    }
  ],
  "rules": [
    {
      "id": "cmtcpoyfv04tjnz01jy7rdsxy",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "version": 1,
      "kind": "PERCENTAGE",
      "percentageBps": 1000,
      "fixedCommissionMinor": null,
      "maximumCommissionMinor": null,
      "currency": "EGP",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "isActive": true,
      "createdAt": "2026-08-28T08:50:46.748Z"
    }
  ],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `POST /api/v1/admin/referral-programs/{id}/suspend`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/suspend
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
  "status": "SUSPENDED",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:51:05.153Z",
  "codes": [
    {
      "id": "cmtcpoxut04t9nz01mbmjp70g",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
      "isActive": true,
      "startsAt": null,
      "endsAt": null,
      "usageLimit": 10,
      "perStudentUsageLimit": null,
      "createdAt": "2026-08-28T08:50:45.990Z",
      "updatedAt": "2026-08-28T08:50:46.568Z"
    }
  ],
  "rules": [
    {
      "id": "cmtcpoyfv04tjnz01jy7rdsxy",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "version": 1,
      "kind": "PERCENTAGE",
      "percentageBps": 1000,
      "fixedCommissionMinor": null,
      "maximumCommissionMinor": null,
      "currency": "EGP",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "isActive": true,
      "createdAt": "2026-08-28T08:50:46.748Z"
    }
  ],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `POST /api/v1/admin/referral-programs/{id}/resume`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/resume
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
  "status": "ACTIVE",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:51:05.374Z",
  "codes": [
    {
      "id": "cmtcpoxut04t9nz01mbmjp70g",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
      "isActive": true,
      "startsAt": null,
      "endsAt": null,
      "usageLimit": 10,
      "perStudentUsageLimit": null,
      "createdAt": "2026-08-28T08:50:45.990Z",
      "updatedAt": "2026-08-28T08:50:46.568Z"
    }
  ],
  "rules": [
    {
      "id": "cmtcpoyfv04tjnz01jy7rdsxy",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "version": 1,
      "kind": "PERCENTAGE",
      "percentageBps": 1000,
      "fixedCommissionMinor": null,
      "maximumCommissionMinor": null,
      "currency": "EGP",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "isActive": true,
      "createdAt": "2026-08-28T08:50:46.748Z"
    }
  ],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `POST /api/v1/admin/referral-programs/{id}/end`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/end
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxju04t3nz01s6ylz96u",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "name": "Phase 5 referral program updated journey-20260828084459-e330-213",
  "status": "ENDED",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": "2026-08-28T08:51:05.576Z",
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "appliesToAll": true,
  "courseId": null,
  "chapterId": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:45.594Z",
  "updatedAt": "2026-08-28T08:51:05.577Z",
  "codes": [
    {
      "id": "cmtcpoxut04t9nz01mbmjp70g",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
      "isActive": true,
      "startsAt": null,
      "endsAt": null,
      "usageLimit": 10,
      "perStudentUsageLimit": null,
      "createdAt": "2026-08-28T08:50:45.990Z",
      "updatedAt": "2026-08-28T08:50:46.568Z"
    }
  ],
  "rules": [
    {
      "id": "cmtcpoyfv04tjnz01jy7rdsxy",
      "programId": "cmtcpoxju04t3nz01s6ylz96u",
      "version": 1,
      "kind": "PERCENTAGE",
      "percentageBps": 1000,
      "fixedCommissionMinor": null,
      "maximumCommissionMinor": null,
      "currency": "EGP",
      "startsAt": "2026-08-28T08:49:45.196Z",
      "endsAt": null,
      "isActive": true,
      "createdAt": "2026-08-28T08:50:46.748Z"
    }
  ],
  "partner": {
    "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
  }
}
```

#### `POST /api/v1/admin/referral-programs/{id}/codes`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/codes
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214"
}
```

**Response**

```json
{
  "id": "cmtcpoxut04t9nz01mbmjp70g",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
  "isActive": true,
  "startsAt": null,
  "endsAt": null,
  "usageLimit": null,
  "perStudentUsageLimit": null,
  "createdAt": "2026-08-28T08:50:45.990Z",
  "updatedAt": "2026-08-28T08:50:45.990Z"
}
```

#### `PATCH /api/v1/admin/referral-programs/codes/{id}`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/admin/referral-programs/codes/cmtcpoxut04t9nz01mbmjp70g
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "usageLimit": 10
}
```

**Response**

```json
{
  "id": "cmtcpoxut04t9nz01mbmjp70g",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
  "isActive": true,
  "startsAt": null,
  "endsAt": null,
  "usageLimit": 10,
  "perStudentUsageLimit": null,
  "createdAt": "2026-08-28T08:50:45.990Z",
  "updatedAt": "2026-08-28T08:50:46.189Z"
}
```

#### `POST /api/v1/admin/referral-programs/codes/{id}/suspend`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/codes/cmtcpoxut04t9nz01mbmjp70g/suspend
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxut04t9nz01mbmjp70g",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
  "isActive": false,
  "startsAt": null,
  "endsAt": null,
  "usageLimit": 10,
  "perStudentUsageLimit": null,
  "createdAt": "2026-08-28T08:50:45.990Z",
  "updatedAt": "2026-08-28T08:50:46.389Z"
}
```

#### `POST /api/v1/admin/referral-programs/codes/{id}/resume`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/codes/cmtcpoxut04t9nz01mbmjp70g/resume
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoxut04t9nz01mbmjp70g",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
  "isActive": true,
  "startsAt": null,
  "endsAt": null,
  "usageLimit": 10,
  "perStudentUsageLimit": null,
  "createdAt": "2026-08-28T08:50:45.990Z",
  "updatedAt": "2026-08-28T08:50:46.568Z"
}
```

#### `POST /api/v1/admin/referral-programs/{id}/rules`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/rules
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "kind": "PERCENTAGE",
  "percentageBps": 1000,
  "startsAt": "2026-08-28T08:49:45.196Z"
}
```

**Response**

```json
{
  "id": "cmtcpoyfv04tjnz01jy7rdsxy",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "version": 1,
  "kind": "PERCENTAGE",
  "percentageBps": 1000,
  "fixedCommissionMinor": null,
  "maximumCommissionMinor": null,
  "currency": "EGP",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "isActive": false,
  "createdAt": "2026-08-28T08:50:46.748Z"
}
```

#### `POST /api/v1/admin/referral-programs/{id}/rules/{ruleId}/activate`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/rules/cmtcpoyfv04tjnz01jy7rdsxy/activate
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpoyfv04tjnz01jy7rdsxy",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "version": 1,
  "kind": "PERCENTAGE",
  "percentageBps": 1000,
  "fixedCommissionMinor": null,
  "maximumCommissionMinor": null,
  "currency": "EGP",
  "startsAt": "2026-08-28T08:49:45.196Z",
  "endsAt": null,
  "isActive": true,
  "createdAt": "2026-08-28T08:50:46.748Z"
}
```

#### `POST /api/v1/admin/referral-programs/{id}/review-rules`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/cmtcpoxju04t3nz01s6ylz96u/review-rules
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "name": "Phase 5 review rule journey-20260828084459-e330-215",
  "kind": "STUDENT_PROGRAM_APPROVED_SALES",
  "action": "QUEUE_REVIEW",
  "threshold": 1
}
```

**Response**

```json
{
  "id": "cmtcpoyrh04tpnz016wdrf8be",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "name": "Phase 5 review rule journey-20260828084459-e330-215",
  "kind": "STUDENT_PROGRAM_APPROVED_SALES",
  "action": "QUEUE_REVIEW",
  "threshold": 1,
  "isActive": true,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:47.165Z",
  "updatedAt": "2026-08-28T08:50:47.165Z"
}
```

#### `PATCH /api/v1/admin/referral-programs/review-rules/{id}`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/admin/referral-programs/review-rules/cmtcpoyrh04tpnz016wdrf8be
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "threshold": 1
}
```

**Response**

```json
{
  "id": "cmtcpoyrh04tpnz016wdrf8be",
  "programId": "cmtcpoxju04t3nz01s6ylz96u",
  "name": "Phase 5 review rule journey-20260828084459-e330-215",
  "kind": "STUDENT_PROGRAM_APPROVED_SALES",
  "action": "QUEUE_REVIEW",
  "threshold": 1,
  "isActive": true,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:47.165Z",
  "updatedAt": "2026-08-28T08:50:47.377Z"
}
```

#### `GET /api/v1/admin/referral-programs/review-flags`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/referral-programs/review-flags?programId=cmtcpoxju04t3nz01s6ylz96u&limit=100
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpp0h604ucnz01w9hi02pf",
      "attributionId": "cmtcpp0h504uanz013q2hi6sc",
      "ruleId": "cmtcpoyrh04tpnz016wdrf8be",
      "source": "AUTOMATED",
      "type": "STUDENT_PROGRAM_APPROVED_SALES",
      "action": "QUEUE_REVIEW",
      "observedValue": 1,
      "threshold": 1,
      "metadata": {
        "programId": "cmtcpoxju04t3nz01s6ylz96u",
        "referralCodeId": "cmtcpoxut04t9nz01mbmjp70g"
      },
      "status": "OPEN",
      "assignedToId": null,
      "disposition": null,
      "resolvedById": null,
      "resolvedAt": null,
      "createdAt": "2026-08-28T08:50:49.385Z",
      "updatedAt": "2026-08-28T08:50:49.385Z",
      "attribution": {
        "orderId": "cmtcpp0h404u6nz01o8dadp93",
        "referralProgramId": "cmtcpoxju04t3nz01s6ylz96u",
        "referralCodeId": "cmtcpoxut04t9nz01mbmjp70g"
      },
      "rule": {
        "name": "Phase 5 review rule journey-20260828084459-e330-215",
        "kind": "STUDENT_PROGRAM_APPROVED_SALES"
      },
      "assignedTo": null,
      "notes": []
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

#### `POST /api/v1/admin/referral-programs/attributions/{id}/review-flags`

Recorded negative test (`404`). The report does not contain a successful call for this operation.

**Request**

```http
POST /api/v1/admin/referral-programs/attributions/missing-attribution/review-flags
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "type": "COVERAGE",
  "note": "Missing attribution validation coverage"
}
```

**Response**

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND.REFERRAL_ATTRIBUTION_NOT_FOUND",
  "message": {
    "en": "Referral attribution not found",
    "ar": "تعذر تنفيذ الطلب: غير موجود"
  },
  "error": {
    "ar": "غير موجود",
    "en": "Not Found"
  },
  "correlationId": "3949d3c6-8ab3-40b0-a68e-df740a3b7436"
}
```

#### `PATCH /api/v1/admin/referral-programs/review-flags/{id}/assign`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/admin/referral-programs/review-flags/cmtcpp0h604ucnz01w9hi02pf/assign
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "assigneeUserId": "cmtcphm6k03hhnz01kvxon5f4"
}
```

**Response**

```json
{
  "id": "cmtcpp0h604ucnz01w9hi02pf",
  "attributionId": "cmtcpp0h504uanz013q2hi6sc",
  "ruleId": "cmtcpoyrh04tpnz016wdrf8be",
  "source": "AUTOMATED",
  "type": "STUDENT_PROGRAM_APPROVED_SALES",
  "action": "QUEUE_REVIEW",
  "observedValue": 1,
  "threshold": 1,
  "metadata": {
    "programId": "cmtcpoxju04t3nz01s6ylz96u",
    "referralCodeId": "cmtcpoxut04t9nz01mbmjp70g"
  },
  "status": "ASSIGNED",
  "assignedToId": "cmtcphm6k03hhnz01kvxon5f4",
  "disposition": null,
  "resolvedById": null,
  "resolvedAt": null,
  "createdAt": "2026-08-28T08:50:49.385Z",
  "updatedAt": "2026-08-28T08:50:54.942Z"
}
```

#### `POST /api/v1/admin/referral-programs/review-flags/{id}/notes`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/referral-programs/review-flags/cmtcpp0h604ucnz01w9hi02pf/notes
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "body": "Phase 5 referral review coverage note"
}
```

**Response**

```json
{
  "id": "cmtcpp4xb04vunz01hnyj3l5x",
  "flagId": "cmtcpp0h604ucnz01w9hi02pf",
  "body": "Phase 5 referral review coverage note",
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "createdAt": "2026-08-28T08:50:55.152Z"
}
```

#### `PATCH /api/v1/admin/referral-programs/review-flags/{id}/resolve`

Recorded successful test (`200`).

**Request**

```http
PATCH /api/v1/admin/referral-programs/review-flags/cmtcpp0h604ucnz01w9hi02pf/resolve
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "status": "ACCEPTED",
  "disposition": "NO_ACTION",
  "note": "Phase 5 referral review coverage resolved"
}
```

**Response**

```json
{
  "id": "cmtcpp0h604ucnz01w9hi02pf",
  "attributionId": "cmtcpp0h504uanz013q2hi6sc",
  "ruleId": "cmtcpoyrh04tpnz016wdrf8be",
  "source": "AUTOMATED",
  "type": "STUDENT_PROGRAM_APPROVED_SALES",
  "action": "QUEUE_REVIEW",
  "observedValue": 1,
  "threshold": 1,
  "metadata": {
    "programId": "cmtcpoxju04t3nz01s6ylz96u",
    "referralCodeId": "cmtcpoxut04t9nz01mbmjp70g"
  },
  "status": "ACCEPTED",
  "assignedToId": "cmtcphm6k03hhnz01kvxon5f4",
  "disposition": "NO_ACTION",
  "resolvedById": "cmtcphm6k03hhnz01kvxon5f4",
  "resolvedAt": "2026-08-28T08:50:55.359Z",
  "createdAt": "2026-08-28T08:50:49.385Z",
  "updatedAt": "2026-08-28T08:50:55.360Z"
}
```

#### `GET /api/v1/partners/referrals/report`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/referrals/report
Authorization: Bearer <admin-access-token>
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

#### `GET /api/v1/partners/referrals/settlements`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/partners/referrals/settlements
Authorization: Bearer <admin-access-token>
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

#### `GET /api/v1/admin/referral-reporting`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/referral-reporting?partnerUserId=cmtcpoxdk04sznz01lkcihtyv
Authorization: Bearer <admin-access-token>
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
      "period": "2026-08-28",
      "conversions": 1,
      "approvedSales": 1,
      "approvedSalesMinor": 19000,
      "learners": 1
    }
  ],
  "products": [
    {
      "productId": "cmtcpi0i803k6nz01890rnl0e",
      "productTitle": "Covered courses journey-20260828084459-e330-93",
      "approvedSales": 1,
      "approvedSalesMinor": 19000,
      "learners": 1
    }
  ],
  "categories": [
    {
      "categoryId": "cmtcpi0cb03k2nz01ccoj8f89",
      "categoryTitle": "Covered subjects journey-20260828084459-e330-92",
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

#### `GET /api/v1/admin/partner-finance/allocations`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partner-finance/allocations?referralRuleId=cmtcpoyfv04tjnz01jy7rdsxy&limit=100
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpp2se04usnz01exglmhgq",
      "kind": "REFERRAL_COMMISSION",
      "state": "PAYABLE",
      "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
      "orderItemId": "cmtcpp0h504u8nz01bzlm9goh",
      "publisherAgreementId": null,
      "referralRuleId": "cmtcpoyfv04tjnz01jy7rdsxy",
      "basisMinor": 19000,
      "amountMinor": 1900,
      "currency": "EGP",
      "snapshot": {
        "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
        "kind": "PERCENTAGE",
        "codeId": "cmtcpoxut04t9nz01mbmjp70g",
        "ruleId": "cmtcpoyfv04tjnz01jy7rdsxy",
        "version": 1,
        "currency": "EGP",
        "programId": "cmtcpoxju04t3nz01s6ylz96u",
        "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
        "percentageBps": 1000,
        "fixedCommissionMinor": null,
        "maximumCommissionMinor": null
      },
      "idempotencyKey": "referral-commission:cmtcpp0h504u8nz01bzlm9goh",
      "reversedAllocationId": null,
      "payableAt": "2026-08-28T08:50:52.382Z",
      "paidAt": null,
      "reversedAt": null,
      "createdAt": "2026-08-28T08:50:52.382Z",
      "partner": {
        "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
      },
      "publisherAgreement": null,
      "referralRule": {
        "programId": "cmtcpoxju04t3nz01s6ylz96u",
        "version": 1
      },
      "settlementLines": []
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

#### `POST /api/v1/admin/partner-finance/settlements`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partner-finance/settlements
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "allocationIds": [
    "cmtcpp2se04usnz01exglmhgq"
  ],
  "paymentReference": "phase5-settlement-journey-20260828084459-e330-221"
}
```

**Response**

```json
{
  "id": "cmtcpp32z04v1nz01ocgkqhpr",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "paymentReference": "phase5-settlement-journey-20260828084459-e330-221",
  "currency": "EGP",
  "totalMinor": 1900,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "paidAt": null,
  "createdAt": "2026-08-28T08:50:52.763Z",
  "lines": [
    {
      "settlementId": "cmtcpp32z04v1nz01ocgkqhpr",
      "allocationId": "cmtcpp2se04usnz01exglmhgq",
      "allocation": {
        "id": "cmtcpp2se04usnz01exglmhgq",
        "kind": "REFERRAL_COMMISSION",
        "state": "PAYABLE",
        "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
        "orderItemId": "cmtcpp0h504u8nz01bzlm9goh",
        "publisherAgreementId": null,
        "referralRuleId": "cmtcpoyfv04tjnz01jy7rdsxy",
        "basisMinor": 19000,
        "amountMinor": 1900,
        "currency": "EGP",
        "snapshot": {
          "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
          "kind": "PERCENTAGE",
          "codeId": "cmtcpoxut04t9nz01mbmjp70g",
          "ruleId": "cmtcpoyfv04tjnz01jy7rdsxy",
          "version": 1,
          "currency": "EGP",
          "programId": "cmtcpoxju04t3nz01s6ylz96u",
          "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
          "percentageBps": 1000,
          "fixedCommissionMinor": null,
          "maximumCommissionMinor": null
        },
        "idempotencyKey": "referral-commission:cmtcpp0h504u8nz01bzlm9goh",
        "reversedAllocationId": null,
        "payableAt": "2026-08-28T08:50:52.382Z",
        "paidAt": null,
        "reversedAt": null,
        "createdAt": "2026-08-28T08:50:52.382Z"
      }
    }
  ]
}
```

#### `GET /api/v1/admin/partner-finance/settlements`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partner-finance/settlements?limit=100
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpp32z04v1nz01ocgkqhpr",
      "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
      "paymentReference": "phase5-settlement-journey-20260828084459-e330-221",
      "currency": "EGP",
      "totalMinor": 1900,
      "createdById": "cmtcphm6k03hhnz01kvxon5f4",
      "paidAt": "2026-08-28T08:50:52.973Z",
      "createdAt": "2026-08-28T08:50:52.763Z",
      "partner": {
        "displayName": "Phase 5 referral partner journey-20260828084459-e330-211"
      },
      "_count": {
        "lines": 1
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 9,
    "totalPages": 1
  }
}
```

#### `POST /api/v1/admin/partner-finance/settlements/{id}/mark-paid`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partner-finance/settlements/cmtcpp32z04v1nz01ocgkqhpr/mark-paid
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpp32z04v1nz01ocgkqhpr",
  "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
  "paymentReference": "phase5-settlement-journey-20260828084459-e330-221",
  "currency": "EGP",
  "totalMinor": 1900,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "paidAt": "2026-08-28T08:50:52.973Z",
  "createdAt": "2026-08-28T08:50:52.763Z",
  "lines": [
    {
      "settlementId": "cmtcpp32z04v1nz01ocgkqhpr",
      "allocationId": "cmtcpp2se04usnz01exglmhgq",
      "allocation": {
        "id": "cmtcpp2se04usnz01exglmhgq",
        "kind": "REFERRAL_COMMISSION",
        "state": "PAID",
        "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
        "orderItemId": "cmtcpp0h504u8nz01bzlm9goh",
        "publisherAgreementId": null,
        "referralRuleId": "cmtcpoyfv04tjnz01jy7rdsxy",
        "basisMinor": 19000,
        "amountMinor": 1900,
        "currency": "EGP",
        "snapshot": {
          "code": "PHASE5-REFERRAL-JOURNEY-20260828084459-E330-214",
          "kind": "PERCENTAGE",
          "codeId": "cmtcpoxut04t9nz01mbmjp70g",
          "ruleId": "cmtcpoyfv04tjnz01jy7rdsxy",
          "version": 1,
          "currency": "EGP",
          "programId": "cmtcpoxju04t3nz01s6ylz96u",
          "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
          "percentageBps": 1000,
          "fixedCommissionMinor": null,
          "maximumCommissionMinor": null
        },
        "idempotencyKey": "referral-commission:cmtcpp0h504u8nz01bzlm9goh",
        "reversedAllocationId": null,
        "payableAt": "2026-08-28T08:50:52.382Z",
        "paidAt": "2026-08-28T08:50:52.973Z",
        "reversedAt": null,
        "createdAt": "2026-08-28T08:50:52.382Z"
      }
    }
  ]
}
```

#### `POST /api/v1/admin/partner-finance/usage-rollups/rebuild`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partner-finance/usage-rollups/rebuild
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "from": "2026-08-28",
  "to": "2026-08-28",
  "publisherUserId": "cmtcphpj003i0nz01pzduxumw"
}
```

**Response**

```json
{
  "from": "2026-08-28",
  "to": "2026-08-28",
  "publisherUserId": "cmtcphpj003i0nz01pzduxumw",
  "rows": 4
}
```

#### `POST /api/v1/admin/partner-finance/reconciliation-runs`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partner-finance/reconciliation-runs
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "pilotLabel": "phase5-reconciliation-journey-20260828084459-e330-223",
  "orderIds": [
    "cmtcpp0h404u6nz01o8dadp93"
  ]
}
```

**Response**

```json
{
  "id": "cmtcpp3y704vjnz01b7sgdzyt",
  "pilotLabel": "phase5-reconciliation-journey-20260828084459-e330-223",
  "status": "DRAFT",
  "summary": null,
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "startedAt": null,
  "completedAt": null,
  "createdAt": "2026-08-28T08:50:53.888Z",
  "updatedAt": "2026-08-28T08:50:53.888Z",
  "orders": [
    {
      "runId": "cmtcpp3y704vjnz01b7sgdzyt",
      "orderId": "cmtcpp0h404u6nz01o8dadp93"
    }
  ]
}
```

#### `GET /api/v1/admin/partner-finance/reconciliation-runs`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partner-finance/reconciliation-runs?limit=100
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpp3y704vjnz01b7sgdzyt",
      "pilotLabel": "phase5-reconciliation-journey-20260828084459-e330-223",
      "status": "COMPLETED",
      "summary": {
        "ordersScanned": 1,
        "discrepancyCount": 1
      },
      "createdById": "cmtcphm6k03hhnz01kvxon5f4",
      "startedAt": "2026-08-28T08:50:54.088Z",
      "completedAt": "2026-08-28T08:50:54.127Z",
      "createdAt": "2026-08-28T08:50:53.888Z",
      "updatedAt": "2026-08-28T08:50:54.138Z",
      "_count": {
        "discrepancies": 1,
        "orders": 1
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 9,
    "totalPages": 1
  }
}
```

#### `POST /api/v1/admin/partner-finance/reconciliation-runs/{id}/run`

Recorded successful test (`201`).

**Request**

```http
POST /api/v1/admin/partner-finance/reconciliation-runs/cmtcpp3y704vjnz01b7sgdzyt/run
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpp3y704vjnz01b7sgdzyt",
  "pilotLabel": "phase5-reconciliation-journey-20260828084459-e330-223",
  "status": "COMPLETED",
  "summary": {
    "ordersScanned": 1,
    "discrepancyCount": 1
  },
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "startedAt": "2026-08-28T08:50:54.088Z",
  "completedAt": "2026-08-28T08:50:54.127Z",
  "createdAt": "2026-08-28T08:50:53.888Z",
  "updatedAt": "2026-08-28T08:50:54.138Z",
  "discrepancies": [
    {
      "id": "cmtcpp45104vmnz01j23dguab",
      "runId": "cmtcpp3y704vjnz01b7sgdzyt",
      "type": "SETTLEMENT_STATE_MISMATCH",
      "expectedAmountMinor": null,
      "actualAmountMinor": 1900,
      "expectedBasisMinor": null,
      "actualBasisMinor": null,
      "currency": "EGP",
      "orderItemId": null,
      "allocationId": "cmtcpp2se04usnz01exglmhgq",
      "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
      "severity": "ERROR",
      "status": "OPEN",
      "assignedToId": null,
      "notes": null,
      "resolutionNote": null,
      "resolvedById": null,
      "resolvedAt": null,
      "createdAt": "2026-08-28T08:50:54.134Z",
      "updatedAt": "2026-08-28T08:50:54.134Z"
    }
  ],
  "orders": [
    {
      "runId": "cmtcpp3y704vjnz01b7sgdzyt",
      "orderId": "cmtcpp0h404u6nz01o8dadp93"
    }
  ]
}
```

#### `GET /api/v1/admin/partner-finance/reconciliation-runs/{id}`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partner-finance/reconciliation-runs/cmtcpp3y704vjnz01b7sgdzyt
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "id": "cmtcpp3y704vjnz01b7sgdzyt",
  "pilotLabel": "phase5-reconciliation-journey-20260828084459-e330-223",
  "status": "COMPLETED",
  "summary": {
    "ordersScanned": 1,
    "discrepancyCount": 1
  },
  "createdById": "cmtcphm6k03hhnz01kvxon5f4",
  "startedAt": "2026-08-28T08:50:54.088Z",
  "completedAt": "2026-08-28T08:50:54.127Z",
  "createdAt": "2026-08-28T08:50:53.888Z",
  "updatedAt": "2026-08-28T08:50:54.138Z",
  "orders": [
    {
      "runId": "cmtcpp3y704vjnz01b7sgdzyt",
      "orderId": "cmtcpp0h404u6nz01o8dadp93"
    }
  ],
  "discrepancies": [
    {
      "id": "cmtcpp45104vmnz01j23dguab",
      "runId": "cmtcpp3y704vjnz01b7sgdzyt",
      "type": "SETTLEMENT_STATE_MISMATCH",
      "expectedAmountMinor": null,
      "actualAmountMinor": 1900,
      "expectedBasisMinor": null,
      "actualBasisMinor": null,
      "currency": "EGP",
      "orderItemId": null,
      "allocationId": "cmtcpp2se04usnz01exglmhgq",
      "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
      "severity": "ERROR",
      "status": "OPEN",
      "assignedToId": null,
      "notes": null,
      "resolutionNote": null,
      "resolvedById": null,
      "resolvedAt": null,
      "createdAt": "2026-08-28T08:50:54.134Z",
      "updatedAt": "2026-08-28T08:50:54.134Z"
    }
  ]
}
```

#### `GET /api/v1/admin/partner-finance/reconciliation-runs/{id}/discrepancies`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/partner-finance/reconciliation-runs/cmtcpp3y704vjnz01b7sgdzyt/discrepancies?limit=100
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "id": "cmtcpp45104vmnz01j23dguab",
      "runId": "cmtcpp3y704vjnz01b7sgdzyt",
      "type": "SETTLEMENT_STATE_MISMATCH",
      "expectedAmountMinor": null,
      "actualAmountMinor": 1900,
      "expectedBasisMinor": null,
      "actualBasisMinor": null,
      "currency": "EGP",
      "orderItemId": null,
      "allocationId": "cmtcpp2se04usnz01exglmhgq",
      "partnerUserId": "cmtcpoxdk04sznz01lkcihtyv",
      "severity": "ERROR",
      "status": "OPEN",
      "assignedToId": null,
      "notes": null,
      "resolutionNote": null,
      "resolvedById": null,
      "resolvedAt": null,
      "createdAt": "2026-08-28T08:50:54.134Z",
      "updatedAt": "2026-08-28T08:50:54.134Z"
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

#### `PATCH /api/v1/admin/partner-finance/reconciliation-discrepancies/{id}/assign`

Recorded negative test (`404`). The report does not contain a successful call for this operation.

**Request**

```http
PATCH /api/v1/admin/partner-finance/reconciliation-discrepancies/missing-discrepancy/assign
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "assigneeUserId": "cmtcphm6k03hhnz01kvxon5f4",
  "notes": "Missing discrepancy validation coverage"
}
```

**Response**

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND.RECORD_NOT_FOUND",
  "message": {
    "en": "Record not found",
    "ar": "تعذر تنفيذ الطلب: غير موجود"
  },
  "error": {
    "ar": "غير موجود",
    "en": "Not Found"
  },
  "correlationId": "ddd1d36d-9752-4bc1-8ce7-e0dd1d61ee61"
}
```

#### `PATCH /api/v1/admin/partner-finance/reconciliation-discrepancies/{id}/resolve`

Recorded negative test (`404`). The report does not contain a successful call for this operation.

**Request**

```http
PATCH /api/v1/admin/partner-finance/reconciliation-discrepancies/missing-discrepancy/resolve
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "status": "ACCEPTED",
  "resolutionNote": "Missing discrepancy validation coverage"
}
```

**Response**

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND.RECORD_NOT_FOUND",
  "message": {
    "en": "Record not found",
    "ar": "تعذر تنفيذ الطلب: غير موجود"
  },
  "error": {
    "ar": "غير موجود",
    "en": "Not Found"
  },
  "correlationId": "802dcc85-464a-4414-bebe-a77e605947ae"
}
```

#### `GET /api/v1/admin/reports/partner-obligations`

Recorded successful test (`200`).

**Request**

```http
GET /api/v1/admin/reports/partner-obligations
Authorization: Bearer <admin-access-token>
```

**Response**

```json
{
  "data": [
    {
      "_count": 25,
      "_sum": {
        "amountMinor": 18400
      },
      "kind": "PUBLISHER_SALE",
      "state": "PAYABLE",
      "currency": "EGP",
      "allocations": 25,
      "amountMinor": 18400
    }
  ]
}
```
