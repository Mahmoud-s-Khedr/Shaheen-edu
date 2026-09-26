# AI Answer and Explanation Review — Frontend Integration Guide

This guide covers the admin workflow for generating, reviewing, applying, and
rejecting AI answer/explanation proposals for an existing question.

The feature is deliberately assistive: generating a proposal never changes the
question. An `ADMIN` or `SUPER_ADMIN` must explicitly apply or reject every
proposal.

## 1. Scope and prerequisites

All paths below are relative to the API base URL:

```text
/api/v1
```

Every request requires a current admin bearer token:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

The frontend needs the canonical question ID before opening this feature. The
server loads the question's body, options, content blocks, shared contexts, and
eligible images itself. Do not send the full question back in the request.

| Endpoint | Purpose |
| --- | --- |
| `POST /admin/questions/:questionId/ai/re-answer` | Generates and stores one review proposal. |
| `GET /admin/questions/:questionId/ai/re-answer` | Lists all stored runs for the question, newest first. |
| `GET /admin/questions/:questionId/ai/re-answer/:runId` | Gets one stored run in full. |
| `POST /admin/questions/:questionId/ai/re-answer/:runId/apply` | Applies the selected answer and/or explanation after human review. |
| `POST /admin/questions/:questionId/ai/re-answer/:runId/reject` | Rejects a pending proposal without changing the question. |

The API documentation is available at `/api/docs` when enabled. Treat it and
the backend DTOs as the final schema authority.

## DTO reference for every endpoint

`questionId` and `runId` are URL parameters, not JSON-body DTO fields. Both
are required opaque string IDs. The controller does not define query parameters
for this feature.

```ts
type ReanswerPathParams = {
  questionId: string;
};

type ReanswerRunPathParams = ReanswerPathParams & {
  runId: string;
};

// Backend DTO: AiQuestionAnswerDto
type AiQuestionAnswerDto = {
  selectedOptionIndexes?: number[]; // 1–20 non-negative integers
  acceptedAnswers?: string[]; // 1–100 non-blank strings, max 10,000 chars each
  gradingRubric?: string; // non-blank, max 100,000 chars
};

// Backend DTO: CreateAiQuestionExplanationRunDto
type CreateAiQuestionExplanationRunDto = {
  mode: 'INFER' | 'GROUNDED';
  suppliedAnswer?: AiQuestionAnswerDto;
  additionalContext?: string; // max 20,000 chars
};

// Backend DTO: ApplyAiQuestionExplanationRunDto
type ApplyAiQuestionExplanationRunDto = {
  applyAnswer: boolean;
  applyExplanation: boolean;
  note?: string; // max 2,000 chars
};

// Backend DTO: RejectAiQuestionExplanationRunDto
type RejectAiQuestionExplanationRunDto = {
  note: string; // required, non-blank, max 2,000 chars
};
```

The DTO permits the optional fields shown above at the transport-validation
layer, but the service applies stricter rules based on `mode` and question
type. Those rules are documented in [Create a review run](#3-create-a-review-run).

| Endpoint | URL DTO | Body DTO | Success response DTO/shape |
| --- | --- | --- | --- |
| `POST /admin/questions/:questionId/ai/re-answer` | `ReanswerPathParams` | `CreateAiQuestionExplanationRunDto` | One `AiReviewRun` with `PENDING_REVIEW` on successful generation. |
| `GET /admin/questions/:questionId/ai/re-answer` | `ReanswerPathParams` | None | `AiReviewRun[]`, ordered newest first. |
| `GET /admin/questions/:questionId/ai/re-answer/:runId` | `ReanswerRunPathParams` | None | One `AiReviewRun`. |
| `POST /admin/questions/:questionId/ai/re-answer/:runId/apply` | `ReanswerRunPathParams` | `ApplyAiQuestionExplanationRunDto` | Updated question or replacement draft question. Read its `id`, then refetch canonical question detail. |
| `POST /admin/questions/:questionId/ai/re-answer/:runId/reject` | `ReanswerRunPathParams` | `RejectAiQuestionExplanationRunDto` | Updated `AiReviewRun` with `REJECTED` status. |

There is currently no separately declared backend response DTO for an applied
question. Its response is the updated persistence object; do not rely on it as
a complete question-detail response. Always follow a successful apply call with
the existing canonical question-detail API using the returned `id`.

## 2. Recommended user journey

```text
Question editor/detail
  -> choose “Generate AI review”
  -> select INFER or GROUNDED mode
  -> generate a PENDING_REVIEW run
  -> inspect answer, explanation, confidence, warnings, and conflicts
  -> apply selected fields OR reject with a reason
  -> reload the canonical question and run history
```

Show the feature as a review panel or modal within the question editor. Make
the current question answer visible next to the proposal, particularly for
`INFER` runs. Never present an inferred answer as already correct or official.

## 3. Create a review run

```http
POST /api/v1/admin/questions/:questionId/ai/re-answer
```

### 3.1 Request modes

`mode` is required and has exactly two values:

| Mode | When to use it | Answer behavior |
| --- | --- | --- |
| `INFER` | The question has no trusted answer, or an admin wants a second opinion. | AI proposes an answer from the question material. The result remains untrusted until applied by a human. |
| `GROUNDED` | An admin has the authoritative answer and needs a supporting explanation/review. | The supplied answer is authoritative. AI may report a reasoning conflict, but the stored proposal keeps the supplied answer. |

`additionalContext` is optional plain text, up to 20,000 characters. Use it for
relevant teaching context or a source note. Do not use it to paste the question
again; the server already has the canonical question. Treat it as sensitive
authoring data in the UI because it is sent to the server's AI integration.

### 3.2 INFER request

Do not send `suppliedAnswer` in `INFER` mode.

```json
{
  "mode": "INFER",
  "additionalContext": "Use the terminology taught in Unit 4."
}
```

### 3.3 GROUNDED request

`GROUNDED` mode requires a `suppliedAnswer`. Its shape depends on the question
type. Send only the matching answer field; the other two fields must be
omitted.

#### Single-choice or multiple-choice

`selectedOptionIndexes` contains zero-based indexes in the question's canonical
option order.

```json
{
  "mode": "GROUNDED",
  "suppliedAnswer": {
    "selectedOptionIndexes": [1, 3]
  }
}
```

Use one index for a single-choice question and one or more indexes for a
multiple-choice question. The backend removes duplicate indexes and sorts them.

#### Short-answer or fill-in-the-blank

```json
{
  "mode": "GROUNDED",
  "suppliedAnswer": {
    "acceptedAnswers": ["Cairo", "القاهرة"]
  }
}
```

`acceptedAnswers` must contain one or more non-blank strings. Each string is
limited to 10,000 characters; send at most 100 values.

#### Long-answer

```json
{
  "mode": "GROUNDED",
  "suppliedAnswer": {
    "gradingRubric": "Award full marks when the student identifies the cause and explains its effect."
  }
}
```

`gradingRubric` must be non-blank and is limited to 100,000 characters.

### 3.4 Frontend request types

```ts
type ChoiceAnswer = { selectedOptionIndexes: number[] };
type WrittenAnswer = { acceptedAnswers: string[] };
type LongAnswer = { gradingRubric: string };

type CreateInferRun = {
  mode: 'INFER';
  additionalContext?: string;
};

type CreateGroundedRun = {
  mode: 'GROUNDED';
  suppliedAnswer: ChoiceAnswer | WrittenAnswer | LongAnswer;
  additionalContext?: string;
};

type CreateRunRequest = CreateInferRun | CreateGroundedRun;
```

Make the form question-type-aware. For example, render an option selector for
choice questions, a list of accepted-answer inputs for short/fill questions,
and a rubric textarea for long answers. Do not offer a mode/type combination
the API will reject.

### 3.5 Success response

The endpoint returns a persisted run, normally with `status:
"PENDING_REVIEW"`. Important response fields include:

```ts
type StructuredExplanation = {
  keywords: string;
  eliminationStrategy: string;
  whyCorrect: string;
  generalRule: string;
  whatIf: string;
  commonMistakes: string;
};

type ProposedAnswer = {
  selectedOptionIndexes: number[] | null;
  acceptedAnswers: string[] | null;
  gradingRubric: string | null;
};

type AiReviewRun = {
  id: string;
  questionId: string;
  mode: 'INFER' | 'GROUNDED';
  status: 'PENDING_REVIEW' | 'APPLIED' | 'REJECTED' | 'FAILED';
  suppliedAnswer: ProposedAnswer | null;
  proposedAnswer: ProposedAnswer | null;
  structuredExplanation: StructuredExplanation | null;
  confidence: number | null; // 0 through 1 when generation succeeds
  warnings: string[] | null;
  conflictWarning: string | null;
  model: string;
  promptVersion: string;
  createdById: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  applyAnswer: boolean | null;
  applyExplanation: boolean | null;
  appliedQuestionId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};
```

The persisted record also contains backend/audit fields such as the question
snapshot, source fingerprint, provider response, and usage. The frontend
should use only the display and workflow fields it needs; never expose raw
provider payloads to students.

For a successful `GROUNDED` run, `proposedAnswer` equals the normalized
`suppliedAnswer`. If the model's independent reasoning differs, inspect and
prominently display `conflictWarning` before allowing the admin to apply it.

## 4. Displaying a proposal safely

Render all six structured explanation sections. A useful display order is:

1. Proposed answer, beside the current question answer.
2. Confidence as a supporting signal only, never an approval decision.
3. `conflictWarning` in a high-visibility warning callout.
4. Every string in `warnings`.
5. `whyCorrect`, then the remaining explanation sections in expandable panels.
6. Run metadata: mode, creator, generated date, model, and final review state.

For choices, translate `selectedOptionIndexes` back to option text using the
same option ordering used by the question detail response. Do not render an
index by itself. If an index is absent from the current option list, show a
stale-data error and refresh the question/run data rather than guessing.

Avoid a one-click “accept AI” action. The review UI should require explicit
selection of whether to apply the answer, the explanation, or both.

## 5. Load the review history

```http
GET /api/v1/admin/questions/:questionId/ai/re-answer
GET /api/v1/admin/questions/:questionId/ai/re-answer/:runId
```

The list endpoint returns runs in descending creation order. Use it when the
panel opens and after a generate, apply, or reject action. Use the detail
endpoint when a user selects a historical row or directly opens a run URL.

Suggested status labels:

| API status | UI label | Available actions |
| --- | --- | --- |
| `PENDING_REVIEW` | Needs review | Apply or reject, subject to current question state. |
| `APPLIED` | Applied | Read-only; link to `appliedQuestionId` if different. |
| `REJECTED` | Rejected | Read-only; show the required review note. |
| `FAILED` | Generation failed | Read-only failure record; allow the user to start a new run. |

## 6. Apply a reviewed proposal

```http
POST /api/v1/admin/questions/:questionId/ai/re-answer/:runId/apply
```

Send at least one field to apply:

```json
{
  "applyAnswer": true,
  "applyExplanation": true,
  "note": "Reviewed against the curriculum answer key."
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `applyAnswer` | Yes | Whether to update the proposed answer. |
| `applyExplanation` | Yes | Whether to save the proposed structured explanation and its rendered text. |
| `note` | No | Review note, maximum 2,000 characters. |

The API rejects a request where both booleans are `false`.

### Apply rules that affect the UI

- Only a `PENDING_REVIEW` run can be applied.
- The source question must be `DRAFT`, `REJECTED`, or `PUBLISHED`.
- The source question must be unchanged since the run was generated. The API
  checks this using a server-side fingerprint.
- Applying only an explanation is permitted only when the run's proposed
  answer already matches the question's current answer.
- Applying an answer without an explanation clears the existing explanation,
  since it may no longer match the answer.
- Applying to a `PUBLISHED` question creates a replacement `DRAFT` question;
  it does not edit the live published question. The response is that replacement
  question and its ID may differ from `:questionId`.
- Applied answers are recorded as human-reviewed. The action is audit logged.

After success, close or reset the review controls, refetch the question by the
returned ID, and refetch the run list. Do not mutate only the local editor
state: a published question can return a new draft replacement.

## 7. Reject a proposal

```http
POST /api/v1/admin/questions/:questionId/ai/re-answer/:runId/reject
```

```json
{
  "note": "The proposed answer conflicts with the official marking scheme."
}
```

`note` is required, must be non-blank, and is limited to 2,000 characters.
Only `PENDING_REVIEW` runs can be rejected. Rejection updates the run to
`REJECTED`, stores the reviewer and time, and never changes the question.

Require a clear reason in the UI and show the stored note in the run history.

## 8. Error handling

Use the API error message as a user-facing fallback and preserve the response
correlation ID in frontend logs/support tooling.

| Status | Likely reason | Frontend action |
| --- | --- | --- |
| `400` | Invalid mode, wrong answer shape, `INFER` request with `suppliedAnswer`, blank fields, or both apply flags false. | Keep form input; display field/form validation guidance. |
| `401` | Access token is missing or expired. | Run the normal session refresh/sign-in flow. |
| `403` | Caller is not an admin or super admin. | Hide/disable this feature and show the normal access-denied state. |
| `404` | The question or run does not exist, or the run does not belong to that question. | Leave the review view and refresh the question list/detail. |
| `409` | Archived/ineligible question, non-pending run, stale question fingerprint, or invalid apply combination. | Refetch question and run history; show the server message and require a new run when stale. |
| `503` | AI model/provider is unavailable, misconfigured, times out, or returns invalid output. | Show a retryable generation error. The server retains a `FAILED` run for audit. |

Disable the generate/apply/reject button while its request is in flight. If the
request fails because the page was stale, do not automatically repeat it: first
reload and let the reviewer inspect current data.

## 9. UI implementation checklist

- [ ] Restrict entry points to `ADMIN` and `SUPER_ADMIN` users.
- [ ] Fetch the canonical question before rendering choice indexes or answer comparisons.
- [ ] Support both `INFER` and `GROUNDED` modes with question-type-specific controls.
- [ ] Do not send `suppliedAnswer` for `INFER`.
- [ ] Validate context and review-note lengths before submit.
- [ ] Clearly label AI output as a proposal pending human review.
- [ ] Display warnings and conflicts without hiding low-confidence output.
- [ ] Offer apply-answer and apply-explanation as separate explicit choices.
- [ ] Reload canonical question and runs after every mutation.
- [ ] Handle a new returned question ID after applying to a published question.
- [ ] Keep applied/rejected/failed runs read-only.

## 10. Example client calls

```ts
const base = '/api/v1';

async function generateReview(questionId: string, body: CreateRunRequest) {
  const response = await api.post<AiReviewRun>(
    `${base}/admin/questions/${encodeURIComponent(questionId)}/ai/re-answer`,
    body,
  );
  return response.data;
}

async function applyReview(
  questionId: string,
  runId: string,
  body: { applyAnswer: boolean; applyExplanation: boolean; note?: string },
) {
  const response = await api.post(
    `${base}/admin/questions/${encodeURIComponent(questionId)}/ai/re-answer/${encodeURIComponent(runId)}/apply`,
    body,
  );
  return response.data; // canonical question or replacement draft
}

async function rejectReview(questionId: string, runId: string, note: string) {
  const response = await api.post<AiReviewRun>(
    `${base}/admin/questions/${encodeURIComponent(questionId)}/ai/re-answer/${encodeURIComponent(runId)}/reject`,
    { note },
  );
  return response.data;
}
```

The frontend never calls OpenRouter directly and must never receive or manage
the AI provider key. The backend owns model selection, prompt construction,
image retrieval, response validation, provider auditing, and authorization.
