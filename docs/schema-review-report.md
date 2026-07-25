# Consolidated Prisma Schema Review Report

Reviewed: 2026-07-25 · Implementation status updated: 2026-07-25  
Scope: `prisma/schema.prisma` and the committed SQL migrations in
`prisma/migrations/`.

## Implementation status

Implemented in migration `20260726100000_schema_integrity_and_question_placements`
(pending normal deployment to persistent environments):

- **Resolved — payouts and agreements.** Statement-period uniqueness, interval and
  money/basis-point CHECKs, active-primary agreement overlap exclusions, content-publisher
  enforcement, and hierarchical agreement-to-statement target coverage are DB-enforced.
- **Resolved — entitlement and audit integrity.** Entitlements now reference
  `StudentProfile`; actor IDs are foreign keys; revoke/timeline states and one-active-
  grant-per-target rules are enforced.
- **Resolved — session integrity.** Refresh replacement is a self-FK and a parent
  session's selected student is constrained to the parent phone.
- **Resolved — questions.** Questions support `SINGLE_CHOICE` and `MULTIPLE_CHOICE`,
  multi-location in-course placement, lifecycle checks, positive ordering, and
  type-aware publication validation. Existing chapter associations are backfilled as
  placements.
- **Resolved — video, pricing, indexes, and geography.** Question video links now
  reference `VideoAsset`; the underlying asset is trigger-checked as Bunny Stream video.
  Pricing checks, missing asset-reference indexes, webhook lookup/retention columns,
  and managed governorate/center tables with admin management endpoints were added.

Still open or intentionally deferred:

- **Open:** `Asset.sizeBytes` and earnings amounts remain `Int`; assess real volume
  before a backward-compatible `BigInt` API migration.
- **Open:** there is no payment/order ledger. Statements intentionally remain manually
  created records.
- **Partial:** webhook retention metadata and lookup indexes exist, but a scheduled
  purge worker has not yet been introduced.
- **Partial:** free-text geography fields remain as compatibility fields while new
  registrations map them to managed reference records; remove them only after clients
  move to ID-based selection.
- **Accepted design:** a content item remains single-placement; raw-SQL constraints are
  documented here and remain authoritative because Prisma cannot represent them all.

## Executive summary

The schema has a strong base: core hierarchy ordering, lifecycle rules for content,
polymorphic-target rules, and several pagination indexes are enforced in PostgreSQL.
The most consequential remaining risks are in financial correctness, authorization
boundaries, and lifecycle/timeline consistency. The existing review is substantially
accurate, but one finding is stale: `ContentPlacement` ordering *is* unique per parent
through partial unique indexes in migration `20260718130000`.

`node_modules/.bin/prisma validate` passes. That validates Prisma syntax and relation
definitions; it does not validate the raw SQL constraints or the business invariants
listed below.

## Original highest-priority findings — resolved

| Status | Finding | Resolution |
|---|---|---|---|
| Resolved | Duplicate/misattributed earnings statements. | Unique statement period plus agreement-coverage trigger. |
| Resolved | Ineligible or overlapping primary agreements. | Partner-type trigger plus partial exclusion constraints. |
| Resolved | Entitlements granted to non-students or duplicated while active. | `StudentProfile` FK plus partial active-grant indexes. |
| Resolved | Incoherent question lifecycle/review metadata. | `Question_lifecycle` CHECK and matching service transitions. |
| Resolved | Invalid financial, agreement, and entitlement ranges. | CHECK constraints on all listed values and intervals. |
| Resolved | Non-video assets used as question videos. | `VideoAsset` FK and subtype/provider trigger. |

## Findings confirmed from `docs/schema-review.md`

1. **Resolved — statement duplicates and money bounds.** Statements now have period
   uniqueness and range/non-negative CHECKs. `Int` overflow for large assets and
   aggregates remains open.

2. **Resolved — entitlement and audit referential integrity.** Entitlements reference
   `StudentProfile`, and grant/revoke/profile/agreement/statement actors are foreign
   keys. Publisher type is additionally trigger-enforced.

3. **Resolved — relationship safeguards.** `AuthSession.replacedBySessionId` is a
   self-FK. Parent sessions use a composite FK to tie the selected student to the
   session's parent phone.

4. **Partially resolved — asset, pricing, and content semantics.** Pricing coherence,
   non-negative price, three-character currency, and missing asset-FK indexes are
   enforced. Video subtype integrity is enforced; general cross-table
   `ContentItem.type`/asset-kind compatibility remains application-enforced.

5. **Resolved — question correctness and placement.** Questions now have an owning
   course and one or more in-course placements across course/chapter/lesson/section.
   Multiple-correct choices are supported; publication validation varies by question
   type rather than imposing a unique-correct-answer index.

6. **Partially resolved — operational/design concerns.** Asset-reference and webhook
   lookup indexes, webhook retention metadata, and managed geography tables are in
   place. Payment provenance and the scheduled webhook purge remain open; one content
   placement is an accepted design constraint.

## Additional findings from this review

1. **Resolved — agreement/statement target coverage.** A trigger now requires the
   statement target to be covered by the agreement, including valid chapter/lesson
   descendants of a course agreement.

2. **Resolved — temporal intervals and entitlement metadata.** Agreement, statement,
   and entitlement time ranges are checked; entitlement status and revoke metadata must
   agree.

3. **Resolved — question state lifecycle.** The migration adds a state-aware lifecycle
   CHECK, including publication/archive timestamps and paired review metadata; rejected
   questions require a reviewer and note.

4. **Resolved — attachment/option ordering.** Positive-value CHECKs now cover
   `QuestionOption`, `QuestionAsset`, and `AssetReference` ordering.

5. **Resolved — video subtype validity.** A `VideoAsset` trigger requires a Bunny
   Stream asset of kind `VIDEO`, and question links reference `VideoAsset` directly.

6. **Partially resolved — raw-SQL schema visibility.** Important controls—such
   as `ContentPlacement_one_target`, its partial unique ordering indexes, lifecycle
   checks, and exactly-one entitlement/agreement/statement target checks—exist only in
   migrations. This is valid with Prisma, but the Prisma file alone is not the complete
   database contract. Treat migrations as authoritative, document these rules beside the
   models, and require migration-review coverage for any schema change.

## Question model: implemented design

The requirements are:

- a question may be `SINGLE_CHOICE` or `MULTIPLE_CHOICE`;
- a multiple-choice question may have more than one `QuestionOption.isCorrect = true`;
- a question may apply to one or more course, chapter, lesson, or section locations;
- every location attached to one question must belong to the same course.

Implemented by replacing `Question.chapterId` with a direct owning-course field and a
placement table:

```text
Question
  courseId                 -> Course
  type                     -> SINGLE_CHOICE | MULTIPLE_CHOICE

QuestionPlacement
  questionId               -> Question
  courseId?                -> Course
  chapterId?               -> Chapter
  lessonId?                -> Lesson
  sectionId?               -> Section
  CHECK(exactly one target is non-null)
  UNIQUE(questionId, courseId)    WHERE courseId IS NOT NULL
  UNIQUE(questionId, chapterId)   WHERE chapterId IS NOT NULL
  UNIQUE(questionId, lessonId)    WHERE lessonId IS NOT NULL
  UNIQUE(questionId, sectionId)   WHERE sectionId IS NOT NULL
```

`Question.courseId` makes the course boundary explicit and makes course-wide questions
natural. The placement table permits one question to target multiple lessons, sections,
or chapters without losing those precise associations. Use a database trigger to reject
a placement whose resolved course differs from `Question.courseId`; ordinary foreign
keys cannot traverse the Chapter → Course, Lesson → Chapter → Course, and Section →
Lesson → Chapter → Course paths. If this integrity rule must be declarative rather than
trigger-based, denormalize `courseId` onto Chapter/Lesson/Section and use composite
foreign keys that include it.

For answers, retain `QuestionOption.isCorrect` without a unique constraint. Publish
validation should require at least one correct option for both question types and,
for `SINGLE_CHOICE`, exactly one. At attempt submission, compare the selected option-ID
set to the correct option-ID set exactly: selecting a proper subset or adding a wrong
option is incorrect. This treats “select all correct answers” unambiguously. Store the
selected option IDs (or immutable answer snapshots) per attempt if attempts/results are
part of the product scope.

## Correction to the existing review

The assertion that `ContentPlacement.sortOrder` has no per-parent uniqueness is not
currently true. Migration `20260718130000_add_content_items/migration.sql:44-47` creates
partial unique indexes for each non-null parent target. The Prisma schema cannot model
those partial indexes, but PostgreSQL enforces them. That item should be removed or
rewritten as a schema-documentation drift observation.

## Implementation outcome

1. Completed: money/payout, authorization, question, video, pricing, ordering, index,
   and geography safeguards described above.
2. Remaining: BigInt capacity assessment, payment/order provenance, scheduled webhook
   retention, final removal of legacy free-text geography, and broader asset-kind
   compatibility if DB-level enforcement becomes necessary.
