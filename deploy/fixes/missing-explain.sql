BEGIN;

WITH candidates AS (
  SELECT
    i.id AS import_item_id,
    i."questionId",
    i."normalizedOutput",
    i."normalizedOutput"->'structuredExplanation' AS structured,
    i."confidence",
    i."warnings"
  FROM "QuestionImportItem" i
  JOIN "Question" q ON q.id = i."questionId"
  LEFT JOIN "QuestionExplanation" qe ON qe."questionId" = q.id
  WHERE i.status::text = 'CREATED'
    AND qe.id IS NULL
    AND jsonb_typeof(i."normalizedOutput"->'structuredExplanation') = 'object'
    AND NULLIF(BTRIM(i."normalizedOutput"->'structuredExplanation'->>'keywords'), '') IS NOT NULL
    AND NULLIF(BTRIM(i."normalizedOutput"->'structuredExplanation'->>'eliminationStrategy'), '') IS NOT NULL
    AND NULLIF(BTRIM(i."normalizedOutput"->'structuredExplanation'->>'whyCorrect'), '') IS NOT NULL
    AND NULLIF(BTRIM(i."normalizedOutput"->'structuredExplanation'->>'generalRule'), '') IS NOT NULL
    AND NULLIF(BTRIM(i."normalizedOutput"->'structuredExplanation'->>'whatIf'), '') IS NOT NULL
    AND NULLIF(BTRIM(i."normalizedOutput"->'structuredExplanation'->>'commonMistakes'), '') IS NOT NULL
)
INSERT INTO "QuestionExplanation" (
  "id", "questionId", "languageCode",
  "keywords", "eliminationStrategy", "whyCorrect",
  "generalRule", "whatIf", "commonMistakes",
  "origin", "confidence", "warnings",
  "createdAt", "updatedAt"
)
SELECT
  'c' || substr(md5(import_item_id || ':structured-explanation-backfill:v1'), 1, 24),
  "questionId",
  COALESCE(NULLIF("normalizedOutput"->>'languageCode', ''), 'ar'),
  structured->>'keywords',
  structured->>'eliminationStrategy',
  structured->>'whyCorrect',
  structured->>'generalRule',
  structured->>'whatIf',
  structured->>'commonMistakes',
  'AI'::"QuestionExplanationOrigin",
  "confidence",
  "warnings",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM candidates
ON CONFLICT ("questionId") DO NOTHING
RETURNING "questionId";

SELECT COUNT(*) AS persisted_ai_explanations
FROM "QuestionExplanation"
WHERE "origin"::text = 'AI';

COMMIT;
