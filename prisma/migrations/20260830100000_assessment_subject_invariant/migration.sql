ALTER TABLE "Assessment" ADD COLUMN "subjectId" TEXT;

WITH inferred_subjects AS (
  SELECT
    question."assessmentId",
    MIN(placement."subjectId") AS "subjectId"
  FROM "AssessmentQuestion" question
  JOIN "AssessmentQuestionPlacement" placement
    ON placement."assessmentQuestionId" = question."id"
  GROUP BY question."assessmentId"
  HAVING COUNT(DISTINCT placement."subjectId") = 1
)
UPDATE "Assessment" assessment
SET "subjectId" = inferred_subjects."subjectId"
FROM inferred_subjects
WHERE assessment."id" = inferred_subjects."assessmentId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Assessment" WHERE "subjectId" IS NULL) THEN
    RAISE EXCEPTION
      'Cannot infer one subject for every existing assessment; remediate mixed-subject or missing-placement assessments before applying this migration.';
  END IF;
END $$;

ALTER TABLE "Assessment" ALTER COLUMN "subjectId" SET NOT NULL;

ALTER TABLE "Assessment"
  ADD CONSTRAINT "Assessment_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Assessment_subjectId_status_createdAt_id_idx"
  ON "Assessment"("subjectId", "status", "createdAt", "id");
