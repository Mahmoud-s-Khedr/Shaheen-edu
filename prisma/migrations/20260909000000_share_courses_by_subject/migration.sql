-- Courses are owned by a reusable subject. Grade availability is represented
-- exclusively by SubjectGrade.
--
-- Older releases permitted one Subject identity per grade. Before removing
-- that scope, merge same-slug subjects into one canonical identity. A
-- published subject wins; ties use the oldest record then its id. This keeps
-- student-visible content publishable while making the choice deterministic.

-- Course slugs were only unique within (subject, grade). Rename only the
-- colliding rows before their subjects are merged. The course id suffix is
-- deterministic and preserves every course and its descendants.
WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY
    "slug",
    CASE "status"
      WHEN 'PUBLISHED'::"ContentStatus" THEN 0
      WHEN 'DRAFT'::"ContentStatus" THEN 1
      ELSE 2
    END,
    "createdAt",
    id
), numbered_courses AS (
  SELECT c.id, row_number() OVER (
    PARTITION BY canonical_subjects.canonical_id, c."slug"
    ORDER BY c."createdAt", c.id
  ) AS slug_rank
  FROM "Course" c
  JOIN "Subject" s ON s.id = c."subjectId"
  JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
)
UPDATE "Course" c
SET "slug" = c."slug" || '--legacy-' || c.id
FROM numbered_courses
WHERE numbered_courses.id = c.id AND numbered_courses.slug_rank > 1;

-- The old Course order is per (subject, grade). Stage it under the eventual
-- subject identity first so moving courses cannot violate the old unique
-- (subject, grade, sortOrder) constraint. It is renumbered per shared subject
-- after that old constraint is removed below.
WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
), numbered_courses AS (
  SELECT c.id, row_number() OVER (
    PARTITION BY canonical_subjects.canonical_id, c."academicGradeId"
    ORDER BY c."sortOrder", c."createdAt", c.id
  )::integer AS next_order
  FROM "Course" c
  JOIN "Subject" s ON s.id = c."subjectId"
  JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
)
UPDATE "Course" c
SET "sortOrder" = 1000000000 + numbered_courses.next_order
FROM numbered_courses
WHERE numbered_courses.id = c.id;

-- Stage every grade's placements before merging SubjectGrade rows. This
-- avoids transient sort-order conflicts and lets the final update restore a
-- contiguous ordering in every grade.
WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY "academicGradeId"
    ORDER BY "sortOrder", "createdAt", id
  )::integer AS next_order
  FROM "SubjectGrade"
)
UPDATE "SubjectGrade" sg
SET "sortOrder" = 1000000000 + numbered.next_order
FROM numbered
WHERE numbered.id = sg.id;

-- When duplicate Subject identities were assigned to the same grade, the
-- assignment becomes identical after the merge. Keep one placement, preferring
-- the canonical Subject's row, and discard only the redundant placements (not
-- either Subject's courses).
WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
), ranked_assignments AS (
  SELECT sg.id, row_number() OVER (
    PARTITION BY canonical_subjects.canonical_id, sg."academicGradeId"
    ORDER BY (sg."subjectId" = canonical_subjects.canonical_id) DESC,
      sg."createdAt", sg.id
  ) AS assignment_rank
  FROM "SubjectGrade" sg
  JOIN "Subject" s ON s.id = sg."subjectId"
  JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
)
DELETE FROM "SubjectGrade" duplicate_assignment
USING ranked_assignments
WHERE duplicate_assignment.id = ranked_assignments.id
  AND ranked_assignments.assignment_rank > 1;

-- Subject constants are namespaced by subject. Preserve colliding constants
-- from a non-canonical subject with a deterministic legacy key rather than
-- dropping data when that subject is merged.
WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
), ranked_constants AS (
  SELECT c.id, row_number() OVER (
    PARTITION BY canonical_subjects.canonical_id, c."key"
    ORDER BY (c."subjectId" = canonical_subjects.canonical_id) DESC,
      c."createdAt", c.id
  ) AS key_rank
  FROM "SubjectConstant" c
  JOIN "Subject" s ON s.id = c."subjectId"
  JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
)
UPDATE "SubjectConstant" duplicate_constant
SET "key" = duplicate_constant."key" || '--legacy-' || duplicate_constant.id
FROM ranked_constants
WHERE duplicate_constant.id = ranked_constants.id
  AND ranked_constants.key_rank > 1;

-- Repoint every persisted reference to its canonical Subject identity.
WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "SubjectGrade" sg
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE sg."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "Course" c
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE c."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "QuestionBank" q
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE q."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "Assessment" a
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE a."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "AssessmentQuestionPlacement" p
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE p."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "ContentPlacement" p
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE p."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
UPDATE "SubjectConstant" c
SET "subjectId" = canonical_subjects.canonical_id
FROM "Subject" s JOIN canonical_subjects ON canonical_subjects."slug" = s."slug"
WHERE c."subjectId" = s.id AND s.id <> canonical_subjects.canonical_id;

-- All references have been repointed, so duplicate Subject rows can now be
-- removed and the global slug constraint can be created safely.
WITH canonical_subjects AS (
  SELECT DISTINCT ON ("slug") id AS canonical_id, "slug"
  FROM "Subject"
  ORDER BY "slug", CASE "status"
    WHEN 'PUBLISHED'::"ContentStatus" THEN 0
    WHEN 'DRAFT'::"ContentStatus" THEN 1
    ELSE 2
  END, "createdAt", id
)
DELETE FROM "Subject" s
USING canonical_subjects
WHERE s."slug" = canonical_subjects."slug"
  AND s.id <> canonical_subjects.canonical_id;

-- Restore sequential placement order after the merge. Existing values are in
-- the temporary high range, so assigning 1..n cannot conflict in-place.
WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY "academicGradeId"
    ORDER BY "sortOrder", "createdAt", id
  )::integer AS next_order
  FROM "SubjectGrade"
)
UPDATE "SubjectGrade" sg
SET "sortOrder" = numbered.next_order
FROM numbered
WHERE numbered.id = sg.id;

ALTER TABLE "Course" DROP CONSTRAINT "Course_academicGradeId_fkey";
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_academicGradeId_fkey";

DROP INDEX "Course_subjectId_academicGradeId_slug_key";
DROP INDEX "Course_subjectId_academicGradeId_sortOrder_key";
DROP INDEX "Course_academicGradeId_subjectId_status_sortOrder_id_idx";
DROP INDEX "Subject_academicGradeId_slug_key";
DROP INDEX "Subject_academicGradeId_sortOrder_key";
DROP INDEX "Subject_academicGradeId_status_sortOrder_id_idx";
DROP INDEX "ContentPlacement_academicGradeId_subjectId_idx";

-- Previous ordering was per (subject, grade). Consolidate it deterministically
-- now that courses are shared by the canonical Subject.
UPDATE "Course" c
SET "sortOrder" = "sortOrder" + 1000000000;

WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY "subjectId"
    ORDER BY "sortOrder", "createdAt", id
  )::integer AS next_order
  FROM "Course"
)
UPDATE "Course" c
SET "sortOrder" = numbered.next_order
FROM numbered
WHERE numbered.id = c.id;

ALTER TABLE "Course" DROP COLUMN "academicGradeId";
ALTER TABLE "Subject" DROP COLUMN "academicGradeId";
ALTER TABLE "ContentPlacement" DROP COLUMN "academicGradeId";

CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");
CREATE INDEX "Subject_status_sortOrder_id_idx" ON "Subject"("status", "sortOrder", "id");
CREATE UNIQUE INDEX "Course_subjectId_slug_key" ON "Course"("subjectId", "slug");
CREATE UNIQUE INDEX "Course_subjectId_sortOrder_key" ON "Course"("subjectId", "sortOrder");
CREATE INDEX "Course_subjectId_status_sortOrder_id_idx" ON "Course"("subjectId", "status", "sortOrder", "id");
