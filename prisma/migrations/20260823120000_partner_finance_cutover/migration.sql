-- Development-only finance cutover: legacy statements were never a source of
-- record and are intentionally retired in favour of immutable allocations.
DROP TABLE IF EXISTS "PublisherEarningsStatement";

CREATE TYPE "PartnerFinanceReconciliationStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED');
CREATE TYPE "PartnerFinanceDiscrepancySeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');
CREATE TYPE "PartnerFinanceDiscrepancyStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'ACCEPTED');

CREATE TABLE "RefundPolicy" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "eligibilityWindowDays" INTEGER NOT NULL,
  "maximumConsumptionBps" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefundPolicy_version_key" ON "RefundPolicy"("version");
CREATE UNIQUE INDEX "RefundPolicy_one_active_key" ON "RefundPolicy"("isActive") WHERE "isActive";
CREATE INDEX "RefundPolicy_isActive_createdAt_idx" ON "RefundPolicy"("isActive", "createdAt");
ALTER TABLE "RefundPolicy" ADD CONSTRAINT "RefundPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundPolicy" ADD CONSTRAINT "RefundPolicy_values_check" CHECK ("eligibilityWindowDays" > 0 AND "maximumConsumptionBps" BETWEEN 1 AND 10000);

CREATE TABLE "PartnerFinanceReconciliationRun" (
  "id" TEXT NOT NULL,
  "pilotLabel" TEXT NOT NULL,
  "status" "PartnerFinanceReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
  "summary" JSONB,
  "createdById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerFinanceReconciliationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerFinanceReconciliationRun_status_createdAt_idx" ON "PartnerFinanceReconciliationRun"("status", "createdAt");
ALTER TABLE "PartnerFinanceReconciliationRun" ADD CONSTRAINT "PartnerFinanceReconciliationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PartnerFinanceReconciliationOrder" (
  "runId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  CONSTRAINT "PartnerFinanceReconciliationOrder_pkey" PRIMARY KEY ("runId", "orderId")
);
ALTER TABLE "PartnerFinanceReconciliationOrder" ADD CONSTRAINT "PartnerFinanceReconciliationOrder_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PartnerFinanceReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerFinanceReconciliationOrder" ADD CONSTRAINT "PartnerFinanceReconciliationOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PartnerFinanceDiscrepancy" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "expectedAmountMinor" INTEGER,
  "actualAmountMinor" INTEGER,
  "expectedBasisMinor" INTEGER,
  "actualBasisMinor" INTEGER,
  "currency" TEXT,
  "orderItemId" TEXT,
  "allocationId" TEXT,
  "partnerUserId" TEXT,
  "severity" "PartnerFinanceDiscrepancySeverity" NOT NULL,
  "status" "PartnerFinanceDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT,
  "notes" TEXT,
  "resolutionNote" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerFinanceDiscrepancy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerFinanceDiscrepancy_runId_status_severity_idx" ON "PartnerFinanceDiscrepancy"("runId", "status", "severity");
CREATE INDEX "PartnerFinanceDiscrepancy_orderItemId_idx" ON "PartnerFinanceDiscrepancy"("orderItemId");
CREATE INDEX "PartnerFinanceDiscrepancy_allocationId_idx" ON "PartnerFinanceDiscrepancy"("allocationId");
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PartnerFinanceReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PartnerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
