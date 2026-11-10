# Sales offers frontend integration guide

This guide covers the sales offers update: student offer browsing, bundles in the cart, checkout, order history, refunds, super-admin offer management, payment reviews, and reporting. It describes the current backend implementation. Credit and first-purchase rewards are outside this update.

## 1. API conventions and prerequisites

- Prefix every route below with `/api/v1`.
- Send the existing `Authorization: Bearer <token>` header.
- Student routes require `STUDENT`; administrator routes require `SUPER_ADMIN`.
- Send JSON bodies with `Content-Type: application/json`, except existing multipart asset/proof uploads.
- Prices and allocation weights are integer EGP minor units. `150000` means EGP 1,500. Format money by dividing by 100; keep request amounts as integers.
- Dates are ISO strings over HTTP. Convert local admin date inputs to ISO timestamps and display returned timestamps in the user's timezone.
- The backend deployment must include the sales offers database migration and regenerated Prisma client before the frontend uses these routes.

An offer can contain one or more courses or chapters. A flash sale uses the same offer model with a limited time window and, optionally, a purchase limit.

## 2. Frontend implementation map

| Area | Required change |
| --- | --- |
| Shared types | Add `BUNDLE`, `PAYMENT_REVIEW`, offer models, and bundle fields on cart/orders |
| Student offers | Add catalog/detail views, protected covers, ownership indicators, and availability states |
| Cart | Render bundles with expandable contents and use server totals |
| Checkout | Reuse existing flows; handle lost capacity and paid orders requiring review |
| Orders | Group included lines by bundle purchase and render historical snapshots |
| Refunds | Select/refund complete bundles and preserve backend eligibility handling |
| Admin offers | Add list, full create/edit form, and lifecycle actions |
| Admin payment reviews | List paid orders without offer access and record completed external refunds |
| Reports | Support the new `bundleSnapshots` column where exports are displayed or parsed |

## 3. Shared response types

Extend existing types rather than replacing the application's complete models. Dates below are strings because these are HTTP response types.

```ts
type CommerceTargetType = "COURSE" | "CHAPTER" | "BUNDLE";
type OfferStatus = "ACTIVE" | "PAUSED" | "ENDED";

interface Money {
  amountMinor: number;
  currency: string;
}

interface SalesOfferItem {
  targetType: "COURSE" | "CHAPTER";
  targetId: string;
  courseId: string;
  title: string;
  weightMinor: number;
  owned: boolean;
}

interface StudentSalesOffer {
  id: string;
  name: string;
  description: string | null;
  marketingCopy: string | null;
  coverAssetId: string | null;
  priceMinor: number;
  currency: "EGP";
  startsAt: string;
  endsAt: string;
  status: OfferStatus;
  purchaseLimit: number | null;
  remainingSpots: number | null;
  purchased: boolean;
  available: boolean;
  items: SalesOfferItem[];
}

interface OrderBundle {
  id: string; // Bundle purchase ID, distinct from the offer ID.
  offerId: string;
  snapshot: StudentSalesOffer;
  allocatedAt: string | null;
  releasedAt: string | null;
}
```

Add the following fields to existing models:

```ts
// CartItem:
// targetType: CommerceTargetType
// bundle?: StudentSalesOffer

// OrderItem:
// salesOfferPurchaseId?: string | null

// Order:
// bundles: OrderBundle[]
// paymentAttentionReason?: string | null

// Add "PAYMENT_REVIEW" to the existing OrderStatus union.
```

The snapshot contains checkout-time values. Fields such as ownership, availability, and remaining spots inside it are historical context, not current state. `weightMinor` is an individual content price used for allocation, not the amount charged for that included item.

## 4. Student catalog and offer detail

| Method | Route | Response |
| --- | --- | --- |
| GET | `/student/sales-offers` | `{ data: StudentSalesOffer[] }` |
| GET | `/student/sales-offers/:id` | `StudentSalesOffer` |
| GET | `/student/sales-offers/:id/cover` | `{ url: string, expiresAt: string }` |

The catalog contains `ACTIVE` offers whose included content is published, purchasable, and available for the student's academic grade. It can include scheduled, expired, sold-out, or already-purchased offers with `available: false`; it is not restricted to offers that can currently be bought. A missing academic grade can produce a conflict response.

Display name, marketing text, price, contents, dates, remaining spots, and ownership indicators. Use `available` from the server to enable the purchase button. Treat `remainingSpots === null` as unlimited and `remainingSpots === 0` as sold out.

Suggested labels, depending on the returned fields:

- `purchased`: "Already purchased".
- `status === "PAUSED"`: "Paused".
- `status === "ENDED"` or past `endsAt`: "Ended".
- Future `startsAt`: "Starts soon".
- Zero remaining spots: "Sold out".

Client date checks help explain a disabled button; the backend remains authoritative. Refresh availability when entering a detail view or returning from payment.

Mark `items[].owned` as "Already owned". Chapter ownership includes current access through its course. The full offer price still applies when some included content is owned; do not subtract those items or recalculate the offer price.

For covers, request protected access only when `coverAssetId` exists, then render the returned URL. Refresh expired access URLs and show a placeholder for missing/unavailable covers. An asset ID is not an image URL.

## 5. Cart integration

Use the existing cart endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/student/cart` | Fetch the authoritative cart and totals |
| POST | `/student/cart/items` | Add an offer or standalone item |
| DELETE | `/student/cart/items/:id` | Remove a cart item by its cart-item ID |

Add a bundle with:

```json
{
  "targetType": "BUNDLE",
  "targetId": "offer-id"
}
```

The returned cart item uses `targetId` for the offer ID and `bundle` for its contents and availability information. Render one cart row per bundle with an optional expandable content list. Do not turn the included items into separate cart purchases.

The cart can contain a bundle alongside individual items or other bundles with overlapping content. The backend allows this; show a notice if useful and do not silently remove purchases. Adding the same offer twice returns a conflict.

`GET /student/cart` returns `data` plus `subtotal`, `discount`, and `total` money objects. Unavailable offers and other stale targets can be removed by the backend during cart resolution. Refetch after additions, removals, and availability conflicts; replace cached cart state with the result.

## 6. Price previews, coupons, and referral codes

Call `POST /student/price-preview` with the desired targets:

```json
{
  "targets": [
    { "targetType": "BUNDLE", "targetId": "offer-id" },
    { "targetType": "COURSE", "targetId": "course-id" }
  ],
  "couponCode": "SAVE10",
  "referralCode": "PARTNER10"
}
```

Both codes are optional; omit unused fields. The preview response contains `items`, `subtotalMinor`, `discountMinor`, `totalMinor`, coupon information, and referral information. These totals are numeric minor-unit fields, unlike the cart/order money objects.

- Campaigns and coupons never discount `BUNDLE` targets.
- A coupon may still apply to eligible standalone items in a mixed cart.
- Fixed coupons are calculated once on the eligible subtotal and distributed across eligible items. Remove any frontend logic that subtracts a fixed coupon from every item.
- Render the returned per-item and overall discounts; the backend also handles campaign/coupon selection and rounding.
- A coupon that does not improve the current price returns a validation error. Display the error near the code input.
- Referral codes use the existing feature/eligibility checks. Do not infer a student discount from a referral commission.

Preview does not reserve capacity or freeze pricing. Checkout validates again.

## 7. Checkout and payments

Continue using `POST /student/checkout` with the existing `idempotency-key` header. Example for XPay:

```json
{
  "paymentChannel": "XPAY"
}
```

For manual payment, send `paymentChannel: "MANUAL"` and the existing `manualPaymentMethodId`. Include optional coupon/referral codes when applicable. Checkout uses the current server cart, so the request does not need a second list of bundle contents.

Create a key for a new checkout operation and preserve it when retrying that operation after a timeout. Disable duplicate submissions while a request is pending.

| Backend result | Frontend action |
| --- | --- |
| `APPROVED`, channel `ZERO_TOTAL` | Show success immediately and refresh entitlements/library |
| Manual payment order | Continue existing instructions and proof-upload flow |
| XPay order with `xpay.checkoutUrl` | Redirect to the hosted checkout |
| `PAYMENT_REVIEW` with `OFFER_UNAVAILABLE_AFTER_PAYMENT` | Explain that payment was received but access could not be granted; show review/refund status |
| Availability conflict | Refetch offer/cart, explain the change, and let the student review the updated purchase |

Zero-total approval is selected by the backend. The request's channel must still be one of the supported requested channels (`MANUAL` or `XPAY`); do not send `ZERO_TOTAL` as a requested channel.

### XPay retries and return handling

The first XPay checkout response can include an extra `xpay` object:

```ts
interface XPayAttempt {
  id: string;
  status: string;
  checkoutUrl: string | null;
  expiresAt: string | null;
}
```

An idempotent checkout replay can return the existing order without `xpay`. Do not assume the nested field is always present. For an eligible unpaid XPay order, use the existing `POST /student/orders/:id/xpay/attempt` endpoint with its own `idempotency-key` when a payment attempt is needed. Preserve that attempt key when retrying the same attempt request; use a new key for a deliberately new attempt.

After the provider redirects back, read authoritative state using either:

- `GET /student/orders/:id`
- `GET /student/xpay/checkout-sessions/:checkoutSessionId/order`

Do not show successful access based solely on the redirect URL. If payment confirmation is still pending, refetch with a bounded polling strategy and provide a refresh action.

### Capacity behavior

Adding an offer, creating an order, or submitting manual proof does not reserve a spot. Capacity is allocated when the backend approves/fulfils the order. Two students can start checkout for the final spot; only one can receive it.

An order started while the offer was available can be approved after the offer is paused or its time window ends, subject to payment rules and remaining capacity. Do not disable an existing valid order solely because the current offer window ended.

If an XPay payment succeeds after capacity is exhausted or the student already has an allocated purchase, the order can enter `PAYMENT_REVIEW`. Show, for example:

> Your payment was received, but the offer became unavailable. An administrator will arrange a refund.

Hide pay-again actions in this state. This is separate from normal manual payment proof review. Refresh the order and purchased content after a successful approval.

## 8. Order history and receipts

Existing order listing/detail endpoints now return:

- `bundles[]`: bundle purchase ID, offer ID, checkout snapshot, allocation date, and release date.
- `items[].salesOfferPurchaseId`: link from an included content line to a bundle purchase.
- `paymentAttentionReason`: context for payment review states.

Group included order lines by the purchase ID:

```ts
const groups = order.bundles.map((bundle) => ({
  bundle,
  items: order.items.filter(
    (item) => item.salesOfferPurchaseId === bundle.id,
  ),
}));

const standaloneItems = order.items.filter(
  (item) => !item.salesOfferPurchaseId,
);
```

Use snapshot names and contents for historical purchases. Fetching the live offer to render an old order can show edited terms or fail if content availability changed.

Included lines contain proportional shares of the bundle price; those line amounts already contribute to the order total. Display the bundle total with its included lines, but do not add the snapshot price again. Use `order.total` for the amount payable.

Receipts retain bundle snapshots. Publisher allocations use the included line shares, while referral commission is calculated once per bundle and distributed across its lines. No frontend allocation calculation is required.

## 9. Student and admin refunds

Submit through the existing student endpoint:

```http
POST /api/v1/student/orders/:orderId/refund-requests
Content-Type: application/json
```

```json
{
  "orderItemIds": ["included-line-1", "included-line-2"],
  "reason": "I would like to request a refund for this bundle."
}
```

Use order-item IDs, not content IDs, offer IDs, or bundle purchase IDs. Omitting `orderItemIds` requests all order items; an empty array is invalid. The reason must be 3–2,000 characters.

Present each bundle as one selectable refund group. Selecting any one included line makes the backend include every line in that bundle. Explain this before submission and show the full selected amount. Existing eligibility checks apply to every included item; handle backend rejection rather than assuming all bundles are refundable.

Normal administrator refund operations remain:

| Method | Route | Body |
| --- | --- | --- |
| GET | `/admin/refunds` | Existing query filters |
| POST | `/admin/refunds/:id/approve` | `{ "manualRefundReference": "transfer-ref", "reviewNote": "optional note" }` |
| POST | `/admin/refunds/:id/reject` | `{ "rejectionReason": "reason", "reviewNote": "optional note" }` |

Approval records a completed manual reimbursement, revokes entitlements originating from the refunded order items, and reverses partner allocations. Access from other purchases is preserved. Refetch the student's library after approval.

A spot is released for resale only if the offer is `ACTIVE` and within its date window at refund approval. Otherwise it remains consumed. The student can repurchase after their spot is released; use freshly returned availability and purchase state.

## 10. Super-admin offer management

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/admin/sales-offers` | Return an array of offers, including items, `soldCount`, and `remainingSpots` |
| POST | `/admin/sales-offers` | Create an offer |
| PUT | `/admin/sales-offers/:id` | Replace all editable details |
| POST | `/admin/sales-offers/:id/pause` | Pause new purchases |
| POST | `/admin/sales-offers/:id/resume` | Resume an offer |
| POST | `/admin/sales-offers/:id/end` | Permanently end an offer |

The admin list is a bare array, unlike the student's `{ data: [...] }` list. There is no separate admin detail GET in this controller; populate the editor from the list result. Admin item records identify included targets but do not include the student-facing item titles; resolve labels using existing content data/selectors.

Create and update use the same complete payload:

```json
{
  "name": "Revision bundle",
  "description": "Two courses for revision",
  "marketingCopy": "Limited places",
  "coverAssetId": null,
  "priceMinor": 150000,
  "startsAt": "2026-11-15T00:00:00.000Z",
  "endsAt": "2026-12-01T00:00:00.000Z",
  "purchaseLimit": 10,
  "items": [
    { "targetType": "COURSE", "targetId": "course-id" },
    { "targetType": "CHAPTER", "targetId": "chapter-id" }
  ]
}
```

`PUT` is replacement, not a partial patch. Send all editable fields and the complete item selection. Optional description, marketing copy, cover, and purchase limit can be null; omission clears these optional values during replacement. Status changes use the lifecycle endpoints rather than this payload.

Mirror these validation rules in the form, while displaying authoritative backend errors:

- Name: 1–160 characters; description and marketing copy: at most 5,000 each.
- Non-negative integer `priceMinor`, up to 2,147,483,647; zero-price offers are allowed.
- End strictly after start.
- Purchase limit: null for unlimited, otherwise a positive integer up to 2,147,483,647, and never lower than allocated, unreleased purchases.
- At least one course/chapter; no duplicate target and no course together with its own chapter.
- Included content must be purchasable. Inherited chapters cannot be sold separately.
- A paid offer must contain at least one item with a positive individual price. Free courses have zero allocation weight.
- Covers must be ready `IMAGE` or `COVER_IMAGE` assets from the existing upload flow.

Show sold/remaining counts, disable edit/resume actions for ended offers, and make permanent ending clear. Creating an offer sets status to `ACTIVE`, but its dates still control purchase availability.

Asset archiving now rejects assets referenced by offer covers. When replacing a cover, save the offer's new reference before trying to archive an old asset; the old asset can still be used elsewhere, so handle conflicts.

## 11. Super-admin paid-offer review queue

This queue handles XPay payments for which offer access could not be granted. It is separate from normal refund requests for approved content.

```http
GET /api/v1/admin/sales-offer-payment-reviews
```

The response is `{ data: [...] }`, ordered newest first. Entries are raw order records with `paymentAttempts`, `salesOfferPurchases`, and `items`. Use a separate response model: monetary fields are `subtotalMinor`, `discountMinor`, `totalMinor`, and `currency`, not the student DTO's nested money objects. Raw item titles are `titleSnapshot`; bundle records use `salesOfferId` and `snapshot`.

Show order/student identifiers, paid attempt details, totals, the reason, and offer snapshots. After the administrator completes reimbursement externally, submit:

```http
POST /api/v1/admin/sales-offer-payment-reviews/:orderId/refund
Content-Type: application/json
```

```json
{
  "reference": "provider-or-bank-refund-reference"
}
```

The trimmed reference must be non-empty and no longer than 200 characters. The response contains `id`, `status: "CANCELLED"`, and `externalRefundReference`.

Label the action **Record external refund**. This endpoint records an already completed refund and cancels the order; it does not call the provider to transfer money. On success, refetch the queue. On conflict, refresh it because another administrator may already have resolved the order.

## 12. Errors and cache refresh

Use the application's existing API error handling/localization. Do not build behavior around exact English error messages.

| Status | Typical integration handling |
| --- | --- |
| 400 | Show field/code validation feedback; retain the form/cart |
| 401 | Use the existing authentication recovery flow |
| 403 | Apply existing role/eligibility handling |
| 404 | Show missing/unavailable content or a cover placeholder |
| 409 | Refresh relevant state and explain an availability, duplicate, lifecycle, or already-processed conflict |

Recommended invalidation:

| Mutation/event | Refresh |
| --- | --- |
| Cart add/remove | Cart and active preview |
| Checkout | Cart, orders, offer detail/catalog |
| Order becomes approved | Order, library/entitlements, offer detail/catalog |
| Payment review resolved | Admin queue and affected order |
| Refund approved | Refund lists, affected order, library/entitlements, offers |
| Admin offer edit/status change | Admin offers and affected student offer/cart caches where available |

Partition student-specific caches by authenticated user. Ownership and availability must not be shared across accounts. Availability remains advisory until approval; even a recently refreshed screen can lose the final spot.

## 13. Reporting and rollout

Commerce and platform revenue exports add a `bundleSnapshots` column. Its value is a JSON string containing an array of offer snapshots with offer ID, name, price, currency, and included content weights. Standalone-only orders produce an empty array. Update custom export parsers or column selectors that assume a fixed set of fields.

Backend financial reconciliation accounts for one referral commission per bundle and distributes it across included lines. Frontend financial views should display server allocations rather than independently calculating them.

Recommended implementation order:

1. Deploy the backend migration and API; extend shared frontend models/status handling.
2. Add student catalog/detail and bundle cart rendering.
3. Integrate preview, checkout, payment review states, and historical order grouping.
4. Add bundle refund selection and admin offer management.
5. Add the external refund recording queue and update report consumers.

## 14. Integration verification checklist

- [ ] Student catalog respects academic grade and shows unavailable states correctly.
- [ ] Protected covers load and recover from expiration/missing covers.
- [ ] Owned contents remain visible without reducing the bundle price.
- [ ] Mixed carts and overlapping bundles render without losing selected purchases.
- [ ] Stale offers disappear when the server resolves the cart.
- [ ] Coupons affect eligible standalone lines and never discount bundles.
- [ ] Preview and checkout use server totals without double-counting included lines.
- [ ] Zero-price offers approve immediately and unlock their contents.
- [ ] Manual payment proof flow works with bundle orders and handles approval conflicts.
- [ ] XPay return handling waits for backend confirmation and supports checkout replay without `xpay`.
- [ ] Two students competing for the final spot get correct access/review outcomes.
- [ ] `PAYMENT_REVIEW` shows the paid-but-unavailable message and hides pay-again actions.
- [ ] Order history remains correct after an administrator edits the live offer.
- [ ] Selecting a bundle refund selects all included lines and preserves unrelated access.
- [ ] Refund approval only restores capacity when the offer is active and in its window.
- [ ] Admin PUT sends complete details and ending an offer prevents editing/resuming.
- [ ] External refund recording cancels the reviewed order and removes it from the queue.
- [ ] Existing standalone purchases, payment flows, and refund flows still work.
- [ ] Report consumers accept `bundleSnapshots`.

## 15. Backend references

- [Sales offers API overview](sales-offers-api.md)
- [Offer routes](../src/modules/commerce/sales-offers.controller.ts)
- [Offer request/response DTOs](../src/modules/commerce/dto/sales-offer.dto.ts)
- [Offer validation and student availability](../src/modules/commerce/sales-offers.service.ts)
- [Commerce routes](../src/modules/commerce/commerce.controller.ts)
- [Commerce DTOs](../src/modules/commerce/dto/commerce.dto.ts)
- [Cart, checkout, orders, and payment review implementation](../src/modules/commerce/commerce.service.ts)
- [Pricing implementation](../src/modules/commerce/pricing.service.ts)
- [Fulfilment and capacity allocation](../src/modules/commerce/fulfilment.service.ts)
- [Refund routes](../src/modules/commerce/refunds.controller.ts)
- [Refund DTOs](../src/modules/commerce/dto/refunds.dto.ts)
- [Refund implementation](../src/modules/commerce/refunds.service.ts)
- [Revenue and referral allocation helpers](../src/modules/commerce/bundle-allocation.ts)
- [Database schema](../prisma/schema.prisma)
