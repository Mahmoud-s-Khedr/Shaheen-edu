# Written-answer AI grading: frontend integration guide

This guide covers the written-answer grading changes introduced in the AI
grading update. It applies to `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, and
`LONG_ANSWER` assessment questions.

All paths below are relative to `/api/v1` and require the existing Bearer
token. Student paths require a `STUDENT` token; the pending queue and retry
path require an `ADMIN` or `SUPER_ADMIN` token.

The request and response examples in this document are recorded API-test
calls from `reports/api-tests/api-2026-08-29T07-58-11-848Z.json`. The IDs are
test data, so use IDs returned by the current environment rather than copying
them into an application.

## What changed

- A non-empty written answer is AI graded. This includes short-answer and
  fill-in-the-blank questions, which were previously evaluated only by direct
  accepted-answer matching.
- Empty written answers are recorded as `OMITTED` and never invoke the AI
  grader.
- A `LONG_ANSWER` must have a grading rubric before it can be published. The
  rubric, accepted answers, prompts, and provider payloads are server-only;
  do not add UI that expects them in a student response.
- Tutor mode grades an eligible written answer after it is saved. Exam mode
  does not grade on autosave; it grades after submission.
- The old admin manual-grading endpoint has been removed. An administrator can
  retry a pending/failed AI grade instead.

## Student answer saving

Use the existing autosave endpoint for every answer:

```http
POST /student/assessments/:assessmentId/attempts/current/answers/:questionId
Content-Type: application/json
```

Send exactly one answer shape that matches the question type:

| Question type | Request field |
| --- | --- |
| `SINGLE_CHOICE`, `MULTIPLE_CHOICE` | `selectedOptionIds: string[]` |
| `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, `LONG_ANSWER` | `responseText: string` |

Do not send `selectedOptionIds` for a written question or `responseText` for a
choice question. The server rejects a mismatched shape with `400`. The maximum
written response length is 100,000 characters. Whitespace is trimmed before it
is stored and graded.

```http
POST /api/v1/student/assessments/cmte378wl02mep9012arxdsl3/attempts/current/answers/cmte378wy02mip901w7up5dv8
Content-Type: application/json

{
  "responseText": " SYNTHETIC "
}
```

The real response was `201 Created`. Notice that the server trims the answer:

```json
{
  "assessmentQuestionId": "cmte378wy02mip901w7up5dv8",
  "selectedOptionIds": [],
  "responseText": "SYNTHETIC",
  "isCorrect": null,
  "outcome": "PENDING_AI_GRADING",
  "awardedPoints": null,
  "aiGradingStatus": "PENDING",
  "graderFeedback": null,
  "aiGrading": null,
  "correctOptionIds": null,
  "explanation": null
}
```

For a transcript produced by the client, send the editable transcript—not the
audio—and identify its provenance:

```http
POST /api/v1/student/assessments/cmte378wl02mep9012arxdsl3/attempts/current/answers/cmte378yd02msp901w8s12mv1
Content-Type: application/json

{
  "responseText": "A clear synthetic explanation.",
  "inputMethod": "VOICE_TRANSCRIPT",
  "responseLanguageCode": "en",
  "transcriptionProvider": "openrouter",
  "transcriptionConfidence": 1
}
```

`transcriptionProvider` is limited to 100 characters and
`transcriptionConfidence` must be between 0 and 1.

### Tutor-mode response

The save response now supplies a safe grading payload for written answers in
Tutor mode:

```http
POST /api/v1/student/assessments/cmte37h3802oep90144bsgr5o/attempts/current/answers/cmte37h3u02orp90127p5k069
Content-Type: application/json

{
  "responseText": "synthetic"
}
```

The recorded Tutor-mode call returned `201 Created` with the completed AI
grade:

```json
{
  "assessmentQuestionId": "cmte37h3u02orp90127p5k069",
  "selectedOptionIds": [],
  "responseText": "synthetic",
  "isCorrect": true,
  "outcome": "CORRECT",
  "awardedPoints": 2,
  "aiGradingStatus": null,
  "graderFeedback": "Correct: the normalized assessment keyword is provided exactly.",
  "aiGrading": {
    "status": "COMPLETED",
    "feedback": "Correct: the normalized assessment keyword is provided exactly.",
    "highlights": [
      {
        "end": 9,
        "note": "Matches the expected keyword.",
        "start": 0,
        "category": "CORRECT"
      }
    ],
    "error": null
  },
  "correctOptionIds": [],
  "explanation": "The accepted answer is synthetic."
}
```
```

The save call waits for the grading attempt. Therefore a successful AI run
normally returns a final `outcome`, `awardedPoints`, `graderFeedback`, and
`aiGrading.status: 'COMPLETED'`. If no final grade is available, show an
“AI feedback is pending” state when `outcome` is `PENDING_AI_GRADING` or
`aiGradingStatus` is `PENDING`.

If `aiGrading.status` is `FAILED`, keep the student-facing message neutral:
feedback is temporarily unavailable and the answer has been queued for retry.
Do not show `error` values as technical errors; `PENDING_RETRY` is a state,
not a user action. A student should be able to continue their assessment.

In Exam mode the autosave response deliberately withholds grading feedback:
`graderFeedback` and `aiGrading` are `null`. Do not use an autosave response to
reveal correctness or points during an exam.

The first real save example above is an Exam-mode response: it returns
`PENDING_AI_GRADING`, `awardedPoints: null`, and no feedback even though the
answer is eligible for grading.

### Editing a previously saved answer

Treat every changed written response as a new grading version:

1. Debounce draft saves to avoid unnecessary requests.
2. On a successful save, replace the local answer with the response returned
   for that save.
3. Discard a response that belongs to an older local draft/save sequence.
4. Render highlights only against the exact `responseText` returned by the
   matching response/result. They use zero-based, end-exclusive offsets.

The server prevents an old AI run from overwriting the score for a newer saved
response. The client still needs the sequence check so a delayed HTTP response
does not overwrite a newer editor state.

```ts
let lastIssuedSave = 0;

async function saveWrittenAnswer(text: string) {
  const saveNumber = ++lastIssuedSave;
  const response = await saveAnswer({ responseText: text, inputMethod: 'TEXT' });
  if (saveNumber !== lastIssuedSave) return; // A newer draft is already current.
  setSavedAnswer(response);
}
```

## Submission and results

Submit an exam as before:

```http
POST /student/assessments/:assessmentId/attempts/current/submit
```

Then load the result:

```http
GET /student/assessments/:assessmentId/attempts/current/result
```

The result endpoint attempts grading for eligible pending written answers and
returns the current state. Reload/refetch the result while
`pendingAiGradingCount > 0`; use a modest backoff rather than tight polling.

```http
GET /api/v1/student/assessments/cmte378wl02mep9012arxdsl3/attempts/current/result
```

The recorded `200 OK` response included this result summary and the following
three written-question entries. This is a response excerpt: unrelated question
metadata, placements, and the comparison object are omitted only for brevity.

```json
{
  "attemptId": "cmte379b602n1p901npvdy6vz",
  "score": 4,
  "totalQuestions": 3,
  "totalPoints": 6,
  "percentage": 66.7,
  "correctCount": 2,
  "incorrectCount": 1,
  "omittedCount": 0,
  "pendingGradingCount": 0,
  "pendingAiGradingCount": 0,
  "answeredCount": 3,
  "questions": [
    {
      "id": "cmte378wy02mip901w7up5dv8",
      "type": "SHORT_ANSWER",
      "responseText": "SYNTHETIC",
      "maxPoints": 2,
      "awardedPoints": 2,
      "isCorrect": true,
      "outcome": "CORRECT",
      "inputMethod": "TEXT",
      "responseLanguageCode": null,
      "graderFeedback": "Correct. The response matches the normalized assessment keyword.",
      "aiGrading": {
        "status": "COMPLETED",
        "feedback": "Correct. The response matches the normalized assessment keyword.",
        "highlights": [{ "start": 0, "end": 9, "category": "CORRECT", "note": "Matches the expected keyword." }],
        "error": null
      }
    },
    {
      "id": "cmte378xc02mnp901ds41yjla",
      "type": "FILL_IN_THE_BLANK",
      "responseText": "synthetic",
      "maxPoints": 2,
      "awardedPoints": 2,
      "isCorrect": true,
      "outcome": "CORRECT",
      "inputMethod": "TEXT",
      "responseLanguageCode": null,
      "graderFeedback": "Correct—the keyword is completed as “synthetic.”",
      "aiGrading": {
        "status": "COMPLETED",
        "feedback": "Correct—the keyword is completed as “synthetic.”",
        "highlights": [{ "start": 0, "end": 9, "category": "CORRECT", "note": "The response exactly matches the expected answer." }],
        "error": null
      }
    },
    {
      "id": "cmte378yd02msp901w8s12mv1",
      "type": "LONG_ANSWER",
      "responseText": "A clear synthetic explanation.",
      "maxPoints": 2,
      "awardedPoints": 0,
      "isCorrect": false,
      "outcome": "INCORRECT",
      "inputMethod": "VOICE_TRANSCRIPT",
      "responseLanguageCode": "en",
      "graderFeedback": "The response does not state or explain the synthetic concept; it only labels itself as an explanation. Add the concept and briefly describe what it means.",
      "aiGrading": {
        "status": "COMPLETED",
        "feedback": "The response does not state or explain the synthetic concept; it only labels itself as an explanation. Add the concept and briefly describe what it means.",
        "highlights": [{ "start": 0, "end": 29, "category": "FACTUAL_ERROR", "note": "This does not provide the requested concept or a clear explanation." }],
        "error": null
      }
    }
  ]
}
```

The result payload also includes `pendingAiGradingCount` and `answeredCount`.
While a written answer is pending, its `awardedPoints` is `null`; avoid treating
it as zero in score cards or progress calculations. A result may be shown with
some grades still pending, so label its score as provisional whenever
`pendingAiGradingCount` is non-zero.

For a completed AI grade, use `graderFeedback` for the primary feedback text.
`aiGrading.feedback` is the associated run feedback and is normally the same
content. Highlights are optional annotations over the returned answer:

- `CORRECT`: point out an effective/correct passage.
- `LANGUAGE`: flag language clarity or form.
- `FACTUAL_ERROR`: flag a factual issue.

Always render annotation text safely as plain text. Never infer or reconstruct
accepted answers or the long-answer rubric from feedback.

## Admin retry queue

Replace the old manual grading screen with a queue that lists pending AI
grades:

```http
GET /admin/assessments/grading/pending
```

Each queue entry is an assessment attempt answer and includes its answer ID,
answer text, attempt/student/assessment information, assessment question, and
the most recent AI-grading run. Queue entries have
`outcome: "PENDING_AI_GRADING"`.

The recorded test queue was empty. For frontend implementation, use the
following expected `200 OK` response when an answer needs retry. It is a
representative response excerpt; the endpoint also returns the remaining
stored fields on `attempt`, `assessmentQuestion`, and `aiGradingRuns`.

```json
[
  {
    "id": "attempt_answer_id",
    "attemptId": "attempt_id",
    "assessmentQuestionId": "assessment_question_id",
    "selectedOptionIds": [],
    "responseText": "A clear synthetic explanation.",
    "responseVersion": 1,
    "inputMethod": "VOICE_TRANSCRIPT",
    "responseLanguageCode": "en",
    "transcriptionProvider": "openrouter",
    "transcriptionConfidence": 1,
    "isCorrect": null,
    "outcome": "PENDING_AI_GRADING",
    "awardedPoints": null,
    "gradedAt": null,
    "gradedById": null,
    "graderFeedback": null,
    "activeSeconds": 0,
    "answeredAt": "2026-08-29T07:56:42.775Z",
    "updatedAt": "2026-08-29T07:56:42.775Z",
    "attempt": {
      "id": "attempt_id",
      "assessmentId": "assessment_id",
      "studentUserId": "student_user_id",
      "status": "COMPLETED",
      "submittedAt": "2026-08-29T07:56:42.775Z",
      "score": 4,
      "totalPoints": 6,
      "totalQuestions": 3,
      "assessment": {
        "id": "assessment_id",
        "title": "Written-answer practice"
      },
      "student": {
        "fullName": "Student name"
      }
    },
    "assessmentQuestion": {
      "id": "assessment_question_id",
      "assessmentId": "assessment_id",
      "type": "LONG_ANSWER",
      "body": "Explain the synthetic concept in one sentence.",
      "maxPoints": 2,
      "gradingRubric": "Award points for a clear, accurate explanation."
    },
    "aiGradingRuns": [
      {
        "id": "ai_grading_run_id",
        "attemptAnswerId": "attempt_answer_id",
        "status": "FAILED",
        "responseVersion": 1,
        "responseLanguageCode": "en",
        "feedback": null,
        "highlights": null,
        "error": "AI grading failed",
        "createdAt": "2026-08-29T07:56:43.000Z",
        "completedAt": "2026-08-29T07:56:44.000Z"
      }
    ]
  }
]
```

Retry one queue entry without a request body:

```http
POST /admin/assessments/grading/answers/:answerId/retry-ai
```

The test report contains a real stale-ID retry call (there is no successful
retry response in this report, so this guide does not fabricate one):

```http
POST /api/v1/admin/assessments/grading/answers/cmte378yd02msp901w8s12mv1/retry-ai
```

It returned `404 Not Found`:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND.ASSESSMENT_ANSWER_NOT_FOUND",
  "message": {
    "en": "Assessment answer not found",
    "ar": "تعذر تنفيذ الطلب: غير موجود"
  },
  "error": {
    "ar": "غير موجود",
    "en": "Not Found"
  },
  "correlationId": "7499fb30-4fbf-4576-8d12-468bf42aa1f7"
}
```

The API contract specifies `201 Created` with the updated answer on a
successful retry; that successful response was not captured in this test run.
After success, remove the entry if its outcome is no longer
`PENDING_AI_GRADING`; otherwise refresh the queue/result state. Handle these
expected failures:

| Status | UI behavior |
| --- | --- |
| `401` / `403` | Require valid admin access. |
| `404` | Remove the stale queue item and refresh. |
| `409` | The answer is no longer eligible/pending; refresh rather than retrying repeatedly. |

There is no longer an endpoint that accepts admin-supplied `awardedPoints` or
`feedback`. Remove any form, client type, and call to the retired endpoint:

```text
POST /admin/assessments/grading/answers/:answerId
```

## Suggested UI states

| State | Student display | Admin display |
| --- | --- | --- |
| `OMITTED` | “No answer submitted.” | Not in the AI queue. |
| `PENDING_AI_GRADING` | “Feedback is being prepared.” | Queue item; retry may be offered. |
| `COMPLETED` AI run | Points, feedback, and safe highlights. | Final answer state; remove from queue. |
| `FAILED` AI run / `PENDING_RETRY` | “Feedback is temporarily unavailable.” | Retry control and latest run state. |

## Migration checklist

- [ ] Update written-answer autosave calls to send `responseText`.
- [ ] Add Tutor-mode feedback, pending, and failed-grading UI states.
- [ ] Add result-page handling for `pendingAiGradingCount`, `graderFeedback`,
      `aiGrading`, and highlight offsets.
- [ ] Do not expose feedback/correctness from Exam-mode autosaves.
- [ ] Remove the manual grade form and old endpoint call.
- [ ] Add the admin pending queue and retry action.
- [ ] Ensure long-answer authoring requires a non-empty rubric before publish.
