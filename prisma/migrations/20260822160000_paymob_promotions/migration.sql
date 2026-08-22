-- Permanent ownership remains course/chapter-only. This migration adds online
-- payment attempts plus immutable pricing, promotions, coupons, and receipts.
CREATE TYPE "PaymentChannel" AS ENUM ('MANUAL', 'PAYMOB');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'PENDING', 'PAID', 'DECLINED', 'FAILED', 'EXPIRED');
CREATE TYPE "PromotionKind" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "CouponReservationStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

ALTER TABLE "Order"
  ALTER COLUMN "manualPaymentMethodId" DROP NOT NULL,
  ADD COLUMN "paymentChannel" "PaymentChannel" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paymentExpiresAt" TIMESTAMP(3),
  ADD COLUMN "expiredAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
  ADD COLUMN "basePriceMinor" INTEGER,
  ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "appliedPromotionSnapshot" JSONB;
UPDATE "OrderItem" SET "basePriceMinor" = "priceMinor" WHERE "basePriceMinor" IS NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "basePriceMinor" SET NOT NULL;
UPDATE "Order" SET "subtotalMinor" = "totalMinor", "discountMinor" = 0;

ALTER TABLE "Order" DROP CONSTRAINT "Order_lifecycle";

-- There is no live data yet: expire only legacy unpaid/rejected orders at the
-- migration boundary. Submitted receipts remain available for administrator review.
-- The legacy lifecycle constraint does not allow EXPIRED, so remove it before
-- converting existing rows and then add the expanded replacement below.
UPDATE "Order"
SET "status" = 'EXPIRED', "expiredAt" = NOW()
WHERE "status" IN ('AWAITING_PAYMENT', 'REJECTED');

ALTER TABLE "Order" ADD CONSTRAINT "Order_lifecycle"
  CHECK (
    ("status" IN ('AWAITING_PAYMENT', 'SUBMITTED', 'REJECTED') AND "approvedAt" IS NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NULL)
    OR ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "approvedAt" IS NULL AND "cancelledAt" IS NOT NULL AND "expiredAt" IS NULL)
    OR ("status" = 'EXPIRED' AND "approvedAt" IS NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NOT NULL)
  );
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_nonnegative"
  CHECK ("subtotalMinor" >= 0 AND "discountMinor" >= 0 AND "totalMinor" >= 0 AND "totalMinor" = "subtotalMinor" - "discountMinor");
ALTER TABLE "Order" ADD CONSTRAINT "Order_payment_expiry_after_creation"
  CHECK ("paymentExpiresAt" IS NULL OR "paymentExpiresAt" > "createdAt");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_snapshot_amounts_nonnegative"
  CHECK ("basePriceMinor" >= 0 AND "discountMinor" >= 0 AND "priceMinor" >= 0 AND "priceMinor" = "basePriceMinor" - "discountMinor");
CREATE INDEX "Order_status_paymentExpiresAt_idx" ON "Order"("status", "paymentExpiresAt");

CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "channel" "PaymentChannel" NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
  "attemptNumber" INTEGER NOT NULL,
  "merchantReference" TEXT NOT NULL,
  "providerOrderId" TEXT,
  "providerTransactionId" TEXT,
  "checkoutUrl" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "providerPayload" JSONB,
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentAttempt_merchantReference_key" ON "PaymentAttempt"("merchantReference");
CREATE UNIQUE INDEX "PaymentAttempt_providerTransactionId_key" ON "PaymentAttempt"("providerTransactionId");
CREATE UNIQUE INDEX "PaymentAttempt_orderId_attemptNumber_key" ON "PaymentAttempt"("orderId", "attemptNumber");
CREATE INDEX "PaymentAttempt_orderId_status_createdAt_idx" ON "PaymentAttempt"("orderId", "status", "createdAt");
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymobWebhookEvent" (
  "id" TEXT NOT NULL,
  "externalTransactionId" TEXT NOT NULL,
  "merchantReference" TEXT,
  "verified" BOOLEAN NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB,
  "processingError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymobWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymobWebhookEvent_externalTransactionId_key" ON "PaymobWebhookEvent"("externalTransactionId");
CREATE INDEX "PaymobWebhookEvent_merchantReference_idx" ON "PaymobWebhookEvent"("merchantReference");
CREATE INDEX "PaymobWebhookEvent_verified_processedAt_idx" ON "PaymobWebhookEvent"("verified", "processedAt");

CREATE TABLE "DiscountCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "note" TEXT,
  "kind" "PromotionKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscountCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountCampaign_window" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "DiscountCampaign_amount" CHECK (("kind" = 'PERCENTAGE' AND "amount" BETWEEN 1 AND 10000) OR ("kind" = 'FIXED' AND "amount" > 0))
);
CREATE INDEX "DiscountCampaign_isActive_startsAt_endsAt_priority_idx" ON "DiscountCampaign"("isActive", "startsAt", "endsAt", "priority");
ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DiscountCampaignTarget" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  CONSTRAINT "DiscountCampaignTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountCampaignTarget_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "DiscountCampaignTarget_campaignId_courseId_key" ON "DiscountCampaignTarget"("campaignId", "courseId");
CREATE UNIQUE INDEX "DiscountCampaignTarget_campaignId_chapterId_key" ON "DiscountCampaignTarget"("campaignId", "chapterId");
CREATE INDEX "DiscountCampaignTarget_courseId_idx" ON "DiscountCampaignTarget"("courseId");
CREATE INDEX "DiscountCampaignTarget_chapterId_idx" ON "DiscountCampaignTarget"("chapterId");
ALTER TABLE "DiscountCampaignTarget" ADD CONSTRAINT "DiscountCampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DiscountCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountCampaignTarget" ADD CONSTRAINT "DiscountCampaignTarget_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscountCampaignTarget" ADD CONSTRAINT "DiscountCampaignTarget_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "PromotionKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
  "minimumOrderMinor" INTEGER NOT NULL DEFAULT 0,
  "maximumDiscountMinor" INTEGER,
  "usageLimit" INTEGER,
  "perStudentUsageLimit" INTEGER,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Coupon_window" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "Coupon_amount" CHECK (("kind" = 'PERCENTAGE' AND "amount" BETWEEN 1 AND 10000) OR ("kind" = 'FIXED' AND "amount" > 0)),
  CONSTRAINT "Coupon_limits" CHECK ("minimumOrderMinor" >= 0 AND ("maximumDiscountMinor" IS NULL OR "maximumDiscountMinor" > 0) AND ("usageLimit" IS NULL OR "usageLimit" > 0) AND ("perStudentUsageLimit" IS NULL OR "perStudentUsageLimit" > 0))
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_isActive_startsAt_endsAt_idx" ON "Coupon"("isActive", "startsAt", "endsAt");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CouponTarget" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  CONSTRAINT "CouponTarget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouponTarget_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "CouponTarget_couponId_courseId_key" ON "CouponTarget"("couponId", "courseId");
CREATE UNIQUE INDEX "CouponTarget_couponId_chapterId_key" ON "CouponTarget"("couponId", "chapterId");
CREATE INDEX "CouponTarget_courseId_idx" ON "CouponTarget"("courseId");
CREATE INDEX "CouponTarget_chapterId_idx" ON "CouponTarget"("chapterId");
ALTER TABLE "CouponTarget" ADD CONSTRAINT "CouponTarget_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponTarget" ADD CONSTRAINT "CouponTarget_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponTarget" ADD CONSTRAINT "CouponTarget_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CouponReservation" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "status" "CouponReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "discountMinor" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CouponReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouponReservation_amount" CHECK ("discountMinor" > 0)
);
CREATE UNIQUE INDEX "CouponReservation_orderId_key" ON "CouponReservation"("orderId");
CREATE INDEX "CouponReservation_couponId_status_createdAt_idx" ON "CouponReservation"("couponId", "status", "createdAt");
CREATE INDEX "CouponReservation_couponId_studentUserId_status_idx" ON "CouponReservation"("couponId", "studentUserId", "status");
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentReceipt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentAttemptId" TEXT,
  "reference" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentReceipt_orderId_key" ON "PaymentReceipt"("orderId");
CREATE UNIQUE INDEX "PaymentReceipt_paymentAttemptId_key" ON "PaymentReceipt"("paymentAttemptId");
CREATE UNIQUE INDEX "PaymentReceipt_reference_key" ON "PaymentReceipt"("reference");
CREATE INDEX "PaymentReceipt_issuedAt_idx" ON "PaymentReceipt"("issuedAt");
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
