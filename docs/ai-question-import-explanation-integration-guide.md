# AI Question Import Draft Integration Guide

For new v7 imports, `POST /api/v1/admin/ai/question-imports/:importId/items/:itemId/accept` creates an **answerless draft**. Import is extraction only: accepted candidates may contain the question body, type, choice options, shared-context links, and reviewed media assignments, but never an answer, rubric, answer provenance, confidence, evidence, explanation, or structured explanation.

For choice questions every created option has `isCorrect: false`. Written questions have no `acceptedAnswers`, and long-answer questions have no rubric. The draft cannot be published until its answer and explanation satisfy the normal publication requirements. An administrator can enter both manually, or supply a verified answer to the separate explanation API and review/apply its output. AI explanation generation is optional.

```json
{
  "candidate": {
    "type": "SINGLE_CHOICE",
    "body": "Which organ pumps blood around the body?",
    "options": [{ "body": "Heart" }, { "body": "Lung" }]
  },
  "note": "Wording checked against the printed source."
}
```

Do not include `selectedOptionIndexes`, `acceptedAnswers`, `gradingRubric`, `answerOrigin`, `confidence`, `explanation`, `structuredExplanation`, or answer-evidence fields. The API rejects those fields for extraction drafts.

Image-only options may omit text when an approved OPTION visual supplies their content. Missing or unapproved images are shown as unresolved visual requirements during review. An empty option still needs an approved image before acceptance.

Retries preserve the original import schema, including legacy answer-bearing candidates. To use extraction-only behavior for an older document, create a new import; retrying does not convert existing batches to v7.
