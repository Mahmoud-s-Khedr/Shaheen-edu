-- Payment proof assets are single-use. Fail explicitly if legacy data violates
-- the invariant instead of silently discarding or rewriting financial history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ManualPaymentSubmission"
    GROUP BY "proofAssetId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique payment proof assets: duplicate proofAssetId values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "ManualPaymentSubmission_proofAssetId_key"
  ON "ManualPaymentSubmission"("proofAssetId");

CREATE INDEX "ParentAccessSession_activeStudentId_idx"
  ON "ParentAccessSession"("activeStudentId");

CREATE INDEX "AssessmentAttemptAnswer_outcome_answeredAt_idx"
  ON "AssessmentAttemptAnswer"("outcome", "answeredAt");

CREATE INDEX "BunnyStreamWebhookEvent_receivedAt_idx"
  ON "BunnyStreamWebhookEvent"("receivedAt");

CREATE INDEX "CommerceIdempotencyKey_createdAt_idx"
  ON "CommerceIdempotencyKey"("createdAt");
