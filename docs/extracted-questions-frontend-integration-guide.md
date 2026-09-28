# Extracted Questions and Verified Answers — Frontend Integration Guide

This guide describes the admin workflow for turning a PDF-extracted question
into a publishable question. It applies to question-import schema
`question-import-v7`.

The central rule is intentional: **AI may extract question content and draft an
explanation, but it never supplies a correct answer.** An `ADMIN` or
`SUPER_ADMIN` must review the extracted content and explicitly provide every
answer before the question is publishable.

All endpoints below are relative to `/api/v1` and require an administrator
bearer token.

## API coverage and request DTO reference

This is the complete API surface used by this updated flow: PDF asset upload,
v7 import/review, verified-answer explanation review, question retrieval/edit,
and publishing. Existing hierarchy, source, and bank management APIs are
outside this guide; their IDs must already exist before an import is created.

### Shared request/query types

```ts
type PaginationQueryDto = {
  page?: number;  // integer, default 1, minimum 1
  limit?: number; // integer, default 20, 1–100
};

type SearchPaginationQueryDto = PaginationQueryDto & {
  q?: string; // trimmed text search, 1–120 characters
};

type QuestionPlacementDto = {
  courseId?: string;
  chapterId?: string;
  lessonId?: string;
  sectionId?: string;
};
```

At least one valid placement target is required by the question-placement
contract. IDs below are strings.

### Asset upload endpoints

| Method and endpoint | Request DTO / input | Purpose / notes |
| --- | --- | --- |
| `POST /admin/assets/upload?kind=PDF` | `multipart/form-data` with one `file` part; query `kind=PDF` | Authorizes upload and returns an asset plus signed storage upload information. This request does not persist the file bytes in the API. |
| `PUT <signed storage URL>` | Raw PDF bytes, using the response’s supplied URL/headers | This is an object-storage request, not an API route. Do not send the bearer token to storage unless the signed-upload instructions require it. |
| `POST /admin/assets/:assetId/complete` | No body | Verifies the direct upload and marks the asset READY. Use its asset ID as `sourceAssetId`. |

### Import endpoints

```ts
type CreateQuestionImportDto = {
  bankId: string;
  sourceId: string;
  courseId: string;
  placements: QuestionPlacementDto[]; // at least one
  rawText?: string;       // max 5,000,000 characters; use instead of sourceAssetId
  sourceAssetId?: string; // READY PDF or TXT asset; use instead of rawText
};

type QueryQuestionImportDto = SearchPaginationQueryDto & {
  status?:
    | 'QUEUED'
    | 'EXTRACTING'
    | 'TRANSCRIBING'
    | 'SEGMENTING'
    | 'GENERATING'
    | 'AWAITING_REVIEW'
    | 'COMPLETED'
    | 'COMPLETED_WITH_ERRORS'
    | 'FAILED';
};

type UpdateQuestionImportSourceTextDto = {
  normalizedText: string; // 20–500,000 characters after normalization
};
```

| Method and endpoint | Request DTO / input | Purpose |
| --- | --- | --- |
| `POST /admin/ai/question-imports` | `CreateQuestionImportDto` | Creates and queues an import job from uploaded source text or a READY source asset. |
| `GET /admin/ai/question-imports?page=&limit=&q=&status=` | `QueryQuestionImportDto` in the query string | Lists imports for the dashboard, with optional text search and status filtering. |
| `GET /admin/ai/question-imports/:importId` | No body or query DTO | Retrieves one import’s current progress, diagnostics, and aggregate results for polling or a detail screen. |
| `GET /admin/ai/question-imports/:importId/source-text` | No body or query DTO | Retrieves the normalized extracted source text for administrator review. |
| `PATCH /admin/ai/question-imports/:importId/source-text` | `UpdateQuestionImportSourceTextDto` | Replaces the normalized source text after correction so extraction can use the reviewed text. |
| `GET /admin/ai/question-imports/:importId/items?page=&limit=&q=&status=` | `QueryQuestionImportDto` in the query string | Lists extracted draft-question candidates in an import for review, filtering, and pagination. |
| `GET /admin/ai/question-imports/:importId/media` | No body or query DTO | Lists detected and manually added visual media associated with the import. |
| `POST /admin/ai/question-imports/:importId/retry` | No body | Retries processing for the failed import as a whole. |
| `POST /admin/ai/question-imports/:importId/chunks/:chunkId/retry` | No body | Retries only the failed source-text chunk identified in import diagnostics. |
| `POST /admin/ai/question-imports/:importId/pages/:pageNumber/retry` | No body | Retries processing for one failed source page. |
| `POST /admin/ai/question-imports/:importId/children/:childId/retry` | No body | Retries a failed child processing job within the import. |
| `POST /admin/ai/question-imports/:importId/items/:itemId/retry` | No body | Regenerates or reprocesses one failed extracted-question candidate. |

Use the retry route whose failed entity was returned in the import diagnostics.
Do not retry an import solely because the UI is still polling.

### Visual-media and candidate-review endpoints

```ts
type QuestionImportMediaBoundsDto = {
  left: number;   // integer 0–1000
  top: number;    // integer 0–1000
  right: number;  // integer 0–1000
  bottom: number; // integer 0–1000
};

type CreateQuestionImportMediaDto = {
  pageNumber: number; // integer, minimum 1
  type:
    | 'DIAGRAM' | 'CHART' | 'MAP' | 'TABLE' | 'EQUATION'
    | 'PHOTO' | 'OPTION_IMAGE' | 'OTHER_INSTRUCTIONAL';
  bounds: QuestionImportMediaBoundsDto;
  description: string; // 1–2,000 characters
};

type UpdateQuestionImportMediaDto = Partial<{
  status: 'REVIEW_REQUIRED' | 'ELIGIBLE' | 'REJECTED' | 'FAILED';
  type: CreateQuestionImportMediaDto['type'];
  bounds: QuestionImportMediaBoundsDto;
  description: string; // max 2,000
  note: string;        // max 2,000
}>;

type QuestionImportItemMediaAssignmentDto = {
  mediaKey: string;
  owner: 'QUESTION' | 'OPTION' | 'CONTEXT';
  ownerReference: string; // for example, OPTION:0
  placementAnchor?: string; // START, END, or AFTER:B00001
  confidence?: number;      // 0–1
  reason?: string;          // max 2,000
  status: 'PROPOSED' | 'VERIFIED' | 'APPROVED' | 'REJECTED';
};

type UpdateQuestionImportItemMediaAssignmentsDto = {
  assignments: QuestionImportItemMediaAssignmentDto[];
  note?: string; // max 2,000
  overrideVisualSafeguards?: boolean;
  overrideReason?: string; // max 2,000
};

type AcceptQuestionImportItemDto = {
  candidate: ExtractedDraftCandidate;
  note?: string; // max 2,000
  overrideVisualSafeguards?: boolean;
  overrideReason?: string; // max 2,000
};

type RejectQuestionImportItemDto = {
  reason: string; // 1–2,000 characters
};
```

| Method and endpoint | Request DTO / input | Purpose |
| --- | --- | --- |
| `POST /admin/ai/question-imports/:importId/media` | `CreateQuestionImportMediaDto` | Adds a manually identified visual region to the import for review and possible question attachment. |
| `PATCH /admin/ai/question-imports/:importId/media/:mediaKey` | `UpdateQuestionImportMediaDto` | Corrects a media item’s review status, type, bounds, description, or reviewer note. |
| `POST /admin/ai/question-imports/:importId/media/:mediaKey/retry` | No body | Retries processing for a media item whose extraction or analysis failed. |
| `PATCH /admin/ai/question-imports/:importId/items/:itemId/media` | `UpdateQuestionImportItemMediaAssignmentsDto` | Reviews and saves which import media belongs in the draft question, an option, or its context. |
| `POST /admin/ai/question-imports/:importId/items/:itemId/accept` | `AcceptQuestionImportItemDto` | Accepts the reviewed candidate and creates its answerless question draft, including approved media assignments. |
| `POST /admin/ai/question-imports/:importId/items/:itemId/reject` | `RejectQuestionImportItemDto` | Rejects an unusable extracted candidate and records the reviewer’s reason. |

### Verified-answer explanation endpoints

```ts
type AiQuestionAnswerDto =
  | { selectedOptionIndexes: number[] }
  | { acceptedAnswers: string[] }
  | { gradingRubric: string };

type CreateAiQuestionExplanationRunDto = {
  suppliedAnswer: AiQuestionAnswerDto;
  additionalContext?: string;
};

type ApplyAiQuestionExplanationRunDto = {
  applyAnswer: boolean;
  applyExplanation: boolean;
  structuredExplanation?: StructuredExplanation;
  note?: string;
};

type RejectAiQuestionExplanationRunDto = {
  note: string;
};
```

| Method and endpoint | Request DTO / input | Purpose |
| --- | --- | --- |
| `POST /admin/questions/:questionId/ai/re-answer` | `CreateAiQuestionExplanationRunDto` | Starts an AI explanation run using the answer explicitly supplied by the administrator. |
| `GET /admin/questions/:questionId/ai/re-answer` | No body or query DTO | Lists explanation runs for the question so the review screen can show history and current state. |
| `GET /admin/questions/:questionId/ai/re-answer/:runId` | No body or query DTO | Retrieves one explanation run and its generated answer/explanation proposal for review. |
| `POST /admin/questions/:questionId/ai/re-answer/:runId/apply` | `ApplyAiQuestionExplanationRunDto` | Applies the administrator-approved answer and/or explanation from a reviewed run to the question. |
| `POST /admin/questions/:questionId/ai/re-answer/:runId/reject` | `RejectAiQuestionExplanationRunDto` | Rejects an explanation proposal and retains the reviewer’s reason without changing the question. |

### Question-readiness and publishing endpoints

```ts
type UpdateQuestionDto = Partial<{
  bankId: string;
  sourceId: string;
  courseId: string;
  type:
    | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER'
    | 'FILL_IN_THE_BLANK' | 'LONG_ANSWER';
  placements: QuestionPlacementDto[];
  body: string; // 1–100,000 characters
  contentBlocks: QuestionContentBlockDto[];
  explanation: string | null;
  contextIds: string[];
  structuredExplanation: StructuredExplanation;
  maxPoints: number; // integer, minimum 1
  acceptedAnswers: string[] | null;
  gradingRubric: string | null;
  answerOrigin:
    | 'OFFICIAL' | 'SOURCE_MARKED' | 'AI_INFERRED' | 'HUMAN_REVIEWED' | null;
}>;

type QuestionContentBlockDto = {
  type: 'TEXT' | 'IMAGE' | 'ASSET' | 'TABLE' | 'EQUATION';
  text?: string;         // max 100,000
  assetId?: string;
  tableData?: { cells: string[][]; headerRow: boolean };
  latex?: string;        // max 100,000
  mathml?: string;       // max 100,000
  caption?: string;      // max 2,000
  altText?: string;      // max 2,000
  languageCode?: string; // max 12
};

type BulkPublishQuestionsDto = {
  questionIds: string[]; // unique; 1–300 IDs
};
```

| Method and endpoint | Request DTO / input | Purpose |
| --- | --- | --- |
| `GET /admin/questions/:questionId` | No body or query DTO | Retrieves the full accepted question for the edit, readiness, and publishing screens. |
| `PATCH /admin/questions/:questionId` | `UpdateQuestionDto` | Updates editable question content, placement, metadata, or non-answer fields before publication. |
| `POST /admin/questions/bulk-publish` | `BulkPublishQuestionsDto` | Publishes up to 300 selected questions after server-side readiness validation. |

`PATCH` can mark an existing structured explanation stale. For this flow, use
the verified-answer apply endpoint—not a generic question patch—to set an
answer and approve an explanation.

## Workflow at a glance

```text
Upload PDF → queue import → poll until review → edit/accept answerless draft
→ admin enters verified answer → AI generates explanation → admin reviews/applies
→ optionally publish
```

Do not combine the acceptance and answer-review screens. A newly accepted v7
question deliberately has no answer and no explanation.

## 1. Create and monitor an import

Upload the PDF through the existing asset-upload flow, complete it, and retain
the resulting READY asset ID. Then create the import:

```http
POST /admin/ai/question-imports
Content-Type: application/json

{
  "bankId": "bank_id",
  "sourceId": "source_id",
  "courseId": "course_id",
  "placements": [{ "chapterId": "chapter_id" }],
  "sourceAssetId": "ready_pdf_asset_id"
}
```

`rawText` may be used instead of `sourceAssetId`; provide exactly one input.
The API returns an import with status `QUEUED`.

Poll this endpoint while processing:

```http
GET /admin/ai/question-imports/:importId
```

Typical PDF progression is `QUEUED → TRANSCRIBING → SEGMENTING → GENERATING →
AWAITING_REVIEW`. The API can also return `EXTRACTING`, `COMPLETED`,
`COMPLETED_WITH_ERRORS`, or `FAILED`. Treat the status returned by the API as
authoritative rather than assuming every intermediate state will occur.

Recommended UI behavior:

- Poll with backoff while the import is non-terminal (for example, every 2–5
  seconds initially, then less often).
- Show page/chunk diagnostics and retry controls for partial or failed work.
- Stop automatic polling at `AWAITING_REVIEW`, `COMPLETED`,
  `COMPLETED_WITH_ERRORS`, or `FAILED`.
- Preserve the import ID in the URL so a reviewer can resume later.

## 2. Review source text, candidates, and visuals

Once review is available, load these resources together:

```http
GET /admin/ai/question-imports/:importId/source-text
GET /admin/ai/question-imports/:importId/items?page=1&limit=100
GET /admin/ai/question-imports/:importId/media
```

The source-text response includes retained page text, confidence, uncertain
spans, and warnings. If transcription/boundaries need correction, an admin can
replace the normalized source text:

```http
PATCH /admin/ai/question-imports/:importId/source-text

{ "normalizedText": "Corrected source text…" }
```

This is allowed only while the import is `AWAITING_REVIEW` and **before any
items have been created**. It requeues segmentation, so discard stale local
candidate state and begin polling again.

Visual regions are reviewed separately from the text candidate. Use the media
and item-media endpoints to approve, reject, move, or reorder visual
assignments before accepting an item:

```http
PATCH /admin/ai/question-imports/:importId/items/:itemId/media
```

Visual requirements are advisory for the administrator. The UI should show
unresolved visual warnings prominently and capture a reason when a reviewer
chooses to proceed despite one; it must not present an AI warning as an
absolute publishing block.

## 3. Edit and accept an answerless candidate

The reviewer can edit the candidate **before** acceptance. For v7, the
accepted candidate supports question wording, type, choice option wording, and
optional warnings:

```ts
type ExtractedDraftCandidate = {
  type:
    | 'SINGLE_CHOICE'
    | 'MULTIPLE_CHOICE'
    | 'SHORT_ANSWER'
    | 'FILL_IN_THE_BLANK'
    | 'LONG_ANSWER';
  body: string;
  options?: Array<{ body: string }>;
  warnings?: string[];
};
```

For `SINGLE_CHOICE` and `MULTIPLE_CHOICE`, require at least two options. Each
non-visual option must have non-blank, distinct text. Visual ownership is
managed via the separate media-assignment endpoint, not by placing answer data
in this object.

Never send any of these fields in an extracted candidate:

- `selectedOptionIndexes`
- `acceptedAnswers`
- `gradingRubric`
- `answerOrigin`
- `confidence`
- `explanation` or `structuredExplanation`
- `citedEvidenceKeys`

The API rejects those fields. This is a safety boundary, not a validation bug.

```http
POST /admin/ai/question-imports/:importId/items/:itemId/accept
Content-Type: application/json

{
  "candidate": {
    "type": "SINGLE_CHOICE",
    "body": "Which statement is verified by the reviewer?",
    "options": [
      { "body": "Verified option" },
      { "body": "Other option" }
    ]
  },
  "note": "Wording reviewed against the source PDF."
}
```

Acceptance creates one question in `DRAFT`. For a choice question all options
are initially `isCorrect: false`; `answerOrigin`, `acceptedAnswers`, and
`gradingRubric` are absent/null. Do not render this draft as assessment-ready.

After a successful accept, replace the local item with the API response and
load the canonical question:

```http
GET /admin/questions/:questionId
```

An item can only be accepted once. If it should not become a question, use:

```http
POST /admin/ai/question-imports/:importId/items/:itemId/reject

{ "reason": "Not a standalone question." }
```

## 4. Supply the verified answer and request an explanation

On the accepted-question screen, the administrator enters the answer from an
authoritative source. The client then asks AI to generate an explanation using
that answer:

```http
POST /admin/questions/:questionId/ai/re-answer
Content-Type: application/json

{
  "suppliedAnswer": { "selectedOptionIndexes": [0] },
  "additionalContext": "Use the terminology taught in Unit 4."
}
```

Use exactly one answer shape matching the question type:

| Question type | `suppliedAnswer` |
| --- | --- |
| `SINGLE_CHOICE` | `{ "selectedOptionIndexes": [0] }` — exactly one zero-based index |
| `MULTIPLE_CHOICE` | `{ "selectedOptionIndexes": [0, 2] }` — at least two distinct zero-based indexes |
| `SHORT_ANSWER` / `FILL_IN_THE_BLANK` | `{ "acceptedAnswers": ["answer"] }` — non-blank text values |
| `LONG_ANSWER` | `{ "gradingRubric": "…" }` — non-blank rubric |

`mode`, `INFER`, and an empty body are invalid. The response is a retained
`PENDING_REVIEW` run. `proposedAnswer` will exactly equal `suppliedAnswer`;
the AI result is the proposed structured explanation, confidence, and any
warnings.

Do not show an AI-generated value as the answer. The reviewer-entered answer
is the only answer source in this workflow.

## 5. Review, edit, apply, or reject the explanation run

Load retained runs if the reviewer leaves and returns:

```http
GET /admin/questions/:questionId/ai/re-answer
GET /admin/questions/:questionId/ai/re-answer/:runId
```

Populate an editable review form from `structuredExplanation`. It has six
required sections:

```ts
type StructuredExplanation = {
  keywords: string;
  eliminationStrategy: string;
  whyCorrect: string;
  generalRule: string;
  whatIf: string;
  commonMistakes: string;
};
```

To apply the verified answer and an edited explanation, submit all six
non-blank sections:

```http
POST /admin/questions/:questionId/ai/re-answer/:runId/apply
Content-Type: application/json

{
  "applyAnswer": true,
  "applyExplanation": true,
  "structuredExplanation": {
    "keywords": "Addition, two groups of two",
    "eliminationStrategy": "Count the objects in both groups together.",
    "whyCorrect": "Two objects plus two more objects make four objects.",
    "generalRule": "Addition combines quantities into a total.",
    "whatIf": "Adding one more object would make five.",
    "commonMistakes": "Count every object exactly once."
  },
  "note": "Reviewed and approved."
}
```

Rules for the apply form:

- At least one of `applyAnswer` or `applyExplanation` must be `true`.
- Include `structuredExplanation` only when `applyExplanation` is `true`.
- Omit `structuredExplanation` to approve the generated explanation unchanged.
- Explanation-only application is permitted only if the question’s current
  answer already equals the run’s supplied answer.
- A changed question invalidates its pending run; show the `409` response and
  prompt the reviewer to generate a new run.
- Applying a run to a published question creates a replacement `DRAFT`, rather
  than editing the published record in place.

The apply response is the canonical persisted question. Use it to replace local
state; do not optimistically infer correct-option flags or explanation origin.
For human-edited content, the returned explanation has `origin: "HUMAN"` and
does not retain AI model, confidence, or warnings.

To reject without changing the question:

```http
POST /admin/questions/:questionId/ai/re-answer/:runId/reject

{ "note": "Explanation needs a clearer elimination strategy." }
```

Only `PENDING_REVIEW` runs are rejectable or applicable. Disable those actions
for `APPLIED` and `REJECTED` runs and handle a `409` as an already-resolved or
stale review state.

## 6. Staleness and publication UX

Editing question content after an explanation has been applied sets
`structuredExplanation.staleAt`. This does not prevent publication. It means
the explanation may no longer accurately describe the question.

Show a persistent warning on the question editor and publishing confirmation:

```text
The explanation may be out of date because this question changed.
Review or regenerate it before publishing.
```

Allow an authorized user to proceed when the product requires it, but record
that choice in the UI or surrounding editorial process. Regenerating and
applying a new explanation clears the stale state.

## Client error handling

| Response | Client action |
| --- | --- |
| `400` | Display field validation. Common causes are answer fields in an extracted candidate, an invalid answer shape, or incomplete edited explanation. |
| `401` / `403` | End the action and use the standard admin-session/permissions flow. |
| `404` | Treat the import, item, question, or run as unavailable; refresh the surrounding list. |
| `409` | Refresh canonical question/run data. Common causes are double acceptance, applying/rejecting a resolved run, or a question changed after generation. |
| `5xx` | Preserve unsaved reviewer edits locally, show a retry action, and do not assume the action succeeded. |

## Suggested screen states

1. **Import progress:** queued/processing, diagnostics, retry.
2. **Import review:** PDF/source-text viewer, candidate list, media assignments.
3. **Draft correction:** editable answerless candidate and accept/reject action.
4. **Verified-answer entry:** type-specific answer controls and explicit
   reviewer confirmation.
5. **Explanation review:** generated six-section explanation, warnings,
   edit/apply/reject controls.
6. **Question readiness:** answer origin, explanation origin, stale indicator,
   and normal draft/publish controls.

Keep server responses as the source of truth at every transition. In
particular, refetch after `409` responses and replace local state with the
successful accept/apply response.
