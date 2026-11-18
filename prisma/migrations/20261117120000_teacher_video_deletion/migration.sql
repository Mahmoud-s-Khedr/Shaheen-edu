-- CreateEnum
CREATE TYPE "VideoDeletionDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VideoDeletionExecution" AS ENUM ('WAITING', 'IN_PROGRESS', 'FAILED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TEACHER';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "deletionStartedAt" TIMESTAMP(3),
ADD COLUMN     "uploadContentItemId" TEXT;

-- CreateTable
CREATE TABLE "TeacherCourseAssignment" (
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherCourseAssignment_pkey" PRIMARY KEY ("teacherId","courseId")
);

-- CreateTable
CREATE TABLE "VideoDeletionRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "decision" "VideoDeletionDecision" NOT NULL DEFAULT 'PENDING',
    "execution" "VideoDeletionExecution" NOT NULL DEFAULT 'WAITING',
    "reviewerId" TEXT,
    "decisionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureDetails" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherCourseAssignment_courseId_idx" ON "TeacherCourseAssignment"("courseId");

-- CreateIndex
CREATE INDEX "VideoDeletionRequest_requesterId_createdAt_id_idx" ON "VideoDeletionRequest"("requesterId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "VideoDeletionRequest_decision_execution_createdAt_idx" ON "VideoDeletionRequest"("decision", "execution", "createdAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadContentItemId_fkey" FOREIGN KEY ("uploadContentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseAssignment" ADD CONSTRAINT "TeacherCourseAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourseAssignment" ADD CONSTRAINT "TeacherCourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDeletionRequest" ADD CONSTRAINT "VideoDeletionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDeletionRequest" ADD CONSTRAINT "VideoDeletionRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live request per asset, including an approved operation awaiting retry.
CREATE UNIQUE INDEX "VideoDeletionRequest_active_asset_key" ON "VideoDeletionRequest" ("assetId")
WHERE decision = 'PENDING' OR (decision = 'APPROVED' AND execution <> 'COMPLETED');
CREATE INDEX "Asset_uploadContentItemId_idx" ON "Asset" ("uploadContentItemId");

-- Lock the same reference key as application reference writers. FOR SHARE
-- synchronizes new references with the durable deletion marker, even for SQL
-- writers that do not use application helpers. Clearing references is allowed.
CREATE FUNCTION guard_deleting_asset_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_id TEXT; deleting_at TIMESTAMP;
BEGIN
  asset_id := to_jsonb(NEW)->>TG_ARGV[0];
  IF asset_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND asset_id IS NOT DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[0]) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('asset-reference:' || asset_id));
  SELECT "deletionStartedAt" INTO deleting_at FROM "Asset" WHERE id = asset_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset is no longer available' USING ERRCODE = '23503';
  END IF;
  IF deleting_at IS NOT NULL THEN
    RAISE EXCEPTION 'Asset deletion is in progress' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ContentItem_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "primaryAssetId" ON "ContentItem"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('primaryAssetId');
CREATE TRIGGER "AssetReference_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "AssetReference"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "QuestionVideoLink_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "videoAssetId" ON "QuestionVideoLink"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('videoAssetId');
CREATE TRIGGER "AssessmentQuestion_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "videoAssetId" ON "AssessmentQuestion"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('videoAssetId');
CREATE TRIGGER "QuestionAsset_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "QuestionAsset"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "QuestionContentBlock_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "QuestionContentBlock"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "QuestionOptionContentBlock_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "QuestionOptionContentBlock"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "QuestionContextContentBlock_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "QuestionContextContentBlock"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "AssessmentQuestionAsset_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "AssessmentQuestionAsset"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "AssessmentQuestionContentBlock_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "AssessmentQuestionContentBlock"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "AssessmentQuestionOptionContentBlock_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "AssessmentQuestionOptionContentBlock"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "AssessmentContextContentBlock_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "AssessmentContextContentBlock"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "AcademicGrade_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "AcademicGrade"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "Subject_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "Subject"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "Course_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "Course"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "Chapter_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "Chapter"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "Lesson_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "Lesson"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "Section_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "Section"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "SalesOffer_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "coverAssetId" ON "SalesOffer"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('coverAssetId');
CREATE TRIGGER "Testimonial_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "screenshotAssetId" ON "Testimonial"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('screenshotAssetId');
CREATE TRIGGER "QuestionImportBatch_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "sourceAssetId" ON "QuestionImportBatch"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('sourceAssetId');
CREATE TRIGGER "QuestionImportMedia_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "assetId" ON "QuestionImportMedia"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('assetId');
CREATE TRIGGER "ManualPaymentSubmission_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "proofAssetId" ON "ManualPaymentSubmission"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('proofAssetId');

-- Freeze the owning item's replacement/movement until cleanup has completed.
CREATE FUNCTION guard_deleting_video_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset_id TEXT; item_id TEXT; deleting_at TIMESTAMP;
BEGIN
  IF current_setting('edu.video_deletion_cleanup', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'ContentItem' THEN
    asset_id := OLD."primaryAssetId";
    item_id := OLD.id;
  ELSE
    item_id := OLD."contentItemId";
    SELECT "primaryAssetId" INTO asset_id FROM "ContentItem" WHERE id = item_id;
  END IF;
  -- Lock before checking the marker, including assets not yet being deleted.
  -- Approval locks the owner rows before assets, matching these SQL writers.
  FOR deleting_at IN
    SELECT "deletionStartedAt" FROM "Asset"
      WHERE id = asset_id OR "uploadContentItemId" = item_id
      ORDER BY id FOR SHARE
  LOOP
    IF deleting_at IS NOT NULL THEN
      RAISE EXCEPTION 'Video deletion is in progress' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER content_item_guard_deleting_video BEFORE UPDATE OR DELETE ON "ContentItem"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_video_owner();
CREATE TRIGGER content_placement_guard_deleting_video BEFORE UPDATE OR DELETE ON "ContentPlacement"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_video_owner();

-- Upload retries/webhooks must not change remote identity or restore READY
-- after the approval marker is committed.
CREATE FUNCTION guard_deleting_video_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deleting_at TIMESTAMP;
BEGIN
  IF current_setting('edu.video_deletion_cleanup', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'Asset' THEN
    deleting_at := OLD."deletionStartedAt";
  ELSE
    SELECT "deletionStartedAt" INTO deleting_at FROM "Asset" WHERE id = NEW."assetId" FOR SHARE;
  END IF;
  IF deleting_at IS NOT NULL THEN
    RAISE EXCEPTION 'Video deletion is in progress' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER asset_guard_deleting_video_mutation BEFORE UPDATE ON "Asset"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_video_mutation();
CREATE TRIGGER video_asset_guard_deleting_video_mutation BEFORE UPDATE ON "VideoAsset"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_video_mutation();

CREATE TRIGGER "VideoFeedback_guard_deleting_asset" BEFORE INSERT OR UPDATE OF "videoAssetId" ON "VideoFeedback"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_asset_reference('videoAssetId');
