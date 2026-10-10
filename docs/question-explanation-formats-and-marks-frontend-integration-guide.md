# Question Explanation Formats and Maximum Points — Frontend Integration Guide

This guide covers the frontend changes for format-aware explanations and proposed maximum points in AI explanation review. It applies to admin question editors, AI generation/review screens, and student explanation displays.

All routes below use the `/api/v1` prefix. Admin routes require a bearer access token for an `ADMIN` or `SUPER_ADMIN`. Examples show the fields relevant to this change; response objects also contain existing question/run fields.

This guide supersedes the six-section-only editing instructions in [the earlier re-answer guide](ai-question-reanswer-frontend-integration-guide.md). See also [question import integration](ai-question-import-explanation-integration-guide.md) and [written-answer grading](written-answer-ai-grading-frontend-guide.md).

## 1. What the frontend must change

1. Support both explanation formats in display components and complete-section editors.
2. Read `structuredExplanationFormat` beside `structuredExplanation` in responses.
3. Add a maximum-points input to AI generation, prefilled from the saved question.
4. Show saved and proposed maximum points separately during review.
5. Explain that applying the answer also saves proposed marks, while answer-only approval clears the previous explanation.
6. Refresh question/run data after approval and follow the returned question ID for replacement drafts.
7. Keep student answer-reveal behavior and historical assessment scores intact.

## 2. Explanation response contract

The format belongs to the containing question or run object. It is never inside the explanation object.

```json
{
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "Identify the concept: 2 marks. Explain its effect: 3 marks.",
    "scientificExplanation": "Explain the concepts and reasoning supporting the answer.",
    "commonMistakes": "Avoid omitting the explanation of the effect.",
    "whatIf": "Explain how changing the assumptions affects the result.",
    "languageCode": "en",
    "origin": "HUMAN"
  }
}
```

The response can include metadata such as language, origin, confidence, warnings, review information, and `staleAt`, depending on the endpoint. Render educational sections using an explicit field list; do not render every property as a section.

| Format | Sections in display/editor order | New AI runs use it for |
| --- | --- | --- |
| `SIX_SECTION` | `keywords`, `eliminationStrategy`, `whyCorrect`, `generalRule`, `whatIf`, `commonMistakes` | `SINGLE_CHOICE`, `MULTIPLE_CHOICE` |
| `WRITTEN_FOUR_SECTION` | `answerElements`, `scientificExplanation`, `commonMistakes`, `whatIf` | `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, `LONG_ANSWER` |

Older written questions and pending runs can still use `SIX_SECTION`. **Select the renderer and review editor from the returned format, not from question type.** Question type determines the format only when starting a new manual explanation or anticipating a new AI run.

Inactive sections are omitted from responses. When content is absent or hidden, both fields are null:

```json
{
  "structuredExplanationFormat": null,
  "structuredExplanation": null
}
```

For compatibility with older API responses, missing format with non-null content may default to `SIX_SECTION`. Do not apply this fallback to null content. For an unknown non-null format, avoid opening an editor that could overwrite the content; offer the flat explanation display when available.

### Suggested frontend types and field definitions

```ts
type ExplanationFormat = 'SIX_SECTION' | 'WRITTEN_FOUR_SECTION';

type SixSectionExplanation = {
  keywords: string;
  eliminationStrategy: string;
  whyCorrect: string;
  generalRule: string;
  whatIf: string;
  commonMistakes: string;
};

type WrittenExplanation = {
  answerElements: string;
  scientificExplanation: string;
  commonMistakes: string;
  whatIf: string;
};

// Metadata varies by endpoint and is read-only in section editors.
type ExplanationEnvelope =
  | { structuredExplanationFormat: null; structuredExplanation: null }
  | {
      structuredExplanationFormat: 'SIX_SECTION';
      structuredExplanation: SixSectionExplanation & Record<string, unknown>;
    }
  | {
      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION';
      structuredExplanation: WrittenExplanation & Record<string, unknown>;
    };

const explanationFields = {
  SIX_SECTION: [
    'keywords', 'eliminationStrategy', 'whyCorrect',
    'generalRule', 'whatIf', 'commonMistakes',
  ],
  WRITTEN_FOUR_SECTION: [
    'answerElements', 'scientificExplanation', 'commonMistakes', 'whatIf',
  ],
} as const;

function explanationPayload(
  format: ExplanationFormat,
  form: Record<string, unknown>,
) {
  return Object.fromEntries(
    explanationFields[format].map((field) => [field, form[field]]),
  );
}
```

Use `explanationPayload` to whitelist submitted sections. Do not spread a response object into an edit request: IDs, language, origin, confidence, warnings, review metadata, and inactive sections are not section-edit fields.

### Suggested section labels

| Field | English | Arabic |
| --- | --- | --- |
| `answerElements` | Answer elements | عناصر الإجابة |
| `scientificExplanation` | Scientific explanation | التفسير العلمي |
| `keywords` | Keywords | الكلمات المفتاحية |
| `eliminationStrategy` | Solution strategy | استراتيجية الحل |
| `whyCorrect` | Why this is correct | لماذا هذه الإجابة صحيحة |
| `generalRule` | General rule | القاعدة العامة |
| `whatIf` | What if? | ماذا لو؟ |
| `commonMistakes` | Common mistakes | الأخطاء الشائعة |

Use frontend translations for other UI languages. Preserve the explanation's content language and support RTL Arabic content and mixed formulas. Section content is text; preserve line breaks and use the application's existing safe text/math rendering.

## 3. Generate an explanation with proposed maximum points

### Load and prefill

Fetch `GET /api/v1/admin/questions/:questionId`. Prefill the generation form's maximum-points input from `question.maxPoints`. Keep this editable input separate from the saved-question state.

Label it **Maximum points** and use helper text such as: “Used for this explanation. Saved with the verified answer when you approve it.” The input is supported for every question type.

Before submitting, convert the input to a JSON number and require an integer of at least 1. Empty input should either be a form error or result in omission of `maxPoints`; do not convert an empty value to zero or send null. Numeric strings, fractions, zero, negative values, and null are invalid for this generation field.

### Generate

```http
POST /api/v1/admin/questions/:questionId/ai/re-answer
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "maxPoints": 5,
  "suppliedAnswer": {
    "gradingRubric": "Identify the concept: 2 marks. Explain its effect: 3 marks."
  },
  "explanationLanguage": "en",
  "additionalContext": "Explain at secondary-school level."
}
```

`suppliedAnswer` is required and must contain the field appropriate to the question:

| Question type | Verified answer payload |
| --- | --- |
| `SINGLE_CHOICE` | `{ "selectedOptionIndexes": [0] }` — one zero-based option index |
| `MULTIPLE_CHOICE` | `{ "selectedOptionIndexes": [0, 2] }` — at least two distinct indexes |
| `SHORT_ANSWER`, `FILL_IN_THE_BLANK` | `{ "acceptedAnswers": ["Verified answer"] }` — nonblank accepted answers |
| `LONG_ANSWER` | `{ "gradingRubric": "Required answer content and grading criteria." }` — nonblank rubric |

Choice indexes refer to the backend's ordered options, not an independently sorted or shuffled display. Do not send `mode`, `INFER`, or a requested explanation format: generation is grounded in the supplied verified answer, and the backend selects the format.

`maxPoints` is optional; omission uses the saved score. `explanationLanguage` accepts `ar`, `en`, `de`, or `fr`; omission uses backend language detection. `additionalContext` supplies teaching preferences and cannot override the verified answer, language, or format.

Generation returns HTTP 201 with a retained review run. A relevant response subset is:

```json
{
  "id": "run-id",
  "questionId": "question-id",
  "status": "PENDING_REVIEW",
  "proposedMaxPoints": 5,
  "proposedAnswer": {
    "gradingRubric": "Identify the concept: 2 marks. Explain its effect: 3 marks."
  },
  "languageCode": "en",
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "Identify the concept: 2 marks. Explain its effect: 3 marks.",
    "scientificExplanation": "Explain the supporting concepts and reasoning.",
    "commonMistakes": "Avoid omitting the explanation of the effect.",
    "whatIf": "Changing the assumptions may change the result."
  },
  "confidence": 0.9,
  "warnings": []
}
```

Generation does not save the answer, explanation, or maximum points to the question. Show a pending review state after success, without updating the saved score in the question cache.

Written explanations describe answer content and supporting reasoning. Numerical allocations and deductions should come only from supplied criteria. Surface run warnings, including missing allocations or allocations inconsistent with maximum points, for administrator review. These educational sections do not replace the grading rubric.

## 4. Review and approve a run

| Action | Route | Response |
| --- | --- | --- |
| List retained runs | `GET /api/v1/admin/questions/:questionId/ai/re-answer` | Array of runs |
| Open a run | `GET /api/v1/admin/questions/:questionId/ai/re-answer/:runId` | Run |
| Apply reviewed content | `POST /api/v1/admin/questions/:questionId/ai/re-answer/:runId/apply` | Applied question, HTTP 201 |
| Reject | `POST /api/v1/admin/questions/:questionId/ai/re-answer/:runId/reject` | Updated run, HTTP 201 |

Display the verified answer, stored explanation format, sections, warnings, confidence, and run status. Show **Saved maximum points** from the question and **Proposed maximum points** from `run.proposedMaxPoints`. Use the retained run value when reopening a run, rather than the generation form's current value.

Legacy runs have `proposedMaxPoints: null`; label this “No score change recorded” and preserve the saved score when approved. Failed runs can still expose proposed marks while their explanation and format are null. Only `PENDING_REVIEW` runs can be applied or rejected.

### Approval options

Both booleans are required. At least one must be true.

| `applyAnswer` | `applyExplanation` | Result |
| --- | --- | --- |
| `true` | `true` | Saves the verified answer, proposed maximum points when present, and the reviewed explanation |
| `true` | `false` | Saves the verified answer and proposed maximum points when present; clears the previous flat and structured explanation |
| `false` | `true` | Saves the explanation only; requires the verified answer and proposed marks to match the saved question |
| `false` | `false` | Rejected with HTTP 400 |

Make the score consequence visible in the answer approval label/helper text, for example: “Apply verified answer and proposed maximum points.” For answer-only approval, explain that the existing explanation will be cleared.

If proposed marks differ from saved marks, disable explanation-only approval and offer either approval with the answer or regeneration with the saved score. The backend also checks answer equivalence and rejects mismatches; treat backend validation as authoritative.

The apply endpoint has no `maxPoints` override. If the administrator wants a different proposal, generate a new run with that value.

### Approve unchanged content

```json
{
  "applyAnswer": true,
  "applyExplanation": true,
  "note": "Verified answer, marks, and explanation reviewed."
}
```

Omit both explanation edit fields when approving unchanged content. Do not send only `structuredExplanationFormat`: a supplied format requires an edited explanation.

### Approve edited content

Populate the editor with sections from the run's stored format and send all active sections:

```json
{
  "applyAnswer": true,
  "applyExplanation": true,
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "Identify the concept: 2 marks. Explain its effect: 3 marks.",
    "scientificExplanation": "Administrator-reviewed explanation of the supporting principle.",
    "commonMistakes": "Do not omit the relationship between the concept and its effect.",
    "whatIf": "If the assumptions change, reconsider whether the same principle applies."
  },
  "note": "Edited for clarity and checked against the rubric."
}
```

Every section must be a nonblank string of at most 10,000 characters. Partial, mixed-format, and null explanation objects are invalid. Editing requires `applyExplanation=true`. The supplied format must match the stored run; omission uses its format. Do not offer format switching in an AI run editor, including legacy written runs with six sections.

Edited explanations are saved with human origin, without inheriting AI model/confidence/warnings. The original run content remains available as generation evidence. Local edits are saved only after apply succeeds.

### Refresh and navigation after approval

The apply response is a question object, not the updated run. For a draft or rejected question, it updates that question. For a published question, it creates a replacement draft and returns that draft's ID; publication remains a separate workflow.

After success:

1. Use the returned question object/ID to update or navigate to the editor.
2. Invalidate/refetch the source question, applied question when different, and source question's run list/detail.
3. Display the applied question's returned `maxPoints` and explanation fields.
4. Disable further approval of the applied run after refreshing its status.

### Reject

```json
{
  "note": "The explanation needs revision; keep the saved answer and marks."
}
```

A nonempty note is required, up to 2,000 characters. Rejection preserves the saved question and score. Refresh the run list/detail after success. Apply notes are optional and also limited to 2,000 characters.

## 5. Manual question create/update

Use the existing `POST /api/v1/admin/questions` or `PATCH /api/v1/admin/questions/:id` flow. A manual explanation payload contains complete active sections and the sibling format:

```json
{
  "maxPoints": 5,
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "Required answer content aligned with the saved rubric.",
    "scientificExplanation": "Supporting reasoning and concepts.",
    "commonMistakes": "Likely omissions and misconceptions.",
    "whatIf": "How changed assumptions affect the answer."
  }
}
```

This is a PATCH example; creation also requires the normal question fields. Four-section manual requests must explicitly include the format and use a written question type. Legacy six-section requests may omit the format, which defaults to `SIX_SECTION`; prefer sending it explicitly in new frontend code.

Do not send a format without content. To leave an explanation unchanged, omit both fields. Do not send inactive fields as null or include response metadata. Manual format replacement clears inactive database columns; the UI need not issue separate clearing requests.

Unlike generation, a manual `maxPoints` update immediately changes the saved question. Changing marks on a written question without supplying a replacement structured explanation marks the existing explanation stale. Display `staleAt` as a needs-review indicator in the admin editor and offer review/replacement. Supplying a complete replacement explanation in the same update keeps it current.

## 6. Student displays and assessment history

Use the same format-aware component for structured explanations returned in student assessment attempt state and practice feedback. Some result/feedback endpoints return only the compatibility `explanation` string; keep their existing flat rendering.

For structured display, use the active section list and frontend labels. For flat display, use the API's `explanation` string, which can include localized section headings and existing compatibility text. Avoid displaying both representations together: the flat value can already contain the structured content.

Assessment attempt state returns both explanation fields as null while answers are hidden. Exam-mode explanations are revealed after completion; tutor-mode state may reveal them after an answer is recorded. Follow the server response instead of deriving visibility from the format or fetching admin/source-question content to fill missing sections. Replace cached visible content with null when a newer response hides it.

Assessment questions freeze their format, explanation, maximum points, and grading criteria. Later edits to a source question do not update existing assessments. Use each assessment question's own `maxPoints` and explanation data in attempts/results; do not overlay the current source-question values. AI explanation generation and student-answer grading remain separate workflows.

## 7. Errors and recovery

Use the existing API error handler. Errors contain `statusCode`, `code`, localized `message`/`error`, optional validation `details`, and `correlationId`; do not assume `message` is a plain string or branch on English message text.

| Status / situation | Frontend behavior |
| --- | --- |
| 400: invalid marks, answer payload, sections, or format | Keep form edits and display validation feedback; correct the payload before retrying |
| 409: question changed after generation | Refresh the question and generate a new run; editing explanation text cannot make the run current |
| 409: explanation-only approval has different marks or answer | Offer approval with the verified answer, or regeneration using the saved answer and score |
| 409: run already applied/rejected, or question status no longer permits approval | Refresh run/question state and remove unavailable actions |
| 503: AI generation unavailable or invalid provider output | Preserve form input, show retry feedback, and refresh retained runs because a failed run may have been recorded |
| Network timeout or lost response during apply | Refetch run/question state before retrying; the first request may already have succeeded |

New runs record the saved question's original score in their source fingerprint, even when generation uses a different proposed score. A later saved-question edit can invalidate approval. Older pending runs retain their legacy fingerprint rules; let the server decide whether they remain applicable.

Disable duplicate submissions while a generation, apply, or reject request is pending. Do not mark a run approved or a score saved until the successful response arrives.

## 8. Frontend acceptance checklist

- [ ] New written runs display/edit four sections; choice runs display/edit six.
- [ ] A legacy written question/run with `SIX_SECTION` still displays/edits six sections.
- [ ] Null content produces an empty/hidden state; response metadata never becomes an editable section.
- [ ] Arabic content supports RTL, and formulas and line breaks remain readable.
- [ ] Generation prefills saved marks and submits a numeric integer; null, fractions, zero, and negative values are blocked.
- [ ] Omitting marks uses the saved score; generation leaves the saved question unchanged.
- [ ] Reopening a retained run shows its proposal, including a null legacy proposal and failed-run state.
- [ ] Different proposed marks prevent explanation-only approval; answer equivalence conflicts are handled from the API.
- [ ] Answer approval visibly includes the proposed score; answer-only approval explains that the previous explanation is cleared.
- [ ] Unchanged approval omits edit fields; edited approval sends all active sections and the matching format.
- [ ] Metadata, mixed sections, partial edits, and a standalone format are never submitted.
- [ ] Published-question approval opens the returned replacement draft and refreshes source/run caches.
- [ ] Rejection leaves saved marks/content intact; stale-question conflicts offer regeneration.
- [ ] Manual written-score edits show the returned stale indicator; complete replacements clear that state.
- [ ] Hidden exam content stays hidden, tutor feedback uses returned visibility, and flat/structured displays do not duplicate content.
- [ ] Existing assessments retain their frozen score and explanation after source-question changes.
- [ ] A lost apply response triggers a state refresh before retrying.

## 9. Rollout and API typing

Deploy both backend migrations before the updated backend: `20261010120000_written_explanation_formats`, then `20261010130000_ai_explanation_proposed_max_points`. Existing records default to six sections; legacy proposals remain null.

Ship dual-format frontend rendering and editors before exposing new four-section generation. Frontend implementation is in a separate repository.

The current OpenAPI response schemas for AI review endpoints describe the explanation envelope and proposed score but omit other returned run/question fields. Until those schemas are expanded, retain or extend the frontend's full run/question types using the actual response contract; generating types from only the newly declared schemas will omit fields such as run `id`/`status` and the applied question `id`/`maxPoints`.
