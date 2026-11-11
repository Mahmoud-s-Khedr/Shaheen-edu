# Student credit and rewards backend

This update adds student credit, student referrals, first qualifying purchase rewards, and optional bundle credit rewards. Routes use `/api/v1` and existing bearer authentication. Administrator operations require `SUPER_ADMIN`. All money uses integer EGP minor units: `100` means EGP 1.

For frontend implementation steps, shared types, screen behavior, cache refresh rules, and acceptance checks, see the [frontend integration guide](student-credit-and-rewards-frontend-integration.md).

## Rollout

Apply `20261111120000_student_credit_rewards`, `20261111130000_student_credit_original_expiry`, and `20261111140000_student_credit_refund_lots`, then regenerate the Prisma client before deploying this code. Credit spending, first-purchase rewards, and student referrals default to disabled. There is no historical credit backfill or automatic award for past orders. Configure the programs through the administrator settings API before enabling them. Frontend integration is separate.

The existing publisher and partner commission bases remain the discounted item price, including the portion funded by platform credit. Credit is a platform-funded payment source rather than an additional discount. Reports separate credit from external payment.

## Student API

| Method | Route | Result |
| --- | --- | --- |
| GET | `/student/credit` | `currency`, `availableMinor`, `reservedMinor`, `debtMinor`, `expiring[]` |
| GET | `/student/credit/transactions?page=1&limit=20` | Paginated immutable credit entries |
| GET | `/student/referrals/code` | Personal `{ code, isActive }`; requires an active referral program |
| GET | `/student/referrals?page=1&limit=20` | Referral IDs, statuses, and creation dates; no invited student identity or purchase details |

Each transaction contains `type`, `amountMinor`, `availableDeltaMinor`, `reason`, source `key`, optional order/actor references, and creation date. `amountMinor` describes the operation; `availableDeltaMinor` is its effect on spendable credit. Reservation deducts available credit, so its later `SPENT` event has a zero available delta. Grants used to repay debt do not become fully spendable. The current balance response is authoritative.

Registration has no referral-code field and creates no referral attribution. Students enter an optional `studentReferralCode` during price preview and checkout. Preview validates it without saving attribution. A successful checkout transaction records the student referrer; failed checkouts roll back attribution. The student referrer remains assigned across future orders, including after cancellation, and a different referrer cannot replace it. Reusing the same code is allowed. Shared parent phone numbers suspend the attribution for administrator review; they do not reject the purchase or prove fraud.

## Administrator API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/admin/student-rewards/settings` | `{ version, config }`; includes defaults before configuration |
| PUT | `/admin/student-rewards/settings` | Replace the complete configuration |
| GET | `/admin/students/:id/credit` | Student balance, reserved credit, expiry and debt |
| GET | `/admin/students/:id/credit/transactions` | Paginated history |
| POST | `/admin/students/:id/credit/adjustments` | Grant or deduct credit |
| GET | `/admin/student-referrals` | Paginated attributions, review flags and status |
| POST | `/admin/student-referrals/:id/review` | `{ status: "ACTIVE" | "SUSPENDED", note }` |
| PUT | `/admin/students/:id/referral-code/status` | `{ isActive, reason }` |

Example complete settings payload (amounts are illustrative, not default rewards):

```json
{
  "credit": {
    "enabled": true,
    "targetTypes": ["COURSE", "CHAPTER", "BUNDLE"],
    "excludedTargets": [],
    "maximumUsageBps": 10000,
    "maximumUsageMinor": null,
    "expiryDays": 180
  },
  "firstPurchase": {
    "enabled": true,
    "targetTypes": ["COURSE", "CHAPTER", "BUNDLE"],
    "excludedTargets": [],
    "minimumPaymentMinor": 20000,
    "rewardMinor": 2000,
    "startsAt": null,
    "endsAt": null
  },
  "referral": {
    "enabled": true,
    "targetTypes": ["COURSE", "CHAPTER", "BUNDLE"],
    "excludedTargets": [],
    "minimumPaymentMinor": 20000,
    "rewardMinor": 3000,
    "invitedRewardMinor": 1000,
    "startsAt": null,
    "endsAt": null,
    "rewardLimit": null,
    "perReferrerLimit": null
  }
}
```

`excludedTargets` contains `COURSE:id`, `CHAPTER:id`, or `BUNDLE:id` keys. Bundle eligibility is evaluated against the bundle target; individual exclusions do not remove selected contents from a bundle. First-purchase rewards additionally require the offer's `firstPurchaseEligible: true`. Reward minimum payments must be positive. Limits count lifetime rewarded referrals, including reversed awards; editing settings does not reset them. Expiry days apply to newly earned purchase/referral/bundle credit; a manual grant can specify its own expiry.

Manual adjustment body:

```json
{ "key": "support-case-123", "amountMinor": 5000, "reason": "Approved goodwill credit", "expiresAt": null }
```

The key is scoped to the student. Retry the same operation with the same key, amount, reason and expiry. Reusing it with different details returns 409. Retry validation uses the original grant expiry; refunds create separate lots and leave that expiry unchanged. Negative adjustments consume available credit and then create debt if needed. Grants repay debt before increasing spendable credit. Adjustments and configuration/review changes are audited.

## Checkout contract

Both `/student/price-preview` and `/student/checkout` accept optional `studentReferralCode`. The existing `referralCode` remains the partner referral code; submitting both returns 409. Price preview returns `studentReferral: { code, status }` or `null`.

Example checkout body:

```json
{
  "paymentChannel": "MANUAL",
  "manualPaymentMethodId": "payment-method-id",
  "studentReferralCode": "STU...",
  "creditAmountMinor": 0
}
```

Add optional `creditAmountMinor` to `/student/price-preview` and `/student/checkout`; omit it or send `0` to avoid spending credit. Requested credit is validated against the available balance, eligible discounted subtotal, percentage cap, and absolute cap. Excess requests return 409 rather than silently charging a different cash amount.

Price preview retains its existing `totalMinor` (discounted price before credit) and adds:

- `maximumCreditMinor`: the current maximum usable credit for these targets.
- `creditAppliedMinor`: requested and eligible credit.
- `paymentDueMinor`: external payment after credit.

Orders add `creditApplied` and `priceAfterDiscount` money objects. Order `total` is the external amount due; item `price` remains the discounted item price. Items add `creditApplied` and `externalPayment`. For example, EGP 900 discounted price paid using EGP 200 credit results in EGP 700 order `total`. Do not subtract credit again on the frontend.

Credit is allocated proportionally across eligible targets, then across a bundle's included lines with deterministic integer rounding. The allocation is preserved on the order for refunds and reward qualification. XPay receives only the external portion. An order entirely funded with credit approves through the existing `ZERO_TOTAL` flow. Existing request channels remain `MANUAL` and `XPAY`.

Checkout reserves credit; approval consumes it. Cancellation and unpaid-order expiration release it atomically, preserving the original credit expiry. Reserved credit that has already expired is recorded as expired rather than becoming spendable again. A rejected manual proof retains the reservation so it can be retried until the order expires or is cancelled. Submitted manual orders retain credit while awaiting review, matching existing expiry behavior. Preview does not reserve credit. Checkout keys and approval/reward claims are idempotent, and wallet locks prevent concurrent overspending.

A late paid XPay callback whose credit reservation was released enters `PAYMENT_REVIEW` with `CREDIT_UNAVAILABLE_AFTER_PAYMENT`. Paid bundles that lose capacity retain `OFFER_UNAVAILABLE_AFTER_PAYMENT`. Both cases release outstanding credit, grant no access or rewards, and appear in the existing administrator payment-review queue. The existing external-refund recording endpoint handles both reasons and does not initiate a money transfer.

## Reward qualification

Program terms and bundle reward settings are snapshotted at checkout. Program dates are evaluated at checkout; amounts and eligibility do not change when an administrator later edits settings. Student referral suspension, invite-code suspension, account eligibility, once-only claims and reward limits are rechecked at approval.

Qualification uses the external payment attributable to eligible items, after discounts and credit. Free or fully credit-funded purchases cannot qualify for first-purchase or referral rewards. Earlier nonqualifying purchases do not consume the opportunity. Existing approved qualifying purchases are considered for both first-purchase and referral eligibility, including purchases before the student entered a referral code; past purchases are never automatically rewarded. First-purchase and referral rewards each have lifetime claims that remain consumed after reversal.

Student referrals and partner referrals cannot both apply to the same order. An active student attribution conflicts with an explicitly submitted partner referral code; the backend does not silently choose one. First-purchase, referral, invited-student and bundle credit can be earned together when their independent rules qualify. Earned credit is issued only after approval and cannot fund that same order.

Offer create/replace payloads now accept `creditRewardMinor` (default `0`) and `firstPurchaseEligible` (default `false`). PUT omission resets these fields to defaults. Bundle credit follows the offer snapshot and can apply even to zero-price offers when an administrator configures it.

## Refunds and accounting

Refund item `amountMinor` is external money to reimburse; `creditReturnMinor` is credit to restore. Whole-bundle selection rules still apply. Credit-only refunds require an administrative reference for traceability but require no external cash reimbursement.

Refunds restore spent credit into separate lots linked to the original grant, preserving unlimited expiry or extending only the returned credit to at least 30 days from return. Unused balances and other reservations keep their original expiry. Expired, unused balances are not resurrected. Reward reversals follow the original grant and all linked return lots, including repeated returns, to distinguish expired credit from spent credit. Returns of already revoked credit compensate the reversal recovery, offset debt first, and retain at least 30 days to use any dated credit left over. This also applies when an unpaid reservation is released after its revoked source lot expires; ordinary reservation releases retain the original expiry.

A partial refund reverses a first-purchase or referral reward only when remaining eligible external payment drops below its snapshotted minimum. Refunding a rewarded bundle reverses its bundle reward. Both referrer and invited-student awards are reversed together when referral qualification is lost. Spent rewards are recovered from other available credit, then recorded as debt. Further credit spending is blocked while debt remains; future grants and returns pay it down. There is no cash withdrawal or student transfer API.

Commerce/revenue exports add `creditAppliedMinor` and `priceAfterDiscountMinor`, while `totalMinor` remains external payment. Refund exports add `creditReturnMinor`. Receipts preserve the same split. Publisher and partner allocations continue to use discounted item prices, including platform-funded credit.

## Verification

`test/student-rewards.e2e-spec.ts` exercises balances, expiry, adjustments, caps, checkout concurrency, cancellation/expiration, first qualifying purchases, historical eligibility, registration without referral attribution, preview validation and checkout attribution, referral review/limits, reward stacking, cash/credit refunds, reward debt, bundle snapshots, late XPay payments, and HTTP authorization/validation. Existing sales-offer, publisher, pricing-response and Swagger suites cover compatibility with the current commerce backend.
