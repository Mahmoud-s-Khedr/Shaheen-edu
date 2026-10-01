# Student error reflections — frontend integration guide

## Purpose

Students can now record one locked reason for each incorrect answer. A
reflection is available for:

- an incorrect direct-practice attempt; or
- an incorrect answer in a submitted assessment.

The feature is student-only. It is useful immediately after displaying an
incorrect answer and is also returned when the relevant result/history is
loaded later.

All routes below use the existing API base URL, including `/api/v1`, and
require the normal student Bearer token.

## Shared types

Send an enum code in requests. The API returns a localized label object in
responses; do not assume the request value and response value have the same
shape.

```ts
export type StudentErrorReasonCode =
  | 'DID_NOT_KNOW_HOW_TO_SOLVE'
  | 'DID_NOT_UNDERSTAND_THE_QUESTION'
  | 'MADE_A_CALCULATION_MISTAKE'
  | 'MADE_A_CARELESS_MISTAKE';

export type StudentErrorReason = {
  code: StudentErrorReasonCode;
  en: string;
  ar: string;
};

export type StudentErrorReflection = {
  id: string;
  reason: StudentErrorReason;
  createdAt: string; // ISO-8601 date-time
};

export type CreateStudentErrorReflectionBody = {
  reason: StudentErrorReasonCode;
};
```

Suggested UI labels, supplied by the server after creation or on a later
read, are:

| Code                              | English label                                | Arabic label                        |
| --------------------------------- | -------------------------------------------- | ----------------------------------- |
| `DID_NOT_KNOW_HOW_TO_SOLVE`       | Not knowing how to solve the question at all | عدم معرفة كيفية حل السؤال من الأساس |
| `DID_NOT_UNDERSTAND_THE_QUESTION` | Not understanding the question               | عدم فهم السؤال                      |
| `MADE_A_CALCULATION_MISTAKE`      | Making a calculation mistake                 | ارتكاب خطأ في الحساب                |
| `MADE_A_CARELESS_MISTAKE`         | Making a careless mistake                    | ارتكاب خطأ بسبب عدم الانتباه        |

The frontend may use a local map for the initial selection UI, but should use
the returned `reason.en` / `reason.ar` when rendering saved data.

## Direct-practice flow

### Create a reflection

```http
POST /api/v1/student/practice/questions/{questionId}/attempts/{attemptId}/error-reflection
Authorization: Bearer <student-token>
Content-Type: application/json

{
  "reason": "MADE_A_CALCULATION_MISTAKE"
}
```

`questionId` is the canonical practice-question ID. `attemptId` is the `id`
returned by `POST /student/practice/questions/{questionId}/attempts`.

Successful response (`201 Created`):

```json
{
  "id": "cm...",
  "reason": {
    "code": "MADE_A_CALCULATION_MISTAKE",
    "en": "Making a calculation mistake",
    "ar": "ارتكاب خطأ في الحساب"
  },
  "createdAt": "2026-10-01T08:30:00.000Z"
}
```

Only the student's own, incorrect attempt for an eligible practice question
can be reflected on. A reflection cannot be changed or deleted.

### Read saved reflections in attempt history

`GET /api/v1/student/practice/questions/{questionId}/attempts` now adds
`errorReflection` to every attempt:

```ts
type PracticeAttemptHistoryItem = {
  id: string;
  attemptNumber: number;
  selectedOptionIds: string[];
  isCorrect: boolean;
  submittedAt: string;
  errorReflection: StudentErrorReflection | null;
};
```

Use `errorReflection === null` to show the reason picker only for an
incorrect attempt. Once non-null, render the locked reason instead.

## Assessment-review flow

### Create a reflection

```http
POST /api/v1/student/assessments/{assessmentId}/attempts/current/questions/{questionId}/error-reflection
Authorization: Bearer <student-token>
Content-Type: application/json

{
  "reason": "DID_NOT_UNDERSTAND_THE_QUESTION"
}
```

Important: the path's `questionId` is the snapshot-question ID from
`GET /student/assessments/{assessmentId}/attempts/current/result` at
`questions[].id`. Do **not** send `questions[].sourceQuestionId`.

The response is the same `StudentErrorReflection` object shown above.

An assessment reflection is allowed only after the current attempt is
submitted and the answer outcome is explicitly `INCORRECT`. Do not render the
picker for `CORRECT`, `OMITTED`, `PENDING_GRADING`, or `PENDING_AI_GRADING`
questions.

### Read saved reflections in the result

The assessment result's `questions[]` items now include:

```ts
type AssessmentResultQuestion = {
  id: string; // snapshot assessment-question ID
  sourceQuestionId: string;
  outcome:
    | 'CORRECT'
    | 'INCORRECT'
    | 'OMITTED'
    | 'PENDING_GRADING'
    | 'PENDING_AI_GRADING';
  // existing fields omitted
  errorReflection: StudentErrorReflection | null;
};
```

After a successful POST, update the matching question's `errorReflection`
optimistically from the response, or refetch the assessment result.

## Error handling and idempotency

The selected reason is locked. Treat the picker as a one-time action.

| Status        | Meaning                                                                                 | Frontend behavior                                                                            |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `201`         | A reflection was created, or the exact same reason was submitted again.                 | Store/render the returned reflection and close the picker.                                   |
| `400`         | Invalid request body, including an unsupported `reason` code.                           | Report a client/request error; do not retry automatically.                                   |
| `401` / `403` | Session is absent/expired or the user is not a student.                                 | Use the application’s normal authentication/authorization handling.                          |
| `404`         | The question/attempt is not owned, eligible, or incorrect.                              | Refresh the source result/history and hide the action if it is no longer valid.              |
| `409`         | Assessment attempt has not been submitted yet, or a different reason is already locked. | Refresh the source result/history; display the existing reason and do not offer replacement. |

Submitting the same reason repeatedly is safe and returns the existing
reflection. Do not retry with a different reason after a `409`.

## Student performance insights

`GET /api/v1/student/performance/insights` now includes `errorReasons`:

```ts
type ErrorReasonInsights = {
  reviewedIncorrectAnswerCount: number;
  unreviewedIncorrectAnswerCount: number;
  reasons: Array<{
    reason: StudentErrorReason;
    count: number;
    percentage: number; // percentage of reviewed incorrect answers, 0–100
  }>;
  dominantReason: StudentErrorReason | null;
};
```

Notes for rendering:

- `reasons` always contains all four supported reasons, including zero-count
  entries.
- Percentages use `reviewedIncorrectAnswerCount` as the denominator, not all
  incorrect answers.
- `dominantReason` is `null` until the student has at least one reflection.
- The parent endpoint
  `GET /api/v1/parent/selected-child/performance/insights` intentionally does
  not include `errorReasons`; frontend types for the parent and student
  responses should remain distinct.

## Recommended UX sequence

1. Show the answer result first.
2. When its outcome is incorrect and `errorReflection` is `null`, offer
   “What made this question difficult?” with the four reasons.
3. Disable the submit control while the POST is in flight.
4. On `201`, replace the picker with the returned locked label and retain it
   in local/cache state.
5. On a `409` or `404`, refetch the result/history before deciding whether to
   hide the picker or show the saved reflection.
