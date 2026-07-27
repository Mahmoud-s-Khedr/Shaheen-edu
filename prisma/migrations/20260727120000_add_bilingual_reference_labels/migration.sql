-- Shared reference data is bilingual. Existing values are Arabic; English is
-- intentionally left null until an administrator supplies the translation.
ALTER TABLE "AcademicGrade"
  ADD COLUMN "titleAr" TEXT,
  ADD COLUMN "titleEn" TEXT,
  ADD COLUMN "descriptionAr" TEXT,
  ADD COLUMN "descriptionEn" TEXT;
UPDATE "AcademicGrade" SET "titleAr" = "title", "descriptionAr" = "description";
ALTER TABLE "AcademicGrade" ALTER COLUMN "titleAr" SET NOT NULL;
ALTER TABLE "AcademicGrade" DROP COLUMN "title", DROP COLUMN "description";

ALTER TABLE "QuestionSource"
  ADD COLUMN "titleAr" TEXT,
  ADD COLUMN "titleEn" TEXT,
  ADD COLUMN "noteAr" TEXT,
  ADD COLUMN "noteEn" TEXT;
UPDATE "QuestionSource" SET "titleAr" = "title", "noteAr" = "note";
ALTER TABLE "QuestionSource" ALTER COLUMN "titleAr" SET NOT NULL;
ALTER TABLE "QuestionSource" DROP COLUMN "title", DROP COLUMN "note";

ALTER TABLE "Governorate" ADD COLUMN "nameAr" TEXT, ADD COLUMN "nameEn" TEXT;
UPDATE "Governorate" SET "nameAr" = "name";
ALTER TABLE "Governorate" ALTER COLUMN "nameAr" SET NOT NULL;
DROP INDEX "Governorate_name_key";
ALTER TABLE "Governorate" DROP COLUMN "name";
CREATE UNIQUE INDEX "Governorate_nameAr_key" ON "Governorate"("nameAr");

ALTER TABLE "Center" ADD COLUMN "nameAr" TEXT, ADD COLUMN "nameEn" TEXT;
UPDATE "Center" SET "nameAr" = "name";
ALTER TABLE "Center" ALTER COLUMN "nameAr" SET NOT NULL;
DROP INDEX "Center_governorateId_name_key";
ALTER TABLE "Center" DROP COLUMN "name";
CREATE UNIQUE INDEX "Center_governorateId_nameAr_key" ON "Center"("governorateId", "nameAr");
