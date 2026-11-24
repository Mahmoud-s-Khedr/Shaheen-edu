# Frontend integration updates — 24 November 2026

This guide consolidates the sales counts, question ordering, payment-method deletion, published-question relocation, and public rewards-settings updates. It also documents the existing AI question import list filters for frontend integration; those filters were verified, rather than newly added in this update.

## 1. Shared conventions and endpoint map

Prefix all routes below with `/api/v1`. Protected routes require `Authorization: Bearer <accessToken>`. Send JSON bodies with `Content-Type: application/json`. The public rewards-settings GET requires no token.

| Feature | Method and route | Access |
| --- | --- | --- |
| Course sales count | `GET /admin/courses`, `GET /admin/courses/:id` | Admin, Super Admin; teachers retain their existing assigned-course read access |
| Chapter sales count | `GET /admin/chapters`, `GET /admin/chapters/:id` | Admin, Super Admin; teachers retain their existing assigned-course read access |
| Bundle sales count | `GET /admin/sales-offers` | Super Admin |
| Oldest-first question list | `GET /admin/questions` | Admin, Super Admin |
| Delete manual payment method | `DELETE /admin/manual-payment-methods/:id` | Super Admin |
| Relocate published question | `PATCH /admin/questions/:id` | Admin, Super Admin |
| Public rewards configuration | `GET /student-rewards/settings` | Public |
| Filter AI question imports | `GET /admin/ai/question-imports` | Admin, Super Admin |

Paginated collections return this envelope:

```ts
interface Page<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

Pagination is one-based. The default page is `1`; the default limit is `20`, with a maximum of `100`. The bundle list is a plain array, not a paginated envelope. Public rewards settings return an object directly.

## 2. Course, chapter, and bundle sales counts

### Response field

Add a required numeric `soldCount` to the course and chapter admin response models. Read `soldCount` from each bundle returned by the admin sales-offer list as well.

Selected fields from a course list response:

```json
{
  "data": [
    { "id": "course-id", "title": "Biology", "soldCount": 12 }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Course and chapter detail responses contain the same field. Selected fields from the bundle list:

```json
[
  { "id": "offer-id", "name": "Revision bundle", "soldCount": 8, "remainingSpots": 22 }
]
```

These are lifetime net purchase counts, not unique-student counts or revenue amounts. There is no new date-range filter for `soldCount`.

### Counting rules

| Event | Effect |
| --- | --- |
| Approved direct course purchase with positive item price | Increases that course's count by one |
| Approved direct chapter purchase with positive item price | Increases that chapter's count by one |
| Approved paid bundle purchase | Increases that bundle's count by one, regardless of the number of contents |
| Course purchase | Does not increase the counts of its chapters |
| Bundle purchase | Does not increase its individual course/chapter counts |
| Purchase fully or partly funded by student credit | Counts when the item price before credit is positive |
| Free grant or purchase with zero item price after discounts | Does not count |
| Pending, submitted, rejected, cancelled, expired, or payment-review order | Does not count |
| Approved item refund | Removes the corresponding direct sale from the count |
| Approved refund of bundle contents | Removes the affected bundle purchase from the bundle count |
| Pending or rejected refund | Does not remove the sale |

The rules apply across manual and XPay purchases. Do not exclude a purchase solely because its channel is `ZERO_TOTAL`: credit-funded purchases can use that channel and still count.

### Frontend behavior

- Display the returned integer, for example **12 sold**. Display `0` when the server returns zero.
- Render the supplied count rather than calculating it from access grants, chapter totals, or payment attempts.
- Refresh affected lists/details after payment approval or refund approval.
- Keep `remainingSpots` as its own field. It reflects bundle capacity allocation and can differ from `purchaseLimit - soldCount`; use the server value.
- These additions apply to the admin endpoints above. Student/public catalog responses have not received a new sales-count field.

## 3. Admin questions now return oldest first

```http
GET /api/v1/admin/questions?page=1&limit=20
GET /api/v1/admin/questions?courseId=course-id&q=biology&page=1&limit=20
```

The question array uses `createdAt ASC`, followed by `id ASC` for questions with the same creation timestamp. This ordering applies to both searched and unsearched results. Search filters the collection without changing the ordering to relevance.

The response remains `Page<Question>`. Archived questions are excluded by default; request `status=ARCHIVED` to list them explicitly. Existing filters remain available: `q`, `status`, `bankId`, `sourceId`, `courseId`, `chapterId`, `lessonId`, `sectionId`, `subjectId`, and `academicGradeId`.

Keep the returned array order. Reset `page` to `1` when filters change. No ordering query parameter was added. Nested options, content blocks, assets, and context links retain their existing `sortOrder ASC` ordering.

This change applies to `/admin/questions`. AI import batches continue to use newest-first ordering, as described below.

## 4. Delete a manual payment method

```http
DELETE /api/v1/admin/manual-payment-methods/payment-method-id
Authorization: Bearer <super-admin-token>
```

No request body is required. Successful response, HTTP 200:

```json
{ "id": "payment-method-id", "deleted": true }
```

| Status | Meaning and frontend handling |
| --- | --- |
| `200` | Deleted. Refresh the admin payment-method list and any cached method selectors. |
| `401` | Authentication required. |
| `403` | The account is not a Super Admin. Hide management actions for other roles. |
| `404` | Method does not exist, including a repeated delete. Refresh the list. |
| `409` | At least one order references the method. Show the server message and offer deactivation. |

Any referencing order prevents deletion, including pending or cancelled orders. The endpoint preserves historical orders and their payment snapshots. A successful deletion records an audit event.

For a referenced method, use the existing update route:

```http
PATCH /api/v1/admin/manual-payment-methods/payment-method-id
Authorization: Bearer <super-admin-token>
Content-Type: application/json

{ "isActive": false }
```

Inactive methods remain visible to administrators but disappear from the student payment-method list and cannot be selected for a new checkout. Refresh both method lists after deactivation.

## 5. Relocate a published question

Use the existing update endpoint. Published questions can now change placement while retaining `PUBLISHED` status and their original publication date.

### Move within the current course

```http
PATCH /api/v1/admin/questions/question-id
Authorization: Bearer <admin-or-super-admin-token>
Content-Type: application/json

{
  "placements": [
    { "chapterId": "destination-chapter-id" }
  ]
}
```

`placements` replaces the entire placement list. To retain multiple placements, send every placement that should remain:

```json
{
  "placements": [
    { "lessonId": "lesson-a-id" },
    { "sectionId": "section-b-id" }
  ]
}
```

Each entry must contain exactly one target: `courseId`, `chapterId`, `lessonId`, or `sectionId`. Supply at least one entry, without duplicate targets. All targets must exist, must not be archived, and must belong to the question's target course.

### Move to another course

```http
PATCH /api/v1/admin/questions/question-id
Authorization: Bearer <admin-or-super-admin-token>
Content-Type: application/json

{
  "courseId": "destination-course-id",
  "bankId": "bank-for-destination-subject-id",
  "placements": [
    { "sectionId": "destination-section-id" }
  ]
}
```

The top-level `courseId` sets the question's course. The nested placement selects its location inside that course. Changing the top-level course requires replacement placements. The bank must belong to the destination course's subject; omit `bankId` if the current bank is already compatible.

When relocating a published question, the destination course and subject, question bank, and question source must all be published. Otherwise the API returns `409` and leaves the question unchanged.

### Response and validation

Successful requests return HTTP 200 with the updated question object, including its replacement placements and scope. A placement-only request preserves its answers, explanations, and other omitted content. Existing assessment question snapshots remain unchanged.

| Condition | Result |
| --- | --- |
| Draft, rejected, or published question | Relocation allowed subject to scope validation |
| Question in review | `409`; relocation is blocked |
| Archived question | `409`; edits are blocked |
| Empty placements, duplicate targets, multiple target fields in one entry | `400` |
| Placement outside the target course | `400` |
| Changed course without replacement placements | `400` |
| Bank subject incompatible with destination course | `400` |
| Missing question/course or missing/archived placement target | `404` |
| Archived destination course | `409` |

Invalid scope requests leave the question unchanged. In the relocation form, clear dependent chapter/lesson/section selections when the course changes. Send only the fields required for the move. After success, replace the detail state with the response and refresh the old and new filtered question lists.

## 6. Public student rewards settings

```http
GET /api/v1/student-rewards/settings
```

No authentication is required. HTTP 200 returns the same `{ version, config }` shape as `GET /admin/student-rewards/settings`:

```ts
type RewardTargetType = 'COURSE' | 'CHAPTER' | 'BUNDLE';

interface PurchaseEligibility {
  targetTypes: RewardTargetType[];
  excludedTargets: string[]; // COURSE:id, CHAPTER:id, or BUNDLE:id
}

interface PurchaseRewardPolicy extends PurchaseEligibility {
  enabled: boolean;
  minimumPaymentMinor: number;
  rewardMinor: number;
  startsAt?: string | null;
  endsAt?: string | null;
}

interface StudentRewardsSettings {
  version: number;
  config: {
    credit: PurchaseEligibility & {
      enabled: boolean;
      maximumUsageBps: number;
      maximumUsageMinor?: number | null;
      expiryDays?: number | null;
    };
    firstPurchase: PurchaseRewardPolicy;
    referral: PurchaseRewardPolicy & {
      invitedRewardMinor: number;
      rewardLimit?: number | null;
      perReferrerLimit?: number | null;
    };
  };
}
```

Money uses integer EGP minor units: `100` means EGP 1. `maximumUsageBps` is a basis-point percentage: `5000` means 50%. HTTP dates are ISO strings.

Before configuration, the endpoint returns version `0` with disabled default policies. Reading does not create a settings record. Subsequent reads reflect saved administrator changes.

Use this endpoint to display program terms before or after login. It does not return personal balances, invite codes, administrator identities, or audit metadata. Use the existing authenticated student routes for personal data.

The settings describe configured terms, not an individual student's guaranteed reward. Checkout validation and approval still determine eligibility. Refresh settings when loading program information; retain the server's configuration version with cached data.

The administrator GET and PUT remain protected. Configuration updates still use `PUT /admin/student-rewards/settings` with a Super Admin token. No public update endpoint was added.

## 7. AI question import list filters

```http
GET /api/v1/admin/ai/question-imports
Authorization: Bearer <admin-or-super-admin-token>
```

These filters already exist in the backend. The endpoint lists top-level import batches only, ordered by `createdAt DESC`, then `id ASC`. Its response is `Page<ImportSummary>`; summaries omit the full raw text, normalized text, and extraction metadata even though text search can match source text.

### Query parameters

| Parameter | Accepted value and behavior |
| --- | --- |
| `page` | Integer, minimum `1`; default `1`. |
| `limit` | Integer `1`–`100`; default `20`. |
| `q` | Trimmed, nonblank text, maximum 120 characters. Case-insensitive literal substring search across batch ID, source asset filename, raw text, and normalized text. |
| `status` | One import status. Cannot be combined with `statuses`. |
| `statuses` | Comma-separated import statuses; matches any listed status. Example: `AWAITING_REVIEW,FAILED`. |
| `courseId` | Exact target course, across all placement depths. |
| `chapterId` | Placement on that chapter or one of its descendant lessons/sections. |
| `lessonId` | Placement on that lesson or one of its descendant sections. |
| `sectionId` | Exact section placement. |
| `bankId` | Exact question-bank ID. |
| `sourceId` | Exact question-source ID. |
| `createdById` | Submitting administrator's user ID. |
| `inputType` | `RAW_TEXT` or `ASSET`. PDF/TXT uploads use `ASSET`, not `PDF` or `TXT`. |
| `createdFrom` | Inclusive lower bound on batch creation time. Calendar ISO timestamp with timezone, such as `2026-11-01T00:00:00Z`. |
| `createdTo` | Exclusive upper bound on batch creation time, in the same timestamp format. |
| `hasErrors` | Literal `true` or `false`. Omit for both. True matches status `FAILED`/`COMPLETED_WITH_ERRORS`, `failedItems > 0`, or `invalidItems > 0`; false matches the inverse. |

Supported statuses:

```text
QUEUED
EXTRACTING
TRANSCRIBING
SEGMENTING
AWAITING_REVIEW
GENERATING
COMPLETED
COMPLETED_WITH_ERRORS
FAILED
```

Subject and academic-grade filters are not supported on this endpoint. Do not send `subjectId` or `academicGradeId` here.

### Combining filters

- Different supplied filters combine with AND; the values within `statuses` combine with OR.
- Combined chapter/lesson/section filters must match the same placement entry. Separate entries cannot satisfy incompatible hierarchy selections.
- A descendant filter does not match a broader ancestor placement. For example, `chapterId` does not match a batch placed only at course level.
- Unknown IDs and incompatible hierarchy combinations return HTTP 200 with an empty collection, rather than a missing-resource error.
- Archived hierarchy records remain searchable. Placement filters work even before any questions have been created.
- Child imports are excluded from the list. Use an import's detail endpoint for its child workflow.
- A page beyond the available results returns empty `data` with the matching total retained in `meta.total`.

### Examples

```http
GET /api/v1/admin/ai/question-imports?courseId=course-id&chapterId=chapter-id&statuses=AWAITING_REVIEW,FAILED&page=1&limit=20
GET /api/v1/admin/ai/question-imports?createdById=admin-id&inputType=ASSET&hasErrors=true
GET /api/v1/admin/ai/question-imports?createdFrom=2026-11-01T00:00:00Z&createdTo=2026-12-01T00:00:00Z
```

The last example covers November using an inclusive start and exclusive next-month boundary in UTC. Convert date-picker boundaries to the intended timezone before sending them. For an inclusive date-picker end date, send the start of the following local day as `createdTo`. A date-only value such as `2026-11-24` is invalid.

Use `URLSearchParams` so timezone offsets containing `+` and other characters are encoded correctly. Omit unset fields and preserve a selected false boolean:

```ts
const query = new URLSearchParams({ page: '1', limit: '20' });
if (courseId) query.set('courseId', courseId);
if (selectedStatuses.length) {
  query.set('statuses', selectedStatuses.join(','));
} // Send either status or statuses, never both.
if (search.trim()) query.set('q', search.trim());
if (hasErrors !== undefined) query.set('hasErrors', String(hasErrors));
if (createdFrom) query.set('createdFrom', createdFrom);
if (createdTo) query.set('createdTo', createdTo);

const response = await fetch(`/api/v1/admin/ai/question-imports?${query}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### Validation and UI behavior

HTTP 400 covers invalid enum values, blank IDs/search text, empty or invalid status lists, simultaneous `status` and `statuses`, invalid booleans such as `1` or `yes`, timestamps without a timezone, and `createdFrom >= createdTo`.

Reset the page to `1` whenever a filter changes. Clear dependent hierarchy filters when their ancestor selection changes. Keep separate loading, empty-result, and error states; an empty result is a valid response. Render the server order and use `meta.total`/`meta.totalPages` for pagination.

These are collection filters for `/admin/ai/question-imports`. They do not apply to `/admin/ai/question-imports/:id/items`, whose existing item-query contract remains separate.

## 8. Frontend acceptance checks

- Course, chapter, and bundle screens display server-provided `soldCount`, including zero. Buying a course does not increase chapter counts; buying a bundle does not increase its component counts.
- Question lists preserve oldest-first order across pages and search results. Import lists preserve newest-first order.
- Only Super Admins see payment-method deletion controls. An unused method deletes successfully; a referenced method shows the conflict and can be deactivated.
- A published question can move to a valid chapter/lesson/section or course while keeping its published state. Invalid moves preserve its prior placement. Multiple desired placements are all sent in the replacement array.
- Public rewards terms load before login and reflect updated configuration. Administrator settings operations still require authentication.
- AI import filters combine correctly, including `hasErrors=false`, multiple statuses, hierarchy selections, and timezone-aware date bounds. Changing filters resets pagination.

## 9. Related references

- [Detailed API reference](api-reference-detailed.md)
- [Compact API reference](api-reference-compact.md)
- [Student credit and rewards frontend integration](student-credit-and-rewards-frontend-integration.md)
- [Student credit and rewards API](student-credit-and-rewards-api.md)
- [Sales offers frontend integration](sales-offers-frontend-integration.md)

Implementation references: [sales-count predicates](../src/common/commerce/sales-count.ts), [question list and update service](../src/modules/question-banks/question-banks.service.ts), [payment-method endpoints](../src/modules/commerce/commerce.controller.ts), [public rewards endpoint](../src/modules/student-rewards/public-student-rewards.controller.ts), [import query DTO](../src/modules/ai-question-import/dto/list-question-imports.dto.ts), and [import filter predicates](../src/modules/ai-question-import/question-import-list.query.ts).
