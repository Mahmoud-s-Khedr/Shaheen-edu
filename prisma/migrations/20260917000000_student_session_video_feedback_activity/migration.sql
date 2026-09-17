-- Feedback is tied to our internal video-asset key, never to a Bunny ID or
-- a content item. The VideoAsset FK also prevents feedback on non-video assets.
CREATE TABLE "VideoFeedback" (
  "id" TEXT NOT NULL,
  "videoAssetId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VideoFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VideoFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "VideoFeedback_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "VideoAsset"("assetId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VideoFeedback_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VideoFeedback_studentUserId_videoAssetId_key" ON "VideoFeedback"("studentUserId", "videoAssetId");
CREATE INDEX "VideoFeedback_videoAssetId_createdAt_idx" ON "VideoFeedback"("videoAssetId", "createdAt");
CREATE INDEX "ContentItem_primaryAssetId_idx" ON "ContentItem"("primaryAssetId");

-- ContentItem.primaryAssetId intentionally remains non-unique because documents
-- and PDFs may be primary for more than one item. Serialize by video key and
-- reject only a second owner of a VIDEO asset, including direct SQL writers.
CREATE OR REPLACE FUNCTION enforce_one_primary_content_item_per_video()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."primaryAssetId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "Asset" WHERE id = NEW."primaryAssetId" AND kind = 'VIDEO'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."primaryAssetId", 0));

  IF EXISTS (
    SELECT 1
    FROM "ContentItem"
    WHERE "primaryAssetId" = NEW."primaryAssetId" AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'VIDEO_ALREADY_ASSIGNED_TO_CONTENT_ITEM'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_item_one_primary_owner_per_video
BEFORE INSERT OR UPDATE OF "primaryAssetId" ON "ContentItem"
FOR EACH ROW EXECUTE FUNCTION enforce_one_primary_content_item_per_video();
