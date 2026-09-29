# Zero-total checkout frontend integration guide

This guide covers the student and admin frontend changes introduced by commit
`6fe572e` (`ZERO_TOTAL` orders). It applies when the backend's authoritative
checkout quote is exactly zero EGP minor units, whether the cart is free by
default or becomes free through a promotion or coupon.

All paths below are relative to `/api/v1`. Consult the current Swagger document
at `/api/docs` alongside the reporting exception documented below.

## What changed

`ZERO_TOTAL` is a new **response and reporting value** of `PaymentChannel`.
It is assigned by the backend; it is not a payment option that the student can
choose.

```text
Student submits cart + optional paid-channel preference
                         |
                         v
              Backend calculates final total
                  |                 |
            total is zero       total is positive
                  |                 |
                  v                 v
       ZERO_TOTAL + APPROVED    MANUAL or XPAY flow
       entitlement + receipt    payment is still required
```

The decisive value is the total calculated during `POST /student/checkout`.
Do not infer the result solely from a price cached in the browser: campaign,
coupon, eligibility, and cart state can change before checkout.

## Student checkout contract

### Request

The checkout request still accepts only `MANUAL` and `XPAY` for
`paymentChannel`; its default is `MANUAL`. **Never send `ZERO_TOTAL` in a
request.** It is rejected because it is not a client-selectable channel.

For a cart the UI believes is free, omit both `paymentChannel` and
`manualPaymentMethodId`. Coupon and referral fields continue to be sent as
needed.

```http
POST /api/v1/student/checkout
Authorization: Bearer <student-access-token>
Content-Type: application/json
Idempotency-Key: <new UUID for this checkout action>

{
  "couponCode": "FREE100",
  "referralCode": "PARTNER10"
}
```

The request may still contain `"paymentChannel": "XPAY"` if that was the
student's selection before a discount made the cart free. The backend returns
a zero-total order instead of starting XPay. The response, rather than the
original selection, must decide the next UI action.

Do not send a `manualPaymentMethodId` for a zero-total cart. The API responds
with `400` and does not create an order if one is supplied. For a positive
manual order, the existing requirement to supply an active manual payment
method remains unchanged.

### Successful zero-total response

The endpoint returns HTTP `201`. It is already fulfilled: there is no payment
attempt, hosted-checkout URL, expiry, or payment-proof submission. Relevant
fields are shown below; the normal populated `items` and empty `submissions`
fields are also returned.

```json
{
  "id": "order-id",
  "status": "APPROVED",
  "paymentChannel": "ZERO_TOTAL",
  "subtotal": { "amountMinor": 15000, "currency": "EGP" },
  "discount": { "amountMinor": 15000, "currency": "EGP" },
  "total": { "amountMinor": 0, "currency": "EGP" },
  "paymentMethod": { "provider": "ZERO_TOTAL", "checkout": "NONE" },
  "createdAt": "2026-09-29T12:00:00.000Z",
  "approvedAt": "2026-09-29T12:00:00.000Z",
  "cancelledAt": null,
  "paymentExpiresAt": null,
  "receiptReference": "RCT-20260929-ORDER"
}
```

The receipt reference and entitlement creation occur within the checkout
transaction. `APPROVED` is therefore immediately authoritative: refresh the
student's catalogue/access data and show the normal success/access state. Do
not poll for a payment webhook or wait for an XPay redirect.

### Model the response as a discriminated union

Extend shared frontend API types to include `ZERO_TOTAL`, and use the returned
channel as the discriminator. Checking only the requested channel is unsafe.

```ts
type PaymentChannel = 'MANUAL' | 'XPAY' | 'ZERO_TOTAL';

type Order = {
  id: string;
  status:
    | 'AWAITING_PAYMENT'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';
  paymentChannel: PaymentChannel;
  total: { amountMinor: number; currency: 'EGP' };
  paymentMethod: Record<string, unknown>;
  paymentExpiresAt: string | null;
  approvedAt: string | null;
  receiptReference: string | null;
};

type XPayAttempt = {
  id: string;
  status: 'INITIATED' | 'PENDING' | 'PAID' | 'DECLINED' | 'FAILED' | 'EXPIRED';
  checkoutUrl: string;
  expiresAt: string | null;
};

type CheckoutResponse = Order & { xpay?: XPayAttempt };

function continueAfterCheckout(order: CheckoutResponse) {
  if (order.paymentChannel === 'ZERO_TOTAL') {
    // This is expected to be APPROVED; do not redirect, poll, or collect proof.
    refreshStudentAccess();
    navigateToOrderSuccess(order.id);
    return;
  }

  if (order.paymentChannel === 'XPAY') {
    if (!order.xpay?.checkoutUrl) throw new Error('Missing XPay checkout URL');
    sessionStorage.setItem('pending-xpay-order-id', order.id);
    window.location.assign(order.xpay.checkoutUrl);
    return;
  }

  navigateToManualPaymentInstructions(order.id);
}
```

Keep the checkout control single-flight and reuse the same idempotency key only
when retrying the same network operation. A later user-initiated checkout is a
new operation and needs a new key. Replaying a key for a zero-total order
returns the saved approved order; it does not grant access a second time.

## Required UI behavior

### Cart and checkout screens

- When a current price preview says the final total is zero, label the action
  as an enrolment/claim action (for example, **Get course**) and hide manual
  method and XPay controls. The preview is a convenience only; preserve the
  response-based branch above.
- Do not render a zero-value order as “payment pending,” “payment failed,” or
  “manual payment required.” Render it as approved/free access.
- `paymentExpiresAt: null` means there is no payment deadline. Do not start an
  expiry timer.
- `paymentMethod.provider: "ZERO_TOTAL"` describes the server fulfilment path,
  not a payment provider. Do not show it as a payment method or receipt
  instruction.
- Do not offer cancel, manual proof upload/resubmission, or XPay retry for a
  `ZERO_TOTAL` order. It is already `APPROVED`; those payment actions are not
  eligible.

### Order history and detail screens

All student order responses may now expose `paymentChannel: "ZERO_TOTAL"`:

- `POST /student/checkout`
- `GET /student/orders`
- `GET /student/orders/{id}`
- `POST /student/orders/{id}/cancel` (the shared response model includes it,
  though an approved zero-total order cannot be cancelled)

Add an explicit display mapping such as `ZERO_TOTAL → Free / no payment
required`. Preserve the existing order-status rendering; `APPROVED` remains
the access decision. Do not treat an unknown future channel as `MANUAL`.

## Admin reporting

Add `ZERO_TOTAL` to the frontend's payment-channel enum and filters for the
order-backed report screens below. It represents approved zero-value orders,
so revenue/amount values can legitimately be zero.

| Endpoint                               | Frontend guidance                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /admin/reports/commerce`          | Offer `ZERO_TOTAL` as a channel filter and display its order counts/totals.    |
| `GET /admin/reports/revenue`           | Offer it; an approved zero-total order contributes zero monetary value.        |
| `GET /admin/reports/refunds`           | It is a valid order filter; render the returned aggregate normally.            |
| `GET /admin/reports/payments`          | Do not expect rows: zero-total orders deliberately create no payment attempts. |
| `GET /admin/reports/active-purchasers` | Offer it when operators need to measure free enrolments/access.                |

### OpenAPI inconsistency to account for

The generated OpenAPI document also lists `ZERO_TOTAL` for the
`paymentChannel` parameter on `registrations`, `entitlements`, and
`partner-obligations`. Those services reject `paymentChannel` altogether with
`400 Unsupported filters for this report`; do not add that filter to those
three screens. This is a documentation/backend inconsistency present in the
commit, not a frontend validation rule to work around.

## Frontend acceptance checklist

- [ ] Shared API types and channel-label maps include `ZERO_TOTAL`.
- [ ] The checkout request never sends `ZERO_TOTAL` and omits
      `manualPaymentMethodId` for an expected free cart.
- [ ] A checkout that was requested as XPay but returns `ZERO_TOTAL` does not
      access `xpay`, redirect, or poll.
- [ ] An approved zero-total response refreshes access and shows a receipt/success
      state immediately.
- [ ] Zero-total orders do not expose manual-proof, XPay retry, cancellation,
      or payment-expiry UI.
- [ ] Order history/detail renders a free/no-payment label alongside its
      `APPROVED` status.
- [ ] Admin reporting only offers the zero-total channel filter on the five
      supported report screens listed above.

## References

- [XPay frontend integration guide](xpay-frontend-integration-guide.md)
- [Compact API reference](api-reference-compact.md)
- [Prisma schema reference](prisma-schema-detailed-reference.md)
