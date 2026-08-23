CREATE TYPE "PartnerAllocationKind" AS ENUM ('PUBLISHER_SALE', 'REFERRAL_COMMISSION');
CREATE TYPE "PartnerAllocationState" AS ENUM ('PENDING', 'PAYABLE', 'PAID', 'REVERSED');
CREATE TYPE "ReferralProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'SUSPENDED');
CREATE TYPE "ReferralCommissionKind" AS ENUM ('PERCENTAGE', 'FIXED_PER_SALE', 'PERCENTAGE_CAPPED');
CREATE TYPE "AssessmentAttributionRole" AS ENUM ('PRIMARY', 'CONTRIBUTOR', 'UNKNOWN_LEGACY');
CREATE TYPE "ReportExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "PublisherAgreement"
  ADD COLUMN "payoutKind" "ReferralCommissionKind" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "fixedPayoutMinor" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EGP',
  ADD COLUMN "contractReference" TEXT,
  ADD COLUMN "signedDocumentAssetId" TEXT,
  ADD COLUMN "internalNote" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedesId" TEXT,
  ALTER COLUMN "revenueShareBps" DROP NOT NULL;
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PublisherAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PublisherAgreement_supersedesId_idx" ON "PublisherAgreement"("supersedesId");

CREATE TABLE "ReferralProgram" (
  "id" TEXT NOT NULL, "partnerUserId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" "ReferralProgramStatus" NOT NULL DEFAULT 'DRAFT', "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3), "usageLimit" INTEGER, "perStudentUsageLimit" INTEGER,
  "appliesToAll" BOOLEAN NOT NULL DEFAULT true, "courseId" TEXT, "chapterId" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL, "programId" TEXT NOT NULL, "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3),
  "usageLimit" INTEGER, "perStudentUsageLimit" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReferralCommissionRule" (
  "id" TEXT NOT NULL, "programId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "kind" "ReferralCommissionKind" NOT NULL, "percentageBps" INTEGER, "fixedCommissionMinor" INTEGER,
  "maximumCommissionMinor" INTEGER, "currency" TEXT NOT NULL DEFAULT 'EGP', "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3), "isActive" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCommissionRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderReferralAttribution" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "studentUserId" TEXT NOT NULL,
  "referralCodeId" TEXT NOT NULL, "referralProgramId" TEXT NOT NULL, "ruleId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReferralAttribution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartnerAllocation" (
  "id" TEXT NOT NULL, "kind" "PartnerAllocationKind" NOT NULL, "state" "PartnerAllocationState" NOT NULL DEFAULT 'PAYABLE',
  "partnerUserId" TEXT NOT NULL, "orderItemId" TEXT NOT NULL, "publisherAgreementId" TEXT, "referralRuleId" TEXT,
  "basisMinor" INTEGER NOT NULL, "amountMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL, "reversedAllocationId" TEXT, "payableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3), "reversedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartnerSettlement" (
  "id" TEXT NOT NULL, "partnerUserId" TEXT NOT NULL, "paymentReference" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EGP', "totalMinor" INTEGER NOT NULL, "createdById" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerSettlement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PartnerSettlementLine" (
  "settlementId" TEXT NOT NULL, "allocationId" TEXT NOT NULL,
  CONSTRAINT "PartnerSettlementLine_pkey" PRIMARY KEY ("settlementId", "allocationId")
);
CREATE TABLE "AssessmentQuestionAttribution" (
  "id" TEXT NOT NULL, "assessmentQuestionId" TEXT NOT NULL, "sourceId" TEXT, "sourceTitle" TEXT,
  "sourceType" "QuestionSourceType", "publisherUserId" TEXT, "publisherDisplayName" TEXT,
  "role" "AssessmentAttributionRole" NOT NULL DEFAULT 'PRIMARY', "weightBps" INTEGER NOT NULL DEFAULT 10000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AssessmentQuestionAttribution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReportExportJob" (
  "id" TEXT NOT NULL, "requestedById" TEXT NOT NULL, "reportType" TEXT NOT NULL, "filters" JSONB NOT NULL,
  "columns" JSONB NOT NULL, "reason" TEXT, "containsPii" BOOLEAN NOT NULL DEFAULT false,
  "status" "ReportExportStatus" NOT NULL DEFAULT 'QUEUED', "storageKey" TEXT, "rowCount" INTEGER,
  "error" TEXT, "expiresAt" TIMESTAMP(3), "downloadedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportExportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE UNIQUE INDEX "ReferralCommissionRule_programId_version_key" ON "ReferralCommissionRule"("programId", "version");
CREATE UNIQUE INDEX "OrderReferralAttribution_orderId_key" ON "OrderReferralAttribution"("orderId");
CREATE UNIQUE INDEX "PartnerAllocation_idempotencyKey_key" ON "PartnerAllocation"("idempotencyKey");
CREATE UNIQUE INDEX "PartnerAllocation_reversedAllocationId_key" ON "PartnerAllocation"("reversedAllocationId");
CREATE UNIQUE INDEX "PartnerAllocation_orderItemId_kind_key" ON "PartnerAllocation"("orderItemId", "kind");
CREATE UNIQUE INDEX "PartnerSettlement_paymentReference_key" ON "PartnerSettlement"("paymentReference");
CREATE UNIQUE INDEX "PartnerSettlementLine_allocationId_key" ON "PartnerSettlementLine"("allocationId");
CREATE UNIQUE INDEX "AssessmentQuestionAttribution_assessmentQuestionId_role_sourceId_publisherUserId_key" ON "AssessmentQuestionAttribution"("assessmentQuestionId", "role", "sourceId", "publisherUserId");
CREATE INDEX "PartnerAllocation_partnerUserId_state_createdAt_idx" ON "PartnerAllocation"("partnerUserId", "state", "createdAt");
CREATE INDEX "AssessmentQuestionAttribution_publisherUserId_createdAt_idx" ON "AssessmentQuestionAttribution"("publisherUserId", "createdAt");
CREATE INDEX "ReportExportJob_requestedById_status_createdAt_idx" ON "ReportExportJob"("requestedById", "status", "createdAt");
CREATE INDEX "ReportExportJob_status_createdAt_idx" ON "ReportExportJob"("status", "createdAt");

ALTER TABLE "PublisherAgreement"
  DROP CONSTRAINT "PublisherAgreement_valid_terms",
  ADD CONSTRAINT "PublisherAgreement_valid_payout"
    CHECK (
      ("payoutKind" = 'PERCENTAGE' AND "revenueShareBps" BETWEEN 0 AND 10000 AND "fixedPayoutMinor" IS NULL)
      OR
      ("payoutKind" = 'FIXED_PER_SALE' AND "fixedPayoutMinor" > 0 AND "revenueShareBps" IS NULL AND "currency" = 'EGP')
    ),
  ADD CONSTRAINT "PublisherAgreement_valid_dates" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "ReferralProgram"
  ADD CONSTRAINT "ReferralProgram_valid_scope"
    CHECK (
      ("appliesToAll" AND "courseId" IS NULL AND "chapterId" IS NULL)
      OR
      (NOT "appliesToAll" AND num_nonnulls("courseId", "chapterId") = 1)
    ),
  ADD CONSTRAINT "ReferralProgram_positive_limits"
    CHECK (("usageLimit" IS NULL OR "usageLimit" > 0) AND ("perStudentUsageLimit" IS NULL OR "perStudentUsageLimit" > 0));

ALTER TABLE "ReferralCode"
  ADD CONSTRAINT "ReferralCode_positive_limits"
    CHECK (("usageLimit" IS NULL OR "usageLimit" > 0) AND ("perStudentUsageLimit" IS NULL OR "perStudentUsageLimit" > 0));

ALTER TABLE "ReferralCommissionRule"
  ADD CONSTRAINT "ReferralCommissionRule_valid_terms"
    CHECK (
      ("kind" = 'PERCENTAGE' AND "percentageBps" BETWEEN 0 AND 10000 AND "fixedCommissionMinor" IS NULL AND "maximumCommissionMinor" IS NULL)
      OR
      ("kind" = 'FIXED_PER_SALE' AND "fixedCommissionMinor" > 0 AND "percentageBps" IS NULL AND "maximumCommissionMinor" IS NULL)
      OR
      ("kind" = 'PERCENTAGE_CAPPED' AND "percentageBps" BETWEEN 0 AND 10000 AND "maximumCommissionMinor" > 0 AND "fixedCommissionMinor" IS NULL)
    ),
  ADD CONSTRAINT "ReferralCommissionRule_egp_currency" CHECK ("currency" = 'EGP');

ALTER TABLE "PartnerAllocation"
  ADD CONSTRAINT "PartnerAllocation_valid_economics"
    CHECK ("basisMinor" >= "amountMinor" AND "amountMinor" > 0 AND "currency" = 'EGP'),
  ADD CONSTRAINT "PartnerAllocation_valid_origin"
    CHECK (
      ("kind" = 'PUBLISHER_SALE' AND "publisherAgreementId" IS NOT NULL AND "referralRuleId" IS NULL)
      OR
      ("kind" = 'REFERRAL_COMMISSION' AND "publisherAgreementId" IS NULL AND "referralRuleId" IS NOT NULL)
    );

ALTER TABLE "PartnerSettlement"
  ADD CONSTRAINT "PartnerSettlement_positive_total" CHECK ("totalMinor" > 0);

ALTER TABLE "AssessmentQuestionAttribution"
  ADD CONSTRAINT "AssessmentQuestionAttribution_valid_weight" CHECK ("weightBps" BETWEEN 0 AND 10000);

-- Allocation economics and snapshots are append-only. Settlement and reversal
-- state transitions remain permitted, but direct financial rewrites do not.
CREATE FUNCTION "prevent_partner_allocation_economic_mutation"() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."partnerUserId" IS DISTINCT FROM OLD."partnerUserId"
    OR NEW."orderItemId" IS DISTINCT FROM OLD."orderItemId"
    OR NEW."publisherAgreementId" IS DISTINCT FROM OLD."publisherAgreementId"
    OR NEW."referralRuleId" IS DISTINCT FROM OLD."referralRuleId"
    OR NEW."basisMinor" IS DISTINCT FROM OLD."basisMinor"
    OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."payableAt" IS DISTINCT FROM OLD."payableAt"
  THEN RAISE EXCEPTION 'PartnerAllocation economic fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PartnerAllocation_prevent_economic_mutation"
  BEFORE UPDATE ON "PartnerAllocation"
  FOR EACH ROW EXECUTE FUNCTION "prevent_partner_allocation_economic_mutation"();

-- Commission terms are versioned; activation is the only mutable rule field.
CREATE FUNCTION "prevent_referral_rule_term_mutation"() RETURNS trigger AS $$
BEGIN
  IF NEW."programId" IS DISTINCT FROM OLD."programId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."percentageBps" IS DISTINCT FROM OLD."percentageBps"
    OR NEW."fixedCommissionMinor" IS DISTINCT FROM OLD."fixedCommissionMinor"
    OR NEW."maximumCommissionMinor" IS DISTINCT FROM OLD."maximumCommissionMinor"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
    OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
  THEN RAISE EXCEPTION 'ReferralCommissionRule terms are immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ReferralCommissionRule_prevent_term_mutation"
  BEFORE UPDATE ON "ReferralCommissionRule"
  FOR EACH ROW EXECUTE FUNCTION "prevent_referral_rule_term_mutation"();

ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralCommissionRule" ADD CONSTRAINT "ReferralCommissionRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_referralProgramId_fkey" FOREIGN KEY ("referralProgramId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReferralCommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_publisherAgreementId_fkey" FOREIGN KEY ("publisherAgreementId") REFERENCES "PublisherAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_referralRuleId_fkey" FOREIGN KEY ("referralRuleId") REFERENCES "ReferralCommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_reversedAllocationId_fkey" FOREIGN KEY ("reversedAllocationId") REFERENCES "PartnerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlement" ADD CONSTRAINT "PartnerSettlement_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlementLine" ADD CONSTRAINT "PartnerSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PartnerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlementLine" ADD CONSTRAINT "PartnerSettlementLine_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PartnerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentQuestionAttribution" ADD CONSTRAINT "AssessmentQuestionAttribution_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportExportJob" ADD CONSTRAINT "ReportExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
