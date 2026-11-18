-- Binding inserts and deletion approval/cleanup lock the owner first.
-- Check the marker after acquiring that lock so a waiting insert observes
-- approval even when cleanup failed and the draft still exists.
CREATE FUNCTION guard_deleting_video_upload_target() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."uploadContentItemId" IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW."uploadContentItemId" IS NOT DISTINCT FROM OLD."uploadContentItemId" THEN RETURN NEW; END IF;
  PERFORM id FROM "ContentItem" WHERE id = NEW."uploadContentItemId" FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM "Asset"
    WHERE "uploadContentItemId" = NEW."uploadContentItemId"
      AND "deletionStartedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Video deletion is in progress' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER asset_guard_deleting_video_upload_target
BEFORE INSERT OR UPDATE OF "uploadContentItemId" ON "Asset"
FOR EACH ROW EXECUTE FUNCTION guard_deleting_video_upload_target();
