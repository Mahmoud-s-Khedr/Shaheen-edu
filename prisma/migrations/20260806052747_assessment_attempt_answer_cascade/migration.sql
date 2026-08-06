-- Deleting an Assessment cascades to its AssessmentQuestion snapshot rows;
-- attempt answers referencing those questions must cascade too, otherwise a
-- Restrict FK blocks deleting an assessment that already has an attempt.
ALTER TABLE "AssessmentAttemptAnswer" DROP CONSTRAINT "AssessmentAttemptAnswer_assessmentQuestionId_fkey";
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
