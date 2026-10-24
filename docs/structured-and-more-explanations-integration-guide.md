# Structured explanations and additional text: integration guide

Reviewed commit: `42397ff09936a6ba552a8a3558a506f0a32d90b8` (24 October 2026), compared with parent `093bb726b0668d3d64ad67cd9233dd1c155e1f2b`.

This guide describes the reviewed commit and the follow-up enforcement of manual-only additional text. This is a breaking contract change within API v1. It removes the saved question/assessment `explanation` string and separates structured educational sections from optional additional text. All **37 affected HTTP operations** are listed below, including operations whose implementation is unchanged but which return a shared question response. No routes or HTTP methods were added, removed, or renamed.

All paths in this guide are relative to `/api/v1`. Send `Authorization: Bearer <access-token>` and `Content-Type: application/json` for JSON requests. Admin operations require `ADMIN` or `SUPER_ADMIN`; student operations require `STUDENT`. Existing resource access and lifecycle restrictions still apply.

## 1. Before and after

| Concern                                   | Before this commit                                                                 | At this commit                                                                                                                                       | Integration change                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Manual question input                     | Optional `explanation` string                                                      | Optional `moreExplanation: string \| null`                                                                                                           | Rename the additional-text form field and request property. Old `explanation` is rejected on manual create/update.           |
| Saved question responses                  | `explanation` could contain an automatically flattened copy of structured sections | `moreExplanation` contains separate text; structured content stays in `structuredExplanation`                                                        | Render structured sections and additional text separately. Renaming the display property alone loses generated explanations. |
| Student practice, tutor feedback, results | Server formatted a compatibility string, including localized headings              | Server returns sections, their format, and additional text separately                                                                                | Supply section headings and display order in the frontend.                                                                   |
| AI apply                                  | Applying sections also overwrote flat explanation; answer-only approval cleared it | Applying sections preserves additional text unless explicitly edited; answer-only approval deletes structured sections and preserves additional text | Update approval helpers and payload construction.                                                                            |
| Admin assessment detail                   | Questions returned flat explanation only                                           | Questions return `moreExplanation`, `structuredExplanation`, and `structuredExplanationFormat`                                                       | Reuse the format-aware renderer.                                                                                             |
| Question report snapshots                 | Snapshot had `explanation`                                                         | Snapshot has `moreExplanation`; newly created snapshots also include structured sections and their format                                            | Update report types and tolerate missing sections on historical snapshots.                                                   |
| Question search                           | Searched question body and saved flat explanation                                  | Searches body, additional text, and active structured sections                                                                                       | Keep the same `q` parameter; do not depend on backend-generated headings being searchable.                                   |

`moreExplanation` is exclusively for text explicitly added or edited by an administrator. AI generation, candidate acceptance, and imported draft creation must never populate it automatically, even from a plain-only legacy candidate. Add it using manual question create/PATCH or an explicitly supplied field in AI approval. Existing saved notes can be copied into replacement drafts, assessment snapshots, and report snapshots. It is independent of the sections and may be non-null when no structured explanation exists.

The original historical migration preserves legacy text whose authorship is not recorded reliably; it is not proof that every migrated value was manually authored. This follow-up changes runtime writes and does not clear or reclassify existing database values.

The two structured formats and proposed maximum-points workflow predate this commit. Continue following [the formats and marks guide](question-explanation-formats-and-marks-frontend-integration-guide.md) for those existing contracts. This guide takes precedence over older examples that still send/read a saved question's `explanation`.

## 2. Shared response contract and rendering

The following is an explanation-only fragment, not a complete question response:

```json
{
  "moreExplanation": "Remember to include the unit in your final answer.",
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "State the result and its unit.",
    "scientificExplanation": "Explain how the result follows from the givens.",
    "commonMistakes": "Do not omit the unit.",
    "whatIf": "Explain how changing the givens changes the result.",
    "languageCode": "en"
  }
}
```

| Returned format        | Educational fields, in display order                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `SIX_SECTION`          | `keywords`, `eliminationStrategy`, `whyCorrect`, `generalRule`, `whatIf`, `commonMistakes` |
| `WRITTEN_FOUR_SECTION` | `answerElements`, `scientificExplanation`, `commonMistakes`, `whatIf`                      |

Choose the renderer using the **returned format**, including for older written questions that still have six sections. `structuredExplanationFormat` is a sibling of `structuredExplanation`, never a property inside it. Inactive section fields are omitted. Depending on the endpoint, the object can also contain read-only metadata such as `languageCode`, `origin`, `confidence`, `warnings`, review information, or `staleAt`. Render only the known educational fields, then optional additional text; do not turn metadata into educational sections.

When structured content is absent, both structured properties are null. Additional text remains independent:

```json
{
  "moreExplanation": "Manually added teaching note without sections.",
  "structuredExplanationFormat": null,
  "structuredExplanation": null
}
```

When assessment answers are hidden, all three properties are null. Replace any cached visible explanation with these null values. Never fill hidden fields from a source-question request.

For older payloads, a non-null structured object without a format can default to `SIX_SECTION`. An unknown non-null format should preserve the payload and show an unsupported-format state instead of opening an editor that could overwrite it. Historical report snapshots can omit both structured properties altogether.

### Frontend labels

The backend no longer produces these labels as part of a student-facing string:

| Field                   | English                | Arabic                  |
| ----------------------- | ---------------------- | ----------------------- |
| `keywords`              | Keywords               | الكلمات المفتاحية       |
| `eliminationStrategy`   | Solution strategy      | استراتيجية الحل         |
| `whyCorrect`            | Why this is correct    | لماذا هذه الإجابة صحيحة |
| `generalRule`           | General rule           | القاعدة العامة          |
| `answerElements`        | Answer elements        | عناصر الإجابة           |
| `scientificExplanation` | Scientific explanation | التفسير العلمي          |
| `commonMistakes`        | Common mistakes        | الأخطاء الشائعة         |
| `whatIf`                | What if?               | ماذا لو؟                |

Use frontend translations, preserve text line breaks, support RTL and existing math rendering, and treat text as untrusted content rather than raw HTML. Display `moreExplanation` under a separate additional-explanation label when nonblank.

## 3. Every affected API

Each row describes the change at this commit. Existing unrelated request fields are unchanged. `:questionId` in assessment answer URLs is an **assessment-question snapshot ID**, not the source question ID.

### 3.1 Admin questions: 17 operations

All full question objects below remove `explanation`, expose `moreExplanation: string | null`, and retain the existing structured envelope. Workflow/option/asset/video actions return that same full question object, so their consumers also need updating even though their request DTOs are unchanged.

| Method | Path                                     | What changed                                                                                                                                                                                                                                                |
| ------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/questions`                       | Request replaces `explanation` with optional `moreExplanation`; trims text and saves blank/null/omitted input as null. Creating sections no longer creates a flat copy. Returns the new question shape.                                                     |
| GET    | `/admin/questions`                       | Each `data[]` item uses the new shape. `q` searches body, additional text, and active structured sections, including queries spanning those fields. Pagination and filters remain the same.                                                                 |
| GET    | `/admin/questions/:id`                   | Full question response uses the new shape.                                                                                                                                                                                                                  |
| PATCH  | `/admin/questions/:id`                   | Request replaces `explanation` with `moreExplanation`; omission preserves text, null/blank clears it. Updating sections no longer overwrites additional text. Editing only additional text no longer invalidates structured content. Returns the new shape. |
| POST   | `/admin/questions/:id/submit`            | Returned question uses the new shape; request and status transition unchanged.                                                                                                                                                                              |
| POST   | `/admin/questions/:id/publish`           | Returned question uses the new shape; publishing rules unchanged.                                                                                                                                                                                           |
| POST   | `/admin/questions/:id/reject`            | Returned question uses the new shape; review-note input unchanged.                                                                                                                                                                                          |
| POST   | `/admin/questions/:id/archive`           | Returned question uses the new shape; archive rules unchanged.                                                                                                                                                                                              |
| POST   | `/admin/questions/:id/options`           | Returned question uses the new shape; option-create input unchanged.                                                                                                                                                                                        |
| PATCH  | `/admin/questions/:id/options/:optionId` | Returned question uses the new shape; option-update input unchanged.                                                                                                                                                                                        |
| DELETE | `/admin/questions/:id/options/:optionId` | Returned question uses the new shape.                                                                                                                                                                                                                       |
| POST   | `/admin/questions/:id/options/reorder`   | Returned question uses the new shape; `optionIds` input unchanged.                                                                                                                                                                                          |
| POST   | `/admin/questions/:id/assets`            | Returned question uses the new shape; `assetId` input unchanged.                                                                                                                                                                                            |
| DELETE | `/admin/questions/:id/assets/:assetId`   | Returned question uses the new shape.                                                                                                                                                                                                                       |
| POST   | `/admin/questions/:id/assets/reorder`    | Returned question uses the new shape; `assetIds` input unchanged.                                                                                                                                                                                           |
| POST   | `/admin/questions/:id/video-link`        | Returned question uses the new shape; video-link input unchanged.                                                                                                                                                                                           |
| DELETE | `/admin/questions/:id/video-link`        | Returned question uses the new shape.                                                                                                                                                                                                                       |

### 3.2 AI approval: 1 operation

| Method | Path                                                     | What changed                                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/questions/:questionId/ai/re-answer/:runId/apply` | Adds optional `moreExplanation` to the request, permitted only when `applyExplanation=true`. Omission preserves saved text; null/blank clears it. Response is the applied question with the new explanation shape. Generated sections no longer populate a flat string. Answer-only approval clears sections but preserves additional text. |

AI run generation, list, detail, and reject responses remain **run objects**, containing generated structured sections and their format. They do not gain `moreExplanation`; read saved additional text from the question. Their paths are unchanged: `POST/GET /admin/questions/:questionId/ai/re-answer`, `GET .../:runId`, and `POST .../:runId/reject`.

### 3.3 Student practice and assessment delivery: 5 operations

| Method | Path                                                            | What changed                                                                                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/student/practice/questions/:questionId/attempts`              | Response replaces formatted `explanation` with `moreExplanation`. Existing structured envelope is returned separately; no server-generated labels. Request remains `{ "optionIds": [...] }`; feedback is available after either a correct or incorrect attempt. |
| POST   | `/student/assessments/:id/attempts/start`                       | Each `questions[]` item replaces `explanation` with `moreExplanation`; existing structured envelope and answer-visibility rules remain. Applies to newly started and resumed attempts.                                                                          |
| GET    | `/student/assessments/:id/attempts/current`                     | Same per-question response change and visibility rules as start/resume.                                                                                                                                                                                         |
| POST   | `/student/assessments/:id/attempts/current/answers/:questionId` | Direct autosave-feedback object replaces `explanation` with `moreExplanation` and **adds** `structuredExplanation` and `structuredExplanationFormat`. TUTOR reveals them immediately; EXAM returns all three as null. Answer input is unchanged.                |
| GET    | `/student/assessments/:id/attempts/current/result`              | Each `questions[]` item replaces formatted `explanation` with `moreExplanation` and **adds** the structured envelope. Result filtering and scoring are unchanged. Requires a completed attempt; otherwise HTTP 409.                                             |

In attempt-state responses, EXAM explanations remain hidden until completion. TUTOR state reveals an answered question, and completed state reveals all questions. A visible question can still have null explanation fields when no content was saved.

Assessment generation now snapshots `moreExplanation` with the structured sections. Later source-question edits do not alter existing assessment snapshots. Always use the snapshot's explanation and marks in attempts/results.

### 3.4 Admin assessments and grading: 7 operations

| Method | Path                                 | What changed                                                                                                                                                                                                    |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/assessments/standard`        | Returned `questions[]` replace `explanation` with `moreExplanation` and add the structured envelope. Creation snapshots additional text from source questions. Request unchanged.                               |
| POST   | `/admin/assessments/custom`          | Same returned-question and snapshot changes as standard creation; question selection input unchanged.                                                                                                           |
| GET    | `/admin/assessments/:id`             | Each `questions[]` item replaces `explanation` with `moreExplanation` and adds `structuredExplanation` and `structuredExplanationFormat`.                                                                       |
| PATCH  | `/admin/assessments/:id`             | Returns the updated admin-detail shape above. Does not add an explanation-editing input.                                                                                                                        |
| POST   | `/admin/assessments/:id/publish`     | Returns the updated admin-detail shape above.                                                                                                                                                                   |
| POST   | `/admin/assessments/:id/archive`     | Returns the updated admin-detail shape above.                                                                                                                                                                   |
| GET    | `/admin/assessments/grading/pending` | Each returned answer's `assessmentQuestion` replaces `explanation` with `moreExplanation`; its existing structured envelope remains. Applies to ADMIN's allowlisted response and SUPER_ADMIN's fuller response. |

`POST /admin/assessments/grading/answers/:answerId/retry-ai` returns an answer without an `assessmentQuestion` relation and has no explanation-contract change. Admin assessment lists also do not include question explanations.

### 3.5 Question report snapshots: 6 operations, including aliases

| Method | Path                                                   | What changed                                                                                                                                                                            |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/student/questions/:questionId/reports`               | Created report's `questionSnapshot` replaces `explanation` with `moreExplanation` and includes selected structured educational fields, language, and sibling format. Request unchanged. |
| POST   | `/student/assessments/question-reports/:questionId`    | Alias of the same report-creation service; identical snapshot change.                                                                                                                   |
| GET    | `/admin/question-reports`                              | Each `data[].questionSnapshot` uses the migrated/new shape. ADMIN projection now allows the additional-text and structured properties; SUPER_ADMIN sees the stored snapshot.            |
| POST   | `/admin/question-reports/:reportId/review`             | Returned report snapshot uses the migrated/new shape; status/note input unchanged.                                                                                                      |
| GET    | `/admin/assessments/question-reports`                  | Alias of the same report-list service; identical snapshot change.                                                                                                                       |
| POST   | `/admin/assessments/question-reports/:reportId/review` | Alias of the same report-review service; identical snapshot change.                                                                                                                     |

The sibling `question` summary, when present in admin lists, still contains only `id` and `body`. New snapshots use the **current source question**, not an assessment snapshot. The migration renames text inside existing report snapshots but does not synthesize missing structured sections or formats; handle those properties as optional for historical reports.

The report-creation implementation currently returns the stored snapshot to the student without applying assessment reveal rules. Do not treat report creation as an explanation-delivery API or use its snapshot to fill hidden assessment content. This is an existing exposure boundary that needs separate backend hardening.

### 3.6 AI import acceptance: 1 operation with changed persistence behavior

| Method | Path                                                  | What changed                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/ai/question-imports/:id/items/:itemId/accept` | All imported drafts start with `moreExplanation: null`. Pre-v7 structured candidates save their sections; plain-only candidate text stays in retained import review data and is never copied into manual notes. V7 remains extraction-only and saves neither explanation representation. The response remains an import item with `questionId`, not a full question. Fetch `/admin/questions/:questionId` afterward. |

**Do not globally rename every `explanation` key.** The pre-v7 review-candidate schema still requires a nonblank `candidate.explanation` string, even when structured sections are supplied. Its stored candidate/raw-output/reviewer data retains the old schema. New v7 candidates still reject `explanation` and `structuredExplanation`; edit the resulting draft via question APIs instead. `candidate.moreExplanation` is not mapped into the saved question by this acceptance path.

The import worker also stops copying generated flat text into questions when creating drafts automatically. Import polling/list/item DTOs do not otherwise change; question data is read through question APIs.

Accepting or reviewing an AI candidate does not count as explicitly authoring `moreExplanation`. Even distinct plain explanation text remains in the import review record. To add administrator notes, PATCH the resulting question's `moreExplanation` explicitly. The shared imported-draft helper enforces null even if unexpected runtime candidate data carries a `moreExplanation` property; its TypeScript input also excludes that field.

### 3.7 Operations without an explanation response change

Question-bank/source/context CRUD, question statistics, bulk publish (`publishedIds`/`failed`), whole-question deletion, practice question lists, practice-attempt history, assessment lists/detail metadata for students, student assessment-generation response metadata, attempt submission summaries, error reflections, analytics, and asset access do not gain explanation fields. Do not add `moreExplanation` to their requests. Student assessment generation still captures the new explanation fields internally for later delivery.

## 4. Request changes and examples

### Additional-text semantics

| Input for `moreExplanation`                     | Manual POST     | Manual PATCH         | AI apply with `applyExplanation=true`                  |
| ----------------------------------------------- | --------------- | -------------------- | ------------------------------------------------------ |
| Omitted                                         | Saves null      | Preserves saved text | Preserves saved text, including on a replacement draft |
| Nonblank string                                 | Trims and saves | Trims and replaces   | Trims and replaces                                     |
| `null`, empty string, or whitespace-only string | Saves null      | Clears to null       | Clears to null                                         |

DTOs declare a maximum of **100,000 characters** for additional text. Construct requests from form fields rather than spreading a response object. Never send the removed top-level `explanation` to manual question endpoints.

Create a written question with separate sections and additional text:

```http
POST /api/v1/admin/questions
```

```json
{
  "bankId": "<existing-bank-id>",
  "sourceId": "<existing-source-id>",
  "courseId": "<existing-course-id>",
  "placements": [{ "courseId": "<existing-course-id>" }],
  "type": "LONG_ANSWER",
  "body": "Explain the concept and its effect.",
  "gradingRubric": "Identify the concept: 2 marks. Explain its effect: 3 marks.",
  "maxPoints": 5,
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "Identify the concept and explain its effect.",
    "scientificExplanation": "Connect the concept to the observed effect.",
    "commonMistakes": "Naming the concept without explaining the effect.",
    "whatIf": "Explain the effect of changing the initial condition."
  },
  "moreExplanation": "Use the diagram discussed in class."
}
```

Edit only additional text without marking existing structured content stale:

```http
PATCH /api/v1/admin/questions/:id
```

```json
{ "moreExplanation": "Updated teaching note." }
```

Clear additional text using `{ "moreExplanation": null }`. To preserve it while updating other question fields, omit the property completely. Manual updates remain subject to existing editable-status restrictions.

Updating structured sections independently preserves additional text. Submit every section for the chosen format, each nonblank and at most 10,000 characters. Do not include response metadata, inactive fields, or a nested format. A format supplied without structured content is invalid. Four-section manual content requires a written question type; six-section requests can omit the format for legacy compatibility.

### AI apply

```http
POST /api/v1/admin/questions/:questionId/ai/re-answer/:runId/apply
```

Apply generated sections and save an additional note in one request:

```json
{
  "applyAnswer": true,
  "applyExplanation": true,
  "moreExplanation": "Use the classroom method when explaining this result."
}
```

To preserve saved notes, leave the `moreExplanation` key out of the request JSON entirely. For example, if the question already has `moreExplanation: "Use the diagram discussed in class."`, this request applies the generated answer and sections while keeping that note unchanged:

```json
{
  "applyAnswer": true,
  "applyExplanation": true
}
```

There is no need to read and resend the existing note. If no note is saved, it remains null. Sending `"moreExplanation": null`, `"moreExplanation": ""`, or a whitespace-only string explicitly clears the saved note; those values do not mean “preserve.” Sending a nonblank string replaces it. The same omission rule applies to manual PATCH requests; manual POST creates a new question, so omission saves null.

To edit generated sections, also supply a complete `structuredExplanation` matching the stored run's format; an optional supplied `structuredExplanationFormat` must match that run.

| `applyAnswer` | `applyExplanation` | Effect                                                                                                                                               |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| true          | true               | Applies the verified answer and proposed maximum points when present; saves generated/reviewed sections. Additional text changes only when supplied. |
| true          | false              | Applies answer/marks, deletes previous structured sections, and preserves additional text. Do not send `moreExplanation`, even null.                 |
| false         | true               | Saves sections and optional additional text. Saved answer and proposed marks must match the run.                                                     |
| false         | false              | HTTP 400.                                                                                                                                            |

For published source questions, applying creates a replacement draft. Additional text is copied before any explicit edit; use the response's `id` for subsequent editing and publishing. Existing assessments retain their original snapshot. AI run generation does not accept `moreExplanation`; use the apply endpoint or manual PATCH.

### Error handling

| Trigger                                                                                   | Result / client action                                                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Top-level `explanation` sent to manual create/update                                      | HTTP 400, `BAD_REQUEST.VALIDATION_FAILED`; remove the obsolete field.                   |
| Invalid additional-text type or value over declared length limit                          | DTO validation error; show the field detail.                                            |
| Any supplied `moreExplanation` with `applyExplanation=false`, including null              | HTTP 400: `Additional explanation requires applyExplanation to be true`.                |
| Both apply flags false                                                                    | HTTP 400; choose at least one action.                                                   |
| Partial/mismatched section edit or format without content                                 | HTTP 400; submit complete active sections in the expected format.                       |
| Stale source, already reviewed run, incompatible saved answer, or proposed-marks mismatch | Existing HTTP 409 behavior; refresh/regenerate or approve the answer where appropriate. |

Errors retain the existing localized `message`, machine-readable `code`, optional validation `details`, and `correlationId`. Match error codes rather than English text.

## 5. Migration and deployment

Required migration: [20261024120000_structured_and_more_explanations](../prisma/migrations/20261024120000_structured_and_more_explanations/migration.sql). It runs in a transaction and:

1. Renames `Question.explanation` and `AssessmentQuestion.explanation` to `moreExplanation`.
2. Clears null/ASCII-blank text and recognized generated copies of the active structured sections. It recognizes unlabeled copies, English/Arabic labeled copies, selected duplicated combinations, and differences only in ASCII spaces/tabs/newlines/carriage returns.
3. Preserves distinct text and text-only historical explanations. It does not remove a structured prefix from a longer distinct string, so some historical additional text can still contain duplicated educational content.
4. Rewrites historical `QuestionReport.questionSnapshot.explanation` to `moreExplanation`, applying the same duplicate check against sections already present in that snapshot.
5. Leaves structured sections, retained AI runs, assessment answers, marks, and scores intact. It invokes no AI. PostgreSQL updates existing question-search index expressions for the column rename.

Coordinate frontend, API, and AI-worker rollout. Old binaries expect the renamed columns and cannot keep running safely after migration. Use a controlled cutover: stop/drain old API and worker processes, apply migrations, start matching binaries, and switch clients to the new payloads. An application-only rollback after migration is insufficient; plan database restoration or an explicit reverse migration if needed. Renaming columns back alone cannot recover redundant text cleared by migration.

Build/deploy commands, with the intended deployment environment already configured:

```sh
pnpm prisma:generate
pnpm build
pnpm prisma:migrate:deploy
```

`prisma:generate` and build prepare the release; run the migration during the coordinated cutover. The migration wrapper uses the repository's deployment lock. Restart both API and worker with that release and invalidate cached question/assessment/report payloads or migrate their local types before reuse.

The commit adds `scripts/review-question-explanations.cjs`, a read-only database audit that detects either column schema. It can run using the deployment's Prisma client and configured `DATABASE_URL`; `--details` includes content for review. Its legacy-duplicate/legacy-only counters describe the old column when present; after rename, consult the additional-text counters and review details. `scripts/fix-reviewed-question-explanations.cjs` is a separate, hash-guarded correction for one specific record, dry-run by default. It is not a required migration step or a general cleanup tool.

The checked-in OpenAPI file updates manual request DTOs, attempt/admin assessment question DTOs, and the AI apply response fragment. Several routes still have incomplete or untyped response schemas, including practice feedback/results and full AI run/applied-question fields. Do not assume code generation alone captures every field in this guide. Consult the actual controller/service contracts and retain complete frontend types.

## 6. Integration verification

- Remove obsolete saved-question `explanation` request/response properties from all 37 affected operation consumers. Keep legacy import candidate keys unchanged.
- Verify both section formats, optional additional-only content, absent content, and unknown formats.
- Verify create, PATCH omission, replacement, null clearing, and whitespace clearing of additional text. A note-only PATCH must preserve structured `staleAt`.
- Verify AI apply preserves omitted notes, updates supplied notes, rejects notes with explanation approval disabled, and preserves notes during answer-only approval. Follow replacement-draft IDs.
- Verify correct and incorrect practice feedback, TUTOR immediate feedback, EXAM hidden fields, start/resume, and completed results. Ensure cached visible content is cleared when a later payload hides it.
- Verify admin assessment creation/detail/workflow responses and the grading queue use snapshot content, even after source edits.
- Verify both report route aliases and historical snapshots with no structured fields.
- Verify that pre-v7 plain-only, pre-v7 structured, and v7 extraction-only imports all leave `moreExplanation` null, including unexpected additional-text input in imported data. Verify manual notes still round-trip and search matches within sections/additional notes.

Review validation on this checkout: `pnpm build` passed. The seven focused unit suites ran 219 tests: 212 passed and seven assessment-visibility tests failed. The same seven failures were reproduced on the parent commit, using transpilation without TypeScript diagnostics against the installed client; they are unrelated fixtures missing `gradeAssignments`. The two focused e2e suites (`question-explanation-formats` and `assessments`) passed all 32 tests against disposable PostgreSQL/Redis, including real migrations and legacy-text conversion cases. The live journey suite was not run.

## 7. Commit review findings

### Corrected review interpretation and manual-only enforcement

Omitting plain candidate text from manual notes is intentional. Text differences from generated sections do not establish manual authorship. The original commit had one conflicting runtime behavior: plain-only legacy acceptance automatically copied `candidate.explanation` into `moreExplanation`. The follow-up removes that fallback and makes the common import helper always save null. Tests cover both plain-only and structured acceptance, unexpected notes in ordinary/extracted import data, manual notes, and preservation during AI approval.

Follow-up validation: all 206 tests in seven focused unit suites passed, all 12 explanation-format e2e tests passed against disposable PostgreSQL/Redis, and `pnpm build` passed. Existing historical migration behavior is unchanged; this validation does not establish manual authorship of previously migrated values.

### P2: Two current-system journeys still assert the removed response property

[student-learning.journey.ts](../scripts/journeys/content/student-learning.journey.ts#L406) still requires truthy `correct.body.explanation`, and [assessments.journey.ts](../scripts/journeys/content/assessments.journey.ts#L756) still requires a string `result.body.questions[0].explanation`. Both fields are now always absent, so `CONTENT-013` and `CONTENT-016` fail their feedback/result checks against this backend; dependent journeys and full API acceptance can also be affected. Update those assertions to validate structured sections/additional text and explicitly check that the obsolete property is absent. This finding was confirmed by source/contract inspection, not a live journey run.

## 8. Implementation references

- [Question controllers](../src/modules/question-banks/question-banks.controller.ts), [question DTOs](../src/modules/question-banks/dto/question-banks.dto.ts), and [question service](../src/modules/question-banks/question-banks.service.ts).
- [AI apply controller](../src/modules/ai-question-explanations/question-ai-explanations.controller.ts), [DTO](../src/modules/ai-question-explanations/dto/question-ai-explanation.dto.ts), and [service](../src/modules/ai-question-explanations/question-ai-explanations.service.ts).
- [Assessment controllers](../src/modules/assessments/assessments.controller.ts), [report aliases](../src/modules/assessments/question-intelligence.controller.ts), and [assessment service](../src/modules/assessments/assessments.service.ts).
- [Learning service](../src/modules/learning/learning.service.ts), [moderation projections](../src/common/privacy/content-moderation.projections.ts), and [structured-envelope helper](../src/common/utils/structured-explanation.ts).
- [Import acceptance](../src/modules/ai-question-import/question-import.service.ts), [worker](../src/modules/ai-question-import/question-import.worker.ts), [schema](../prisma/schema.prisma), and [checked-in OpenAPI](../docs-json.json).
