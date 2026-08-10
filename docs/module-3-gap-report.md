# Module 3 Gap Report

Reviewed against [`docs/original.md`](original.md) and the current assessment, learning, question-bank, Prisma, API, and e2e journey code. No implementation changes were made during this review.

## Current foundation

Module 3 already supports:

- Standard quiz generation from entitled course/chapter/lesson/section scopes.
- Up to 50 questions, random selection, `TUTOR`/`EXAM` modes, and optional timers.
- Autosave, resume, submit, scoring, and immutable question snapshots.
- Student quiz history with pagination, search, status filtering, rename, and delete.
- Direct QBank practice with immediate feedback and per-question attempt history.
- Admin question banks, sources, question authoring, and hand-picked custom assessments.

Evidence: [`assessments.controller.ts`](../src/modules/assessments/assessments.controller.ts), [`assessments.service.ts`](../src/modules/assessments/assessments.service.ts), and [`learning.service.ts`](../src/modules/learning/learning.service.ts).

## Missing features and limitations

### 1. Student-facing QBank selection

Question Bank and Question Source APIs are admin-only. Students cannot:

- Browse or select a question bank.
- Filter by source: platform, external book, previous exam, or ministry model.
- Filter by unused, used, correct, incorrect, marked, omitted, or all.
- Bookmark or mark questions.
- Select community-incorrect questions.
- Filter by difficulty bands A+ through D.
- Build a custom quiz from these filters.

The current “custom quiz” means an admin submits exact question IDs; it is not a student custom-quiz builder.

### 2. Explicit question-state tracking

The current model stores direct-practice submissions and the latest assessment answer, but not a complete learner question state.

Missing data includes:

- Bookmark/mark state.
- Explicit omitted status.
- Answer-change history.
- Time spent per question.
- The distinction between “ever answered incorrectly” and “currently incorrect.”
- A clear definition of whether merely seeing a question counts as “used.”

An unanswered assessment question is currently represented indirectly: no answer row, or an empty answer array. The result returns `answered: false` and `isCorrect: false`. This supports a basic UI indicator but is not sufficient for robust filtering or analytics.

The relevant schema currently has one answer row per assessment question: [`AssessmentAttemptAnswer`](../prisma/schema.prisma#L907).

### 3. Quiz history limitations

History is functional but incomplete:

- No saved/completed/suspended summary totals.
- No subject in list rows.
- Score is a raw correct count rather than an explicit percentage.
- No date-range, subject, source, bank, or score filters.
- Only one attempt is allowed per assessment/student because of the unique constraint in [`AssessmentAttempt`](../prisma/schema.prisma#L887).
- No separate history of retakes or multiple attempts.

### 4. Result and review analytics

The result endpoint returns basic question review data: selected answers, correct options, explanations, and correctness. It does not provide:

- Platform average, comparison, or performance gap.
- Excellent / Good Progress / Needs Improvement classification.
- Best subject/topic, weakest area, or most omitted.
- Subject-level and chapter-level breakdowns.
- Question success rate across the platform.
- Time spent per question.
- Answer-change analysis.
- Explicit correct/incorrect/omitted totals.
- Video timestamp in the assessment snapshot.
- AI explanations.

The snapshot stores body, options, and explanation, but not source, bank, hierarchy placement, or video-link metadata. See [`AssessmentQuestion`](../prisma/schema.prisma#L853).

Circular charts, expandable tables, and visual layout are frontend concerns. This repository is backend-focused, so those UI components cannot be assessed here.

## Recommended roadmap

### Phase 1 — Make the QBank usable

Define filter semantics, then add:

- Student QBank queries with scope, bank, source, status, and difficulty filters.
- Question counts/facets before quiz generation.
- Student bookmark/mark endpoints.
- Student custom-quiz generation based on filters.
- A persisted selection snapshot on each assessment so history explains how the quiz was created.

Potential API shape:

- `GET /student/qbank/questions`
- `GET /student/qbank/filters`
- `PUT /student/qbank/questions/:id/bookmark`
- `POST /student/assessments/custom`

### Phase 2 — Strengthen attempt and result data

Add an explicit per-question attempt state containing:

- `ANSWERED`, `OMITTED`, or `UNANSWERED`.
- First-view time, answer time, and time spent.
- Answer revisions.
- Final selected answer.
- Immutable question hierarchy, source, and bank metadata.

Expand results into summary counts, percentages, question review, subject/chapter aggregations, omitted/correct/incorrect distributions, and best/weakest areas.

### Phase 3 — History and analytics

Add history summaries, subject and score fields, date/subject filters, a retake policy, attempt history, accuracy trends, Smart Score, and cohort/platform comparisons.

Benchmarks should be defined by grade, subject, mode, question count, and time period. Comparing a 10-question tutor quiz against a 50-question exam would be misleading.

### Phase 4 — AI

Keep AI quiz generation deferred for now. When revisited, decide whether AI selects existing approved questions or generates new questions. The safer first version is AI-assisted selection from approved content; newly generated questions would require review, provenance, quality scoring, and moderation.

## Product decisions to settle first

1. Does “used” mean displayed, answered, or included in a quiz?
2. Does “incorrect” mean latest answer incorrect or incorrect at least once?
3. Do omitted questions count toward QBank usage?
4. Should completed quizzes support retakes?
5. What population defines the platform average?
6. Should AI select existing questions or generate new ones?

The biggest immediate gap is the missing student QBank/query layer and the lack of explicit per-question analytics data.
