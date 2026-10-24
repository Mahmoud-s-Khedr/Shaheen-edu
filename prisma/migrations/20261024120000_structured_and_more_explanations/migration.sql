BEGIN;

-- Preserve legacy human text by renaming the columns rather than dropping them.
-- PostgreSQL also updates the existing Question search index expressions on rename.
ALTER TABLE "Question" RENAME COLUMN "explanation" TO "moreExplanation";
ALTER TABLE "AssessmentQuestion" RENAME COLUMN "explanation" TO "moreExplanation";

-- Remove generated copies that differ only in ASCII whitespace. Distinct text remains additional
-- content, including records with no structured explanation. No AI is invoked.
CREATE FUNCTION pg_temp.additional_explanation(legacy TEXT, sections JSONB, format TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  keys TEXT[];
  en TEXT[];
  ar TEXT[];
  flat TEXT := '';
  english TEXT := '';
  arabic TEXT := '';
  content TEXT;
  candidate TEXT;
  i INTEGER;
BEGIN
  IF legacy IS NULL OR btrim(legacy, E' \t\n\r') = '' THEN
    RETURN NULL;
  END IF;
  IF sections IS NULL OR jsonb_typeof(sections) <> 'object' THEN
    RETURN legacy;
  END IF;
  IF format = 'WRITTEN_FOUR_SECTION' THEN
    keys := ARRAY['answerElements', 'scientificExplanation', 'commonMistakes', 'whatIf'];
    en := ARRAY['Answer elements', 'Scientific explanation', 'Common mistakes', 'What if?'];
    ar := ARRAY['عناصر الإجابة', 'التفسير العلمي', 'الأخطاء الشائعة', 'ماذا لو؟'];
  ELSE
    keys := ARRAY['keywords', 'eliminationStrategy', 'whyCorrect', 'generalRule', 'whatIf', 'commonMistakes'];
    en := ARRAY['Keywords', 'Solution strategy', 'Why this is correct', 'General rule', 'What if?', 'Common mistakes'];
    ar := ARRAY['الكلمات المفتاحية', 'استراتيجية الحل', 'لماذا هذه الإجابة صحيحة', 'القاعدة العامة', 'ماذا لو؟', 'الأخطاء الشائعة'];
  END IF;
  FOR i IN 1..array_length(keys, 1) LOOP
    IF jsonb_typeof(sections -> keys[i]) <> 'string' THEN
      CONTINUE;
    END IF;
    content := btrim(sections ->> keys[i], E' \t\n\r');
    IF content IS NULL OR content = '' THEN CONTINUE; END IF;
    IF flat <> '' THEN
      flat := flat || E'\n\n';
      english := english || E'\n\n';
      arabic := arabic || E'\n\n';
    END IF;
    flat := flat || content;
    english := english || en[i] || ': ' || content;
    arabic := arabic || ar[i] || ': ' || content;
  END LOOP;
  IF flat <> '' THEN
    FOREACH candidate IN ARRAY ARRAY[
      flat, english, arabic,
      flat || E'\n\n' || english, flat || E'\n\n' || arabic,
      english || E'\n\n' || english, arabic || E'\n\n' || arabic
    ] LOOP
      IF regexp_replace(btrim(legacy, E' \t\n\r'), E'[ \t\n\r]+', ' ', 'g') =
         regexp_replace(candidate, E'[ \t\n\r]+', ' ', 'g') THEN
        RETURN NULL;
      END IF;
    END LOOP;
  END IF;
  RETURN legacy;
END;
$$;

UPDATE "Question" SET "moreExplanation" = NULL
WHERE btrim("moreExplanation", E' \t\n\r') = '';

UPDATE "Question" q
SET "moreExplanation" = pg_temp.additional_explanation(
  q."moreExplanation", to_jsonb(e), e."structuredExplanationFormat"::TEXT
)
FROM "QuestionExplanation" e WHERE e."questionId" = q.id;

UPDATE "AssessmentQuestion"
SET "moreExplanation" = pg_temp.additional_explanation(
  "moreExplanation", "structuredExplanation", "structuredExplanationFormat"::TEXT
);

-- Normalize historical report snapshots to the new response shape as well.
UPDATE "QuestionReport"
SET "questionSnapshot" = ("questionSnapshot" - 'explanation') || jsonb_build_object(
  'moreExplanation', pg_temp.additional_explanation(
    "questionSnapshot" ->> 'explanation',
    "questionSnapshot" -> 'structuredExplanation',
    "questionSnapshot" ->> 'structuredExplanationFormat'
  )
)
WHERE "questionSnapshot" ? 'explanation';

COMMIT;
