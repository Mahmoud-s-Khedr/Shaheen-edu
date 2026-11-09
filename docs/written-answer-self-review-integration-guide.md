# Written answer self-review: integration guide

This guide describes the current working-tree changes; it does not imply they are deployed. Examples show only relevant fields. Existing authentication, request bodies, and pagination remain unchanged. Student endpoints require a student bearer token; the retry endpoint requires an admin or super-admin token.

## Configuration and behavior

`AI_ANSWER_GRADING_ENABLED` defaults to `false`. With the default, a non-empty written answer receives the `SELF_REVIEW` outcome. Its `isCorrect` and `awardedPoints` are `null`: the student can compare their response with the available accepted answers or rubric. An empty response is `OMITTED`. Written types are `SHORT_ANSWER`, `FILL_IN_THE_BLANK`, and `LONG_ANSWER`.

When the flag is `true`, the existing AI grading flow uses `PENDING_AI_GRADING` for written answers and may return a graded outcome. Self-review answers are not automatically converted to AI grades when the flag changes. Apply the accompanying database migration before using the new outcome.

## Affected endpoints

All paths include the `/api/v1` prefix.

| Method and path | Integration impact |
| --- | --- |
| `POST /student/assessments/:id/attempts/start` | Attempt questions include `acceptedAnswers` and `gradingRubric`; outcomes can be `SELF_REVIEW`. |
| `GET /student/assessments/:id/attempts/current` | Returns the same updated attempt-question fields. |
| `POST /student/assessments/:id/attempts/current/answers/:questionId` | Written answer response can have outcome `SELF_REVIEW`. In tutor mode it includes `acceptedAnswers` and `gradingRubric`. |
| `POST /student/assessments/:id/attempts/current/submit` | With AI grading disabled, submitted written answers are self-review. The score includes awarded points only, so ungraded written answers contribute zero to the current score. |
| `GET /student/assessments/:id/attempts/current/result` | Adds `selfReviewCount` and the two review fields on questions; `isCorrect` can be `null`. |
| `POST /admin/assessments/grading/answers/:answerId/retry-ai` | Returns HTTP `409` with `AI answer grading is disabled` when the flag is off. |
| `GET /student/leaderboard/current` | Attempts with self-review answers are excluded from ranking. |
| `GET /student/leaderboard/history/:weekKey` | Applies the same eligibility rule. |

## Response fields

For a written answer saved in tutor mode, the autosave response can contain:

```json
{
  "assessmentQuestionId": "question-id",
  "responseText": "My answer",
  "isCorrect": null,
  "outcome": "SELF_REVIEW",
  "awardedPoints": null,
  "aiGradingStatus": null,
  "acceptedAnswers": ["An accepted answer"],
  "gradingRubric": "Compare the response with the key concepts."
}
```

After submission, the result response includes the count and review information:

```json
{
  "selfReviewCount": 1,
  "questions": [
    {
      "id": "question-id",
      "responseText": "My answer",
      "outcome": "SELF_REVIEW",
      "isCorrect": null,
      "awardedPoints": null,
      "acceptedAnswers": ["An accepted answer"],
      "gradingRubric": "Compare the response with the key concepts."
    }
  ]
}
```

`acceptedAnswers` is an array of strings or `null`; `gradingRubric` is a string or `null`. Either may be unavailable. For non-written questions both fields are `null`. In attempt state, they are revealed after completion or in tutor mode once an answer exists. Autosave returns them for written questions in tutor mode; result returns them for written questions after submission.

## Client handling

- Add `SELF_REVIEW` to outcome types and display a self-review state instead of marking the answer correct or incorrect. Handle `isCorrect: null` as unknown and `awardedPoints: null` as ungraded.
- Show accepted answers and the rubric when present, and handle either being `null`. Do not reveal answer content before the API provides it.
- Show `selfReviewCount` in the result when useful. Scores and percentages still use the full points total, so they can reflect only the graded portion of an assessment containing self-review answers.
- Do not expect self-review attempts to appear on the leaderboard or automatically receive an AI grade later. Existing AI-pending and graded outcomes should remain supported when AI grading is enabled.
- Handle the admin retry endpoint's `409` response when grading is disabled.
