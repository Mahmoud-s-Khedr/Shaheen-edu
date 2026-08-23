CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "RefundRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "eligibilitySnapshot" JSONB NOT NULL,
  "rejectionReason" TEXT,
  "reviewNote" TEXT,
  "manualRefundReference" TEXT,
  "reviewedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundRequestItem" (
  "id" TEXT NOT NULL,
  "refundRequestId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundRequestItem_orderItemId_key" ON "RefundRequestItem"("orderItemId");
CREATE INDEX "RefundRequest_studentUserId_requestedAt_id_idx" ON "RefundRequest"("studentUserId", "requestedAt", "id");
CREATE INDEX "RefundRequest_orderId_status_requestedAt_idx" ON "RefundRequest"("orderId", "status", "requestedAt");
CREATE INDEX "RefundRequest_status_requestedAt_id_idx" ON "RefundRequest"("status", "requestedAt", "id");
CREATE INDEX "RefundRequestItem_refundRequestId_idx" ON "RefundRequestItem"("refundRequestId");

ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_studentUserId_fkey"
  FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequestItem" ADD CONSTRAINT "RefundRequestItem_refundRequestId_fkey"
  FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequestItem" ADD CONSTRAINT "RefundRequestItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequestItem" ADD CONSTRAINT "RefundRequestItem_valid_amount"
  CHECK ("amountMinor" > 0 AND "currency" = 'EGP');

-- Reversals are compensating ledger entries: originals stay immutable while
-- their linked reversals carry negative basis and amount values.
DROP INDEX "PartnerAllocation_orderItemId_kind_key";
CREATE UNIQUE INDEX "PartnerAllocation_original_order_item_kind_key"
  ON "PartnerAllocation"("orderItemId", "kind") WHERE "reversedAllocationId" IS NULL;
ALTER TABLE "PartnerAllocation" DROP CONSTRAINT "PartnerAllocation_valid_economics";
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_valid_economics"
  CHECK ("basisMinor" <> 0 AND "amountMinor" <> 0 AND abs("basisMinor") >= abs("amountMinor") AND "currency" = 'EGP');
ALTER TABLE "PartnerSettlement" DROP CONSTRAINT "PartnerSettlement_positive_total";
ALTER TABLE "PartnerSettlement" ADD CONSTRAINT "PartnerSettlement_nonzero_total" CHECK ("totalMinor" <> 0);
