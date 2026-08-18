-- QuestionAsset is a legacy attachment projection.  Canonical content blocks
-- retain every supported media kind; only image, PDF, and document assets are
-- represented in the legacy table.
DELETE FROM "QuestionAsset" qa
USING "Asset" a, "QuestionContentBlock" block
WHERE qa."assetId" = a.id
  AND block."questionId" = qa."questionId"
  AND block."assetId" = qa."assetId"
  AND a.kind NOT IN ('IMAGE'::"AssetKind", 'PDF'::"AssetKind", 'DOCUMENT'::"AssetKind");
