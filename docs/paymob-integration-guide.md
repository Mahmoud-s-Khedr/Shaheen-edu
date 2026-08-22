# Paymob integration guide

This application uses Paymob Hosted Unified Checkout. The backend creates every
payment intention; the frontend only redirects the student to Paymob and then
refreshes its own order state. A Paymob callback with a valid HMAC is the only
authority that marks an order paid or grants course/chapter access.

Paymob's current API path is the Intention API (`POST /v1/intention/`), not the
legacy auth-token/order/payment-key sequence. See Paymob's [API integration
path](https://developers.paymob.com/paymob-docs/integration-paths/apis) and
[webhook and HMAC documentation](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac).

## 1. Merchant setup

1. Complete Paymob merchant onboarding and enable every payment method to show
   in Hosted Checkout.
2. Create a sandbox account/credentials before testing real payments.
3. Configure the Paymob callback URL as:

   ```text
   https://<api-host>/api/v1/payments/paymob/webhook
   ```

4. Set the frontend return URL to a payment-result screen. This URL is only for
   customer experience; it is not a payment confirmation endpoint.

Required server environment variables:

```dotenv
PAYMOB_BASE_URL=https://accept.paymob.com
PAYMOB_SECRET_KEY=<server-only-secret-key>
PAYMOB_PUBLIC_KEY=<frontend-safe-public-key>
PAYMOB_HMAC_SECRET=<server-only-callback-secret>
PAYMOB_INTEGRATION_IDS=12345,67890
PAYMOB_NOTIFICATION_URL=https://api.example.com/api/v1/payments/paymob/webhook
PAYMOB_REDIRECT_URL=https://app.example.com/payment-result
PAYMOB_ORDER_EXPIRY_SECONDS=1800
```

Never expose the secret key or HMAC secret to the browser. The public key may
appear in a hosted-checkout URL, but this backend creates that URL and returns
it to the authenticated student.

## 2. Backend flow

### Create an order and checkout attempt

`POST /api/v1/student/checkout` accepts an `Idempotency-Key` header and:

```json
{
  "paymentChannel": "PAYMOB",
  "couponCode": "MIDTERMS25"
}
```

The API validates the cart, resolves campaign/coupon pricing, stores immutable
order-item snapshots, reserves a limited-use coupon, creates a pending order,
and returns `paymob.checkoutUrl`. The order expires after 30 minutes unless a
verified Paymob callback succeeds.

To restart an unsuccessful checkout before expiry, call:

```text
POST /api/v1/student/orders/{orderId}/paymob/attempt
Idempotency-Key: <new-idempotency-key>
```

Each retry creates a new Paymob intention/client secret. Do not retry by
reusing a previous URL or client secret.

### Intention request

The backend calls:

```text
POST https://accept.paymob.com/v1/intention/
Authorization: Token <PAYMOB_SECRET_KEY>
```

It sends the final order total in minor EGP units (`100.00 EGP` is `10000`),
configured integration IDs, the internal payment-attempt reference in
`special_reference`, billing data, notification URL, redirect URL, and the
immutable paid line items. Store the Paymob provider identifiers on the local
payment attempt; never treat the redirect result as paid.

### Callback processing

Paymob sends the result to `POST /api/v1/payments/paymob/webhook?hmac=...`.
The controller:

1. Verifies the transaction callback HMAC with SHA-512 and a timing-safe
   comparison using Paymob's documented field order.
2. Persists/deduplicates the provider transaction ID before applying business
   changes.
3. Matches `merchant_order_id`/`special_reference` to the local payment
   attempt.
4. On `success: true` and `pending: false`, atomically marks the attempt paid,
   approves the order, redeems a reserved coupon, issues a receipt reference,
   and grants each entitlement once.
5. On a declined result, records the failure but leaves an unexpired order
   available for a fresh attempt.

Duplicate and out-of-order callbacks are safe. Invalid HMAC callbacks are
recorded for diagnosis but never affect order state.

## 3. Frontend flow

1. Render cart prices returned by the backend. Treat them as display-only until
   checkout creates the immutable order snapshot.
2. On “Pay online”, call `POST /student/checkout` with a unique
   `Idempotency-Key` and `paymentChannel: "PAYMOB"`.
3. Redirect the browser to `response.paymob.checkoutUrl` using `window.location.assign`.
   Do not collect card or wallet credentials in this application.
4. The Paymob redirect URL should show a neutral “Confirming payment” screen.
   Read the local `orderId` retained before navigation, then poll
   `GET /api/v1/student/orders/{orderId}` until it is `APPROVED`, `EXPIRED`, or
   a retryable unpaid state.
5. Show access/receipt only after the local order becomes `APPROVED`. Never use
   Paymob redirect query parameters, SDK/browser events, or a client-side
   success indicator to unlock content.
6. For an unexpired decline/failure, offer “Try again”, which calls the retry
   endpoint with a new idempotency key. For expired orders, return the student
   to the cart and create a fresh order at current prices.

## 4. Testing and go-live checklist

- Use sandbox credentials and Paymob's webhook testing tools first.
- Test card/wallet success, decline, cancellation, duplicate callback, delayed
  callback after expiry, callback with invalid HMAC, and a second retry attempt.
- Confirm all configured integration IDs are enabled on the merchant account.
- Verify callback and redirect URLs are HTTPS and publicly reachable.
- Keep secrets only in deployment secret storage; rotate them through the
  Paymob dashboard and deployment configuration together.
- Monitor pending attempts, invalid callbacks, callback processing errors,
  expiry volume, and unmatched provider transactions.

For the current Paymob prerequisites and supported hosted checkout options,
refer to Paymob's [integration overview](https://developers.paymob.com/paymob-docs/integration-paths/apis).
