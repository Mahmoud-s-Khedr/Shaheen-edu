-- AlterTable
ALTER TABLE "SalesOffer" ADD COLUMN     "creditRewardMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstPurchaseEligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "creditAppliedMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rewardsSnapshot" JSONB;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "creditAppliedMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RefundRequestItem" ADD COLUMN     "creditReturnMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StudentCreditAccount" (
    "studentUserId" TEXT NOT NULL,
    "debtMinor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StudentCreditAccount_pkey" PRIMARY KEY ("studentUserId")
);

-- CreateTable
CREATE TABLE "StudentCreditGrant" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "remainingMinor" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCreditEntry" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "availableDeltaMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCreditReservation" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCreditAllocation" (
    "returnedMinor" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "StudentCreditAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRewardsSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentRewardsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInviteCode" (
    "studentUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StudentInviteCode_pkey" PRIMARY KEY ("studentUserId")
);

-- CreateTable
CREATE TABLE "StudentReferral" (
    "id" TEXT NOT NULL,
    "invitedStudentId" TEXT NOT NULL,
    "referrerStudentId" TEXT NOT NULL,
    "codeOwnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reviewReason" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentRewardAward" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "grantSourceKey" TEXT NOT NULL,
    "eligibilitySnapshot" JSONB NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentRewardAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentCreditGrant_sourceKey_key" ON "StudentCreditGrant"("sourceKey");

-- CreateIndex
CREATE INDEX "StudentCreditGrant_studentUserId_expiresAt_idx" ON "StudentCreditGrant"("studentUserId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCreditEntry_key_key" ON "StudentCreditEntry"("key");

-- CreateIndex
CREATE INDEX "StudentCreditEntry_studentUserId_createdAt_id_idx" ON "StudentCreditEntry"("studentUserId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCreditReservation_orderId_key" ON "StudentCreditReservation"("orderId");

-- CreateIndex
CREATE INDEX "StudentCreditReservation_studentUserId_status_idx" ON "StudentCreditReservation"("studentUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCreditAllocation_reservationId_grantId_key" ON "StudentCreditAllocation"("reservationId", "grantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInviteCode_code_key" ON "StudentInviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StudentReferral_invitedStudentId_key" ON "StudentReferral"("invitedStudentId");

-- CreateIndex
CREATE INDEX "StudentReferral_referrerStudentId_createdAt_idx" ON "StudentReferral"("referrerStudentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentRewardAward_key_key" ON "StudentRewardAward"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StudentRewardAward_grantSourceKey_key" ON "StudentRewardAward"("grantSourceKey");

-- CreateIndex
CREATE INDEX "StudentRewardAward_orderId_idx" ON "StudentRewardAward"("orderId");

-- CreateIndex
CREATE INDEX "StudentRewardAward_studentUserId_kind_idx" ON "StudentRewardAward"("studentUserId", "kind");

-- AddForeignKey
ALTER TABLE "StudentCreditAccount" ADD CONSTRAINT "StudentCreditAccount_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCreditGrant" ADD CONSTRAINT "StudentCreditGrant_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentCreditAccount"("studentUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCreditEntry" ADD CONSTRAINT "StudentCreditEntry_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentCreditAccount"("studentUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCreditReservation" ADD CONSTRAINT "StudentCreditReservation_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentCreditAccount"("studentUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCreditReservation" ADD CONSTRAINT "StudentCreditReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCreditAllocation" ADD CONSTRAINT "StudentCreditAllocation_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StudentCreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCreditAllocation" ADD CONSTRAINT "StudentCreditAllocation_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "StudentCreditGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInviteCode" ADD CONSTRAINT "StudentInviteCode_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentReferral" ADD CONSTRAINT "StudentReferral_invitedStudentId_fkey" FOREIGN KEY ("invitedStudentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentReferral" ADD CONSTRAINT "StudentReferral_referrerStudentId_fkey" FOREIGN KEY ("referrerStudentId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentReferral" ADD CONSTRAINT "StudentReferral_codeOwnerId_fkey" FOREIGN KEY ("codeOwnerId") REFERENCES "StudentInviteCode"("studentUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRewardAward" ADD CONSTRAINT "StudentRewardAward_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentRewardAward" ADD CONSTRAINT "StudentRewardAward_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep financial and lifecycle invariants enforceable below the API layer.
ALTER TABLE "StudentCreditAccount" ADD CONSTRAINT "StudentCreditAccount_debt_check" CHECK ("debtMinor" >= 0);
ALTER TABLE "StudentCreditGrant" ADD CONSTRAINT "StudentCreditGrant_amount_check" CHECK ("amountMinor" > 0 AND "remainingMinor" >= 0 AND "remainingMinor" <= "amountMinor");
ALTER TABLE "StudentCreditReservation" ADD CONSTRAINT "StudentCreditReservation_amount_check" CHECK ("amountMinor" > 0), ADD CONSTRAINT "StudentCreditReservation_status_check" CHECK ("status" IN ('RESERVED', 'SPENT', 'RELEASED'));
ALTER TABLE "StudentCreditAllocation" ADD CONSTRAINT "StudentCreditAllocation_amount_check" CHECK ("amountMinor" > 0 AND "returnedMinor" >= 0 AND "returnedMinor" <= "amountMinor");
ALTER TABLE "StudentReferral" ADD CONSTRAINT "StudentReferral_distinct_students_check" CHECK ("invitedStudentId" <> "referrerStudentId"), ADD CONSTRAINT "StudentReferral_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED'));
ALTER TABLE "StudentRewardAward" ADD CONSTRAINT "StudentRewardAward_amount_check" CHECK ("amountMinor" >= 0), ADD CONSTRAINT "StudentRewardAward_kind_check" CHECK ("kind" IN ('FIRST_PURCHASE', 'REFERRER', 'INVITED_STUDENT', 'BUNDLE'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_credit_check" CHECK ("creditAppliedMinor" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_credit_check" CHECK ("creditAppliedMinor" >= 0 AND "creditAppliedMinor" <= "priceMinor");
ALTER TABLE "SalesOffer" ADD CONSTRAINT "SalesOffer_credit_reward_check" CHECK ("creditRewardMinor" >= 0);
ALTER TABLE "RefundRequestItem" ADD CONSTRAINT "RefundRequestItem_credit_return_check" CHECK ("creditReturnMinor" >= 0);
