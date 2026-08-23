CREATE TYPE "ReportDataClassification" AS ENUM ('NON_PII', 'PII_RESTRICTED');

ALTER TABLE "ReportExportJob"
  ADD COLUMN "classification" "ReportDataClassification" NOT NULL DEFAULT 'NON_PII';
