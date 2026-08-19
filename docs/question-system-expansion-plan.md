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

Status: `COMPLETED`

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

Implemented decisions:

- Canonical content is an ordered `contentBlocks` sequence with `TEXT`, `IMAGE`, `ASSET`, `TABLE`, and `EQUATION` block types. Tables use rectangular string-cell matrices with `headerRow`; equations retain LaTeX and/or MathML.
- Legacy bodies and question attachments are backfilled and retained as synchronized compatibility projections. Existing body-only writes create a text block, while block writes atomically replace the sequence and derive `body`.
- Assessment snapshots copy blocks for questions, options, and shared contexts. Student media remains asset-ID based and is delivered through the existing scoped protected-access endpoints.

## Phase 4 — Written-response AI extraction

Status: `IMPLEMENTED` (2026-08-19)

Expand the existing text/OCR import flow to create written-response drafts before
introducing visual ownership.

Pipeline:

`TXT or PDF transcription → segmentation → answer-key evidence indexing → typed extraction → validated written draft or review candidate`

Scope:

- Extend segmentation to recognize `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, and `LONG_ANSWER` alongside choice questions. Question and shared-text-context boundaries remain block-based and may span PDF pages.
- Index source-marked answer-key material separately from question ranges, so final extraction can cite actual answer evidence rather than treating every answer as model inference.
- Replace the choice-only extraction result with a typed candidate contract: choice options and selected indexes; accepted answers for short/fill questions; and a grading rubric for long answers.
- Require every answer claim to include confidence, provenance, and source evidence block keys. Map source-marked answers to `SOURCE_MARKED`; map model-derived answers to `AI_INFERRED`; the importer must never create `OFFICIAL` answers.
- Create ordinary draft questions through the same type-specific domain validation as manual authoring. A long answer without a usable rubric, a missing answer key, or an inferred/uncertain answer remains `REVIEW_REQUIRED` rather than being published or discarded.
- Preserve item diagnostics, raw model responses, source locators, and retry/idempotency behavior. This phase remains text-only: it neither detects nor attaches visual assets.

Exit criteria:

- Written questions are no longer classified as unsupported.
- The importer creates valid draft written questions using the manual-authoring validation rules.
- Every imported answer is explicitly `SOURCE_MARKED`, `AI_INFERRED`, or absent/review-required, with evidence retained where it exists.
- Missing rubrics, ambiguous answers, and unsupported grading remain reviewable candidates.
- Choice-question behavior, diagnostics, and retry safety remain unchanged.

Implementation notes:

- New imports use `question-import-v3`; queued and historical `question-import-v2` batches continue on the original choice-only path.
- Segmentation stores batch-local answer-evidence ranges with block/page locators. Typed candidates retain their cited evidence keys, normalized payload, provenance, warnings, raw output, and later reviewer decision.
- Only complete, high-confidence `SOURCE_MARKED` candidates with relevant retained evidence auto-create drafts. Admin-only accept/reject endpoints create exactly one `HUMAN_REVIEWED` draft atomically or retain a required rejection reason.

## Phase 5 — PDF visual extraction and provenance

Status: `NOT STARTED`

Create reviewable, durable visual assets from PDFs without yet deciding which
question, option, or context owns them.

Pipeline:

`PDF → render each physical page → vision OCR + visual-region proposals → validate/deduplicate → high-resolution crops → image assets + import-media provenance → page-overlay review`

Scope:

- Continue using rendered PDF pages as the universal visual source. Render at a fixed high quality (currently 350 DPI) so the same path supports scans, embedded raster images, vector diagrams, charts, equations, and image-only options.
- Extend the per-page vision transcription response with visual-region proposals: visual type, normalized bounding box, confidence, description, and warnings. Bounds use normalized integer `0..1000` coordinates relative to the rendered page, never model-specific pixel coordinates.
- Validate bounds before cropping; reject empty/out-of-page regions, add a small bounded padding margin, flag edge-touching regions, and collapse near-duplicate regions by overlap while preserving their detection evidence.
- Materialize every accepted crop as a protected `IMAGE` asset. A rendered crop is the authoritative v1 extraction method; extracting the original embedded image is a later quality optimization and must not block scans or vector-only PDFs.
- Add a durable import-media record with a stable batch-local media key (for example `M0001`), source PDF asset, page number, page dimensions/rotation, normalized and rendered bounds, render DPI, visual type, confidence, description, checksum, created asset ID, raw model evidence, and review status.
- Retain source-block/page proximity metadata only as evidence for later assignment; do not infer final ownership merely because a visual appears on the same page as a question.
- Make visual materialization idempotent. Retries reuse the same batch media key/checksum where possible, retry failed media independently, and clean up only failed/rejected assets that are no longer referenced.
- Add review output that serves the protected original PDF page with region overlays and crop previews. An admin can approve, reject, add, resize, or reclassify a region; manual regions use the same provenance contract as AI-detected regions.

Exit criteria:

- Imported visuals are actual protected stored assets, not OCR placeholders.
- Every media asset is traceable from its asset record to the source PDF page, normalized region, model evidence, and review decision.
- Low-confidence, malformed, or manually corrected regions remain reviewable with their original evidence intact.
- Retries do not duplicate media records or assets.
- Media remains unassigned at the end of this phase; no student-visible question attachment is created yet.

## Phase 6 — Visual AI extraction and ownership

Status: `NOT STARTED`

Use the Phase 5 media manifest to create visual questions, visual options, and
shared visual contexts safely.

Scope:

- Extend segmentation and final extraction to receive stable source block keys, shared-context IDs, answer-key evidence, and only the relevant batch-local media keys/crops. Never send or persist arbitrary asset IDs or signed URLs.
- Ask the extraction model for one typed candidate per segmented question, citing source block keys rather than freely recreating source wording. The backend constructs text blocks from the cited source and interleaves media at validated anchors.
- Return proposed media assignments with `mediaKey`, owner (`QUESTION`, `OPTION`, or `CONTEXT`), owner reference, placement anchor, confidence, and reason. A shared visual may have multiple approved context/question relationships; an option image may be image-only.
- Validate that every referenced media key belongs to the current batch and is approved, that the proposed owner exists in the candidate, and that no unauthorized or duplicate attachment is created. Convert approved assignments into canonical `IMAGE` content blocks using the materialized asset IDs.
- Pass visual crops to the model only when visual interpretation is needed; keep text-only extraction requests text-only. Keep visual calls small and page/range scoped rather than resending the whole document.
- Route uncertain ownership, unsupported media placement, inferred answers, and incomplete grading data to `REVIEW_REQUIRED`. Reviewers can accept, reject, or reassign media before draft creation.
- Preserve import item diagnostics, provenance, source citations, and retry behavior. Retrying an item must reuse Phase 5 assets and must not duplicate questions, assignments, or media.

Exit criteria:

- Visual question stems, image-only/text-and-image answer options, and shared visual contexts produce valid draft questions using canonical content-block validation.
- Every attached visual can be traced from source PDF page and crop through import-media evidence, assignment/review decision, final content block, assessment snapshot, and student delivery.
- Ambiguous candidates remain reviewable rather than being discarded or published.
- Retries do not duplicate questions, media, or attachments.

## Phase 7 — Input-format simplification

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
