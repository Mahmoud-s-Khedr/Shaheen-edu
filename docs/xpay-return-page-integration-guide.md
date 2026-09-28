# XPay return-page integration guide

Use this guide to implement the frontend page that XPay opens after a Hosted
Checkout attempt. The return page displays the platform's local order state;
it must never decide that a payment succeeded from the URL or the XPay redirect
alone.

## 1. Configure the backend redirect URLs

Set the completion redirect URL with XPay's supported Checkout Session template:

```dotenv
XPAY_REDIRECT_URL=https://app.jibal-platform.com/payment-result?xpay_session_id={CHECKOUT_SESSION_ID}
XPAY_CANCEL_URL=https://app.jibal-platform.com/payment-canceled
```

XPay replaces `{CHECKOUT_SESSION_ID}` before redirecting the browser. For
example, a test checkout may return to:

```text
https://app.jibal-platform.com/payment-result?xpay_session_id=cs_test_abc123
```

The cancel URL deliberately has no template. The frontend falls back to the
locally saved order ID when it receives that URL.

## 2. Save the local order before leaving the application

When checkout creates an XPay session, retain the local order ID before
navigating to XPay. It is the fallback for cancel returns and is useful for
support correlation.

```ts
const checkout = await api.post('/api/v1/student/checkout', {
  paymentChannel: 'XPAY',
});

sessionStorage.setItem('pending-xpay-order-id', checkout.id);
window.location.assign(checkout.xpay.checkoutUrl);
```

Use the application's normal authenticated API client and an idempotency key
when creating the checkout. Do not put XPay secret keys in frontend code.

## 3. Resolve the returned order

On `/payment-result`, prefer the `xpay_session_id` query parameter. It maps to
the authenticated student's local order through this endpoint:

```http
GET /api/v1/student/xpay/checkout-sessions/{checkoutSessionId}/order
Authorization: Bearer <student-access-token>
```

If the parameter is absent, such as after a cancel return, retrieve the saved
local order instead:

```http
GET /api/v1/student/orders/{orderId}
Authorization: Bearer <student-access-token>
```

Both endpoints return the same local order response and do not expose XPay
credentials, webhook payloads, or provider data. The session lookup returns a
generic `404 Order not found` for an unknown or non-owned session.

```ts
type Order = {
  id: string;
  status:
    | 'AWAITING_PAYMENT'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';
  paymentExpiresAt: string | null;
  approvedAt: string | null;
  receiptReference: string | null;
};

async function loadReturnedOrder(): Promise<Order | null> {
  const sessionId = new URLSearchParams(window.location.search).get(
    'xpay_session_id',
  );

  if (sessionId) {
    return api.get<Order>(
      `/api/v1/student/xpay/checkout-sessions/${encodeURIComponent(sessionId)}/order`,
    );
  }

  const orderId = sessionStorage.getItem('pending-xpay-order-id');
  return orderId
    ? api.get<Order>(`/api/v1/student/orders/${encodeURIComponent(orderId)}`)
    : null;
}
```

If neither value exists, show an order-history link or an appropriate neutral
message. Do not show a payment-success screen.

## 4. Display and poll the authoritative state

The return may happen before the signed XPay webhook reaches the backend. Show
the returned API state and poll while it remains `AWAITING_PAYMENT`. Stop when
the result is terminal or when the page is left.

```ts
let pollTimer: number | undefined;

async function refreshPaymentResult() {
  const order = await loadReturnedOrder();
  if (!order) {
    renderOrderLookupUnavailable();
    return;
  }

  renderOrderStatus(order);

  if (order.status === 'AWAITING_PAYMENT') {
    pollTimer = window.setTimeout(refreshPaymentResult, 2000);
  }
}

window.addEventListener('pagehide', () => {
  if (pollTimer) window.clearTimeout(pollTimer);
});

refreshPaymentResult();
```

| API order state                      | Frontend behavior                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWAITING_PAYMENT`                   | Show a pending state and continue polling. A retry may be offered only through the existing user-initiated retry flow while the order is eligible. |
| `APPROVED`                           | Show payment confirmation and refresh entitlement/course access data.                                                                              |
| `EXPIRED`                            | Show that payment expired; do not retry automatically.                                                                                             |
| `CANCELLED`, `REJECTED`, `SUBMITTED` | Render the returned state without treating it as a successful payment.                                                                             |

There is no `FAILED` local order state for this flow. A declined provider payment
can leave the local order at `AWAITING_PAYMENT`.

## 5. Security and correctness requirements

- Treat the signed backend webhook and the returned local `order.status` as
  the sole payment authority.
- The `xpay_session_id` query value identifies an order lookup only; it is not
  evidence of a completed or paid transaction.
- Use the student's existing bearer-token and cookie-authenticated API flow.
- Do not call XPay from the browser and do not expose `XPAY_SECRET_KEY` or
  `XPAY_WEBHOOK_SECRET`.
- Do not automatically create a new checkout, retry payment, or redirect to
  XPay during page load or polling.

## 6. Test checklist

1. Complete a test checkout and confirm the return URL contains
   `xpay_session_id=cs_test_...`.
2. Confirm the page first shows `AWAITING_PAYMENT` when the webhook is pending.
3. Deliver the signed webhook and confirm polling changes the page to
   `APPROVED`.
4. Open a return URL with an unknown or another student's session ID and
   confirm it exposes only the generic not-found response.
5. Return through the static cancel URL and confirm the saved local order ID is
   used as the fallback.
6. Clear browser session storage, open a completion return URL, and confirm it
   still loads the order through `xpay_session_id`.

For the broader hosted-checkout flow, see the
[XPay frontend integration guide](xpay-frontend-integration-guide.md) and the
[XPay backend integration guide](xpay-integration-guide.md).
