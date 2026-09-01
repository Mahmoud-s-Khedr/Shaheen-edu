# Content-publisher operations frontend integration guide

This guide covers the content-publisher setup and administration flows that
precede the publisher reporting screens documented in
[`partner-frontend-integration-guide.md`](partner-frontend-integration-guide.md).
It is intended for the staff/admin application and the publisher portal.

All paths are relative to `/api/v1`. The generated
[`../docs-json.json`](../docs-json.json) remains the canonical API contract.

## 1. Scope and permissions

A content publisher is a `PARTNER` user whose `partnerType` is
`CONTENT_PUBLISHER`. Creating the account does not itself grant it content,
create a commercial agreement, or generate earnings.

| Actor | Can do | Cannot do |
| --- | --- | --- |
| `ADMIN` / `SUPER_ADMIN` | Create the publisher account; configure content pricing; create, activate, replace, and end publisher agreements; attribute question sources to a publisher. | Use a publisher's self-service reports as that publisher. |
| `PARTNER` + `CONTENT_PUBLISHER` | Sign in, maintain its profile, and view its agreement-covered content, ledger, earnings, and aggregate question usage. | Create or edit agreements, prices, courses, content items, assets, question sources, question banks, or questions. |

The second boundary is deliberate and important for frontend routing. Every
currently implemented content-authoring endpoint is restricted to `ADMIN` or
`SUPER_ADMIN`; a publisher token must receive a `403` rather than being given
an authoring UI. The portal is reporting-only at present.

## 2. Data model and dependency map

```text
Create CONTENT_PUBLISHER account
             |
             +--> create a signed-document asset (optional) --+
             |                                                 |
Create course/chapter/lesson ----> configure sale pricing      |
             |                                                 v
             +--------------------------> create draft publisher agreement
                                                    |
                                             activate agreement
                                                    |
Learner buys covered content --> approved fulfilment --> immutable publisher allocation
                                                    |
                                       publisher portal: content / earnings / ledger

Create CONTENT_PUBLISHER question source --> author and publish questions
                                                    |
                                assessment attempts --> aggregate usage reporting
```

An agreement covers exactly one hierarchy target: a `courseId`, `chapterId`,
or `lessonId`. It does **not** assign ownership to an individual content item,
video, or asset. Question-usage attribution is separate: it derives from a
published question source whose `publisherUserId` identifies the publisher.

## 3. Recommended admin journey

### A. Create and verify the publisher account

1. Create the partner with `POST /admin/partners`, using
   `partnerType: "CONTENT_PUBLISHER"`.
2. Preserve the returned partner/user ID. This is `publisherUserId` in an
   agreement and in a content-publisher question source.
3. Optionally let the publisher sign in and call `GET /partners/me` to verify
   the account and profile. Do not consider successful login proof that
   reporting is available: reporting can be unavailable during the ledger
   rollout and then returns `409`.

Example account request:

```json
{
  "email": "publisher@example.com",
  "password": "<8-to-128-character-password>",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Example Publishing",
  "legalName": "Example Publishing LLC",
  "phone": "01098765432"
}
```

### B. Set commercial availability and price

Configure pricing before making purchasable publisher-covered material live.
The nearest explicit price wins: lesson, then chapter, then course. A course
is the root of this lookup; chapters and lessons can inherit a price from
their ancestors.

| Endpoint | Target | Body |
| --- | --- | --- |
| `POST /admin/pricing/course/{id}` | Course | `isPurchasable`, plus `priceMinor` and `currency: "EGP"` when purchasable. |
| `POST /admin/pricing/chapter/{id}` | Chapter | Same body; creates a chapter override. |
| `POST /admin/pricing/lesson/{id}` | Lesson | Same body; creates a lesson override. |
| `GET /admin/pricing/effective` | Course, chapter, or lesson | Query with exactly one of `courseId`, `chapterId`, `lessonId`. |

Money is in EGP minor units. For example, `15000` means EGP 150.00. For a
purchasable target, send both `priceMinor` and `currency: "EGP"`; for an
unavailable target, send only `isPurchasable: false`.

```http
POST /api/v1/admin/pricing/course/course-id
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{ "isPurchasable": true, "priceMinor": 15000, "currency": "EGP" }
```

Use the effective-pricing response to display an inherited-price label, such
as “Inherited from Course: Algebra”, from its `resolvedFrom` object. Do not
copy an inherited value into a chapter or lesson merely to render it.

### C. Create a draft agreement

`POST /admin/publisher-agreements` creates a `DRAFT`; it does not begin
commercial attribution. The body must name the publisher and exactly one
coverage target.

```json
{
  "publisherUserId": "publisher-user-id",
  "courseId": "course-id",
  "payoutKind": "PERCENTAGE",
  "revenueShareBps": 2500,
  "startsAt": "2026-09-01T00:00:00.000Z",
  "isPrimary": true,
  "currency": "EGP",
  "contractReference": "PUB-2026-001",
  "signedDocumentAssetId": "optional-ready-asset-id",
  "internalNote": "Internal staff note"
}
```

Supported payout configurations are:

| `payoutKind` | Required amount | Meaning |
| --- | --- | --- |
| `PERCENTAGE` | `revenueShareBps` from `0` to `10000` | Basis points; `2500` is 25%. |
| `FIXED_PER_SALE` | `fixedPayoutMinor` of at least `1` | Fixed EGP minor-unit amount per eligible sale. |

`PERCENTAGE` is the default if `payoutKind` is omitted. `FIXED_PER_SALE`
currently supports EGP only. `endsAt`, when supplied, must be later than
`startsAt`.

If a signed document is stored in the platform, upload/complete it through the
admin asset flow first, then use its ready asset ID as `signedDocumentAssetId`.
The document reference and `internalNote` are staff data: do not render them in
the publisher portal unless the API response and product policy explicitly
allow it.

### D. Review, edit, and activate

Show a draft review screen before activation. A draft may be updated with
`PATCH /admin/publisher-agreements/{id}`. Only draft agreements are editable.

Activation uses `POST /admin/publisher-agreements/{id}/activate`. It should be
an explicit confirmation action because it makes the agreement effective for
future fulfilment. Activation rejects an overlapping active, primary agreement
for the same exact target with `409`.

`GET /admin/publisher-agreements` is paginated (`page`, `limit`) and omits
ended agreements by default. Use `history=true` for the complete agreement
timeline. Its records include publisher and target display labels
(`publisherName`, `courseName`, `chapterName`, `lessonName`), which should be
preferred over resolving names client-side.

### E. Check effective coverage before sale or launch

Call `GET /admin/publisher-agreements/effective` with one hierarchy target and
an optional `at` ISO timestamp. The response checks the target first and then
its parents:

```text
lesson request: lesson agreement -> chapter agreement -> course agreement
chapter request: chapter agreement -> course agreement
course request:  course agreement only
```

Only an `ACTIVE`, primary agreement whose time range contains `at` is returned.
If no agreement applies, the response is `{ "agreement": null,
"resolvedFrom": null }`; display this as “No active publisher agreement”, not
as an error. This endpoint is the right preflight check for a content launch or
commercial configuration screen.

### F. Change terms or end a relationship

Do not try to edit an active agreement. Use one of the following actions:

| Intent | Endpoint | Behaviour |
| --- | --- | --- |
| Change terms while retaining the same publisher and target | `POST /admin/publisher-agreements/{id}/replace` | Ends the prior version at the replacement `startsAt` and creates version +1. `activateImmediately` defaults to `true`. |
| Stop an active agreement | `POST /admin/publisher-agreements/{id}/end` | Ends the agreement at supplied `endsAt`, or now when omitted. |

The replacement request has the same commercial fields as create, plus
`activateImmediately`. It must retain the existing publisher and exact target,
and its start cannot precede the prior agreement's start. This preserves the
version that was used for historical allocations. Require a confirmation UI
for replacement and ending, then refresh agreement history and effective
coverage.

## 4. Attribute publisher-owned questions

Publisher agreement coverage and question attribution have different jobs:

- Agreements drive publisher-sale allocations for covered commerce targets.
- A question source identifies the publisher whose questions may appear in
  aggregate question-usage reporting.

For publisher question reporting, an administrator creates a source using
`POST /admin/question-banks/sources`:

```json
{
  "type": "CONTENT_PUBLISHER",
  "title": { "ar": "بنك أسئلة الناشر", "en": "Publisher question bank" },
  "note": { "ar": "مرجع الترخيص", "en": "Licence reference" },
  "publisherUserId": "publisher-user-id"
}
```

`publisherUserId` is required for `CONTENT_PUBLISHER` sources and must refer
to a content-publisher partner. It is invalid for all other source types.
Publish the source and the relevant questions through the normal admin
question-bank workflow. The publisher token cannot make these mutations.

The publisher later uses:

- `GET /partners/analytics/question-usage`
- `GET /partners/analytics/question-usage/sources`
- `GET /partners/analytics/question-usage/questions`

Those responses are aggregate-only. Never add learner, attempt, answer-text,
or raw-order views to the portal.

## 5. Publisher portal hand-off

After an agreement is activated and the publisher signs in, bootstrap with
`GET /partners/me` and route only a `CONTENT_PUBLISHER` profile to the
publisher area. The available screens are:

| Portal screen | Endpoint | Notes |
| --- | --- | --- |
| Dashboard | `GET /partners/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` | Ledger-derived headline metrics and compact earnings trend. |
| Earnings | `GET /partners/analytics/earnings` | Optional `from`, `to`, `granularity=day|month`; includes agreement/version breakdowns. |
| Ledger | `GET /partners/analytics/allocations` | Read-only allocations; filter by date and paginate. |
| Covered content | `GET /partners/analytics/content` | Agreement-covered course/chapter/lesson records; filter with `status=DRAFT|ACTIVE|ENDED`. |
| Question insights | `GET /partners/analytics/question-usage` and drill-down endpoints | Dates, hierarchy filters, `sourceId`, and pagination as applicable. |

The partner API derives the publisher identity from the bearer token. Do not
put `publisherUserId` selectors in self-service request UIs.

## 6. State, errors, and frontend guardrails

- Dates sent to publisher analytics use `YYYY-MM-DD` and are interpreted as
  Cairo calendar dates. Agreement dates are ISO date-times.
- Keep money as integer minor units throughout calculations and formatting.
- A `409` from dashboard or analytics can mean partner-ledger reporting is
  disabled by rollout configuration; show a feature-unavailable state, not a
  zero-value report.
- A `409` during activation usually means an overlapping primary agreement or
  a stale/non-draft state. Refresh history and present the conflicting business
  state; do not silently retry an activation.
- Treat allocations and agreement versions as historical records. Refunds and
  corrections use compensating/reversed allocation entries rather than edits.
- Use one-based pagination, preserve list filters across page changes, and do
  not fetch all agreement, allocation, or question-usage records to filter in
  the browser.
- The shared API error envelope is `{ statusCode, code, message: { ar, en },
  error: { ar, en }, details?, correlationId }`. Localize from `message` and
  retain `correlationId` in support logs.

## 7. Screen-to-endpoint mapping

| Screen | First request | Primary actions |
| --- | --- | --- |
| Publisher onboarding | `POST /admin/partners` | Create and open commercial setup. |
| Commercial setup | `GET /admin/pricing/effective` | Set course/chapter/lesson pricing. |
| Agreement directory | `GET /admin/publisher-agreements` | Filter history, inspect state, create draft. |
| Agreement review | `POST /admin/publisher-agreements` | Edit draft, activate, resolve effective coverage. |
| Agreement change | `POST /admin/publisher-agreements/{id}/replace` | Confirm new version and refresh history. |
| Question-source attribution | `POST /admin/question-banks/sources` | Create/publish publisher source before question authoring. |
| Publisher portal | `GET /partners/me` | Route to analytics-only screens. |

For the shared authentication conventions, allocation settlement workflow, and
the detailed publisher reporting queries, see
[`partner-frontend-integration-guide.md`](partner-frontend-integration-guide.md).

## 8. What actually creates a publisher payment obligation

The agreement does not transfer money and the question source has no role in
the financial calculation. The allocation is created only when the payment
provider/manual-payment workflow approves an order and fulfils it.

For every approved order item, the fulfilment transaction does the following:

1. It starts with the saved final item price (`priceMinor`) from checkout. This
   is the price after the applicable campaign or coupon discount, not the list
   price and not the order total.
2. For a course purchase it searches a matching active, primary course
   agreement. For a chapter purchase it searches the chapter first, then the
   parent course, and selects the most specific agreement.
3. The agreement must be effective at **approval/fulfilment time**: it must be
   `ACTIVE`, `isPrimary: true`, started already, and not ended. It is not
   frozen at checkout creation.
4. It calculates the allocation: percentage agreements use
   `floor(item.priceMinor * revenueShareBps / 10000)`; fixed agreements use
   `fixedPayoutMinor`. An amount of zero or an amount greater than the item
   price does not create an allocation.
5. It writes one `PUBLISHER_SALE` allocation for the publisher with the order
   item, agreement ID, agreement version/terms snapshot, basis, amount, and a
   retry-safe `publisher-sale:<orderItemId>` idempotency key. Duplicate Paymob
   webhooks or approval retries cannot create a second row.
6. The row begins as `PAYABLE`. Later, an administrator makes an external
   payment, groups eligible rows into a settlement, and marks the settlement
   paid. Only then do its allocation rows become `PAID`.

For example, an item whose final price is `10000` EGP minor units (EGP 100.00)
under a `2500` basis-point agreement produces a `2500` minor-unit allocation
(EGP 25.00). The recorded test response in Section 10 contains exactly that
relationship.

If an approved refund is later approved, the original allocation is marked
`REVERSED` and the system creates a negative compensating allocation. It never
rewrites the original amount.

> **Current checkout limitation:** commerce only sells `COURSE` and `CHAPTER`
> targets. The agreement API accepts a `lessonId`, and lesson agreements appear
> in coverage/reporting APIs, but the current fulfilment lookup does not select
> a lesson agreement for a sale. Do not present a lesson agreement as a
> sale-revenue configuration until lesson commerce is implemented.

## 9. Complete request DTO reference

This section reproduces the request DTOs implemented in the codebase for every
publisher-specific endpoint used by this guide. Fields marked `?` are optional;
all other fields are required. Every protected endpoint requires
`Authorization: Bearer <access token>`.

### Shared values

```ts
type PartnerType = 'CONTENT_PUBLISHER' | 'REFERRAL_PARTNER';
type AgreementStatus = 'DRAFT' | 'ACTIVE' | 'ENDED';
type PayoutKind = 'PERCENTAGE' | 'FIXED_PER_SALE';
type AllocationKind = 'PUBLISHER_SALE' | 'REFERRAL_COMMISSION';
type AllocationState = 'PENDING' | 'PAYABLE' | 'PAID' | 'REVERSED';
type Granularity = 'day' | 'month';

type PaginationQuery = {
  page?: number;  // one-based; defaults to 1
  limit?: number; // defaults to 20; maximum 100
};

type AgreementTargetQuery = {
  courseId?: string;
  chapterId?: string;
  lessonId?: string;
  // Exactly one target ID must be supplied.
};

type LocalizedText = { ar: string; en: string };
type LocalizedOptionalText = { ar?: string | null; en?: string | null };
```

### 9.1 Account and portal bootstrap

| Endpoint | Authorization | DTO / input |
| --- | --- | --- |
| `POST /admin/partners` | `ADMIN` or `SUPER_ADMIN` | `CreatePartnerDto` |
| `GET /admin/partners` | `ADMIN` or `SUPER_ADMIN` | `PaginationQuery & { q?: string; partnerType?: PartnerType }` |
| `POST /auth/partners/login` | Public | `PartnerLoginDto` |
| `GET /partners/me` | `PARTNER` | No request DTO |

```ts
type CreatePartnerDto = {
  email: string;        // valid email
  password: string;     // 8..128 characters
  partnerType: PartnerType;
  displayName: string;
  legalName?: string;
  phone?: string;
};

type PartnerLoginDto = {
  email: string;        // non-empty
  password: string;     // non-empty
};
```

### 9.2 Pricing

| Endpoint | Authorization | DTO / input |
| --- | --- | --- |
| `POST /admin/pricing/course/{id}` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; `SetPricingDto` body |
| `POST /admin/pricing/chapter/{id}` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; `SetPricingDto` body |
| `POST /admin/pricing/lesson/{id}` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; `SetPricingDto` body |
| `GET /admin/pricing/effective` | `ADMIN` or `SUPER_ADMIN` | `AgreementTargetQuery` query |

```ts
type SetPricingDto = {
  isPurchasable: boolean;
  // Required only when isPurchasable is true.
  priceMinor?: number;  // integer >= 0
  currency?: string;    // required when purchasable; must be 'EGP'
};
```

When `isPurchasable` is `false`, omit `priceMinor` and `currency`; sending
either is rejected. When it is `true`, send both. The effective-pricing query
accepts exactly one target ID.

### 9.3 Publisher agreements

| Endpoint | Authorization | DTO / input |
| --- | --- | --- |
| `POST /admin/publisher-agreements` | `ADMIN` or `SUPER_ADMIN` | `CreatePublisherAgreementDto` body |
| `GET /admin/publisher-agreements` | `ADMIN` or `SUPER_ADMIN` | `PaginationQuery & { history?: boolean }` query |
| `PATCH /admin/publisher-agreements/{id}` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; `UpdatePublisherAgreementDto` body |
| `POST /admin/publisher-agreements/{id}/activate` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; no body |
| `POST /admin/publisher-agreements/{id}/replace` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; `ReplacePublisherAgreementDto` body |
| `POST /admin/publisher-agreements/{id}/end` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; `EndPublisherAgreementDto` body |
| `GET /admin/publisher-agreements/effective` | `ADMIN` or `SUPER_ADMIN` | `AgreementTargetQuery & { at?: string }` query; `at` is an ISO date-time |

```ts
type CreatePublisherAgreementDto = AgreementTargetQuery & {
  publisherUserId: string;
  payoutKind?: PayoutKind;        // defaults to 'PERCENTAGE'
  revenueShareBps?: number;       // integer 0..10000; required for PERCENTAGE
  fixedPayoutMinor?: number;      // integer >= 1; required for FIXED_PER_SALE
  startsAt: string;               // ISO date-time
  endsAt?: string;                // ISO date-time; must be after startsAt
  isPrimary?: boolean;            // defaults to true
  currency?: string;              // FIXED_PER_SALE supports EGP only
  contractReference?: string;     // max 120 characters
  signedDocumentAssetId?: string;
  internalNote?: string;          // max 4,000 characters
};

type UpdatePublisherAgreementDto = {
  publisherUserId?: string;
  payoutKind?: PayoutKind;
  revenueShareBps?: number;       // integer 0..10000
  fixedPayoutMinor?: number;      // integer >= 1
  startsAt?: string;              // ISO date-time
  endsAt?: string;                // ISO date-time
  isPrimary?: boolean;
  currency?: string;
  contractReference?: string;     // max 120 characters
  signedDocumentAssetId?: string;
  internalNote?: string;          // max 4,000 characters
};

type ReplacePublisherAgreementDto = CreatePublisherAgreementDto & {
  activateImmediately?: boolean;  // defaults to true
};

type EndPublisherAgreementDto = {
  endsAt?: string;                // ISO date-time; defaults to server now
};
```

The create/replace DTO must contain exactly one of `courseId`, `chapterId`, or
`lessonId`. An update cannot change a coverage target because it is only valid
while the agreement is a draft. A replacement must retain the previous
publisher and exact target.

### 9.4 Publisher question attribution

| Endpoint | Authorization | DTO / input |
| --- | --- | --- |
| `POST /admin/question-banks/sources` | `ADMIN` or `SUPER_ADMIN` | `CreateQuestionSourceDto` body |
| `POST /admin/question-banks/sources/{id}/publish` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; no body |

```ts
type QuestionSourceType =
  | 'PLATFORM'
  | 'CONTENT_PUBLISHER'
  | 'EXTERNAL_BOOK'
  | 'PREVIOUS_EXAM'
  | 'MINISTRY_MODEL';

type CreateQuestionSourceDto = {
  type: QuestionSourceType;
  title: LocalizedText;
  note?: LocalizedOptionalText;
  // Required when type is CONTENT_PUBLISHER; forbidden for every other type.
  publisherUserId?: string;
};
```

Question-bank and question authoring use the generic admin endpoints documented
in [`questions-api-integration-guide.md`](questions-api-integration-guide.md).
The publisher-specific connection is that a created question must use the
publisher source as its `sourceId`; its `bankId` is a separate required
relationship. Creating a source does not create a question bank or assign any
questions automatically.

### 9.5 Publisher portal reporting

| Endpoint | Authorization | Query DTO |
| --- | --- | --- |
| `GET /partners/dashboard` | `PARTNER` + `CONTENT_PUBLISHER` | `PartnerPeriodQueryDto` |
| `GET /partners/analytics/earnings` | `PARTNER` + `CONTENT_PUBLISHER` | `PartnerEarningsQueryDto` |
| `GET /partners/analytics/allocations` | `PARTNER` | `PartnerAllocationsQueryDto` |
| `GET /partners/analytics/content` | `PARTNER` + `CONTENT_PUBLISHER` | `PartnerContentQueryDto` |
| `GET /partners/analytics/question-usage` | `PARTNER` + `CONTENT_PUBLISHER` | `PartnerQuestionUsageQueryDto` |
| `GET /partners/analytics/question-usage/sources` | `PARTNER` + `CONTENT_PUBLISHER` | `PartnerQuestionUsageQueryDto` |
| `GET /partners/analytics/question-usage/questions` | `PARTNER` + `CONTENT_PUBLISHER` | `PartnerQuestionUsageQueryDto` |

```ts
type PartnerPeriodQueryDto = {
  from?: string; // YYYY-MM-DD, Cairo date
  to?: string;   // YYYY-MM-DD, Cairo date
};

type PartnerEarningsQueryDto = PartnerPeriodQueryDto & {
  granularity?: Granularity;
};

type PartnerAllocationsQueryDto = PaginationQuery & PartnerPeriodQueryDto;

type PartnerContentQueryDto = PaginationQuery & {
  status?: AgreementStatus;
};

type PartnerQuestionUsageQueryDto = PaginationQuery & PartnerPeriodQueryDto & {
  sourceId?: string;
  granularity?: Granularity;
  subjectId?: string;
  courseId?: string;
  chapterId?: string;
  lessonId?: string;
  sectionId?: string;
};
```

Question-usage date ranges may not exceed 93 days. The server chooses the
default earnings granularity: `day` through 93 days and `month` afterwards.
The allocations endpoint permits either partner type at the route layer, but a
content publisher receives only its own allocation rows.

### 9.6 Admin payout operations

| Endpoint | Authorization | DTO / input |
| --- | --- | --- |
| `GET /admin/partner-finance/allocations` | `ADMIN` or `SUPER_ADMIN` | `AdminAllocationsQueryDto` |
| `POST /admin/partner-finance/settlements` | `ADMIN` or `SUPER_ADMIN` | `CreateSettlementDto` body |
| `POST /admin/partner-finance/settlements/{id}/mark-paid` | `ADMIN` or `SUPER_ADMIN` | Path `id: string`; no body |

```ts
type AdminAllocationsQueryDto = PaginationQuery & {
  partnerUserId?: string;
  kind?: AllocationKind;
  state?: AllocationState;
  publisherAgreementId?: string;
  referralRuleId?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
};

type CreateSettlementDto = {
  allocationIds: string[];        // at least one; no duplicate IDs
  paymentReference: string;       // maximum 160 characters
};
```

All selected settlement allocations must be `PAYABLE`, for one partner, in one
currency, and not already included in another settlement. `mark-paid` is a
confirmation of an external payment; it does not initiate a bank transfer.

### 9.7 Reusable response contracts

The following objects cover the response fields used by the endpoint examples
below. `Money` amounts are integer minor units.

```ts
type PartnerSummary = {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  loginIdentifier: string;
  createdAt: string;
  partnerType: PartnerType;
  displayName: string;
  legalName: string | null;
  phone: string | null;
};

type EffectivePricing = {
  title: string;
  priceMinor: number | null;
  currency: string | null;
  isPurchasable: boolean | null;
  resolvedFrom: {
    courseId?: string; chapterId?: string; lessonId?: string;
    courseName?: string | null; chapterName?: string | null;
    lessonName?: string | null;
  };
};

type PublisherAgreement = {
  id: string;
  publisherUserId: string;
  courseId: string | null;
  chapterId: string | null;
  lessonId: string | null;
  payoutKind: PayoutKind;
  revenueShareBps: number | null;
  fixedPayoutMinor: number | null;
  currency: string;
  contractReference: string | null;
  signedDocumentAssetId: string | null;
  internalNote: string | null;
  version: number;
  supersedesId: string | null;
  startsAt: string;
  endsAt: string | null;
  status: AgreementStatus;
  isPrimary: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  publisherName: string | null;
  courseName: string | null;
  chapterName: string | null;
  lessonName: string | null;
};

type QuestionSource = {
  id: string;
  type: QuestionSourceType;
  publisherUserId: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdById: string;
  updatedById: string;
  publisherName: string | null;
  title: { ar: string; en: string | null };
  note: { ar: string | null; en: string | null };
};

type Money = { amountMinor: number; currency: 'EGP' };

type PublisherAllocation = {
  id: string;
  kind: 'PUBLISHER_SALE';
  state: AllocationState;
  basisMinor: number;
  amountMinor: number;
  currency: 'EGP';
  createdAt: string;
  paidAt: string | null;
  reversedAt: string | null;
  publisherAgreementId: string | null;
  basis: Money;
  amount: Money;
};

type PaginationMeta = {
  page: number; limit: number; total: number; totalPages: number;
};
```

## 10. Recorded request and response examples

The examples below are derived from
[`../reports/api-tests/api-2026-08-29T07-58-11-848Z.json`](../reports/api-tests/api-2026-08-29T07-58-11-848Z.json),
recorded on 2026-08-29. They are real disposable test-fixture calls. Bearer
tokens, refresh cookies, and the test password are redacted. Responses from
lists are intentionally limited to their first item.

### 10.1 Create a publisher account and bootstrap its portal

#### `POST /api/v1/admin/partners` — `201`

```json
{
  "email": "partner-journey-20260829075125-d246-6@example.test",
  "password": "<redacted>",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner journey-20260829075125-d246-7",
  "phone": "01093684958"
}
```

```json
{
  "id": "cmte30ocz01isp90196x5b64s",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260829075125-d246-6@example.test",
  "createdAt": "2026-08-29T07:51:34.740Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Partner journey-20260829075125-d246-7",
  "legalName": null,
  "phone": "01093684958"
}
```

#### `GET /api/v1/admin/partners?q=partner&limit=1` — `200`

The request has no body. Its recorded response was:

```json
{
  "data": [
    {
      "id": "cmte30ocz01isp90196x5b64s",
      "status": "ACTIVE",
      "loginIdentifier": "partner-journey-20260829075125-d246-6@example.test",
      "createdAt": "2026-08-29T07:51:34.740Z",
      "partnerType": "CONTENT_PUBLISHER",
      "displayName": "Partner journey-20260829075125-d246-7",
      "legalName": null,
      "phone": "01093684958"
    }
  ],
  "meta": { "page": 1, "limit": 1, "total": 56, "totalPages": 56 }
}
```

#### `POST /api/v1/auth/partners/login` — `201`

```json
{ "email": "partner-journey-20260829075125-d246-6@example.test", "password": "<redacted>" }
```

```json
{
  "accessToken": "<redacted>",
  "user": {
    "id": "cmte30ocz01isp90196x5b64s",
    "role": "PARTNER",
    "loginIdentifier": "partner-journey-20260829075125-d246-6@example.test",
    "mustChangePassword": false
  }
}
```

#### `GET /api/v1/partners/me` — `200`

No request body.

```json
{
  "id": "cmte30ocz01isp90196x5b64s",
  "status": "ACTIVE",
  "loginIdentifier": "partner-journey-20260829075125-d246-6@example.test",
  "createdAt": "2026-08-29T07:51:34.740Z",
  "partnerType": "CONTENT_PUBLISHER",
  "displayName": "Updated partner journey-20260829075125-d246-8",
  "legalName": null,
  "phone": "01093684958"
}
```

### 10.2 Configure pricing

#### `POST /api/v1/admin/pricing/course/{id}` — `201`

```http
POST /api/v1/admin/pricing/course/cmte31yt001p9p90114lige74
```

```json
{ "isPurchasable": true, "priceMinor": 20000, "currency": "EGP" }
```

```json
{
  "title": "Student catalog paid course journey-20260829075125-d246-64",
  "priceMinor": 20000,
  "currency": "EGP",
  "isPurchasable": true,
  "resolvedFrom": {
    "courseId": "cmte31yt001p9p90114lige74",
    "courseName": "Student catalog paid course journey-20260829075125-d246-64"
  }
}
```

#### `POST /api/v1/admin/pricing/chapter/{id}` — `201`

```http
POST /api/v1/admin/pricing/chapter/cmte31z8w01php901888gkt4y
```

```json
{ "isPurchasable": true, "priceMinor": 12000, "currency": "EGP" }
```

```json
{
  "title": "Locked chapter journey-20260829075125-d246-68",
  "priceMinor": 12000,
  "currency": "EGP",
  "isPurchasable": true,
  "resolvedFrom": {
    "chapterId": "cmte31z8w01php901888gkt4y",
    "chapterName": "Locked chapter journey-20260829075125-d246-68"
  }
}
```

#### `POST /api/v1/admin/pricing/lesson/{id}` — `201`

```http
POST /api/v1/admin/pricing/lesson/cmte310mg01l6p901l6vwc1n9
```

```json
{ "isPurchasable": false }
```

```json
{
  "title": "Covered lessons journey-20260829075125-d246-95",
  "priceMinor": null,
  "currency": null,
  "isPurchasable": false,
  "resolvedFrom": {
    "lessonId": "cmte310mg01l6p901l6vwc1n9",
    "lessonName": "Covered lessons journey-20260829075125-d246-95"
  }
}
```

#### `GET /api/v1/admin/pricing/effective?lessonId=...` — `200`

```json
{
  "title": "Course journey-20260829075125-d246-25",
  "priceMinor": 20000,
  "currency": "EGP",
  "isPurchasable": true,
  "resolvedFrom": {
    "courseId": "cmte3108801kyp901thuo4jnw",
    "courseName": "Course journey-20260829075125-d246-25"
  }
}
```

The request has no body; the recorded query was
`lessonId=cmte310mg01l6p901l6vwc1n9`. This proves that the lesson inherited the
course price at that time.

### 10.3 Create, activate, replace, and resolve an agreement

#### `POST /api/v1/admin/publisher-agreements` — `201`

```json
{
  "courseId": "cmte3108801kyp901thuo4jnw",
  "publisherUserId": "cmte30ocz01isp90196x5b64s",
  "revenueShareBps": 1000,
  "startsAt": "2026-08-29T06:52:43.270Z",
  "isPrimary": true
}
```

```json
{
  "id": "cmte326tc01r0p90168qa1p1h",
  "publisherUserId": "cmte30ocz01isp90196x5b64s",
  "courseId": "cmte3108801kyp901thuo4jnw",
  "chapterId": null,
  "lessonId": null,
  "payoutKind": "PERCENTAGE",
  "revenueShareBps": 1000,
  "fixedPayoutMinor": null,
  "currency": "EGP",
  "contractReference": null,
  "signedDocumentAssetId": null,
  "internalNote": null,
  "version": 1,
  "supersedesId": null,
  "startsAt": "2026-08-29T06:52:43.270Z",
  "endsAt": null,
  "status": "DRAFT",
  "isPrimary": true,
  "createdById": "cmte30l5q01i9p901vbvh342e",
  "createdAt": "2026-08-29T07:52:45.312Z",
  "updatedAt": "2026-08-29T07:52:45.312Z",
  "publisherName": "Partner self update journey-20260829075125-d246-9",
  "courseName": "Course journey-20260829075125-d246-25",
  "chapterName": null,
  "lessonName": null
}
```

#### `PATCH /api/v1/admin/publisher-agreements/{id}` — `200`

```http
PATCH /api/v1/admin/publisher-agreements/cmte344w9024kp901xvjh7hpd
```

```json
{ "revenueShareBps": 1200 }
```

The recorded response is a `DRAFT` `PublisherAgreement` with the same fields
as the create response and `revenueShareBps: 1200`.

#### `POST /api/v1/admin/publisher-agreements/{id}/activate` — `201`

The request has no body:

```http
POST /api/v1/admin/publisher-agreements/cmte326tc01r0p90168qa1p1h/activate
```

The response is the agreement shown above with `status: "ACTIVE"` and
`updatedAt: "2026-08-29T07:52:45.627Z"`.

#### `POST /api/v1/admin/publisher-agreements/{id}/replace` — `201`

```json
{
  "lessonId": "cmte310mg01l6p901l6vwc1n9",
  "publisherUserId": "cmte30ocz01isp90196x5b64s",
  "revenueShareBps": 1300,
  "startsAt": "2026-08-29T07:54:16.763Z",
  "isPrimary": false,
  "activateImmediately": true
}
```

```json
{
  "id": "cmte345gg024sp901jdgvxar5",
  "publisherUserId": "cmte30ocz01isp90196x5b64s",
  "courseId": null,
  "chapterId": null,
  "lessonId": "cmte310mg01l6p901l6vwc1n9",
  "payoutKind": "PERCENTAGE",
  "revenueShareBps": 1300,
  "fixedPayoutMinor": null,
  "currency": "EGP",
  "contractReference": null,
  "signedDocumentAssetId": null,
  "internalNote": null,
  "version": 2,
  "supersedesId": "cmte344w9024kp901xvjh7hpd",
  "startsAt": "2026-08-29T07:54:16.763Z",
  "endsAt": null,
  "status": "ACTIVE",
  "isPrimary": false,
  "createdById": "cmte30l5q01i9p901vbvh342e",
  "createdAt": "2026-08-29T07:54:16.864Z",
  "updatedAt": "2026-08-29T07:54:16.864Z",
  "publisherName": "Partner self update journey-20260829075125-d246-9",
  "courseName": null,
  "chapterName": null,
  "lessonName": "Covered lessons journey-20260829075125-d246-95"
}
```

#### `POST /api/v1/admin/publisher-agreements/{id}/end` — `201`

```json
{ "endsAt": "2026-08-29T07:54:16.965Z" }
```

The recorded response is the replacement agreement with
`status: "ENDED"` and `endsAt: "2026-08-29T07:54:16.965Z"`.

#### `GET /api/v1/admin/publisher-agreements?history=true` — `200`

The request has no body. The recorded response was:

```json
{
  "data": [
    {
      "id": "cmte2hznu00msp901w5qus24c",
      "publisherUserId": "cmte2e8g4000sp901ony1mapf",
      "courseId": null,
      "chapterId": null,
      "lessonId": "cmte2elxc0036p9013x2cgqop",
      "payoutKind": "PERCENTAGE",
      "revenueShareBps": 1300,
      "fixedPayoutMinor": null,
      "currency": "EGP",
      "contractReference": null,
      "signedDocumentAssetId": null,
      "internalNote": null,
      "version": 2,
      "supersedesId": "cmte2hz6m00mkp9013t9cdurr",
      "startsAt": "2026-08-29T07:37:02.820Z",
      "endsAt": "2026-08-29T07:37:03.229Z",
      "status": "ENDED",
      "isPrimary": false,
      "createdById": "cmte2e4n00009p901pwo9yt7q",
      "createdAt": "2026-08-29T07:37:02.922Z",
      "updatedAt": "2026-08-29T07:37:03.332Z",
      "publisherName": "Partner self update journey-20260829073356-f04d-9",
      "courseName": null,
      "chapterName": null,
      "lessonName": "Covered lessons journey-20260829073356-f04d-95"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 116, "totalPages": 6 }
}
```

#### `GET /api/v1/admin/publisher-agreements/effective?lessonId=...` — `200`

The request has no body. The recorded query was
`lessonId=cmte310mg01l6p901l6vwc1n9` and returned the more specific active
chapter agreement:

```json
{
  "agreement": {
    "id": "cmte327b101r6p901mmjf1wvo",
    "publisherUserId": "cmte30ocz01isp90196x5b64s",
    "courseId": null,
    "chapterId": "cmte310ed01l2p9014ekavs5u",
    "lessonId": null,
    "payoutKind": "PERCENTAGE",
    "revenueShareBps": 2500,
    "fixedPayoutMinor": null,
    "currency": "EGP",
    "contractReference": null,
    "signedDocumentAssetId": null,
    "internalNote": null,
    "version": 1,
    "supersedesId": null,
    "startsAt": "2026-08-29T06:52:43.270Z",
    "endsAt": null,
    "status": "ACTIVE",
    "isPrimary": true,
    "createdById": "cmte30l5q01i9p901vbvh342e",
    "createdAt": "2026-08-29T07:52:45.949Z",
    "updatedAt": "2026-08-29T07:52:46.251Z",
    "publisherName": "Partner self update journey-20260829075125-d246-9",
    "courseName": null,
    "chapterName": "Chapter journey-20260829075125-d246-27",
    "lessonName": null
  },
  "resolvedFrom": {
    "chapterId": "cmte310ed01l2p9014ekavs5u",
    "courseName": null,
    "chapterName": "Chapter journey-20260829075125-d246-27",
    "lessonName": null
  }
}
```

### 10.4 Create and publish a publisher question source

#### `POST /api/v1/admin/question-banks/sources` — `201`

```json
{
  "type": "CONTENT_PUBLISHER",
  "title": {
    "ar": "Publisher source journey-20260829075125-d246-77",
    "en": "Publisher source journey-20260829075125-d246-77"
  },
  "note": {
    "ar": "Synthetic journey provenance journey-20260829075125-d246-78",
    "en": "Synthetic journey provenance journey-20260829075125-d246-78"
  },
  "publisherUserId": "cmte30ocz01isp90196x5b64s"
}
```

```json
{
  "id": "cmte328po01rgp901ajc8r5yo",
  "type": "CONTENT_PUBLISHER",
  "publisherUserId": "cmte30ocz01isp90196x5b64s",
  "status": "DRAFT",
  "createdAt": "2026-08-29T07:52:47.773Z",
  "updatedAt": "2026-08-29T07:52:47.773Z",
  "publishedAt": null,
  "archivedAt": null,
  "createdById": "cmte30l5q01i9p901vbvh342e",
  "updatedById": "cmte30l5q01i9p901vbvh342e",
  "publisherName": "Partner self update journey-20260829075125-d246-9",
  "title": {
    "ar": "Publisher source journey-20260829075125-d246-77",
    "en": "Publisher source journey-20260829075125-d246-77"
  },
  "note": {
    "ar": "Synthetic journey provenance journey-20260829075125-d246-78",
    "en": "Synthetic journey provenance journey-20260829075125-d246-78"
  }
}
```

#### `POST /api/v1/admin/question-banks/sources/{id}/publish` — `201`

The recorded request had no body:

```http
POST /api/v1/admin/question-banks/sources/cmte328po01rgp901ajc8r5yo/publish
```

The response repeats the source above with `status: "PUBLISHED"` and
`publishedAt: "2026-08-29T07:52:48.286Z"`.

### 10.5 Publisher reporting, including the generated allocation

#### `GET /api/v1/partners/dashboard` — `200`

No body or query was sent. The server defaulted to the current Cairo month.

```json
{
  "period": { "from": "2026-08-01", "to": "2026-08-31", "timeZone": "Africa/Cairo" },
  "granularity": "day",
  "metricDefinitions": {
    "earned": "Positive immutable publisher allocation rows.",
    "reversals": "Absolute value of compensating negative allocation rows.",
    "net": "Signed financial allocations; reversed original rows are audit-only and excluded."
  },
  "totals": {
    "earned": { "amountMinor": 2500, "currency": "EGP" },
    "reversals": { "amountMinor": 0, "currency": "EGP" },
    "net": { "amountMinor": 2500, "currency": "EGP" },
    "payable": { "amountMinor": 2500, "currency": "EGP" },
    "paid": { "amountMinor": 0, "currency": "EGP" },
    "pending": { "amountMinor": 0, "currency": "EGP" }
  },
  "trend": [
    {
      "period": "2026-08-29",
      "earned": { "amountMinor": 2500, "currency": "EGP" },
      "reversals": { "amountMinor": 0, "currency": "EGP" },
      "net": { "amountMinor": 2500, "currency": "EGP" },
      "payable": { "amountMinor": 2500, "currency": "EGP" },
      "paid": { "amountMinor": 0, "currency": "EGP" }
    }
  ],
  "agreements": [
    {
      "agreementId": "cmte327b101r6p901mmjf1wvo",
      "version": 1,
      "contractReference": null,
      "target": { "type": "CHAPTER", "id": "cmte310ed01l2p9014ekavs5u" },
      "earned": { "amountMinor": 2500, "currency": "EGP" },
      "reversals": { "amountMinor": 0, "currency": "EGP" },
      "net": { "amountMinor": 2500, "currency": "EGP" },
      "payable": { "amountMinor": 2500, "currency": "EGP" },
      "paid": { "amountMinor": 0, "currency": "EGP" }
    }
  ]
}
```

#### `GET /api/v1/partners/analytics/earnings?granularity=day` — `200`

The recorded response has the same report shape and values as the dashboard
response above. Its query DTO permits `from`, `to`, and `granularity`; the
recorded request supplied only `granularity=day`.

#### `GET /api/v1/partners/analytics/allocations?limit=100` — `200`

```json
{
  "data": [
    {
      "id": "cmte34luy027kp901xau6vzur",
      "kind": "PUBLISHER_SALE",
      "state": "PAYABLE",
      "basisMinor": 10000,
      "amountMinor": 2500,
      "currency": "EGP",
      "createdAt": "2026-08-29T07:54:38.122Z",
      "paidAt": null,
      "reversedAt": null,
      "publisherAgreementId": "cmte327b101r6p901mmjf1wvo",
      "basis": { "amountMinor": 10000, "currency": "EGP" },
      "amount": { "amountMinor": 2500, "currency": "EGP" }
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 1, "totalPages": 1 }
}
```

This is the actual end-to-end trace: an approved item with a 10,000-minor-unit
basis produced a 2,500-minor-unit payable allocation for the 2,500-bps chapter
agreement shown in the effective-agreement response.

#### `GET /api/v1/partners/analytics/content?limit=100` — `200`

```json
{
  "data": [
    {
      "id": "cmte334zi01uip901rj9ugo7d",
      "status": "ACTIVE",
      "revenueShareBps": 1500,
      "startsAt": "2026-08-29T07:53:29.500Z",
      "endsAt": null,
      "isCurrentlyActive": true,
      "target": {
        "type": "COURSE",
        "id": "cmte3108801kyp901thuo4jnw",
        "title": "Covered courses journey-20260829075125-d246-93",
        "subjectName": "Covered subjects journey-20260829075125-d246-92"
      }
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 6, "totalPages": 1 }
}
```

#### Question-usage endpoints — `200`

The three endpoints share `PartnerQuestionUsageQueryDto`. The recorded calls
were `GET /partners/analytics/question-usage`,
`GET /partners/analytics/question-usage/sources?limit=100`, and
`GET /partners/analytics/question-usage/questions?limit=100`.

```json
// /partners/analytics/question-usage
{
  "period": { "from": "2026-08-01", "to": "2026-08-31", "timeZone": "Africa/Cairo" },
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
  "usageRate": { "numerator": 0, "denominator": 1, "value": 0 },
  "correctRate": { "numerator": 0, "denominator": 0, "value": null },
  "rolledUp": false,
  "freshness": null,
  "indicators": {
    "zeroUsage": false,
    "zeroSolved": true,
    "earningsDespiteZeroSolved": true,
    "earningsScope": "ALL_PUBLISHER_LEDGER"
  }
}

// /partners/analytics/question-usage/sources?limit=100
{
  "data": [
    {
      "sourceId": "cmte335a101uop901itv2mrvy",
      "sourceTitle": "Phase 9 source journey-20260829075125-d246-85",
      "presented": 1,
      "solved": 0,
      "correct": 0,
      "graded": 0,
      "unique": {},
      "reattempts": 0,
      "uniqueSolvers": 0,
      "usageRate": { "numerator": 0, "denominator": 1, "value": 0 },
      "correctRate": { "numerator": 0, "denominator": 0, "value": null }
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 1, "totalPages": 1 }
}

// /partners/analytics/question-usage/questions?limit=100
{
  "data": [
    {
      "sourceId": "cmte335a101uop901itv2mrvy",
      "sourceTitle": "Phase 9 source journey-20260829075125-d246-85",
      "sourceQuestionId": "cmte335vi01v0p901kmaybpf6",
      "presented": 1,
      "solved": 0,
      "correct": 0,
      "graded": 0,
      "unique": {},
      "reattempts": 0,
      "uniqueSolvers": 0,
      "usageRate": { "numerator": 0, "denominator": 1, "value": 0 },
      "correctRate": { "numerator": 0, "denominator": 0, "value": null }
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 1, "totalPages": 1 }
}
```

The full aggregate response also contains `trend` and `metricDefinitions`, as
shown in the recorded report. They are omitted only from this three-response
excerpt to avoid repeating a daily array; no individual learner data is
available.

### 10.6 Create a settlement and confirm it paid

#### `GET /api/v1/admin/partner-finance/allocations` — `200`

Use `kind=PUBLISHER_SALE`, `partnerUserId`, and/or `publisherAgreementId` to
locate publisher rows. The specified report's recorded settlement fixture uses
a referral allocation, but the `data` and pagination shape is the same; the
publisher-specific allocation response above shows the publisher fields.

The recorded request had no body and used
`referralRuleId=cmte37wii02uep901v854pgzx&limit=100` as its query:

```json
{
  "data": [
    {
      "id": "cmte381jc02vnp901au5ammoa",
      "kind": "REFERRAL_COMMISSION",
      "state": "PAYABLE",
      "partnerUserId": "cmte37vfd02tup901xmoxpqbw",
      "orderItemId": "cmte37yoz02v3p901cnomufn4",
      "publisherAgreementId": null,
      "referralRuleId": "cmte37wii02uep901v854pgzx",
      "basisMinor": 19000,
      "amountMinor": 1900,
      "currency": "EGP",
      "idempotencyKey": "referral-commission:cmte37yoz02v3p901cnomufn4",
      "reversedAllocationId": null,
      "payableAt": "2026-08-29T07:57:18.408Z",
      "paidAt": null,
      "reversedAt": null,
      "createdAt": "2026-08-29T07:57:18.408Z",
      "partner": {
        "displayName": "Phase 5 referral partner journey-20260829075125-d246-210"
      },
      "publisherAgreement": null,
      "referralRule": {
        "programId": "cmte37vkw02typ901si8e7xg0",
        "version": 1
      },
      "settlementLines": []
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 1, "totalPages": 1 }
}
```

#### `POST /api/v1/admin/partner-finance/settlements` — `201`

```json
{
  "allocationIds": ["cmte381jc02vnp901au5ammoa"],
  "paymentReference": "phase5-settlement-journey-20260829075125-d246-220"
}
```

```json
{
  "id": "cmte381uz02vwp9018xy86h5l",
  "partnerUserId": "cmte37vfd02tup901xmoxpqbw",
  "paymentReference": "phase5-settlement-journey-20260829075125-d246-220",
  "currency": "EGP",
  "totalMinor": 1900,
  "createdById": "cmte30l5q01i9p901vbvh342e",
  "paidAt": null,
  "createdAt": "2026-08-29T07:57:18.827Z",
  "lines": [
    {
      "settlementId": "cmte381uz02vwp9018xy86h5l",
      "allocationId": "cmte381jc02vnp901au5ammoa",
      "allocation": {
        "id": "cmte381jc02vnp901au5ammoa",
        "kind": "REFERRAL_COMMISSION",
        "state": "PAYABLE",
        "partnerUserId": "cmte37vfd02tup901xmoxpqbw",
        "basisMinor": 19000,
        "amountMinor": 1900,
        "currency": "EGP"
      }
    }
  ]
}
```

#### `POST /api/v1/admin/partner-finance/settlements/{id}/mark-paid` — `201`

The recorded request had no body:

```http
POST /api/v1/admin/partner-finance/settlements/cmte381uz02vwp9018xy86h5l/mark-paid
```

The response repeats the settlement with:

```json
{
  "paidAt": "2026-08-29T07:57:19.021Z",
  "lines": [
    {
      "allocation": {
        "id": "cmte381jc02vnp901au5ammoa",
        "state": "PAID",
        "paidAt": "2026-08-29T07:57:19.021Z"
      }
    }
  ]
}
```

The report uses a referral test fixture for the settlement operation. The
settlement validation and `PAYABLE` → `PAID` state transition are shared by
publisher-sale allocations; use a selected `PUBLISHER_SALE` allocation in the
publisher payout screen.
