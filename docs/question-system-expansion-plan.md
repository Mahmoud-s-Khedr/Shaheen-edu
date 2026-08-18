# Question System Expansion Plan

## Objective

Extend the question platform from choice-only questions and text-only content into a system supporting:

- Choice and written-response questions.
- Text, images, tables, equations, and mixed content.
- PDF imports that preserve visual regions and their ownership.
- TXT for text-only imports and PDF for rich-document imports.
- Auditable answer provenance and appropriate written-response grading.

## Guiding decisions

- Stabilize the canonical question/content model before expanding the AI importer.
- Treat written grading as an explicit product capability, not an importer-only concern.
- Use ordered content blocks for mixed text and media rather than adding isolated image fields.
- Preserve source provenance for every AI-derived question, answer, and visual asset.
- Initially support manual grading for long written responses; add AI-assisted grading only behind review controls.
- Remove DOCX from question importing while preserving existing historical data and any unrelated document-asset use.

## Phase 1 — Canonical question and answer model

Status: `COMPLETED`

Define and implement the domain contracts first.

Scope:

- Add written question types, including short answer, fill-in-the-blank, and long explanation.
- Define response storage for text answers.
- Define grading states, score/partial-credit behavior, and omitted responses.
- Replace choice-only validation with type-specific validation.
- Expand answer provenance to distinguish official, source-marked, AI-inferred, and human-reviewed answers.
- Update Prisma schema, DTOs, OpenAPI output, and shared enums.

Exit criteria:

- Every question type has a documented authoring and validation contract.
- Existing single- and multiple-choice behavior remains compatible.
- Written questions can be persisted as drafts without fake options.
- AI-inferred answers cannot silently become trusted official answers.

Implemented decisions:

- Written types are `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, and `LONG_ANSWER`; all questions carry integer `maxPoints` (default `1`).
- Short and fill-in answers use normalized exact matching against authored accepted answers. Long answers require a rubric and use manual grading.
- Written answer provenance is explicit (`OFFICIAL`, `SOURCE_MARKED`, `AI_INFERRED`, or `HUMAN_REVIEWED`); AI-inferred keys cannot be published until reviewed.

## Phase 2 — Authoring, delivery, attempts, and manual grading

Status: `COMPLETED`

Make the new model usable without depending on AI import.

Scope:

- Add admin authoring and editing for written questions.
- Add student delivery DTOs for written questions without exposing answer keys.
- Add autosave, resume, submission, and omitted-answer handling for text responses.
- Add manual grading endpoints/workflows for long answers.
- Update analytics, performance, answer history, and assessment completion logic.
- Snapshot all authored question data needed by an assessment.

Exit criteria:

- A manually authored written question can complete the full lifecycle: draft → review → published → attempted → graded.
- Students can leave, resume, and submit written answers safely.
- Choice-question regression tests pass unchanged.
- Unreviewed written answers are represented distinctly from incorrect answers.

Implemented decisions:

- Assessments snapshot points, answer-key/rubric, and answer provenance along with existing authored question data.
- Submitted long answers are `PENDING_GRADING`, while omitted responses remain `OMITTED`; completed assessments show a provisional point total until grading finishes.
- Any ADMIN or SUPER_ADMIN can list pending long answers and award `0..maxPoints`, producing incorrect, partial, or correct outcomes with audit history.

## Phase 3 — Ordered media and mixed-content model

Status: `NOT STARTED`

Create the reusable representation for visual and rich content.

Scope:

- Add ordered content blocks/fragments for questions, options, and shared contexts.
- Support text, image, table, and equation blocks.
- Add captions, alt text, language metadata, and display ordering.
- Support images on answer options and shared contexts.
- Update admin APIs, student APIs, assessment snapshots, and serializers.
- Keep existing simple `body` values backward compatible during migration.

Exit criteria:

- A question, option, or context can contain text only, image only, or mixed ordered content.
- Shared contexts render correctly for multiple questions.
- Media is available to students without exposing storage internals.
- Existing question attachments continue to work during migration.

## Phase 4 — PDF visual extraction and provenance

Status: `NOT STARTED`

Upgrade the PDF pipeline after the canonical model is ready.

Pipeline:

`PDF → rendered pages → visual-region detection → OCR/transcription → segmentation → extraction → asset materialization → reviewable draft`

Scope:

- Continue rendering PDF pages as the visual source.
- Detect graphs, diagrams, figures, tables, answer-option images, and shared-context visuals.
- Persist page number, bounding box, visual type, confidence, and ownership.
- Extract embedded source images where available.
- Create rendered crops when the PDF is scanned or contains vector-only visuals.
- Attach materialized assets to the appropriate question, option, or context.
- Preserve links from created records back to the source page and region.
- Add review output that shows the original page and detected visual regions.

Exit criteria:

- Imported visuals are actual stored assets, not only OCR placeholders.
- Visual ownership is represented as question, option, or shared context.
- Every imported visual can be traced to a PDF page and region.
- Low-confidence or ambiguous visual assignments require review.

## Phase 5 — Written and visual AI extraction

Status: `NOT STARTED`

Expand segmentation and extraction to use the new model.

Scope:

- Recognize written-response question types.
- Recognize visual questions and visual answer options.
- Pass text, visual references, and shared contexts to extraction.
- Generate answer keys only with explicit provenance and confidence.
- Create review-required candidates for ambiguous answers, unsupported grading, or uncertain media ownership.
- Preserve import item diagnostics and retry behavior.

Exit criteria:

- Written and visual questions are no longer classified as unsupported.
- The importer creates valid draft questions using the same domain validation as manual authoring.
- Ambiguous candidates remain reviewable rather than being discarded or published.
- Import retries do not duplicate questions or assets.

## Phase 6 — Input-format simplification

Status: `NOT STARTED`

Simplify and document supported question-import inputs.

Scope:

- Keep TXT/raw text for text-only imports.
- Keep PDF as the full-featured rich-document format.
- Reject DOCX specifically from question import creation and extraction.
- Return a clear message instructing users to export DOCX to PDF first.
- Preserve historical DOCX import records and unrelated document assets.
- Update API documentation, admin UI copy, and tests.

Exit criteria:

- TXT and PDF imports work through the documented paths.
- DOCX imports fail early with an actionable conversion message.
- No existing historical import data is corrupted.

## Test and release requirements

Each phase should include unit, integration, and relevant end-to-end coverage.

Required scenarios:

- Single- and multiple-choice regression coverage.
- Short answer, fill-in-the-blank, and long-answer lifecycle coverage.
- Manual grading, partial credit, omitted responses, and answer revisions.
- Text-only, image-only, and mixed question/option/context rendering.
- Shared context reused by multiple questions.
- PDF visuals assigned to questions, options, and contexts.
- Source page and region provenance.
- AI-inferred versus official answer handling.
- TXT success, PDF success, and DOCX rejection.
- Import retry/idempotency and no answer-key leakage to students.

## Working rule

Do not begin the next phase until the current phase’s exit criteria and regression tests pass. Update this file’s phase status and record notable schema/API decisions as implementation proceeds.
