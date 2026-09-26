# AI import review: long-answer grading rubric is missing

## Observed behaviour

When an administrator accepts an imported candidate whose type is `LONG_ANSWER`
(`إجابة طويلة`), the UI can show this error:

> يحتاج المرشحون ذوو الإجابات الطويلة إلى نموذج تقييم

The Arabic wording means that a grading rubric is required; it does **not** mean
that an AI model needs to be selected.

## Confirmed backend condition

The accept endpoint normalizes `candidate.gradingRubric`. It rejects the request
when that value is absent, not a string, or empty after trimming:

- `src/modules/ai-question-import/question-import.service.ts:1532-1539`
- error key: `Long-answer candidates require a grading rubric`

The rubric is later passed to the normal imported-draft creation path and is used
for AI grading. The question DTO also identifies it as required for long-answer
questions:

- `src/modules/question-banks/dto/question-banks.dto.ts:299-305`

## Likely UI issue

The reviewed form shown in the reported screenshot selects `إجابة طويلة` but
does not visibly provide a grading-rubric input. The form may therefore submit a
candidate without `gradingRubric`.

Other possibilities to verify:

1. The original AI extraction did not generate a rubric.
2. The UI renders the rubric control but does not bind it into
   `candidate.gradingRubric`.
3. The client sends the field at the wrong JSON level or with a different name.
4. Client-side normalization clears a whitespace-only rubric.

## Follow-up work

1. In the candidate-review UI, render a required multiline **grading rubric**
   field whenever `type === LONG_ANSWER`.
2. Pre-fill it from the imported candidate when present.
3. Submit the value as `candidate.gradingRubric` and trim it before submission.
4. Add client-side validation with a clear Arabic message before calling the
   accept endpoint.
5. Add an integration/UI test that accepts a corrected long-answer candidate
   with a rubric, and asserts that an empty rubric is blocked locally.
