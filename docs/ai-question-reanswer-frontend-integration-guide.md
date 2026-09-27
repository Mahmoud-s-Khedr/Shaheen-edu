# Verified Answer Explanation — Frontend Integration Guide

The re-answer route now generates an explanation only. An `ADMIN` or `SUPER_ADMIN` must first supply a verified answer; AI never infers, proposes, compares, or stores an answer.

```http
POST /api/v1/admin/questions/:questionId/ai/re-answer
Authorization: Bearer <access-token>
Content-Type: application/json
```

```ts
type AiQuestionAnswerDto =
  | { selectedOptionIndexes: number[] }
  | { acceptedAnswers: string[] }
  | { gradingRubric: string };

type CreateAiQuestionExplanationRunDto = {
  suppliedAnswer: AiQuestionAnswerDto; // required, verified by the admin
  additionalContext?: string;
};
```

Use only the answer field matching the question type. Choice indexes are zero-based; a single-choice question needs one index, and multiple-choice needs at least two distinct indexes. All indexes must reference existing options; invalid selections are rejected before calling AI. Written questions require non-blank `acceptedAnswers`; long-answer questions require a non-blank rubric. `mode` and `INFER` are no longer accepted.

```json
{
  "suppliedAnswer": { "selectedOptionIndexes": [0] },
  "additionalContext": "Use the terminology taught in Unit 4."
}
```

The response is a `PENDING_REVIEW` run. Its `proposedAnswer` is exactly the verified supplied answer. AI output consists only of `structuredExplanation`, explanation-quality `confidence`, and `warnings`; there is no AI answer or conflict warning.

Use `POST /admin/questions/:questionId/ai/re-answer/:runId/apply` with `applyAnswer`, `applyExplanation`, and an optional note. Applying the answer writes the supplied answer and marks it `HUMAN_REVIEWED`. Explanation-only apply is allowed only when the current question answer already equals that verified answer. Applying a run to a published question creates a replacement draft. Reject with `POST .../:runId/reject` and a required note.

To edit before approval, populate the review form from the run's `structuredExplanation`, let the administrator edit it, and send the complete six-section object with the apply request:

```json
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
  "note": "Explanation edited and approved."
}
```

`structuredExplanation` is optional. Omit it to apply the generated explanation unchanged. When included, all six sections must be non-blank strings of at most 10,000 characters each; partial objects and null are rejected. It requires `applyExplanation: true`. The backend trims the sections and saves both the structured explanation and the rendered student-facing text during approval.

Edited explanations use `origin: HUMAN` and do not inherit AI model, confidence, or warnings. The original AI explanation and provider response remain on the run; the applied edits are also recorded in the approval audit metadata as `reviewedExplanation`. The supplied answer and existing stale-run checks still apply. Editing in the frontend does not save anything until the apply request succeeds.
