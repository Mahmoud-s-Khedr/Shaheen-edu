# Assessment post-completion updates

This document tracks requested changes to the student assessment results and
analytics experience.

## 1. Include answer-change information in the assessment result

**Endpoint:** `GET /api/v1/student/assessments/:id/attempts/current/result?includeComparison=true`

### Required response additions

Add an `answerChanges` summary to the top-level result response:

```json
{
  "answerChanges": {
    "total": 0,
    "correctToCorrect": 0,
    "incorrectToIncorrect": 0,
    "correctToIncorrect": 0,
    "incorrectToCorrect": 0,
    "other": 0
  }
}
```

Add answer-change information to each appropriate item in `questions[]`, so the
client can identify which snapshot question changed and display its history:

```json
{
  "id": "assessment-snapshot-question-id",
  "answerChanges": [
    {
      "id": "change-id",
      "fromOutcome": "INCORRECT",
      "toOutcome": "CORRECT",
      "changedAt": "2026-10-02T12:00:00.000Z"
    }
  ]
}
```

The summary must classify every saved answer change into exactly one of:

- correct → correct
- incorrect → incorrect
- correct → incorrect
- incorrect → correct

Transitions involving omitted or pending outcomes are counted in `other`.

Only changes belonging to the requesting student's current attempt for this
assessment may be returned.

## 2. Assessment question notes

Add `GET /api/v1/student/assessments/question-notes?page=1&limit=20` to list
the authenticated student's accessible private question notes. It returns:

```json
{
  "data": [
    {
      "questionId": "source-question-id",
      "body": "Student's private note",
      "createdAt": "2026-10-02T12:00:00.000Z",
      "updatedAt": "2026-10-02T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

The result API continues to include the matching `note` in each assessment
question for the review screen.

## 3. Subject totals and drill-down table

The existing endpoint already supplies the data in the provided table:

```text
GET /api/v1/student/assessments/analytics/summary
```

At its default level (`GET .../analytics/summary`), each `data[]` row represents
a subject and returns `title`, `total`, `correct`, `incorrect`, and `omitted`.
This maps directly to the table columns:

| Table column | API field   |
| ------------ | ----------- |
| Subjects     | `title` or `subjectTitle` |
| Total Q      | `total`     |
| Correct      | `correct`   |
| Incorrect    | `incorrect` |
| Omitted      | `omitted`   |

For the expandable rows:

- Request `?subjectId=:subjectId` to receive that subject's chapter rows.
- Request `?chapterId=:chapterId` to receive topic rows and the completed
  assessment-attempt drill-down.

No new aggregation endpoint is required for this table. The frontend needs to
make the filtered request when a row is expanded and render the returned level
as its child rows.

Every hierarchy ID now has its matching title in the response: `subjectId` /
`subjectTitle`, `chapterId` / `chapterTitle`, `lessonId` / `lessonTitle`, and
`sectionId` / `sectionTitle`.
