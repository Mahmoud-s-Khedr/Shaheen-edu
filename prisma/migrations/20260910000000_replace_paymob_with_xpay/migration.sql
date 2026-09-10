-- Preserve historical provider records; XPay deliveries have a distinct event
-- shape and are stored separately from the retired provider's callbacks.
ALTER TYPE "PaymentChannel" RENAME VALUE 'PAYMOB' TO 'XPAY';

CREATE TABLE "XPayWebhookEvent" (
  "id" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "checkoutSessionId" TEXT,
  "paymentIntentId" TEXT,
  "verified" BOOLEAN NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB,
  "processingError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "XPayWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XPayWebhookEvent_externalEventId_key" ON "XPayWebhookEvent"("externalEventId");
CREATE INDEX "XPayWebhookEvent_checkoutSessionId_idx" ON "XPayWebhookEvent"("checkoutSessionId");
CREATE INDEX "XPayWebhookEvent_paymentIntentId_idx" ON "XPayWebhookEvent"("paymentIntentId");
CREATE INDEX "XPayWebhookEvent_verified_processedAt_idx" ON "XPayWebhookEvent"("verified", "processedAt");
