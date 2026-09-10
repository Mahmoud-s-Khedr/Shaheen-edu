# XPay integration guide

This application uses XPay Hosted Checkout. The backend creates every Checkout
Session and the client redirects the student to the returned `checkoutUrl`.
The browser return is informational only: the signed XPay webhook is the sole
authority for approving an order and granting content access.

## Configuration

Create a secret API key and webhook endpoint in the XPay dashboard. Subscribe
the endpoint to `checkout.session.completed` and
`checkout.session.async_payment_succeeded`, then configure:

```dotenv
XPAY_API_BASE_URL=https://api.xpay.app
XPAY_SECRET_KEY=sk_test_... # use sk_live_... in production
XPAY_WEBHOOK_SECRET=whsec_...
XPAY_REDIRECT_URL=https://app.example.com/payment-result
XPAY_CANCEL_URL=https://app.example.com/payment-result
XPAY_TIMEOUT_MS=15000
XPAY_ORDER_EXPIRY_SECONDS=1800
```

Expose the signed webhook endpoint at:

```
POST https://<api-host>/api/v1/payments/xpay/webhook
```

`XPAY_SECRET_KEY` and `XPAY_WEBHOOK_SECRET` are server-only credentials. Never
put either in a browser bundle, mobile application, test evidence, or source
control. Test and live XPay environments need separate keys and webhook
secrets.

## Local end-to-end test console

The repository includes a development-only Hosted Checkout UI at
`dev/xpay-test-console.html`. It signs in a disposable student, adds one paid
course or chapter, creates the normal local order, redirects to the XPay-hosted
checkout page, and polls the local order after the return. It is not a
production frontend and retains a test access token only in browser session
storage so that the token survives the XPay redirect.

1. Put `sk_test_...` credentials and the XPay settings above in the local
   `.env`, then start the Docker development stack:

   ```sh
   pnpm dev:start
   pnpm dlx serve dev -l 5173
   ```

2. Expose the local API and the static test page separately. The provider must
   reach the API webhook and redirect the browser to a publicly reachable HTTPS
   frontend URL:

   ```sh
   cloudflared tunnel --url http://localhost:3000
   cloudflared tunnel --url http://localhost:5173
   ```

3. Add the frontend tunnel origin to `CORS_ORIGINS`, set both
   `XPAY_REDIRECT_URL` and `XPAY_CANCEL_URL` to
   `https://<frontend-tunnel>/xpay-test-console.html`, and restart the API with
   `pnpm dev:update`.

4. In the XPay dashboard's **Test mode**, create a webhook endpoint at
   `https://<api-tunnel>/api/v1/payments/xpay/webhook`. Subscribe to
   `checkout.session.completed` and
   `checkout.session.async_payment_succeeded`, copy its one-time `whsec_...`
   value into `XPAY_WEBHOOK_SECRET`, then run `pnpm dev:update` again.

5. Open the console through `https://<frontend-tunnel>/xpay-test-console.html`
   (not `localhost`). Use a disposable student account and one paid, published
   course or chapter. Complete the hosted page with XPay's test card, then use
   **Refresh saved order** to confirm that the signed webhook—not the
   redirect—changed the order to `APPROVED`.

Use the XPay dashboard's Workbench to resend the same delivery and prove that
the receipt, entitlements, and partner allocations remain single-instance.

## Student checkout

Create an XPay order with the normal checkout route:

```json
{
  "paymentChannel": "XPAY"
}
```

Use an `Idempotency-Key` header. The response has `xpay.checkoutUrl`; redirect
the browser to it. To create a replacement session for an unpaid order, call:

```
POST /api/v1/student/orders/{orderId}/xpay/attempt
```

with a new `Idempotency-Key`. Each retry opens a separate XPay Checkout Session
while retaining the immutable local order and price snapshot.

## Webhook handling and reconciliation

The application verifies `XPay-Signature` as HMAC-SHA256 over
`<timestamp>.<raw request body>`, rejects payloads outside XPay's five-minute
replay window, and deduplicates deliveries by top-level XPay event ID. It
fulfils only `checkout.session.completed` or
`checkout.session.async_payment_succeeded` events whose `paymentStatus` is
`paid`. Before fulfilment it checks the session ID, amount, and currency against
the locally created attempt and order.

Do not approve an order from a redirect, client-side result, or a webhook body
whose signature did not validate. Check the order status through the API after
the redirect while XPay's webhook is being processed.

## Test and production acceptance

1. Use an `sk_test_` key and XPay's documented test cards to create and pay a
   test session.
2. Verify the signed test webhook changes the order to `APPROVED` and creates
   its receipt and entitlements exactly once.
3. Replay the same event and verify no duplicate entitlement, receipt, or
   partner allocation appears.
4. Send a payload with a bad signature and verify it is rejected without an
   order mutation.
5. Create an equivalent live webhook endpoint and replace all test credentials
   only after the live acceptance run succeeds.

See the [XPay Hosted Checkout guide](https://docs.xpay.app/en/integrate/integration-patterns/hosted-checkout)
and [webhook signature guidance](https://docs.xpay.app/en/integrate/webhooks/verifying-signatures)
for the provider contract.
