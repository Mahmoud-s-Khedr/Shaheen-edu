CREATE TABLE "SalesOffer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "marketingCopy" TEXT,
  "coverAssetId" TEXT,
  "priceMinor" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "purchaseLimit" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesOffer_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesOffer_price_check" CHECK ("priceMinor" >= 0),
  CONSTRAINT "SalesOffer_dates_check" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "SalesOffer_limit_check" CHECK ("purchaseLimit" IS NULL OR "purchaseLimit" > 0),
  CONSTRAINT "SalesOffer_status_check" CHECK ("status" IN ('ACTIVE', 'PAUSED', 'ENDED'))
);
CREATE INDEX "SalesOffer_status_startsAt_endsAt_idx" ON "SalesOffer"("status", "startsAt", "endsAt");
CREATE TABLE "SalesOfferItem" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "targetType" "CommerceTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  CONSTRAINT "SalesOfferItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesOfferItem_target_check" CHECK (("targetType" = 'COURSE' AND "courseId" IS NOT NULL AND "courseId" = "targetId" AND "chapterId" IS NULL) OR ("targetType" = 'CHAPTER' AND "chapterId" IS NOT NULL AND "chapterId" = "targetId" AND "courseId" IS NULL)),
  CONSTRAINT "SalesOfferItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesOfferItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesOfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SalesOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SalesOfferItem_offerId_targetType_targetId_key" ON "SalesOfferItem"("offerId", "targetType", "targetId");
ALTER TYPE "CommerceTargetType" ADD VALUE IF NOT EXISTS 'BUNDLE';
ALTER TABLE "CartItem" ADD COLUMN "salesOfferId" TEXT;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_salesOfferId_fkey" FOREIGN KEY ("salesOfferId") REFERENCES "SalesOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CartItem_cartId_salesOfferId_key" ON "CartItem"("cartId", "salesOfferId");
ALTER TABLE "Order" ADD COLUMN "paymentAttentionReason" TEXT, ADD COLUMN "externalRefundReference" TEXT;
CREATE TABLE "SalesOfferPurchase" (
  "id" TEXT NOT NULL,
  "salesOfferId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "allocatedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesOfferPurchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesOfferPurchase_salesOfferId_fkey" FOREIGN KEY ("salesOfferId") REFERENCES "SalesOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesOfferPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SalesOfferPurchase_orderId_salesOfferId_key" ON "SalesOfferPurchase"("orderId", "salesOfferId");
CREATE INDEX "SalesOfferPurchase_salesOfferId_allocatedAt_releasedAt_idx" ON "SalesOfferPurchase"("salesOfferId", "allocatedAt", "releasedAt");
CREATE INDEX "SalesOfferPurchase_salesOfferId_studentUserId_allocatedAt_r_idx" ON "SalesOfferPurchase"("salesOfferId", "studentUserId", "allocatedAt", "releasedAt");
ALTER TABLE "OrderItem" ADD COLUMN "salesOfferPurchaseId" TEXT;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_salesOfferPurchaseId_fkey" FOREIGN KEY ("salesOfferPurchaseId") REFERENCES "SalesOfferPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "OrderItem_salesOfferPurchaseId_idx" ON "OrderItem"("salesOfferPurchaseId");
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_REVIEW';
