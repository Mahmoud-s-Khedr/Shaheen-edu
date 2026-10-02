# Frontend integration guide: assessment review, notes, and analytics

This guide covers the three assessment API updates intended for the student
review and progress experience:

1. question-note listing;
2. answer-change history in a completed assessment result; and
3. hierarchy titles in assessment analytics.

All routes are versioned under `/api/v1`, require a logged-in user with the
`STUDENT` role, and use a bearer token:

```http
Authorization: Bearer <access-token>
```

Dates are ISO-8601 timestamps. IDs are opaque strings; the client must not
derive hierarchy or ownership from their format.

## Quick reference

| UI need | Method and route | When to call |
| --- | --- | --- |
| Notes library | `GET /student/assessments/question-notes` | When opening or paginating the student's saved notes. |
| Completed-result review | `GET /student/assessments/:assessmentId/attempts/current/result` | Only after the student's current attempt is completed. |
| Subject/chapter/topic performance | `GET /student/assessments/analytics/summary` | When loading the analytics table or expanding a hierarchy row. |

`/api/v1` is omitted from the route column for readability. Add it when
constructing browser requests.

## 1. List private question notes

### Request

```http
GET /api/v1/student/assessments/question-notes?page=1&limit=20
Authorization: Bearer <access-token>
```

Query parameters:

| Parameter | Required | Rules | Default |
| --- | --- | --- | --- |
| `page` | No | One-based positive integer. | `1` |
| `limit` | No | Positive integer from `1` through `100`. | `20` |

### Successful response — `200 OK`

```json
{
  "data": [
    {
      "questionId": "question_123",
      "body": "Revisit the rule for conditional sentences.",
      "createdAt": "2026-10-01T10:00:00.000Z",
      "updatedAt": "2026-10-02T11:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

`questionId` is the authored/source-question ID. It is the same ID exposed as
`sourceQuestionId` in completed assessment-result questions, rather than the
immutable assessment snapshot question ID.

### Rendering and pagination guidance

- The server orders records by `updatedAt` descending. Use this order as-is;
  do not re-sort client-side unless the user explicitly chooses another sort.
- Render `body` as plain text. It is student-provided text, so escape or
  sanitize it; do not inject it as HTML.
- Use `meta.totalPages` to disable a "next" control. An empty `data` array is
  a valid response, including when the requested page is beyond the last page.
- Notes are returned only while their source questions are currently
  accessible to the student. Do not treat a missing previously saved note as
  deletion; it may be unavailable because its content access changed.

### Related existing write routes

The list endpoint is read-only. A review screen can continue to use the
existing routes below to maintain a note:

```http
PUT    /api/v1/student/assessments/question-notes/:questionId
DELETE /api/v1/student/assessments/question-notes/:questionId
```

For `PUT`, send `{ "body": "..." }`. Use the result item's
`sourceQuestionId` for `:questionId` when a note is edited from an assessment
review page. Refresh the relevant notes query after a successful write.

### Expected errors

| Status | Frontend behavior |
| --- | --- |
| `401` | Refresh/login flow; do not show stale private notes as current data. |
| `403` | The session does not have student access; show the standard access-denied state. |
| `400` | Correct invalid pagination values before retrying. |

## 2. Completed assessment result with answer-change history

### Request

```http
GET /api/v1/student/assessments/assessment_123/attempts/current/result?includeComparison=true
Authorization: Bearer <access-token>
```

| Parameter | Required | Meaning |
| --- | --- | --- |
| `includeComparison` | No | Defaults to `true`. Set to `false` when peer-comparison data is not needed, for example on a compact review page. |

The route reads the requesting student's current attempt only. It is available
after submission/completion, not while the attempt is resumable.

### New response fields

The existing result payload is unchanged. These fields are additions:

```json
{
  "answerChanges": {
    "total": 5,
    "correctToCorrect": 1,
    "incorrectToIncorrect": 1,
    "correctToIncorrect": 1,
    "incorrectToCorrect": 1,
    "other": 1
  },
  "questions": [
    {
      "id": "assessment_snapshot_question_1",
      "sourceQuestionId": "question_123",
      "note": "Revisit the rule for conditional sentences.",
      "outcome": "CORRECT",
      "answerChanges": [
        {
          "id": "change_1",
          "fromOutcome": "INCORRECT",
          "toOutcome": "CORRECT",
          "changedAt": "2026-10-02T11:01:00.000Z"
        }
      ]
    }
  ]
}
```

`answerChanges` at the top level is the summary across every answer in that
attempt. `questions[].answerChanges` is the ordered history for that one
snapshot question, sorted oldest to newest by `changedAt`. A question with no
saved changes returns an empty array.

### Transition semantics

Each saved change belongs to exactly one summary bucket:

| Summary field | Transition |
| --- | --- |
| `correctToCorrect` | `CORRECT` → `CORRECT` |
| `incorrectToIncorrect` | `INCORRECT` → `INCORRECT` |
| `correctToIncorrect` | `CORRECT` → `INCORRECT` |
| `incorrectToCorrect` | `INCORRECT` → `CORRECT` |
| `other` | Every other transition, including omitted, partial, and pending-grading outcomes. |

The `total` equals the sum of the five bucket counts. This is a history of
saved answer edits, not a count of questions answered or an indication that a
student changed their final answer. For example, `CORRECT` → `CORRECT` is a
saved edit whose correctness did not change.

Possible `fromOutcome`, `toOutcome`, and question `outcome` values are:
`CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `OMITTED`, `PENDING_GRADING`, and
`PENDING_AI_GRADING`.

### Suggested review UI

1. Load this route after the submit-success view, or whenever the user opens
   a completed assessment.
2. Show the top-level totals in a compact "answer changes" card. Keep `other`
   visible rather than silently discarding it.
3. For each review question, show a timeline only when
   `answerChanges.length > 0`. Use `changedAt` as the event time and label the
   event with `fromOutcome` and `toOutcome`.
4. Use `questions[].note` for the inline note state. It may be `null`; that is
   distinct from an empty history array.
5. Use `sourceQuestionId`, not `id`, when handing off to the note write route.

### Expected errors

| Status | Frontend behavior |
| --- | --- |
| `401` | Start the authentication recovery flow. |
| `403` | Do not retry with another assessment ID; the attempt is not available to this student. |
| `404` | Treat the assessment as unavailable/deleted and return to the assessment list. |
| `409` | The attempt is not completed yet. Direct the user to resume or submit it instead of rendering a partial result. |

## 3. Assessment analytics hierarchy rollups

### Request patterns

```http
# Root table: one row per subject
GET /api/v1/student/assessments/analytics/summary?page=1&limit=20

# Expand a subject: one row per chapter in that subject
GET /api/v1/student/assessments/analytics/summary?subjectId=subject_123&page=1&limit=20

# Expand a chapter: topic rows plus completed-attempt drill-down
GET /api/v1/student/assessments/analytics/summary?chapterId=chapter_123&page=1&limit=20

# Search the labels shown at the requested level
GET /api/v1/student/assessments/analytics/summary?subjectId=subject_123&q=grammar
```

All calls require the bearer token shown at the start of this guide. `page`
and `limit` follow the same rules as the notes endpoint; `q` is optional text
search. Pass either hierarchy ID only when expanding the corresponding row.

### Successful response — `200 OK`

```json
{
  "level": "chapter",
  "data": [
    {
      "id": "chapter_456",
      "title": "Grammar",
      "subjectId": "subject_123",
      "subjectTitle": "English",
      "chapterId": "chapter_456",
      "chapterTitle": "Grammar",
      "lessonId": null,
      "lessonTitle": null,
      "sectionId": null,
      "sectionTitle": null,
      "total": 20,
      "correct": 14,
      "incorrect": 4,
      "omitted": 2,
      "answered": 18,
      "percentage": 70
    }
  ],
  "attempts": [],
  "meta": {
    "groups": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

The updated fields are the title companions for every hierarchy ID:
`subjectTitle`, `chapterTitle`, `lessonTitle`, and `sectionTitle`. They are
snapshotted hierarchy labels associated with the completed assessment result.
Use them for display instead of issuing separate hierarchy lookups.

### Level and drill-down contract

| Request | `level` | `data[]` represents | Use this ID to expand |
| --- | --- | --- | --- |
| No `subjectId` or `chapterId` | `subject` | Subjects | `data[].subjectId` |
| `subjectId` | `chapter` | Chapters within that subject | `data[].chapterId` |
| `chapterId` | `topic` | The deepest available section, lesson, or chapter topic | No deeper analytics route is currently defined. |

At any level, `title` is the display label for that row. The explicit title
fields preserve the full breadcrumb, so a chapter row can safely render
`subjectTitle` and `chapterTitle`, and a topic row can render all available
ancestors.

When `chapterId` is present, `attempts` contains completed assessment attempts
that include that chapter, ordered most recently submitted first. In that
case, `meta.attempts` is also present and paginated with the same `page` and
`limit` as `data`. Without `chapterId`, `attempts` is `[]` and
`meta.attempts` is absent.

### UI calculations and edge cases

- Render the API's `percentage`; it is already rounded. Do not recompute it
  from a page of data.
- `answered` is `correct + incorrect`; `omitted` remains separate.
- One assessment question can have multiple hierarchy placements. The API
  de-duplicates its contribution per displayed hierarchy ID, but it may
  legitimately contribute to different rows when the authored question has
  more than one placement. Do not sum child rows as a replacement for a
  parent total.
- Use the returned pagination metadata independently for `data` and
  `attempts` when a chapter is selected.
- Preserve query state (`subjectId`, `chapterId`, `q`, `page`, `limit`) in the
  URL so an expanded analytics view is shareable/bookmarkable inside the
  authenticated application.

### Expected errors

| Status | Frontend behavior |
| --- | --- |
| `401` | Start authentication recovery. |
| `403` | Show the standard student-access error state. |
| `400` | Validate query values locally and retry only after correcting them. |

## TypeScript client shapes

These compact interfaces cover the new or changed fields. Keep any existing
result and analytics fields in the application’s broader API types.

```ts
type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type QuestionNote = {
  questionId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type AnswerOutcome =
  | 'CORRECT'
  | 'PARTIALLY_CORRECT'
  | 'INCORRECT'
  | 'OMITTED'
  | 'PENDING_GRADING'
  | 'PENDING_AI_GRADING';

type AnswerChange = {
  id: string;
  fromOutcome: AnswerOutcome;
  toOutcome: AnswerOutcome;
  changedAt: string;
};

type AnswerChangeSummary = {
  total: number;
  correctToCorrect: number;
  incorrectToIncorrect: number;
  correctToIncorrect: number;
  incorrectToCorrect: number;
  other: number;
};

type AnalyticsRow = {
  id: string;
  title: string;
  subjectId: string;
  subjectTitle: string;
  chapterId: string | null;
  chapterTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  total: number;
  correct: number;
  incorrect: number;
  omitted: number;
  answered: number;
  percentage: number;
};
```

## Integration checklist

- [ ] Add the bearer token to all three requests.
- [ ] Add a paginated notes query keyed by `page` and `limit`.
- [ ] Display result answer-change totals and per-question timelines only for
      completed attempts.
- [ ] Keep snapshot `id` and authored `sourceQuestionId` distinct in review
      state; use the latter for question notes.
- [ ] Use `title` as the current analytics-row label and the new hierarchy
      title fields for breadcrumb/context labels.
- [ ] Fetch child rollups lazily when a subject or chapter is expanded.
- [ ] Handle `409` from the result route as "attempt not completed," not as a
      generic server failure.
