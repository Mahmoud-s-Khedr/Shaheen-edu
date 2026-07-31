CREATE TYPE "CommerceTargetType" AS ENUM ('COURSE', 'CHAPTER');
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ManualPaymentSubmissionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

ALTER TYPE "AssetKind" ADD VALUE 'PAYMENT_PROOF';

CREATE TABLE "Cart" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cart_studentUserId_key" ON "Cart"("studentUserId");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CartItem" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "targetType" "CommerceTargetType" NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CartItem_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int = 1),
  CONSTRAINT "CartItem_target_type_matches" CHECK (("targetType" = 'COURSE' AND "courseId" IS NOT NULL) OR ("targetType" = 'CHAPTER' AND "chapterId" IS NOT NULL))
);
CREATE UNIQUE INDEX "CartItem_cartId_courseId_key" ON "CartItem"("cartId", "courseId");
CREATE UNIQUE INDEX "CartItem_cartId_chapterId_key" ON "CartItem"("cartId", "chapterId");
CREATE INDEX "CartItem_cartId_createdAt_idx" ON "CartItem"("cartId", "createdAt");
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ManualPaymentMethod" (
  "id" TEXT NOT NULL,
  "titleAr" TEXT NOT NULL,
  "instructionsAr" TEXT NOT NULL,
  "titleEn" TEXT,
  "instructionsEn" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualPaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ManualPaymentMethod_sortOrder_key" ON "ManualPaymentMethod"("sortOrder");
CREATE INDEX "ManualPaymentMethod_isActive_sortOrder_id_idx" ON "ManualPaymentMethod"("isActive", "sortOrder", "id");
ALTER TABLE "ManualPaymentMethod" ADD CONSTRAINT "ManualPaymentMethod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "manualPaymentMethodId" TEXT NOT NULL,
  "paymentMethodSnapshot" JSONB NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_total_nonnegative" CHECK ("totalMinor" >= 0),
  CONSTRAINT "Order_currency_egp" CHECK ("currency" = 'EGP')
);
CREATE INDEX "Order_studentUserId_createdAt_id_idx" ON "Order"("studentUserId", "createdAt", "id");
CREATE INDEX "Order_status_createdAt_id_idx" ON "Order"("status", "createdAt", "id");
ALTER TABLE "Order" ADD CONSTRAINT "Order_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_manualPaymentMethodId_fkey" FOREIGN KEY ("manualPaymentMethodId") REFERENCES "ManualPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "targetType" "CommerceTargetType" NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "titleSnapshot" TEXT NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int = 1),
  CONSTRAINT "OrderItem_target_type_matches" CHECK (("targetType" = 'COURSE' AND "courseId" IS NOT NULL) OR ("targetType" = 'CHAPTER' AND "chapterId" IS NOT NULL)),
  CONSTRAINT "OrderItem_price_nonnegative" CHECK ("priceMinor" >= 0),
  CONSTRAINT "OrderItem_currency_egp" CHECK ("currency" = 'EGP')
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ManualPaymentSubmission" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "proofAssetId" TEXT NOT NULL,
  "transactionReference" TEXT NOT NULL,
  "note" TEXT,
  "status" "ManualPaymentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualPaymentSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ManualPaymentSubmission_orderId_createdAt_idx" ON "ManualPaymentSubmission"("orderId", "createdAt");
CREATE INDEX "ManualPaymentSubmission_status_createdAt_id_idx" ON "ManualPaymentSubmission"("status", "createdAt", "id");
CREATE INDEX "ManualPaymentSubmission_transactionReference_idx" ON "ManualPaymentSubmission"("transactionReference");
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_proofAssetId_fkey" FOREIGN KEY ("proofAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommerceIdempotencyKey" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommerceIdempotencyKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommerceIdempotencyKey_studentUserId_operation_key_key" ON "CommerceIdempotencyKey"("studentUserId", "operation", "key");

ALTER TABLE "StudentEntitlement" ADD COLUMN "orderItemId" TEXT;
CREATE UNIQUE INDEX "StudentEntitlement_orderItemId_key" ON "StudentEntitlement"("orderItemId");
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
