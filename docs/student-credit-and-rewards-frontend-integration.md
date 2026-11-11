# Student credit and rewards frontend integration guide

This guide describes how to integrate the current student credit, first-purchase rewards, student referrals, and bundle reward backend into the student and super-admin interfaces. Use it alongside the [sales offers frontend guide](sales-offers-frontend-integration.md) and [credit and rewards API guide](student-credit-and-rewards-api.md).

## 1. API conventions and scope

- Prefix every route below with `/api/v1`.
- Send `Authorization: Bearer <token>` and JSON request bodies with `Content-Type: application/json`.
- Student endpoints require `STUDENT`. Administrator endpoints require `SUPER_ADMIN`.
- Money uses integer EGP minor units: `100` means EGP 1. Convert display inputs to integers before submitting.
- Dates are ISO timestamps over HTTP. Display them in the user's timezone.
- Paginated endpoints accept `page` (default 1) and `limit` (default 20, maximum 100).
- Credit spending, first-purchase rewards, and referrals default to disabled. Bundle rewards default to zero.

This update adds backend functionality; it does not provide frontend screens, family groups or discounts, credit transfers, or cash withdrawal. Registration has no student referral-code field. Referral attribution happens during checkout.

## 2. Implementation map

| Area | Integration work |
| --- | --- |
| Shared API types | Add credit balances, history, referral types, and payment splits |
| Student account | Show available/reserved credit, expiry, debt, and transaction history |
| Checkout | Add optional credit amount and student referral code; render server preview |
| Payment return and order history | Show external payment and credit separately; support the new review reason |
| Student referrals | Show the personal code and privacy-limited referral statuses |
| Admin settings | Edit the full credit, first-purchase, and referral configuration |
| Admin student details | Read balances/history and submit audited credit adjustments |
| Admin referral review | Review suspended attribution and activate/suspend invite codes |
| Offer editor | Preserve and edit bundle reward and first-purchase eligibility fields |
| Refunds and reports | Separate cash reimbursement from returned credit |

## 3. Shared response types

Extend existing application models with these fields. These are HTTP types, so dates are strings.

```ts
interface Money {
  amountMinor: number;
  currency: string;
}

interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface StudentCreditBalance {
  currency: "EGP";
  availableMinor: number;
  reservedMinor: number;
  debtMinor: number;
  expiring: Array<{ amountMinor: number; expiresAt: string }>;
}

interface StudentCreditEntry {
  id: string;
  studentUserId: string;
  key: string;
  type:
    | "GRANTED" | "RESERVED" | "SPENT" | "RETURNED"
    | "RELEASED" | "EXPIRED" | "ADJUSTED" | "REVERSED";
  amountMinor: number;
  availableDeltaMinor: number;
  reason: string;
  actorUserId: string | null;
  orderId: string | null;
  createdAt: string;
}

interface InviteCode {
  code: string;
  isActive: boolean;
}

interface StudentReferralSummary {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
}

interface AdminStudentReferral extends StudentReferralSummary {
  invitedStudentId: string;
  referrerStudentId: string;
  codeOwnerId: string;
  reviewReason: string | null;
  reviewNote: string | null;
  reviewedById: string | null;
}

// Add to the existing preview response. Existing items/coupon/referral remain.
interface CreditPreviewFields {
  totalMinor: number; // Discounted price BEFORE credit.
  maximumCreditMinor: number;
  creditAppliedMinor: number;
  paymentDueMinor: number; // External payment AFTER credit.
  studentReferral: { code: string; status: "ACTIVE" | "SUSPENDED" } | null;
}

// Add to existing order and item models.
interface OrderCreditFields {
  total: Money; // External payment AFTER credit.
  creditApplied: Money;
  priceAfterDiscount: Money; // Discounted price BEFORE credit.
}

interface OrderItemCreditFields {
  price: Money; // Discounted line price BEFORE credit.
  creditApplied: Money;
  externalPayment: Money;
}
```

The balance endpoint is authoritative. Do not reconstruct available credit by summing `amountMinor` from history: reservations already reduce availability, `SPENT` has zero available delta, and grants/returns can repay debt. `availableDeltaMinor` describes the movement in spendable credit.

## 4. Student credit screens

| Method | Route | Response |
| --- | --- | --- |
| GET | `/student/credit` | `StudentCreditBalance` |
| GET | `/student/credit/transactions?page=1&limit=20` | `Page<StudentCreditEntry>` |

Show available and reserved credit separately. Reserved credit belongs to an existing order and cannot fund a second checkout. Show debt separately from available credit; spending is blocked while debt remains. New grants and returns pay debt first.

Display upcoming expiries from `expiring[]`. Entries represent lots and may share an expiry timestamp; the UI may group matching timestamps for presentation.

History should distinguish an operation's amount from its available balance effect. For example, reserving EGP 50 reduces availability by EGP 50, while later spending that reservation changes availability by zero. A release may have separate returned/expired entries, so do not treat the `RELEASED` amount as an additional balance increase.

## 5. Checkout preview and credit selection

Call `POST /student/price-preview` with the current targets and optional codes/credit:

```json
{
  "targets": [
    { "targetType": "COURSE", "targetId": "course-id" },
    { "targetType": "BUNDLE", "targetId": "offer-id" }
  ],
  "couponCode": "SAVE10",
  "studentReferralCode": "STU...",
  "creditAmountMinor": 20000
}
```

Omit unused codes. The existing `referralCode` is a partner code; `studentReferralCode` is a student code. Do not submit both.

Suggested interaction:

1. Request a preview with `creditAmountMinor: 0` to obtain the current `maximumCreditMinor`.
2. Let the student enter an amount or choose “Use maximum credit”. Default to zero.
3. Request a new preview for the selected amount. Debounce edits and discard stale responses.
4. Display the returned discount, credit, and `paymentDueMinor`.
5. Re-preview after cart, coupon, code, or credit changes.

The server caps credit by the available balance, eligible discounted subtotal, percentage limit, and absolute limit. Debt makes the maximum zero. Requests over the maximum return 409; the backend does not silently reduce them. Preview does not reserve credit, and checkout can still fail if the balance changes.

Use server allocations and totals. Exclusions can differ between credit and reward policies. For bundles, eligibility applies to the bundle target, not its individual contents.

### Amounts to display

| Field | Meaning |
| --- | --- |
| Preview `totalMinor` | Discounted price before credit |
| Preview `creditAppliedMinor` | Requested credit accepted by the server |
| Preview `paymentDueMinor` | External payment after credit |
| Order `priceAfterDiscount.amountMinor` | Discounted price before credit |
| Order `creditApplied.amountMinor` | Credit funding the order |
| Order `total.amountMinor` | External payment after credit |
| Item `price.amountMinor` | Discounted item price before credit |
| Item `externalPayment.amountMinor` | Item price less its allocated credit |

For an EGP 1,000 purchase with EGP 100 discount and EGP 200 credit, show EGP 900 price after discount, EGP 200 credit, and EGP 700 payment due. Preview `totalMinor` is `90000`, while order `total.amountMinor` is `70000`. Do not subtract credit again from order `total`.

The cart response remains the existing pricing view. Use price preview for the selected credit payment split.

## 6. Submit checkout and handle payment

Checkout uses the server cart. Send the same selected codes and credit amount used for the latest preview:

```http
POST /api/v1/student/checkout
Authorization: Bearer <token>
Content-Type: application/json
idempotency-key: <key-for-this-checkout-operation>
```

```json
{
  "paymentChannel": "MANUAL",
  "manualPaymentMethodId": "method-id",
  "creditAmountMinor": 20000,
  "studentReferralCode": "STU..."
}
```

For XPay, use `paymentChannel: "XPAY"` and omit the manual method. Preserve the idempotency key and original payload when retrying a request after a timeout. Use a new key for a deliberately new checkout operation. Disable duplicate submissions while checkout is pending.

| Result/event | Frontend behavior |
| --- | --- |
| Checkout succeeds | Refresh cart, balance, history, and orders; credit is reserved |
| Manual payment required | Continue existing instructions and proof flow for order `total` |
| Manual proof rejected | Allow existing retry actions; credit stays reserved |
| Manual proof awaiting review | Keep reserved credit visible; do not imply it is available |
| XPay checkout URL returned | Redirect using the existing hosted checkout flow |
| `APPROVED` with `ZERO_TOTAL` | Show success and refresh access; no external payment is due |
| Cancellation or unpaid-order expiry | Refresh order and wallet; credit may return or expire |
| 409 balance/cap conflict | Refresh balance and preview, then let the student review the amount |

The requested channel remains `MANUAL` or `XPAY`. An order fully funded with credit uses the backend-selected `ZERO_TOTAL` flow; do not send that channel yourself.

An idempotent checkout replay can omit `xpay`. Preserve the existing XPay attempt recovery flow described in the sales offers guide. After redirect, fetch `GET /student/orders/:id` or `GET /student/xpay/checkout-sessions/:checkoutSessionId/order`; a provider redirect alone does not prove approval.

### Late paid orders requiring review

Support both `paymentAttentionReason` values on `PAYMENT_REVIEW` orders:

| Reason | Suggested explanation |
| --- | --- |
| `CREDIT_UNAVAILABLE_AFTER_PAYMENT` | Payment was received after the order's credit reservation became unavailable. An administrator must review the payment. |
| `OFFER_UNAVAILABLE_AFTER_PAYMENT` | Payment was received, but the offer could not be fulfilled. An administrator must review the payment. |

Hide pay-again actions in this state. These orders grant no access or rewards. The backend releases outstanding reserved credit.

## 7. Student referrals and reward messaging

| Method | Route | Response |
| --- | --- | --- |
| GET | `/student/referrals/code` | `InviteCode`; inactive program returns a conflict |
| GET | `/student/referrals?page=1&limit=20` | `Page<StudentReferralSummary>` |

Show the code with a copy action and its active status. A frontend invite link may prefill the checkout code input, but the backend does not define a signup attribution flow or return an invite URL. Never include a referral field in registration requests.

Preview validates a code without saving attribution. Successful checkout assigns the referrer, and a failed checkout rolls back that assignment. Attribution survives cancellation; a different student referrer cannot replace it. The backend normalizes entered codes by trimming and uppercasing them.

Self-referrals are rejected. Matching parent phone numbers suspend attribution for administrator review while allowing purchase. Label `SUSPENDED` as requiring review rather than asserting fraud. Referral summary endpoints do not expose invited student identity or purchase details; do not build a screen that expects those fields.

An existing active student attribution can also conflict with a supplied partner referral code. Handle the server conflict even when the student has not typed a student code for the current order.

### What can be promised before approval

The current preview returns credit usage and referral attribution, not a guaranteed reward amount or eligibility breakdown. There is no student-facing general rewards-settings endpoint. Avoid calculating or promising a first-purchase/referral award from cart totals alone.

Rules relevant to UI copy:

- Rewards are issued after approval and cannot fund the purchase earning them.
- First-purchase and referral minimums use external payment on eligible items after discounts and credit.
- Free and fully credit-funded orders do not qualify for those two programs.
- Earlier nonqualifying purchases do not consume eligibility; earlier qualifying approved purchases are considered even if they predate code entry or program launch.
- First-purchase, referral, invited-student, and bundle rewards may stack.
- Checkout-time terms are preserved, but referral suspensions, account eligibility, limits, and once-only claims are rechecked on approval.
- Reversing an award does not reset its lifetime claim or referral limit consumption.

Refresh wallet/history after approval and show the actual grant. Referral `ACTIVE` means attribution is active, not that a reward has been paid.

## 8. Super-admin rewards settings

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/admin/student-rewards/settings` | Read `{ version, config }` |
| PUT | `/admin/student-rewards/settings` | Replace the complete configuration |

Load the settings before editing. PUT requires all three sections. Example values below are illustrative, not backend defaults:

```json
{
  "credit": {
    "enabled": true,
    "maximumUsageBps": 5000,
    "maximumUsageMinor": 50000,
    "expiryDays": 180,
    "targetTypes": ["COURSE", "CHAPTER", "BUNDLE"],
    "excludedTargets": []
  },
  "firstPurchase": {
    "enabled": true,
    "minimumPaymentMinor": 20000,
    "rewardMinor": 2000,
    "startsAt": null,
    "endsAt": null,
    "targetTypes": ["COURSE", "CHAPTER", "BUNDLE"],
    "excludedTargets": []
  },
  "referral": {
    "enabled": true,
    "minimumPaymentMinor": 20000,
    "rewardMinor": 3000,
    "invitedRewardMinor": 1000,
    "startsAt": null,
    "endsAt": null,
    "rewardLimit": null,
    "perReferrerLimit": null,
    "targetTypes": ["COURSE", "CHAPTER", "BUNDLE"],
    "excludedTargets": []
  }
}
```

Form rules:

- `maximumUsageBps`: integer 0–10000. Convert a percentage input by multiplying by 100.
- `maximumUsageMinor`: null for no absolute cap, otherwise integer 0–2147483647.
- `expiryDays`: null for no expiry, otherwise integer 1–3650. Applies to newly earned rewards; manual grants specify their own expiry.
- `minimumPaymentMinor`: integer 1–2147483647, including while a program is disabled.
- Reward amounts: integers 0–2147483647. An enabled program requires a positive reward on at least one applicable side.
- Program end must be strictly later than start when both are supplied. Send ISO timestamps or null.
- Referral limits: null for unlimited, otherwise positive integers up to 2147483647. They count lifetime referrer claims, including reversed claims, and are not reset by settings edits.
- `targetTypes`: unique values from `COURSE`, `CHAPTER`, `BUNDLE`.
- `excludedTargets`: unique `COURSE:id`, `CHAPTER:id`, or `BUNDLE:id` strings, up to 1000 entries and 200 characters per entry.

Refetch settings after save. Changing settings does not recalculate pending orders' snapshotted terms. There is no expected-version field for conditional updates, so do not present the displayed version as protection against another administrator overwriting changes.

## 9. Super-admin student wallet and referral review

### Credit operations

| Method | Route | Response |
| --- | --- | --- |
| GET | `/admin/students/:id/credit` | `StudentCreditBalance` |
| GET | `/admin/students/:id/credit/transactions` | `Page<StudentCreditEntry>` |
| POST | `/admin/students/:id/credit/adjustments` | Updated `StudentCreditBalance` |

Example adjustment:

```json
{
  "key": "support-case-123",
  "amountMinor": 5000,
  "reason": "Approved goodwill credit",
  "expiresAt": "2027-05-01T00:00:00.000Z"
}
```

The amount is signed and nonzero, bounded by -2147483647 and 2147483647. The operation key is 1–100 characters, and the reason is 3–1000 characters. A supplied expiry must be in the future for a new operation. Use null/omission for no grant expiry.

Keep the same key, amount, reason, and expiry for retries. Reusing a key with different details returns 409. Keys are scoped to the student. Negative adjustments consume available credit and then create debt if needed; expiry has no useful meaning for deductions, so omit it in that flow. Show the resulting balance and debt from the response and refresh history.

### Referral operations

| Method | Route | Payload/result |
| --- | --- | --- |
| GET | `/admin/student-referrals` | `Page<AdminStudentReferral>` |
| POST | `/admin/student-referrals/:id/review` | `{ "status": "ACTIVE", "note": "Reviewed account details" }` |
| PUT | `/admin/students/:id/referral-code/status` | `{ "isActive": false, "reason": "Suspended after review" }` |

Review accepts `ACTIVE` or `SUSPENDED`; notes and status-change reasons must be 3–1000 characters. The code-status response includes `studentUserId`, `code`, and `isActive`. It changes an existing code; it does not create one for a student who has never requested a code.

Show `SHARED_PARENT_PHONE` as a review flag. Refresh lists after mutations. Review/status changes affect approval checks, but do not themselves issue rewards or reverse previously granted rewards.

## 10. Offer editor and student offer cards

Extend existing create/replace offer payloads and response models with:

```ts
interface OfferRewardFields {
  creditRewardMinor: number;
  firstPurchaseEligible: boolean;
}
```

Expose “Credit earned after approval” and “Eligible for first-purchase reward” in the administrator form. `creditRewardMinor` is an integer 0–2147483647. Zero disables that offer's reward. `firstPurchaseEligible` defaults to false, so bundles require an explicit opt-in in addition to the general policy's eligibility.

Offer PUT is a complete replacement. Include both fields when saving any edit; omission resets them to zero/false. Preserve existing offer fields and item selection.

Student cards may display the configured bundle reward returned by the offer API. Keep it separate from the price and payable credit; it is earned after approval. Bundle rewards may apply to zero-price offers and are independent of the first-purchase/referral minimum external payment requirement. Existing orders retain their checkout snapshot if the live offer is edited.

## 11. Refunds, receipts, payment reviews, and reports

### Refund requests for approved orders

Continue using the existing refund routes:

- `POST /student/orders/:orderId/refund-requests`
- `GET /student/refund-requests`
- `GET /admin/refunds`
- `POST /admin/refunds/:id/approve`

Request body remains `{ "orderItemIds": ["item-id"], "reason": "Refund reason" }`. Omitting item IDs requests all items. Selecting a bundled item includes the complete bundle under existing rules.

Refund items now separate:

| Field | Meaning |
| --- | --- |
| `amountMinor` | External cash reimbursement |
| `creditReturnMinor` | Credit restored to the wallet |

For an EGP 900 item funded with EGP 200 credit, show EGP 700 cash reimbursement and EGP 200 credit restoration. Avoid displaying EGP 900 as a cash refund. Approval still requires `manualRefundReference`, even when cash reimbursement is zero; use it for administrative traceability. Approval records a manual reimbursement rather than initiating a provider transfer.

Refunded dated credit has at least 30 days from return, or its existing later expiry. Nonexpiring credit stays nonexpiring. Other unused credit keeps its original expiry. Cancellation of an unpaid reservation normally preserves original expiry rather than granting a new 30-day period. Returns from revoked rewards can compensate previous reversal recovery; rely on the returned wallet/history instead of predicting these amounts locally.

Refunds can reverse first-purchase/referral rewards when remaining eligible external payment falls below the snapshotted minimum. Refunding a rewarded bundle reverses its bundle reward. Reversals may consume other credit and create debt when the reward was already spent. Explain changed balances using actual transaction history.

### Paid orders requiring review

The existing `GET /admin/sales-offer-payment-reviews` queue now also includes `CREDIT_UNAVAILABLE_AFTER_PAYMENT`. Its records use raw `creditAppliedMinor` and `totalMinor`, unlike student orders' nested money objects. Item records also include raw `creditAppliedMinor`.

Continue recording completed external reimbursements through `POST /admin/sales-offer-payment-reviews/:orderId/refund` with `{ "reference": "provider-or-bank-reference" }`. Label it “Record external refund”. This endpoint handles both review reasons, records an already completed refund, and cancels the order; it does not transfer money. This is separate from normal refund requests for approved orders.

### Receipts and reports

Receipts preserve credit/payment splits. Commerce and revenue exports add `creditAppliedMinor` and `priceAfterDiscountMinor`; `totalMinor` represents external payment. Refund exports add `creditReturnMinor`, while the aggregate refund report exposes `creditReturnedMinor`. Update column selectors, totals, and CSV parsers accordingly.

Publisher and partner allocation bases remain the discounted item price, including platform-funded credit. Display server allocations rather than recalculating commission from external payment alone.

## 12. Errors and cache invalidation

Use existing localized API error handling. Branch on status and structured fields where available, rather than exact English message strings.

| Status | Handling |
| --- | --- |
| 400 | Show validation, invalid/inactive code, self-referral, or expiry feedback near the relevant input |
| 401 | Run existing authentication recovery |
| 403 | Apply role/access handling |
| 404 | Show the missing student, attribution, or invite code and refresh context |
| 409 | Resolve disabled spending, changed balance/caps, conflicting referrals, reused adjustment details, or already-processed state; refresh relevant data |

After a credit conflict, do not silently change the credit amount and submit checkout again: the external amount may have changed. Fetch a fresh preview and let the student review it.

| Event | Refresh |
| --- | --- |
| Cart/code/coupon/credit selection changes | Active preview |
| Checkout succeeds | Cart, orders, credit balance/history, offers |
| Order approved | Order, library/access, credit balance/history, offers |
| Cancellation or expiry observed | Order, credit balance/history |
| Refund approved | Refund lists, order, library/access, credit balance/history, reports |
| Admin credit adjustment | Affected student balance/history |
| Settings or referral review changes | Admin settings/lists and relevant preview on next use |
| External review refund recorded | Review queue and affected order/wallet |

Partition caches by authenticated user, clear account-specific data on sign-out, and refresh balances when returning to checkout/account screens. Expiry and changes from another session can invalidate cached amounts.

## 13. Deployment and acceptance checks

Deploy the three migrations in order and regenerate the Prisma client before running the updated backend:

1. `20261111120000_student_credit_rewards`
2. `20261111130000_student_credit_original_expiry`
3. `20261111140000_student_credit_refund_lots`

Existing rows default to zero credit usage. There is no automatic historical reward backfill. Enable programs through the administrator API when the relevant frontend flows are ready. Keep manually configured bundle rewards at zero until that flow is ready too; those rewards are configured on offers independently of the global first-purchase/referral switches.

Verify these integration scenarios:

- [ ] Disabled programs and zero balances render correctly without blocking ordinary purchases.
- [ ] Preview and order totals show the correct before/after-credit amounts.
- [ ] A percentage cap, absolute cap, excluded item, and outstanding debt restrict spending correctly.
- [ ] A stale preview or concurrent checkout produces a recoverable credit conflict.
- [ ] Fully credit-funded orders approve without an external payment step.
- [ ] Manual proof rejection retains reserved credit; cancellation and expiry refresh the wallet.
- [ ] XPay receives only external payment and return handling waits for backend confirmation.
- [ ] Both payment-review reasons hide pay-again actions and appear in the admin queue.
- [ ] Referral preview does not persist attribution; successful checkout does.
- [ ] Self-referrals, mixed partner/student codes, and shared-parent review are handled clearly.
- [ ] Referral lists work without invited student identities or reward-paid indicators.
- [ ] Settings PUT sends complete configuration and offer PUT preserves both reward fields.
- [ ] Adjustment retries use the same operation details and do not duplicate grants.
- [ ] Cash/credit refunds display separately, including credit-only refunds and reward debt.
- [ ] Refunded credit expiry changes do not imply all old credit has been renewed.
- [ ] Report/receipt consumers accept the new split and field names.

Backend coverage is in [student-rewards.e2e-spec.ts](../test/student-rewards.e2e-spec.ts). See the [controller](../src/modules/student-rewards/student-rewards.controller.ts), [DTOs](../src/modules/student-rewards/dto/student-rewards.dto.ts), [credit service](../src/modules/student-rewards/student-credit.service.ts), and [rewards service](../src/modules/student-rewards/student-rewards.service.ts) for implementation details.
