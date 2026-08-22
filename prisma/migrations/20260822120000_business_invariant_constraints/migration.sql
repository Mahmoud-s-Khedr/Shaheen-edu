-- Assessments have exactly one owner of the type declared by ownerType.
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_owner_matches_type"
  CHECK (
    ("ownerType" = 'STUDENT' AND "studentUserId" IS NOT NULL AND "createdByAdminId" IS NULL)
    OR
    ("ownerType" = 'ADMIN' AND "studentUserId" IS NULL AND "createdByAdminId" IS NOT NULL)
  );

ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_timing_and_count"
  CHECK (
    "questionCount" BETWEEN 1 AND 50
    AND ("durationSeconds" IS NULL OR "durationSeconds" >= 30)
    AND (NOT "isTimed" OR "durationSeconds" IS NOT NULL)
  );

ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lifecycle"
  CHECK (
    ("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL)
    OR
    ("status" = 'READY' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL)
    OR
    ("status" = 'ARCHIVED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NOT NULL)
  );

ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_exactly_one_target"
  CHECK (
    ("courseId" IS NOT NULL)::int
    + ("chapterId" IS NOT NULL)::int
    + ("lessonId" IS NOT NULL)::int
    + ("sectionId" IS NOT NULL)::int = 1
  );

ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_positive_values"
  CHECK (
    "sortOrder" > 0
    AND "maxPoints" > 0
    AND ("timestampSeconds" IS NULL OR "timestampSeconds" >= 0)
  );

ALTER TABLE "AssessmentQuestionAsset" ADD CONSTRAINT "AssessmentQuestionAsset_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "AssessmentQuestionContentBlock" ADD CONSTRAINT "AssessmentQuestionContentBlock_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "AssessmentQuestionContext" ADD CONSTRAINT "AssessmentQuestionContext_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "AssessmentContextContentBlock" ADD CONSTRAINT "AssessmentContextContentBlock_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "AssessmentQuestionOption" ADD CONSTRAINT "AssessmentQuestionOption_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "AssessmentQuestionOptionContentBlock" ADD CONSTRAINT "AssessmentQuestionOptionContentBlock_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_value_bounds"
  CHECK (
    "totalQuestions" > 0
    AND "totalPoints" >= 0
    AND ("score" IS NULL OR ("score" >= 0 AND "score" <= "totalPoints"))
    AND ("expiresAt" IS NULL OR "expiresAt" > "startedAt")
  );

ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_lifecycle"
  CHECK (
    ("status" = 'SUSPENDED' AND "submittedAt" IS NULL)
    OR
    ("status" = 'COMPLETED' AND "submittedAt" IS NOT NULL)
  );

ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_value_bounds"
  CHECK (
    "activeSeconds" >= 0
    AND ("awardedPoints" IS NULL OR "awardedPoints" >= 0)
  );

ALTER TABLE "ManualPaymentMethod" ADD CONSTRAINT "ManualPaymentMethod_sortOrder_positive"
  CHECK ("sortOrder" > 0);

ALTER TABLE "Order" ADD CONSTRAINT "Order_lifecycle"
  CHECK (
    ("status" IN ('AWAITING_PAYMENT', 'SUBMITTED', 'REJECTED') AND "approvedAt" IS NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "approvedAt" IS NULL AND "cancelledAt" IS NOT NULL)
  );

ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_lifecycle"
  CHECK (
    ("status" = 'SUBMITTED' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "rejectionReason" IS NULL)
    OR
    ("status" = 'APPROVED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "rejectionReason" IS NULL)
    OR
    ("status" = 'REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL)
  );
