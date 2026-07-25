-- Question authoring: multi-correct types and multi-scope placement.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'MULTIPLE_CHOICE';

ALTER TABLE "Question" ADD COLUMN "courseId" TEXT;
UPDATE "Question" q SET "courseId" = c."courseId" FROM "Chapter" c WHERE c."id" = q."chapterId";
ALTER TABLE "Question" ALTER COLUMN "courseId" SET NOT NULL;

CREATE TABLE "QuestionPlacement" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "lessonId" TEXT,
  "sectionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionPlacement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestionPlacement_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int + ("lessonId" IS NOT NULL)::int + ("sectionId" IS NOT NULL)::int = 1)
);
INSERT INTO "QuestionPlacement" ("id", "questionId", "chapterId")
SELECT 'legacy_' || q."id", q."id", q."chapterId" FROM "Question" q;

ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Question_courseId_status_idx" ON "Question"("courseId", "status");
CREATE INDEX "QuestionPlacement_questionId_idx" ON "QuestionPlacement"("questionId");
CREATE UNIQUE INDEX "QuestionPlacement_question_course_key" ON "QuestionPlacement"("questionId", "courseId") WHERE "courseId" IS NOT NULL;
CREATE UNIQUE INDEX "QuestionPlacement_question_chapter_key" ON "QuestionPlacement"("questionId", "chapterId") WHERE "chapterId" IS NOT NULL;
CREATE UNIQUE INDEX "QuestionPlacement_question_lesson_key" ON "QuestionPlacement"("questionId", "lessonId") WHERE "lessonId" IS NOT NULL;
CREATE UNIQUE INDEX "QuestionPlacement_question_section_key" ON "QuestionPlacement"("questionId", "sectionId") WHERE "sectionId" IS NOT NULL;

ALTER TABLE "Question" DROP CONSTRAINT "Question_chapterId_fkey";
DROP INDEX "Question_chapterId_status_idx";
ALTER TABLE "Question" DROP COLUMN "chapterId";
ALTER TABLE "Question" ADD CONSTRAINT "Question_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "QuestionPlacement_matches_question_course"() RETURNS trigger AS $$
DECLARE resolved_course_id TEXT;
BEGIN
  IF NEW."courseId" IS NOT NULL THEN resolved_course_id := NEW."courseId";
  ELSIF NEW."chapterId" IS NOT NULL THEN SELECT "courseId" INTO resolved_course_id FROM "Chapter" WHERE "id" = NEW."chapterId";
  ELSIF NEW."lessonId" IS NOT NULL THEN SELECT c."courseId" INTO resolved_course_id FROM "Lesson" l JOIN "Chapter" c ON c."id" = l."chapterId" WHERE l."id" = NEW."lessonId";
  ELSE SELECT c."courseId" INTO resolved_course_id FROM "Section" s JOIN "Lesson" l ON l."id" = s."lessonId" JOIN "Chapter" c ON c."id" = l."chapterId" WHERE s."id" = NEW."sectionId";
  END IF;
  IF resolved_course_id IS DISTINCT FROM (SELECT "courseId" FROM "Question" WHERE "id" = NEW."questionId") THEN RAISE EXCEPTION 'Question placement must belong to the question course'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "QuestionPlacement_matches_question_course_trigger" BEFORE INSERT OR UPDATE ON "QuestionPlacement" FOR EACH ROW EXECUTE FUNCTION "QuestionPlacement_matches_question_course"();

ALTER TABLE "Question" ADD CONSTRAINT "Question_lifecycle" CHECK (
  ("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL AND "reviewedAt" IS NULL AND "reviewedById" IS NULL) OR
  ("status" = 'IN_REVIEW' AND "publishedAt" IS NULL AND "archivedAt" IS NULL AND "reviewedAt" IS NULL AND "reviewedById" IS NULL) OR
  ("status" = 'REJECTED' AND "publishedAt" IS NULL AND "archivedAt" IS NULL AND "reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL AND "reviewNote" IS NOT NULL) OR
  ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL AND "reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL) OR
  ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL AND (("reviewedAt" IS NULL AND "reviewedById" IS NULL) OR ("reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL)))
);
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_sortOrder_positive" CHECK ("sortOrder" > 0);
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_sortOrder_positive" CHECK ("sortOrder" > 0);
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_sortOrder_positive" CHECK ("sortOrder" > 0);

-- Authorization audit chains and entitlement state.
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentEntitlement" DROP CONSTRAINT "StudentEntitlement_studentUserId_fkey";
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherEarningsStatement" ADD CONSTRAINT "PublisherEarningsStatement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_temporal_and_revoke_state" CHECK (("expiresAt" IS NULL OR "expiresAt" > "startsAt") AND (("status" = 'ACTIVE' AND "revokedAt" IS NULL AND "revokedById" IS NULL) OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedById" IS NOT NULL)));
CREATE UNIQUE INDEX "StudentEntitlement_one_active_course" ON "StudentEntitlement"("studentUserId", "courseId") WHERE "status" = 'ACTIVE' AND "courseId" IS NOT NULL;
CREATE UNIQUE INDEX "StudentEntitlement_one_active_chapter" ON "StudentEntitlement"("studentUserId", "chapterId") WHERE "status" = 'ACTIVE' AND "chapterId" IS NOT NULL;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_replacedBySessionId_fkey" FOREIGN KEY ("replacedBySessionId") REFERENCES "AuthSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_parentPhoneNormalized_key" UNIQUE ("userId", "parentPhoneNormalized");
ALTER TABLE "ParentAccessSession" ADD CONSTRAINT "ParentAccessSession_activeStudent_parentPhone_fkey" FOREIGN KEY ("activeStudentId", "parentPhoneNormalized") REFERENCES "StudentProfile"("userId", "parentPhoneNormalized") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial correctness.
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_valid_terms" CHECK ("revenueShareBps" BETWEEN 0 AND 10000 AND ("endsAt" IS NULL OR "endsAt" > "startsAt"));
ALTER TABLE "PublisherEarningsStatement" ADD CONSTRAINT "PublisherEarningsStatement_valid_values" CHECK ("revenueShareBps" BETWEEN 0 AND 10000 AND "grossRevenueMinor" >= 0 AND "publisherEarningsMinor" >= 0 AND "periodEndsAt" > "periodStartsAt" AND char_length("currency") = 3);
CREATE UNIQUE INDEX "PublisherEarningsStatement_agreement_period_key" ON "PublisherEarningsStatement"("agreementId", "periodStartsAt", "periodEndsAt");
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_primary_course_no_overlap" EXCLUDE USING gist ("courseId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("status" = 'ACTIVE' AND "isPrimary" AND "courseId" IS NOT NULL);
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_primary_chapter_no_overlap" EXCLUDE USING gist ("chapterId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("status" = 'ACTIVE' AND "isPrimary" AND "chapterId" IS NOT NULL);
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_primary_lesson_no_overlap" EXCLUDE USING gist ("lessonId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("status" = 'ACTIVE' AND "isPrimary" AND "lessonId" IS NOT NULL);

CREATE OR REPLACE FUNCTION "PublisherAgreement_requires_content_publisher"() RETURNS trigger AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "PartnerProfile" WHERE "userId" = NEW."publisherUserId" AND "partnerType" = 'CONTENT_PUBLISHER') THEN RAISE EXCEPTION 'Publisher agreement requires a content publisher'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PublisherAgreement_requires_content_publisher_trigger" BEFORE INSERT OR UPDATE ON "PublisherAgreement" FOR EACH ROW EXECUTE FUNCTION "PublisherAgreement_requires_content_publisher"();

CREATE OR REPLACE FUNCTION "PublisherEarningsStatement_agreement_covers_target"() RETURNS trigger AS $$
DECLARE a "PublisherAgreement"%ROWTYPE; target_course TEXT;
BEGIN
  SELECT * INTO a FROM "PublisherAgreement" WHERE "id" = NEW."agreementId";
  IF NEW."courseId" IS NOT NULL THEN target_course := NEW."courseId";
  ELSIF NEW."chapterId" IS NOT NULL THEN SELECT "courseId" INTO target_course FROM "Chapter" WHERE "id" = NEW."chapterId";
  ELSE SELECT c."courseId" INTO target_course FROM "Lesson" l JOIN "Chapter" c ON c."id" = l."chapterId" WHERE l."id" = NEW."lessonId";
  END IF;
  IF (a."courseId" IS NOT NULL AND a."courseId" = target_course) OR (a."chapterId" IS NOT NULL AND (a."chapterId" = NEW."chapterId" OR a."chapterId" = (SELECT "chapterId" FROM "Lesson" WHERE "id" = NEW."lessonId"))) OR (a."lessonId" IS NOT NULL AND a."lessonId" = NEW."lessonId") THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Earnings statement target is not covered by its agreement';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PublisherEarningsStatement_agreement_covers_target_trigger" BEFORE INSERT OR UPDATE ON "PublisherEarningsStatement" FOR EACH ROW EXECUTE FUNCTION "PublisherEarningsStatement_agreement_covers_target"();

-- Asset/video consistency, pricing, and operations.
ALTER TABLE "QuestionVideoLink" DROP CONSTRAINT "QuestionVideoLink_videoAssetId_fkey";
ALTER TABLE "QuestionVideoLink" ADD CONSTRAINT "QuestionVideoLink_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "VideoAsset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION "VideoAsset_requires_video_asset"() RETURNS trigger AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Asset" WHERE "id" = NEW."assetId" AND "kind" = 'VIDEO' AND "provider" = 'BUNNY_STREAM') THEN RAISE EXCEPTION 'VideoAsset requires a Bunny Stream VIDEO asset'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "VideoAsset_requires_video_asset_trigger" BEFORE INSERT OR UPDATE ON "VideoAsset" FOR EACH ROW EXECUTE FUNCTION "VideoAsset_requires_video_asset"();
ALTER TABLE "Course" ADD CONSTRAINT "Course_pricing_coherent" CHECK (("isPurchasable" AND "priceMinor" IS NOT NULL AND "priceMinor" >= 0 AND char_length("currency") = 3) OR (NOT "isPurchasable" AND "priceMinor" IS NULL AND "currency" IS NULL));
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_pricing_coherent" CHECK (("isPurchasable" IS TRUE AND "priceMinor" IS NOT NULL AND "priceMinor" >= 0 AND char_length("currency") = 3) OR (("isPurchasable" IS FALSE OR "isPurchasable" IS NULL) AND "priceMinor" IS NULL AND "currency" IS NULL));
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_pricing_coherent" CHECK (("isPurchasable" IS TRUE AND "priceMinor" IS NOT NULL AND "priceMinor" >= 0 AND char_length("currency") = 3) OR (("isPurchasable" IS FALSE OR "isPurchasable" IS NULL) AND "priceMinor" IS NULL AND "currency" IS NULL));
CREATE INDEX "AcademicGrade_coverAssetId_idx" ON "AcademicGrade"("coverAssetId");
CREATE INDEX "Subject_coverAssetId_idx" ON "Subject"("coverAssetId");
CREATE INDEX "Course_coverAssetId_idx" ON "Course"("coverAssetId");
CREATE INDEX "Chapter_coverAssetId_idx" ON "Chapter"("coverAssetId");
CREATE INDEX "Lesson_coverAssetId_idx" ON "Lesson"("coverAssetId");
CREATE INDEX "Section_coverAssetId_idx" ON "Section"("coverAssetId");
CREATE INDEX "ContentItem_primaryAssetId_idx" ON "ContentItem"("primaryAssetId");
CREATE INDEX "AssetReference_assetId_idx" ON "AssetReference"("assetId");
CREATE INDEX "QuestionAsset_assetId_idx" ON "QuestionAsset"("assetId");
ALTER TABLE "BunnyStreamWebhookEvent" ADD COLUMN "processedAt" TIMESTAMP(3), ADD COLUMN "retentionExpiresAt" TIMESTAMP(3);
CREATE INDEX "BunnyStreamWebhookEvent_bunnyVideoId_idx" ON "BunnyStreamWebhookEvent"("bunnyVideoId");
CREATE INDEX "BunnyStreamWebhookEvent_retentionExpiresAt_idx" ON "BunnyStreamWebhookEvent"("retentionExpiresAt");

-- Managed geography; current free-text values seed the initial reference data.
CREATE TABLE "Governorate" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Governorate_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Governorate_name_key" ON "Governorate"("name");
CREATE TABLE "Center" ("id" TEXT NOT NULL, "governorateId" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Center_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Center_governorateId_name_key" ON "Center"("governorateId", "name");
CREATE INDEX "Center_governorateId_idx" ON "Center"("governorateId");
ALTER TABLE "Center" ADD CONSTRAINT "Center_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "Governorate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD COLUMN "governorateId" TEXT, ADD COLUMN "centerId" TEXT;
INSERT INTO "Governorate" ("id", "name", "updatedAt") SELECT 'gov_' || md5("governorate"), "governorate", CURRENT_TIMESTAMP FROM "StudentProfile" GROUP BY "governorate";
UPDATE "StudentProfile" s SET "governorateId" = g."id" FROM "Governorate" g WHERE g."name" = s."governorate";
INSERT INTO "Center" ("id", "governorateId", "name", "updatedAt") SELECT 'ctr_' || md5(s."governorate" || ':' || s."center"), g."id", s."center", CURRENT_TIMESTAMP FROM "StudentProfile" s JOIN "Governorate" g ON g."name" = s."governorate" WHERE s."center" IS NOT NULL GROUP BY g."id", s."governorate", s."center";
UPDATE "StudentProfile" s SET "centerId" = c."id" FROM "Center" c WHERE c."governorateId" = s."governorateId" AND c."name" = s."center";
ALTER TABLE "StudentProfile" ALTER COLUMN "governorateId" SET NOT NULL;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "Governorate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StudentProfile_governorateId_idx" ON "StudentProfile"("governorateId");
CREATE INDEX "StudentProfile_centerId_idx" ON "StudentProfile"("centerId");
