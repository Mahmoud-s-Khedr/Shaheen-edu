# Sales offers API

All routes use the `/api/v1` prefix and require a bearer token. Prices and weights are integer EGP minor units. A bundle is an offer with one or more courses or chapters; a flash sale is an offer with a limited window and, optionally, a purchase limit. Credit and first-purchase rewards are outside this API.

## Administrator operations

Super administrators can `GET /admin/sales-offers`, `POST /admin/sales-offers`, or `PUT /admin/sales-offers/{id}`. PUT replaces all editable fields. Creation and replacement accept:

```json
{
  "name": "Revision bundle",
  "description": "Two courses",
  "marketingCopy": "Limited places",
  "coverAssetId": null,
  "priceMinor": 150000,
  "startsAt": "2026-11-01T00:00:00.000Z",
  "endsAt": "2026-12-01T00:00:00.000Z",
  "purchaseLimit": 10,
  "items": [
    { "targetType": "COURSE", "targetId": "course-id" },
    { "targetType": "CHAPTER", "targetId": "chapter-id" }
  ]
}
```

Description, marketing copy, cover and purchase limit may be omitted or null. Covers must be ready image assets. Dates must be ordered, the offer price must be non-negative, and any limit must be positive. Included items must meet the same purchase rules as individual courses and chapters; inherited chapters cannot be sold separately. Free courses have a zero allocation weight even if they retain an old price. A paid offer must include an item with a positive individual price. Duplicate items and a course paired with its own chapter are rejected. A limit cannot be reduced below the number of allocated, unreleased purchases. A zero-price offer is approved through the existing zero-total checkout flow.

`POST /admin/sales-offers/{id}/pause`, `/resume`, and `/end` change the lifecycle. Ending is permanent. A student can start checkout only while the offer is active, in its date window, and not sold out; an order started then can be approved after a pause or the end of the window, subject to payment rules and remaining capacity. Checkout and manual proof submission do not reserve capacity.

`GET /admin/sales-offer-payment-reviews` lists paid XPay orders that could not receive an offer spot. Refund these payments externally, then call `POST /admin/sales-offer-payment-reviews/{orderId}/refund` with `{ "reference": "external-refund-reference" }`. The action records the reference and cancels the order; it does not initiate a provider refund.

## Student operations

`GET /student/sales-offers` lists active offers whose content is published and available for the student's grade. `GET /student/sales-offers/{id}` returns an offer's `available`, `purchased`, `remainingSpots` (null means unlimited), and `items`. Each item reports `targetType`, `targetId`, `title`, `weightMinor`, and `owned`; a chapter is owned when the student has current access to the chapter or its course. `GET /student/sales-offers/{id}/cover` returns protected access to its cover image.

Add an offer through `POST /student/cart/items` using `{ "targetType": "BUNDLE", "targetId": "offer-id" }`. It may overlap with individual items or other offers. The full offer price is charged regardless of owned content. Campaigns and coupons never reduce offer prices; a coupon can still apply to eligible individual items in the same cart. Preview and checkout use the existing commerce endpoints and idempotency rules.

Each order's `bundles` contains the purchase ID, offer ID, and a checkout snapshot, including price, included content and individual price weights. Each included content line in `items` carries the corresponding `salesOfferPurchaseId`. The line prices are proportional shares of the bundle price, rounded deterministically to sum to that price. Those shares are the basis for publisher agreements and referral accounting. Later offer edits do not change the snapshot or line shares. Receipt snapshots and commerce/revenue exports also retain offer details.

When requesting a refund, selecting any one included order-item ID automatically selects the whole bundle. Existing eligibility checks apply to all included items. On approval, only entitlements originating from those items are revoked, and partner allocations are reversed. A spot becomes available for resale only if the offer is active and within its window at refund approval; otherwise it remains consumed. A student may repurchase after a spot has been released.
