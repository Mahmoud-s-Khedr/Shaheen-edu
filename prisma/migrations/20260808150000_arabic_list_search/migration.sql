-- Arabic-aware search is implemented as immutable expressions so source rows
-- remain the single source of truth and no asynchronous document projection can
-- expose records outside the endpoint's existing authorization scope.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `normalize(..., NFKC)` is required, not cosmetic: the JS twin `normalizeArabic`
-- in src/common/search/arabic-search.ts calls String.prototype.normalize('NFKC'),
-- so without it Arabic presentation forms (U+FB50-U+FEFF, common in text pasted
-- from PDFs) fold on the query side but not in the indexed expression, and the
-- needle can never match. `normalize` is IMMUTABLE on PG13+, so it is legal here.
CREATE OR REPLACE FUNCTION arabic_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      translate(lower(normalize(coalesce(input, ''), NFKC)),
        'أإآىیک٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ـ',
        'اااييك01234567890123456789'),
      '[ً-ٰٟۖ-ۭ]', '', 'g'),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

-- Fail the deploy rather than silently mis-indexing. `[^[:alnum:]]+` in the body
-- above resolves against the database LC_CTYPE: under a C/POSIX ctype it matches
-- ASCII only, which would strip every Arabic string to '' and make all the
-- indexes below uniformly empty. That failure is otherwise invisible -- searches
-- just return nothing. This fixture exercises tatweel, diacritics, Persian yeh
-- and keheh, and both Arabic-Indic digit blocks; it is duplicated as the first
-- case in src/common/search/arabic-search.spec.ts.
DO $$
BEGIN
  IF arabic_normalize('  إِلـى  یَوم ۱۲٣! ') <> 'الي يوم 123' THEN
    RAISE EXCEPTION 'arabic_normalize() is misbehaving on this database (got %). Check that the server was initialised with a UTF-8 LC_CTYPE, not C/POSIX.',
      arabic_normalize('  إِلـى  یَوم ۱۲٣! ');
  END IF;
  IF arabic_normalize('ﻣﺪﺭﺳﺔ') <> 'مدرسة' THEN
    RAISE EXCEPTION 'arabic_normalize() is not applying NFKC (got %).', arabic_normalize('ﻣﺪﺭﺳﺔ');
  END IF;
END $$;

-- The first index serves typo/partial matching; the second serves token search.
CREATE INDEX "Subject_search_trgm_idx" ON "Subject" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Subject_search_fts_idx" ON "Subject" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "AcademicGrade_search_trgm_idx" ON "AcademicGrade" USING gin
  (arabic_normalize(coalesce("titleAr", '') || ' ' || coalesce("titleEn", '') || ' ' || coalesce(slug, '') || ' ' || coalesce("descriptionAr", '') || ' ' || coalesce("descriptionEn", '')) gin_trgm_ops);
CREATE INDEX "Course_search_trgm_idx" ON "Course" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Course_search_fts_idx" ON "Course" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "Chapter_search_trgm_idx" ON "Chapter" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Chapter_search_fts_idx" ON "Chapter" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "Lesson_search_trgm_idx" ON "Lesson" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Lesson_search_fts_idx" ON "Lesson" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "Section_search_trgm_idx" ON "Section" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Section_search_fts_idx" ON "Section" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "ContentItem_search_trgm_idx" ON "ContentItem" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce("textBody", '')) gin_trgm_ops);
CREATE INDEX "ContentItem_search_fts_idx" ON "ContentItem" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce("textBody", ''))));
CREATE INDEX "Question_search_trgm_idx" ON "Question" USING gin
  (arabic_normalize(coalesce(body, '') || ' ' || coalesce(explanation, '')) gin_trgm_ops);
CREATE INDEX "Question_search_fts_idx" ON "Question" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(body, '') || ' ' || coalesce(explanation, ''))));
CREATE INDEX "QuestionBank_search_trgm_idx" ON "QuestionBank" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "QuestionSource_search_trgm_idx" ON "QuestionSource" USING gin
  (arabic_normalize(coalesce("titleAr", '') || ' ' || coalesce("titleEn", '') || ' ' || coalesce("noteAr", '') || ' ' || coalesce("noteEn", '')) gin_trgm_ops);
CREATE INDEX "Assessment_search_trgm_idx" ON "Assessment" USING gin
  (arabic_normalize(coalesce(title, '')) gin_trgm_ops);
CREATE INDEX "User_loginIdentifier_search_trgm_idx" ON "User" USING gin
  (arabic_normalize(coalesce("loginIdentifier", '')) gin_trgm_ops);
CREATE INDEX "ManualPaymentMethod_search_trgm_idx" ON "ManualPaymentMethod" USING gin
  (arabic_normalize(coalesce("titleAr", '') || ' ' || coalesce("titleEn", '') || ' ' || coalesce("instructionsAr", '') || ' ' || coalesce("instructionsEn", '')) gin_trgm_ops);
CREATE INDEX "Governorate_search_trgm_idx" ON "Governorate" USING gin
  (arabic_normalize(coalesce("nameAr", '') || ' ' || coalesce("nameEn", '')) gin_trgm_ops);
CREATE INDEX "Center_search_trgm_idx" ON "Center" USING gin
  (arabic_normalize(coalesce("nameAr", '') || ' ' || coalesce("nameEn", '')) gin_trgm_ops);
-- Admin people-search matches on the profile name, not just the login identifier.
CREATE INDEX "StudentProfile_search_trgm_idx" ON "StudentProfile" USING gin
  (arabic_normalize(coalesce("fullName", '')) gin_trgm_ops);
CREATE INDEX "PartnerProfile_search_trgm_idx" ON "PartnerProfile" USING gin
  (arabic_normalize(coalesce("displayName", '') || ' ' || coalesce("legalName", '')) gin_trgm_ops);
