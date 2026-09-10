# XPay Hosted Checkout: frontend integration guide

This application uses **XPay Hosted Checkout**. The API creates the XPay
Checkout Session and the student leaves the app for XPay's hosted page. This
is not an XPay Drop-in or Elements integration: do not load an XPay checkout
SDK, mount payment fields, or call XPay APIs from the browser.

The frontend does not need an XPay publishable/public key. It must never
receive `XPAY_SECRET_KEY` or `XPAY_WEBHOOK_SECRET`; both are API-only
configuration. The backend creates the hosted session and verifies signed
webhooks.

## Student flow

1. Add a purchasable course or chapter to the cart:

   ```http
   POST /api/v1/student/cart/items
   Authorization: Bearer <student-access-token>
   Content-Type: application/json

   {"targetType":"COURSE","targetId":"course-id"}
   ```

   `targetType` is either `COURSE` or `CHAPTER`. Adding an unavailable target,
   already entitled content, or overlapping cart content is rejected by the
   API.

2. Start checkout with a newly generated `Idempotency-Key` for this checkout
   action. The header is required and may not exceed 200 characters.

   ```http
   POST /api/v1/student/checkout
   Authorization: Bearer <student-access-token>
   Content-Type: application/json
   Idempotency-Key: <fresh UUID>

   {"paymentChannel":"XPAY"}
   ```

3. Save `id` as the local order ID before leaving the app, then read
   `xpay.checkoutUrl` and redirect the current page:

   ```ts
   window.location.assign(checkout.xpay.checkoutUrl);
   ```

   Do not open an XPay iframe or substitute another redirect mechanism.

4. XPay eventually returns the browser to the configured frontend return or
   cancel URL. That return is informational only. It is not a payment result:
   never approve an order or grant access from the return, its query/path
   values, a client SDK callback, or browser state. XPay documents that the
   success authority is the signed webhook, and its Hosted Checkout return has
   no extra query parameters.

5. On the return page, load the saved local order ID with:

   ```http
   GET /api/v1/student/orders/{orderId}
   Authorization: Bearer <student-access-token>
   ```

   Render the returned API state, and poll while it is `AWAITING_PAYMENT` so
   the UI can reflect webhook processing. Stop polling when it reaches a
   terminal state or when the page is left. The return page must also handle a
   missing saved order ID without claiming payment; send the student to Orders
   or show an order lookup/history path already provided by the application.

## Responses and states

`POST /student/checkout` returns HTTP 201. For XPay it returns the local order
fields below plus an `xpay` attempt object. The order is the durable record;
the `xpay` object is only used to perform the immediate redirect.

```json
{
  "id": "order-id",
  "status": "AWAITING_PAYMENT",
  "paymentChannel": "XPAY",
  "subtotal": { "amountMinor": 15000, "currency": "EGP" },
  "discount": { "amountMinor": 0, "currency": "EGP" },
  "total": { "amountMinor": 15000, "currency": "EGP" },
  "paymentMethod": { "provider": "XPAY", "checkout": "HOSTED_REDIRECT" },
  "createdAt": "2026-09-10T12:00:00.000Z",
  "approvedAt": null,
  "cancelledAt": null,
  "paymentExpiresAt": "2026-09-10T12:30:00.000Z",
  "receiptReference": null,
  "items": [
    {
      "id": "order-item-id",
      "targetType": "COURSE",
      "targetId": "course-id",
      "targetName": "Physics course",
      "title": "Physics course",
      "basePrice": { "amountMinor": 15000, "currency": "EGP" },
      "discount": { "amountMinor": 0, "currency": "EGP" },
      "price": { "amountMinor": 15000, "currency": "EGP" }
    }
  ],
  "submissions": [],
  "xpay": {
    "id": "payment-attempt-id",
    "status": "PENDING",
    "checkoutUrl": "https://checkout.xpay.app/...",
    "expiresAt": "2026-09-10T12:30:00.000Z"
  }
}
```

`GET /student/orders/{orderId}` returns the order object, without `xpay` or
payment-attempt details. Use these exposed order statuses for the screen:

| API `status`                            | Frontend treatment                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWAITING_PAYMENT`                      | Show **Awaiting payment** and continue polling. If `paymentExpiresAt` has not passed, offer a user-initiated retry. A provider decline/cancel does not create a `FAILED` order status in this response.                                  |
| `APPROVED`                              | Show **Approved**. `approvedAt` and, when available, `receiptReference` provide confirmation. Refresh the relevant course/chapter access UI from its existing API data.                                                                  |
| `EXPIRED`                               | Show **Expired**; it cannot start another XPay attempt.                                                                                                                                                                                  |
| `CANCELLED`, `REJECTED`, or `SUBMITTED` | Render the exact returned status as no longer payable through this XPay flow; do not infer a successful payment. These are part of the API enum even though an ordinary XPay purchase uses `AWAITING_PAYMENT`, `APPROVED`, or `EXPIRED`. |

There is no order status named `FAILED`. For a checkout/attempt request that
fails before redirecting, show the API error and leave the student on the app;
do not treat it as paid. An XPay payment decline can leave the order as
`AWAITING_PAYMENT`, in which case an eligible order may be retried.

## Retry an unpaid order

For a student-selected retry of an unpaid XPay order, generate a **new**
`Idempotency-Key` and call:

```http
POST /api/v1/student/orders/{orderId}/xpay/attempt
Authorization: Bearer <student-access-token>
Idempotency-Key: <fresh UUID>
```

The HTTP 201 response is the replacement attempt, not an order:

```json
{
  "id": "payment-attempt-id",
  "status": "PENDING",
  "checkoutUrl": "https://checkout.xpay.app/...",
  "expiresAt": "2026-09-10T12:30:00.000Z"
}
```

Redirect only after verifying `checkoutUrl` is present:

```ts
window.location.assign(attempt.checkoutUrl);
```

The API allows this only when the order belongs to the current student, uses
`XPAY`, is `AWAITING_PAYMENT`, and has not reached `paymentExpiresAt`.

## Authentication and error handling

These student endpoints require the existing student bearer token:

```http
Authorization: Bearer <accessToken>
```

Use the application's existing authenticated API client. In the deployed
cross-origin setup, it must also use `credentials: 'include'` so the secure
refresh cookie is sent for login, refresh, logout, and other
cookie-authenticated requests. Do not replace the application token or cookie
flow with XPay credentials. Send `Content-Type: application/json` when there
is a JSON body; the retry has no request body.

All API errors use this envelope:

```json
{
  "statusCode": 409,
  "code": "CONFLICT.CART_IS_EMPTY",
  "message": { "ar": "...", "en": "Cart is empty" },
  "error": { "ar": "تعارض", "en": "Conflict" },
  "correlationId": "request-id"
}
```

`details` is optionally present for validation failures and contains
field-level `{ field, code, message: { ar, en } }` entries. Display the
localized message and use `code`/field paths for client logic; do not parse
the prose message. Retain `correlationId` with the local order ID in support
logs.

Relevant backend outcomes are:

| Request       | Statuses and exposed conditions                                                                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add cart item | `400`, `401`, `403`, `404`, or `409`; examples include `Purchasable course not found`, `Purchasable chapter not found`, `Course is not purchasable`, `Chapter is not purchasable`, `Cart already contains overlapping content`, and `Item is already in cart`.                |
| Checkout      | `400`, `401`, `403`, `404`, or `409`; examples include a missing/too-long idempotency key, `Active payment method not found` (manual checkout only), `Cart is empty`, and checkout conflicts. XPay session-creation failures surface as the API error rather than a redirect. |
| Get order     | `401`, `403`, or `404`; a missing order for the current student is `Order not found`.                                                                                                                                                                                         |
| XPay retry    | A missing/too-long idempotency key is `400`; `XPay order not found` is `404`; `Order cannot start an XPay payment` is `409` when it is not eligible or is expired. It can also surface the XPay session-creation API error.                                                   |

## Framework-neutral implementation

This example uses an existing API client convention: it sends the bearer
token, includes cookies for the application's refresh flow, and preserves the
order ID in session storage before navigation. Replace `accessToken()` with
the frontend's existing session/token accessor.

```ts
type ApiError = {
  statusCode: number;
  code: string;
  message: { ar: string; en: string };
  correlationId: string;
};

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

type XPayAttempt = {
  id: string;
  status: 'INITIATED' | 'PENDING' | 'PAID' | 'DECLINED' | 'FAILED' | 'EXPIRED';
  checkoutUrl: string;
  expiresAt: string | null;
};

const apiBase = '/api/v1';

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken()}`,
      ...init.headers,
    },
  });
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) throw body as ApiError;
  return body as T;
}

async function startXPayCheckout() {
  const checkout = await api<Order & { xpay: XPayAttempt }>(
    '/student/checkout',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({ paymentChannel: 'XPAY' }),
    },
  );

  sessionStorage.setItem('pending-xpay-order-id', checkout.id);
  window.location.assign(checkout.xpay.checkoutUrl);
}

async function retryXPayCheckout(orderId: string) {
  const attempt = await api<XPayAttempt>(
    `/student/orders/${encodeURIComponent(orderId)}/xpay/attempt`,
    { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );
  window.location.assign(attempt.checkoutUrl);
}

async function loadReturnedOrder(): Promise<Order | null> {
  const orderId = sessionStorage.getItem('pending-xpay-order-id');
  return orderId
    ? api<Order>(`/student/orders/${encodeURIComponent(orderId)}`)
    : null;
}
```

Disable the checkout/retry control while its request is in progress. Do not
automatically issue another redirect on reload, return, polling, or an API
retry; redirects must follow one explicit successful checkout or retry action.

## Local testing

At a high level, use only XPay test-mode keys (`sk_test_...`) and a test-mode
webhook endpoint. Local XPay redirect and webhook testing needs publicly
reachable HTTPS URLs for both the frontend and API (for example, separate
tunnels). Configure the API's return/cancel URLs with the frontend tunnel URL,
configure the webhook with the API tunnel URL, and add the frontend tunnel
**origin** to `CORS_ORIGINS` before restarting the API.

Complete the hosted page with [XPay test cards](https://docs.xpay.app/en/get-started/test-mode).
Validate an approved payment and receipt/access, replay/resend a webhook to
confirm webhook idempotency, exercise a decline, and confirm an eligible order
can be retried. The repository's development-only
[`dev/xpay-test-console.html`](../dev/xpay-test-console.html) demonstrates the
same Hosted Checkout redirect and return polling flow; it is not production
frontend code.

## Production checklist

- [ ] The configured return/cancel URL uses the production frontend's HTTPS
      origin.
- [ ] No XPay secret, webhook secret, or server environment file is bundled
      into frontend code, exposed in logs, or sent to the browser.
- [ ] Checkout and return pages provide a calm pending/awaiting-payment state.
- [ ] Payment approval and access come only from subsequent API order/access
      data after backend webhook processing, never from redirects.
- [ ] Frontend support logs correlate the local order ID and API
      `correlationId`; do not log secrets or payment details.
- [ ] Buttons are single-flight and redirect only once per explicit successful
      checkout/retry action.

## References

Local backend documentation:

- [XPay backend integration guide](xpay-integration-guide.md)
- [Detailed API reference](api-reference-detailed.md)
- [Production deployment](production-deployment.md)

Official XPay documentation:

- [Hosted Checkout](https://docs.xpay.app/en/integrate/integration-patterns/hosted-checkout)
- [Verifying webhook signatures](https://docs.xpay.app/en/integrate/webhooks/verifying-signatures)
- [Test mode and test cards](https://docs.xpay.app/en/get-started/test-mode)
- [Idempotency](https://docs.xpay.app/en/integrate/idempotency)
