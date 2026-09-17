-- A student can give a written comment, a star rating, or both. The request
-- validator still requires at least one of the two fields.
ALTER TABLE "VideoFeedback"
  ALTER COLUMN "comment" DROP NOT NULL,
  ALTER COLUMN "rating" DROP NOT NULL;
