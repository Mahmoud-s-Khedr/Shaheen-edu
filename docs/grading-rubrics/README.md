# Writing a gradingRubric

`gradingRubric` is a plain-text string for `LONG_ANSWER` questions. It must contain the verified answer content and the rules for awarding marks. Multiline text is supported; there is no required rubric syntax.

The app uses this text both to grade student responses and to generate explanations. The explanation generator treats it as authoritative and does not infer a missing answer. A non-empty string passes current backend validation, but that does not guarantee a useful rubric.

## What to include

1. The expected answer: the actual facts, reasoning, calculation, or relationships the student must describe.
2. Separate criteria with explicit marks. Their total should equal the question's `maxPoints` (or the re-answer request's proposed `maxPoints`).
3. Acceptable equivalent wording or valid alternative methods.
4. Partial-credit and omission rules, including how contradictory statements affect the relevant criterion.
5. For diagrams, the verified meaning of every referenced label. Attach the actual image to the question or its shared context too.

Use whole-number marks in these examples: the grading client requests integer `awardedPoints`. Do not assume fractional marks are supported end to end.

## Copyable Arabic template

This is a template, not a completed answer. Replace every bracketed item before saving.

```text
الإجابة النموذجية:
[اكتب الإجابة الصحيحة كاملة، بما فيها خطوات الحل أو تفسير العلاقات المطلوبة.]

توزيع الدرجات — المجموع [عدد] درجات:
1. [العنصر الصحيح المطلوب بالتحديد]: [عدد] درجة.
2. [العنصر الصحيح المطلوب بالتحديد]: [عدد] درجة.

البدائل المقبولة:
[الصياغات المكافئة أو طرق الحل الأخرى التي تحقق العناصر نفسها.]

قواعد التصحيح:
- يمنح كل عنصر درجته عند تحقق المضمون المحدد له.
- لا تمنح درجة العنصر الغائب أو الخاطئ، ولا تخصم من عنصر آخر صحيح بسبب ذلك.
- [حدد حكم التناقض أو النتيجة الصحيحة دون خطوات إذا كان ذلك مناسبًا للسؤال.]
- لا يشترط التطابق الحرفي مع الإجابة النموذجية إذا كان المعنى صحيحًا.
```

## Weak inputs from the investigated runs

| Input | Why it is incomplete | What to add |
| --- | --- | --- |
| `تصحيح عام` | Contains neither an answer nor criteria. | The verified answer, required elements, and marks. |
| `كل عظمة بدرجه` | Specifies marks without explaining the connections. | Verified label identities and the exact connection required for each bone. |

For a one-word completion such as the white-blood-cell question, first verify the expected term from the answer key. If it is genuinely a short response, use the appropriate short/fill question type and `acceptedAnswers`, rather than a generic long-answer rubric. This guide does not invent that question's missing answer.

## Where to put it in the API

For the re-answer endpoint, put the string inside `suppliedAnswer.gradingRubric`. Do not put the expected answer only in `additionalContext`; that field contains teaching preferences.

```json
{
  "maxPoints": 3,
  "explanationLanguage": "ar",
  "suppliedAnswer": {
    "gradingRubric": "الإجابة النموذجية: س = 4.\nتوزيع الدرجات: طرح 3 من الطرفين للحصول على 2س = 8: درجة واحدة. قسمة الطرفين على 2 والحصول على س = 4: درجة واحدة. التحقق بالتعويض 2 × 4 + 3 = 11: درجة واحدة. تقبل الطرق المكافئة. الإجابة النهائية الصحيحة وحدها دون خطوات أو تحقق تستحق درجة واحدة فقط."
  },
  "additionalContext": "اشرح خطوات الحل بلغة عربية بسيطة."
}
```

Creating a run retains it for review. Saving its answer to the question requires applying the run with `applyAnswer: true`; `applyExplanation: true` also applies the reviewed explanation. This documentation does not apply anything to production.

## Examples

- [Algebra: worked solution and partial credit](algebra.md)
- [Biology: photosynthesis explanation](photosynthesis.md)
- [Diagram question: completing the pelvic-bones rubric](diagram-template.md)

These are authored examples, not official curriculum answer keys. Verify content and marking against the course before use.

Implementation references: [explanation client](../../src/modules/ai-question-explanations/question-ai-explanation.client.ts), [grading client](../../src/modules/assessments/assessment-ai.client.ts), and [re-answer integration guide](../ai-question-reanswer-frontend-integration-guide.md).
