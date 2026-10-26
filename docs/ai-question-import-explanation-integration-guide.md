# AI Question Import Draft Integration Guide

For new v7 imports, `POST /api/v1/admin/ai/question-imports/:importId/items/:itemId/accept` creates an **answerless draft**. Import is extraction only: accepted candidates may contain the question body, type, choice options, shared-context links, and reviewed media assignments, but never an answer, rubric, answer provenance, confidence, evidence, explanation, or structured explanation.

For choice questions every created option has `isCorrect: false`. Written questions have no `acceptedAnswers`, and long-answer questions have no rubric. The draft cannot be published until its answer satisfies the normal publication requirements; an explanation is optional (neither `structuredExplanation` nor `moreExplanation` is required). An administrator can enter the answer manually, or supply a verified answer to the separate explanation API and review/apply its output. AI explanation generation is optional.

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

## Verified-answer explanation formats

Frontend implementation details, UI states, approval examples, and acceptance checks are in the [Question Explanation Formats and Maximum Points frontend guide](question-explanation-formats-and-marks-frontend-integration-guide.md).

New `POST /admin/questions/{questionId}/ai/re-answer` runs use
`WRITTEN_FOUR_SECTION` for `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, and `LONG_ANSWER`.
Choice questions continue to use `SIX_SECTION`. Always read the explicit format;
older written questions and pending runs can still have six sections.

The format is a sibling of the content, never a property inside it:

```json
{
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "Actual required answer content; include only marks explicitly supplied in the rubric.",
    "scientificExplanation": "Supporting concepts, laws, reasoning, and examples.",
    "commonMistakes": "Misconceptions and omissions; deductions only when explicitly supplied.",
    "whatIf": "Effects of changing givens, assumptions, or command words."
  }
}
```

`SIX_SECTION` contains `keywords`, `eliminationStrategy`, `whyCorrect`,
`generalRule`, `whatIf`, and `commonMistakes`. Responses retain existing metadata
such as `languageCode`, `origin`, and review evidence. Inactive sections are
omitted. Both sibling fields are `null` when content is absent or hidden by the
assessment's answer-reveal rules. Use the compatibility `explanation` string
where a flat display is needed; the backend includes localized section labels.

All sections must be nonblank strings of at most 10,000 characters. Complete
manual create/update requests may supply either shape. Legacy six-section
requests may omit the format; four-section requests must explicitly supply it
and use a written question type. Mixed shapes and format mismatches are rejected.

Long-answer generation uses the administrator's supplied `gradingRubric`;
other written generation uses supplied `acceptedAnswers`. The question's
`maxPoints` is included in generation and new-run snapshots/fingerprints. The
prompt requires warnings for absent numerical allocations and allocations
inconsistent with total marks. It forbids invented marking criteria, deductions,
textbook quotations, and citations. Student grading continues to use the
assessment's immutable saved criteria and total marks, independently of these
explanations. Changing total marks stales a written explanation unless the
update supplies a replacement explanation.

### Approving edited content

Send a complete explanation in the run's stored format:

```json
{
  "applyAnswer": false,
  "applyExplanation": true,
  "structuredExplanationFormat": "WRITTEN_FOUR_SECTION",
  "structuredExplanation": {
    "answerElements": "The required answer is ...",
    "scientificExplanation": "This follows because ...",
    "commonMistakes": "A frequent omission is ...",
    "whatIf": "If the assumption changes, ..."
  },
  "note": "Reviewed wording and marking alignment."
}
```

Omitting the sibling format uses the stored run format. Supplying a different
format is rejected. Omit both edit fields to approve the generated content.
Explanation-only approval still requires matching saved answers. Edits retain
human origin and audit evidence; the original run stays immutable. Published
questions receive replacement drafts. Older pending runs retain their original
fingerprint calculation and do not need regeneration.

### Release sequence

1. Deploy `20261010120000_written_explanation_formats` before the backend update.
   The migration defaults existing records, runs, and assessment snapshots to
   `SIX_SECTION` without changing their text or JSON.
2. Coordinate frontend rendering and complete-section editors for both formats
   before exposing new written explanations. Frontend work is outside this repo.
3. Deploy the backend and enable the updated client. Retain existing approval,
   rejection, answer-reveal, and assessment snapshot behavior.

## Editing maximum points during generation

The admin can prefill a maximum-points input from `GET /admin/questions/{id}`
(`maxPoints`) and send the edited value beside `suppliedAnswer`:

```json
{
  "maxPoints": 5,
  "suppliedAnswer": {
    "gradingRubric": "Identify the concept: 2 marks. Explain it: 3 marks."
  },
  "explanationLanguage": "en"
}
```

`maxPoints` is optional and must be an integer of at least 1; null is rejected.
Omission uses the saved question's score. This works for all question types.
Generation uses these marks but does not update the question. Create/list/get/
reject run responses expose `proposedMaxPoints`, including failed runs; older
runs have null. The source snapshot/fingerprint still describes the original
saved question, so edits after generation prevent approval.

Approve with `applyAnswer=true` to save the proposed score alongside the answer.
Published questions receive a replacement draft with the proposed marks.
Explanation-only approval is rejected if proposed marks differ from saved marks:
approve the answer too, or regenerate with the saved score. Answer-only approval
clears the previous explanation. Rejection leaves the question unchanged.
Existing assessment snapshots keep their original marks and grading criteria.
Legacy runs with null proposed marks do not change the question's maximum points.

Deploy `20261010130000_ai_explanation_proposed_max_points` before this backend
update, after the explanation-format migration. The admin frontend is outside
this repository and must add the input and display the proposal during review.
