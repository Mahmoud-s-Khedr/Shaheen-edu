# Assessments, quizzes, exams, and question-bank API guide

This guide is for frontend teams integrating the assessment domain: admin
question authoring, student direct practice, and generated quizzes/exams. Its
examples come from the successful journey run in
[`reports/api-tests/api-2026-08-08T19-46-57-912Z.json`](../reports/api-tests/api-2026-08-08T19-46-57-912Z.json).

The IDs, titles, and timestamps are real values from that run and may no longer
exist. Use them to understand relationships only. Bearer tokens and signed
delivery URLs are deliberately represented by placeholders; always use the
fresh value returned by the API.

## At a glance

```text
admin source + bank
        ↓
create question → add options/assets/video → submit → review → publish
        ↓                                      ↙                 ↘
student direct practice (immediate feedback)       generated assessment snapshot
                                                               ↓
                                                quiz (TUTOR) or exam (EXAM)
                                                               ↓
                                           start/resume → autosave → submit → result
```

All routes are under `/api/v1`. Use `Authorization: Bearer <token>` for every
route in this guide:

| Route family | Required role |
| --- | --- |
| `/admin/question-banks`, `/admin/questions`, `/admin/assessments` | `ADMIN` or `SUPER_ADMIN` |
| `/student/practice/*`, `/student/performance`, `/student/assessments` | `STUDENT` |

## State and UI model

There are three independent state machines. Keep them separate in the UI.

```text
Question:    DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED
                         ↓
                      REJECTED → IN_REVIEW

Assessment: DRAFT → READY → ARCHIVED       (admin-created only)
Student assessment is created as READY.

Attempt:     SUSPENDED → COMPLETED
```

An assessment is not a live reference to the question bank. When it is created,
the API copies its questions, options, explanations, and answer keys into an
immutable snapshot. Later edits or archival of the authoring question do not
change an already-created assessment or its result.

`TUTOR` and `EXAM` are modes of the same assessment API:

| Mode | Frontend behavior |
| --- | --- |
| `TUTOR` | After each autosave, show correctness, correct option IDs, and explanation. |
| `EXAM` | Do not show correctness or explanations until the attempt is completed. |

## 1. Admin question banks and authoring

Questions must be authored and published before they can be used for direct
practice or assessment generation. A source identifies provenance; a bank is a
collection. Both must be published before a question can pass review.

### Question-source endpoints

| Method and path | Request body or query | Frontend use |
| --- | --- | --- |
| `POST /admin/question-banks/sources` | `type`, localized `title`, optional localized `note`, optional `publisherUserId` | Create a source. |
| `GET /admin/question-banks/sources` | `page`, `limit`, `q`, `status`, `type` | List/search sources. |
| `GET /admin/question-banks/sources/:id` | — | Load source detail. |
| `PATCH /admin/question-banks/sources/:id` | Any mutable create fields | Edit a source. |
| `POST /admin/question-banks/sources/:id/publish` | — | Make it available for question review. |
| `POST /admin/question-banks/sources/:id/archive` | — | Archive an unused source. |
| `POST /admin/question-banks/sources/:id/restore` | — | Restore an archived source to `DRAFT`. |
| `DELETE /admin/question-banks/sources/:id` | — | Delete an unreferenced draft source. |

Recorded creation request and response:

```http
POST /api/v1/admin/question-banks/sources
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "type": "PLATFORM",
  "title": {
    "ar": "Coverage source journey-20260808194316-db39-125",
    "en": "Coverage source journey-20260808194316-db39-125"
  }
}
```

```json
{
  "id": "cmsksa6v400h5nw01xp5tlz27",
  "type": "PLATFORM",
  "publisherUserId": null,
  "status": "DRAFT",
  "createdAt": "2026-08-08T19:45:43.745Z",
  "publishedAt": null,
  "archivedAt": null,
  "title": {
    "ar": "Coverage source journey-20260808194316-db39-125",
    "en": "Coverage source journey-20260808194316-db39-125"
  },
  "note": { "ar": null, "en": null }
}
```

`CONTENT_PUBLISHER` sources require `publisherUserId`; it is not accepted for
the other source types. The recorded run returned `400` when that required
publisher relationship was omitted.

### Question-bank endpoints

| Method and path | Request body or query | Frontend use |
| --- | --- | --- |
| `POST /admin/question-banks` | `title`, optional `description` | Create a bank. |
| `GET /admin/question-banks` | `page`, `limit`, `q`, `status` | List/search banks. |
| `GET /admin/question-banks/:id` | — | Load detail. |
| `PATCH /admin/question-banks/:id` | `title?`, `description?` | Edit a bank. |
| `POST /admin/question-banks/:id/publish` | — | Publish it for question review. |
| `POST /admin/question-banks/:id/archive` | — | Archive an unused bank. |
| `POST /admin/question-banks/:id/restore` | — | Restore it to `DRAFT`. |
| `DELETE /admin/question-banks/:id` | — | Delete an unreferenced draft bank. |

```http
POST /api/v1/admin/question-banks
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "title": "Coverage bank journey-20260808194316-db39-126",
  "description": "covered"
}
```

```json
{
  "id": "cmsksa70g00h9nw01rl77tn68",
  "title": "Coverage bank journey-20260808194316-db39-126",
  "description": "covered",
  "status": "DRAFT",
  "publishedAt": null,
  "archivedAt": null
}
```

The UI should block/archive actions optimistically only after a successful
response. A source or bank with published questions cannot be archived; the
recorded journey returned `409 Conflict` for both cases.

### Question endpoints

| Method and path | Request body or query | Frontend use |
| --- | --- | --- |
| `POST /admin/questions` | `bankId`, `sourceId`, `courseId`, `placements`, `body`, optional `type` and `explanation` | Create a draft question. |
| `GET /admin/questions` | `page`, `limit`, `q`, `status`, bank/source/course/subject/grade and hierarchy filters | Search the authoring queue. |
| `GET /admin/questions/:id` | — | Load full authoring detail. |
| `PATCH /admin/questions/:id` | Any mutable create fields | Edit an editable question. |
| `POST /admin/questions/:id/submit` | — | Validate and send to review. |
| `POST /admin/questions/:id/publish` | — | Publish a reviewed question. |
| `POST /admin/questions/:id/reject` | `reviewNote` | Return an in-review question for revision. |
| `POST /admin/questions/:id/archive` | — | Archive a question. |
| `DELETE /admin/questions/:id` | — | Delete an unreferenced draft question. |

Each placement must contain exactly one of `courseId`, `chapterId`, `lessonId`,
or `sectionId`, and each placement must belong to the question's `courseId`.
`SINGLE_CHOICE` is the default; `MULTIPLE_CHOICE` is also supported.

Recorded creation request:

```json
{
  "bankId": "cmsksa70g00h9nw01rl77tn68",
  "sourceId": "cmsksa6v400h5nw01xp5tlz27",
  "courseId": "cmsks7iro002lnw01mveg8obj",
  "placements": [{ "chapterId": "cmsks7iyh002pnw01l3h8uqex" }],
  "body": "Coverage question?",
  "explanation": "Choose the correct option."
}
```

The response is the question authoring record: it includes the question,
source/bank context, `placements`, `options`, `assets`, `videoLink`, and the
derived `scope` containing course, subject, and academic-grade IDs.

### Options, attachments, and video

| Method and path | Request body | Frontend use |
| --- | --- | --- |
| `POST /admin/questions/:id/options` | `body`, optional `isCorrect` | Add an option. |
| `PATCH /admin/questions/:id/options/:optionId` | `body?`, `isCorrect?` | Edit an option. |
| `DELETE /admin/questions/:id/options/:optionId` | — | Remove an option. |
| `POST /admin/questions/:id/options/reorder` | `{ "optionIds": ["…"] }` | Persist the complete option order. |
| `POST /admin/questions/:id/assets` | `{ "assetId": "…" }` | Attach a ready image, PDF, or document. |
| `DELETE /admin/questions/:id/assets/:assetId` | — | Remove an attachment. |
| `POST /admin/questions/:id/assets/reorder` | `{ "assetIds": ["…"] }` | Persist the complete attachment order. |
| `POST /admin/questions/:id/video-link` | `videoAssetId`, `timestampSeconds` | Link a ready video at a timestamp. |
| `DELETE /admin/questions/:id/video-link` | — | Remove the video link. |

Recorded option request:

```http
POST /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha/options
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{ "body": "Correct option", "isCorrect": true }
```

All option/asset/video mutations return the updated full question record. Send
the complete ID list for either reorder endpoint; do not send a partial list.

### Review rules and authoring errors

Submitting validates the whole question, not just the last edited field. The
question needs a non-empty body and explanation, a published source and bank,
published course ancestry, a placement, and valid options:

| Question type | Required answer setup |
| --- | --- |
| `SINGLE_CHOICE` | At least two options and exactly one correct option. |
| `MULTIPLE_CHOICE` | At least two options and at least two correct options. |

The recorded run attempted to submit a new single-choice question before
options existed and received `409 Conflict`. Once two options were present,
`POST /submit` returned `201` with `status: "IN_REVIEW"`. A reviewer then used:

```json
POST /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha/reject

{ "reviewNote": "Please clarify the wording." }
```

The response had `status: "REJECTED"` and retained the note. A rejected
question can be edited, resubmitted, and then published. Only admins can use
these routes: the recorded partner-token request to create a question returned
`403 Forbidden`.

## 2. Student direct practice

Direct practice is separate from generated quizzes/exams. It presents eligible
live published questions and records a new immutable attempt on every submit.
It always returns immediate feedback.

| Method and path | Request body or query | Frontend use |
| --- | --- | --- |
| `GET /student/practice/questions` | Exactly one of `courseId`, `chapterId`, `lessonId`, `sectionId`; `page`, `limit` | List practice questions in one scope. |
| `POST /student/practice/questions/:questionId/attempts` | `{ "optionIds": ["…"] }` | Submit one immutable practice answer. |
| `GET /student/practice/questions/:questionId/attempts` | `page`, `limit` | Show retry history. |
| `GET /student/practice/questions/:questionId/assets/:assetId/access` | — | Obtain protected attachment/video access. |
| `GET /student/performance` | — | Show current-grade practice summary. |

The list only includes questions that are published, in the student's current
grade, and accessible through the student's effective content access. The
frontend must provide exactly one scope; a course scope includes descendant
question placements.

Recorded list response:

```http
GET /api/v1/student/practice/questions?courseId=cmsksav3x00mqnw01t4h029oc
Authorization: Bearer <student-access-token>
```

```json
{
  "data": [
    {
      "id": "cmsksaxk100o2nw01ivrmwuao",
      "type": "SINGLE_CHOICE",
      "body": "Which option is correct?",
      "placements": [{
        "courseId": null,
        "chapterId": null,
        "lessonId": null,
        "sectionId": "cmsksavjb00n2nw014hgr5i2t"
      }],
      "options": [
        { "id": "cmsksaxpp00o8nw01em4bzqeo", "body": "Correct", "sortOrder": 1 },
        { "id": "cmsksaxw900ocnw01uksiqfzi", "body": "Wrong", "sortOrder": 2 }
      ],
      "attachments": [],
      "video": null,
      "attemptCount": 0,
      "solved": false,
      "lastAttemptAt": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Recorded wrong-answer response:

```http
POST /api/v1/student/practice/questions/cmsksaxk100o2nw01ivrmwuao/attempts
Authorization: Bearer <student-access-token>
Content-Type: application/json

{ "optionIds": ["cmsksaxw900ocnw01uksiqfzi"] }
```

```json
{
  "id": "cmsksb0qy00otnw01z1iw4rpv",
  "attemptNumber": 1,
  "selectedOptionIds": ["cmsksaxw900ocnw01uksiqfzi"],
  "isCorrect": false,
  "correctOptionIds": ["cmsksaxpp00o8nw01em4bzqeo"],
  "explanation": "The first option is correct.",
  "submittedAt": "2026-08-08T19:46:22.474Z"
}
```

Use the returned `correctOptionIds` and `explanation` immediately. A later
attempt is a separate record; it does not overwrite the first attempt. The
recorded retry succeeded as `attemptNumber: 2` and the history endpoint returned
both attempts in chronological order.

The asset-access endpoint verifies both student access and the question/asset
relationship. It returns a temporary `url` for non-video assets or `embedUrl`
for video, plus `expiresAt`; never construct or persist either URL. A missing
asset returned the following recorded error:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND.ELIGIBLE_QUESTION_ASSET_NOT_FOUND",
  "message": { "en": "Eligible question asset not found" }
}
```

The recorded performance response after one wrong and one correct retry was:

```json
{
  "totalQuestions": 1,
  "attemptedQuestions": 1,
  "solvedQuestions": 1,
  "totalAttempts": 2,
  "accuracyPercent": 50,
  "firstTryCorrect": 0,
  "lastActivityAt": "2026-08-08T19:46:22.671Z"
}
```

## 3. Generated quizzes and exams

The assessment APIs generate a frozen set of existing published questions. They
do not create questions, call AI, or support retries after submission.

Each scope object has exactly one target:

```json
{ "courseId": "…" }
{ "chapterId": "…" }
{ "lessonId": "…" }
{ "sectionId": "…" }
```

The array can contain more than one scope. Questions from matching scopes form
the candidate set; duplicate targets are rejected.

### Student assessment endpoints

| Method and path | Request body or query | Frontend use |
| --- | --- | --- |
| `POST /student/assessments` | `scopes`, `questionCount` (1–50), optional `mode`, `isTimed`, `durationSeconds`, `title` | Create a private random assessment. |
| `GET /student/assessments` | `page`, `limit`, `search`, `status` (`ALL`, `SUSPENDED`, `COMPLETED`) | List own and visible public assessments. |
| `GET /student/assessments/:id` | — | Read metadata and scopes. |
| `PATCH /student/assessments/:id` | `{ "title": "…" }` | Rename an owned assessment. |
| `DELETE /student/assessments/:id` | — | Delete an owned assessment. |
| `POST /student/assessments/:id/attempts/start` | — | Start or resume the only attempt. |
| `GET /student/assessments/:id/attempts/current` | — | Restore a saved attempt. |
| `POST /student/assessments/:id/attempts/current/answers/:questionId` | `selectedOptionIds` | Autosave one answer. |
| `POST /student/assessments/:id/attempts/current/submit` | — | Finalize and score. |
| `GET /student/assessments/:id/attempts/current/result` | optional `includeComparison` (default `true`) | Retrieve completed review data and weighted chapter peer comparisons. |
| `PATCH /student/assessments/:id/attempts/current/questions/:questionId/active-time` | `{ "activeSeconds": number }` | Persist the monotonic active-time total while an attempt is resumable. |
| `GET /student/assessments/analytics/summary` | optional `subjectId`, `chapterId`, `q`, `page`, `limit` | Retrieve paginated completed-result subject/chapter/topic rollups and chapter attempt drill-down. |

`GET /student/assessments` combines the student's non-archived private
assessments with accessible published admin assessments. Its `status` query is
the student's attempt status, not the assessment lifecycle status.

### Generate a private assessment

```http
POST /api/v1/student/assessments
Authorization: Bearer <student-access-token>
Content-Type: application/json

{
  "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }],
  "questionCount": 2,
  "mode": "EXAM"
}
```

```json
{
  "id": "cmsksbb1600sinw01d9ikhjth",
  "title": "Exam - 2026-08-08 19:46",
  "visibility": "MINE",
  "generationType": "STANDARD",
  "mode": "EXAM",
  "isTimed": false,
  "durationSeconds": null,
  "questionCount": 2,
  "createdAt": "2026-08-08T19:46:35.802Z",
  "attemptStatus": null,
  "score": null,
  "scopes": [{
    "courseId": "cmsksb6i600q8nw01kxa4s2se",
    "chapterId": null,
    "lessonId": null,
    "sectionId": null
  }]
}
```

The student must have an academic grade and access to the selected published
scope. The API returns `400` when there are not enough eligible questions.
It creates the assessment only; call `/attempts/start` to receive its questions.

`isTimed` defaults to `false`. When true, include a `durationSeconds` integer
of at least 30. The timer starts at the first `POST /attempts/start`, not at
assessment creation.

Private assessments are never visible to another student. The recorded other
student detail request returned:

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN.ASSESSMENT_IS_NOT_ACCESSIBLE",
  "message": { "en": "Assessment is not accessible" }
}
```

### Attempt lifecycle

```text
create assessment → start/resume → autosave answers → submit → result
                          ↑              ↓
                    current state ← app reload/network recovery
```

The `questionId` in the autosave path is the **assessment snapshot question
ID** returned by `start`, not the original authoring question ID.

Recorded start response for the generated exam:

```json
{
  "attemptId": "cmsksbc7200sunw01d4sidtcu",
  "status": "SUSPENDED",
  "startedAt": "2026-08-08T19:46:37.309Z",
  "expiresAt": null,
  "submittedAt": null,
  "score": null,
  "totalQuestions": 2,
  "mode": "EXAM",
  "questions": [
    {
      "id": "cmsksbb3o00smnw01iwqu5zux",
      "sortOrder": 1,
      "type": "SINGLE_CHOICE",
      "body": "Assessment question 1",
      "options": [
        { "id": "cmsksbb3o00snnw0189eq9zzp", "body": "Correct", "sortOrder": 1 },
        { "id": "cmsksbb3o00sonw01bvcsndjd", "body": "Wrong", "sortOrder": 2 }
      ],
      "selectedOptionIds": [],
      "answered": false,
      "isCorrect": null,
      "correctOptionIds": null,
      "explanation": null
    }
  ]
}
```

Autosave request and recorded `EXAM` response:

```http
POST /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth/attempts/current/answers/cmsksbb3o00smnw01iwqu5zux
Authorization: Bearer <student-access-token>
Content-Type: application/json

{ "selectedOptionIds": ["cmsksbb3o00snnw0189eq9zzp"] }
```

```json
{
  "assessmentQuestionId": "cmsksbb3o00smnw01iwqu5zux",
  "selectedOptionIds": ["cmsksbb3o00snnw0189eq9zzp"],
  "isCorrect": null,
  "correctOptionIds": null,
  "explanation": null
}
```

The current-state endpoint returns those selected option IDs, `answered`, and
the same question order. Use it to restore an interrupted attempt. The attempt
can be resumed only while `SUSPENDED`; starting twice resumes the existing row.

For `SINGLE_CHOICE`, send zero or one option ID. For `MULTIPLE_CHOICE`, send
the selected set. Duplicate IDs and options outside the snapshot question are
rejected. Sending an empty array clears an autosaved answer.

Submission is idempotent. The recorded response was:

```json
{
  "attemptId": "cmsksbc7200sunw01d4sidtcu",
  "status": "COMPLETED",
  "score": 1,
  "totalQuestions": 2,
  "submittedAt": "2026-08-08T19:46:38.104Z"
}
```

After `COMPLETED`, call `/result` to show the review. The response reveals
every snapshot question, explanation, options with `isCorrect`, selected option
IDs, and `answered`/`isCorrect`. It also returns percentage and persisted
correct/incorrect/omitted counts. It derives every represented chapter from
the frozen question placements, returns a minimum-sample protected comparison
for each chapter, then returns an overall comparison weighted by the number of
questions in each chapter. This works for course, lesson, section, and
multi-scope assessments when their snapshot questions have chapter placements;
use `includeComparison=false` to omit that calculation.
Unanswered questions are scored incorrect.

For a timed attempt, compare `expiresAt` with the client clock for the UI
countdown, but treat the server as authoritative. Accessing current state or
autosaving after expiry causes the API to finalize the attempt.

### Admin assessment endpoints

| Method and path | Request body or query | Frontend use |
| --- | --- | --- |
| `POST /admin/assessments/standard` | Same generation payload as student creation | Create a random draft. |
| `POST /admin/assessments/custom` | `questionIds`, `scopes`, optional mode/timer/title | Create a hand-picked draft. |
| `GET /admin/assessments` | `page`, `limit`, `search`, `status` (`DRAFT`, `READY`, `ARCHIVED`) | List admin assessments. |
| `GET /admin/assessments/:id` | — | Load snapshot questions, answer keys, and scopes. |
| `PATCH /admin/assessments/:id` | `title?`, `mode?`, `isTimed?`, `durationSeconds?` | Edit a draft. |
| `POST /admin/assessments/:id/publish` | — | Move a draft to `READY`. |
| `POST /admin/assessments/:id/archive` | — | Move a ready assessment to `ARCHIVED`. |
| `DELETE /admin/assessments/:id` | — | Delete a never-published draft. |

An admin standard assessment uses the same eligible published-question pool as
student generation but is created as `DRAFT`. The admin detail/create response
includes the full answer key, so never use it in a student-facing client state.

Recorded standard creation request:

```json
{
  "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }],
  "questionCount": 2,
  "mode": "EXAM",
  "title": "Disposable standard assessment journey-20260808194316-db39-172"
}
```

Its recorded response had:

```json
{
  "id": "cmsksbd6h00synw01ebpt732i",
  "generationType": "STANDARD",
  "mode": "EXAM",
  "questionCount": 2,
  "status": "DRAFT",
  "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }],
  "questions": [
    {
      "id": "cmsksbd6n00t2nw01e70s9guy",
      "body": "Assessment question 1",
      "explanation": "Explanation 1",
      "options": [{ "body": "Correct", "isCorrect": true, "sortOrder": 1 }]
    }
  ]
}
```

Recorded custom creation request:

```json
{
  "questionIds": [
    "cmsksb7u300qunw01gjab3wwu",
    "cmsksb8pr00rcnw0156wo7aa2"
  ],
  "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }],
  "mode": "TUTOR"
}
```

This returned `generationType: "CUSTOM"`, `mode: "TUTOR"`, and `status:
"DRAFT"`; question order follows the supplied `questionIds` order. Every ID
must be unique, published, and have a published placement inside one supplied
scope.

Only `DRAFT` assessments can be edited or deleted. Publishing changes
`DRAFT → READY`; archiving changes `READY → ARCHIVED`.

## 4. Public-assessment visibility and frontend integration checklist

An admin assessment is not visible merely because it is `READY`. For a student
to see or start it, every assessment scope must have published ancestry, match
the student's current academic grade, and grant that student effective access.
This fails closed: access to only one scope of a multi-scope assessment is not
enough.

The recorded custom `TUTOR` assessment was absent from student lists while it
was `DRAFT`, appeared after publish for the eligible student, and disappeared
again after archive. Its completed attempt remained readable.

Use this checklist when implementing screens:

- Store `visibility` (`MINE` or `PUBLIC`) with assessment list items; show
  rename/delete only for `MINE` records.
- Treat `attemptStatus: null` as “not started,” `SUSPENDED` as resumable, and
  `COMPLETED` as result-ready.
- Persist no answer key from a student `EXAM` response before completion;
  fields are intentionally `null`.
- Use assessment snapshot question and option IDs for all answer requests.
- Autosave after an answer change, then reconcile local state with the response
  or with `GET .../attempts/current` after reconnecting.
- Render `expiresAt` as a countdown but submit/lock based on the server response
  when the timer expires.
- Do not offer a retry button for completed generated assessments. Direct
  practice, by contrast, intentionally supports repeated immutable attempts.
- Handle `403` as unavailable/private/no-longer-entitled, `404` as an invalid
  relationship or missing record, and `409` as a state-transition or validation
  conflict; surface the localized `message` payload where appropriate.

For API-wide request validation and complete DTO field definitions, see
[`docs/api-reference-detailed.md`](api-reference-detailed.md). The recorded
examples in this guide should be treated as the frontend integration baseline.

## Appendix: recorded request and response for every endpoint

The earlier sections explain the workflows. This appendix is a route-by-route
lookup with a request and response example from the recorded run. Responses
are intentionally abridged to the fields relevant to that operation; every
shown value comes from the referenced report. “No body” means the recorded
request had no JSON payload or query parameters.

### Question sources

#### Create a source — `POST /admin/question-banks/sources`

**Request**

```json
{ "type": "PLATFORM", "title": { "ar": "Coverage source journey-20260808194316-db39-125", "en": "Coverage source journey-20260808194316-db39-125" } }
```

**Response — `201 Created`**

```json
{ "id": "cmsksa6v400h5nw01xp5tlz27", "type": "PLATFORM", "status": "DRAFT" }
```

#### List sources — `GET /admin/question-banks/sources`

**Request:** no body or query parameters in the recorded call.

**Response — `200 OK`**

```json
{ "data": [{ "id": "cmsksa6v400h5nw01xp5tlz27", "type": "PLATFORM", "status": "DRAFT" }], "meta": { "page": 1, "limit": 20, "total": 112, "totalPages": 6 } }
```

#### Read a source — `GET /admin/question-banks/sources/:id`

**Request:** `GET /api/v1/admin/question-banks/sources/cmsksa6v400h5nw01xp5tlz27`

**Response — `200 OK`**

```json
{ "id": "cmsksa6v400h5nw01xp5tlz27", "type": "PLATFORM", "status": "DRAFT" }
```

#### Update a source — `PATCH /admin/question-banks/sources/:id`

**Request**

```json
{ "title": { "ar": "Updated coverage source journey-20260808194316-db39-127", "en": "Updated coverage source journey-20260808194316-db39-127" } }
```

**Response — `200 OK`**

```json
{ "id": "cmsksa6v400h5nw01xp5tlz27", "status": "DRAFT", "title": { "ar": "Updated coverage source journey-20260808194316-db39-127" } }
```

#### Publish a source — `POST /admin/question-banks/sources/:id/publish`

- Request: `POST /api/v1/admin/question-banks/sources/cmsksa6v400h5nw01xp5tlz27/publish` (no body)
- Response — `201 Created`: `{ "id": "cmsksa6v400h5nw01xp5tlz27", "status": "PUBLISHED" }`

#### Archive a source — `POST /admin/question-banks/sources/:id/archive`

- Request: `POST /api/v1/admin/question-banks/sources/cmsksa6v400h5nw01xp5tlz27/archive` (no body)
- Response — `201 Created`: `{ "id": "cmsksa6v400h5nw01xp5tlz27", "status": "ARCHIVED" }`

#### Restore a source — `POST /admin/question-banks/sources/:id/restore`

- Request: `POST /api/v1/admin/question-banks/sources/cmsksa6v400h5nw01xp5tlz27/restore` (no body)
- Response — `201 Created`: `{ "id": "cmsksa6v400h5nw01xp5tlz27", "status": "DRAFT" }`

#### Delete a source — `DELETE /admin/question-banks/sources/:id`

- Request: `DELETE /api/v1/admin/question-banks/sources/cmsksacdw00ivnw01snw1br6p` (no body)
- Response — `200 OK`: `{ "id": "cmsksacdw00ivnw01snw1br6p", "deleted": true }`

### Question banks

#### Create a bank — `POST /admin/question-banks`

**Request**

```json
{ "title": "Coverage bank journey-20260808194316-db39-126" }
```

**Response — `201 Created`**

```json
{ "id": "cmsksa70g00h9nw01rl77tn68", "title": "Coverage bank journey-20260808194316-db39-126", "status": "DRAFT" }
```

#### List banks — `GET /admin/question-banks`

- Request: `GET /api/v1/admin/question-banks` (no body or query parameters)
- Response — `200 OK`: `{ "data": [{ "id": "cmsksa70g00h9nw01rl77tn68", "status": "DRAFT" }], "meta": { "page": 1, "limit": 20, "total": 112, "totalPages": 6 } }`

#### Read a bank — `GET /admin/question-banks/:id`

- Request: `GET /api/v1/admin/question-banks/cmsksa70g00h9nw01rl77tn68`
- Response — `200 OK`: `{ "id": "cmsksa70g00h9nw01rl77tn68", "title": "Coverage bank journey-20260808194316-db39-126", "status": "DRAFT" }`

#### Update a bank — `PATCH /admin/question-banks/:id`

- Request: `PATCH /api/v1/admin/question-banks/cmsksa70g00h9nw01rl77tn68` with `{ "description": "covered" }`
- Response — `200 OK`: `{ "id": "cmsksa70g00h9nw01rl77tn68", "description": "covered", "status": "DRAFT" }`

#### Publish a bank — `POST /admin/question-banks/:id/publish`

- Request: `POST /api/v1/admin/question-banks/cmsksa70g00h9nw01rl77tn68/publish` (no body)
- Response — `201 Created`: `{ "id": "cmsksa70g00h9nw01rl77tn68", "status": "PUBLISHED" }`

#### Archive a bank — `POST /admin/question-banks/:id/archive`

- Request: `POST /api/v1/admin/question-banks/cmsksa70g00h9nw01rl77tn68/archive` (no body)
- Response — `201 Created`: `{ "id": "cmsksa70g00h9nw01rl77tn68", "status": "ARCHIVED" }`

#### Restore a bank — `POST /admin/question-banks/:id/restore`

- Request: `POST /api/v1/admin/question-banks/cmsksa70g00h9nw01rl77tn68/restore` (no body)
- Response — `201 Created`: `{ "id": "cmsksa70g00h9nw01rl77tn68", "status": "DRAFT" }`

#### Delete a bank — `DELETE /admin/question-banks/:id`

- Request: `DELETE /api/v1/admin/question-banks/cmsksacjx00iznw01ewnkxdyq` (no body)
- Response — `200 OK`: `{ "id": "cmsksacjx00iznw01ewnkxdyq", "deleted": true }`

### Questions and review

#### Create a question — `POST /admin/questions`

**Request**

```json
{ "bankId": "cmsksa70g00h9nw01rl77tn68", "sourceId": "cmsksa6v400h5nw01xp5tlz27", "courseId": "cmsks7iro002lnw01mveg8obj", "placements": [{ "chapterId": "cmsks7iyh002pnw01l3h8uqex" }], "body": "Coverage question?" }
```

**Response — `201 Created`**

```json
{ "id": "cmsksa9e900htnw01xpsrxxq0", "type": "SINGLE_CHOICE", "status": "DRAFT", "options": [] }
```

#### Read and edit a question

**`GET /admin/questions`**

Request: `GET /api/v1/admin/questions?chapterId=cmsks7iyh002pnw01l3h8uqex&q=revised`

Response — `200 OK`:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
```

**`GET /admin/questions/:id`**

Request: `GET /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0`

Response — `200 OK`:

```json
{ "id": "cmsksa9e900htnw01xpsrxxq0", "body": "Coverage question?", "status": "DRAFT", "placements": [{ "chapterId": "cmsks7iyh002pnw01l3h8uqex" }], "options": [] }
```

**`PATCH /admin/questions/:id`**

Request: `PATCH /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha`

```json
{ "body": "Which revised synthetic option is correct?" }
```

Response — `200 OK`:

```json
{ "id": "cmsks8n3d009hnw01wkv08lha", "body": "Which revised synthetic option is correct?", "status": "IN_REVIEW" }
```

#### Submit, reject, publish, archive, or delete a question

- **`POST /admin/questions/:id/submit`**
  - Request: `POST /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha/submit`
  - Response — `201 Created`: `{ "id": "cmsks8n3d009hnw01wkv08lha", "status": "IN_REVIEW" }`
- **`POST /admin/questions/:id/reject`**
  - Request: `POST /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha/reject` with `{ "reviewNote": "Please clarify the wording." }`
  - Response — `201 Created`: `{ "id": "cmsks8n3d009hnw01wkv08lha", "status": "REJECTED", "reviewNote": "Please clarify the wording." }`
- **`POST /admin/questions/:id/publish`**
  - Request: `POST /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha/publish`
  - Response — `201 Created`: `{ "id": "cmsks8n3d009hnw01wkv08lha", "status": "PUBLISHED" }`
- **`POST /admin/questions/:id/archive`**
  - Request: `POST /api/v1/admin/questions/cmsks8n3d009hnw01wkv08lha/archive`
  - Response — `201 Created`: `{ "id": "cmsks8n3d009hnw01wkv08lha", "status": "ARCHIVED" }`
- **`DELETE /admin/questions/:id`**
  - Request: `DELETE /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0`
  - Response — `200 OK`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "deleted": true }`

### Question options, assets, and video

#### Options

- **`POST /admin/questions/:id/options`**
  - Request: `POST /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/options` with `{ "body": "Correct", "isCorrect": true }`
  - Response — `201 Created`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "options": [{ "id": "cmsksa9t800hznw01kbbkqpgk", "body": "Correct", "isCorrect": true, "sortOrder": 1 }] }`
- **`PATCH /admin/questions/:id/options/:optionId`**
  - Request: `PATCH /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/options/cmsksa9zf00i3nw01bl4szo5e` with `{ "body": "Updated option" }`
  - Response — `200 OK`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "options": [{ "id": "cmsksa9zf00i3nw01bl4szo5e", "body": "Updated option" }] }`
- **`DELETE /admin/questions/:id/options/:optionId`**
  - Request: `DELETE /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/options/cmsksa9zf00i3nw01bl4szo5e`
  - Response — `200 OK`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "options": [{ "id": "cmsksa9t800hznw01kbbkqpgk", "sortOrder": 1 }] }`
- **`POST /admin/questions/:id/options/reorder`**
  - Request: `POST /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/options/reorder` with `{ "optionIds": ["cmsksa9zf00i3nw01bl4szo5e", "cmsksa9t800hznw01kbbkqpgk"] }`
  - Response — `201 Created`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "options": [{ "id": "cmsksa9zf00i3nw01bl4szo5e", "sortOrder": 1 }, { "id": "cmsksa9t800hznw01kbbkqpgk", "sortOrder": 2 }] }`

#### Attachments and video

- **`POST /admin/questions/:id/assets`**
  - Request: `POST /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/assets` with `{ "assetId": "cmsks8u1o00adnw015cn556b2" }`
  - Response — `201 Created`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "assets": [{ "assetId": "cmsks8u1o00adnw015cn556b2", "sortOrder": 1 }] }`
- **`POST /admin/questions/:id/assets/reorder`**
  - Request: `POST /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/assets/reorder` with `{ "assetIds": ["cmsks8u1o00adnw015cn556b2"] }`
  - Response — `201 Created`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "assets": [{ "assetId": "cmsks8u1o00adnw015cn556b2", "sortOrder": 1 }] }`
- **`DELETE /admin/questions/:id/assets/:assetId`**
  - Request: `DELETE /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/assets/cmsks8u1o00adnw015cn556b2`
  - Response — `200 OK`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "assets": [] }`
- **`POST /admin/questions/:id/video-link`**
  - Request: `POST /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/video-link` with `{ "videoAssetId": "cmsks8y2700arnw01pidqfc24", "timestampSeconds": 0 }`
  - Response — `201 Created`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "videoLink": { "videoAssetId": "cmsks8y2700arnw01pidqfc24", "timestampSeconds": 0 } }`
- **`DELETE /admin/questions/:id/video-link`**
  - Request: `DELETE /api/v1/admin/questions/cmsksa9e900htnw01xpsrxxq0/video-link`
  - Response — `200 OK`: `{ "id": "cmsksa9e900htnw01xpsrxxq0", "videoLink": null }`

### Student direct practice

#### List questions — `GET /student/practice/questions`

**Request:** `GET /api/v1/student/practice/questions?courseId=cmsksav3x00mqnw01t4h029oc`

**Response — `200 OK`**

```json
{ "data": [{ "id": "cmsksaxk100o2nw01ivrmwuao", "body": "Which option is correct?", "attemptCount": 0, "solved": false }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }
```

#### Submit and inspect practice attempts

- **`POST /student/practice/questions/:questionId/attempts`**
  - Request: `POST /api/v1/student/practice/questions/cmsksaxk100o2nw01ivrmwuao/attempts` with `{ "optionIds": ["cmsksaxw900ocnw01uksiqfzi"] }`
  - Response — `201 Created`: `{ "id": "cmsksb0qy00otnw01z1iw4rpv", "attemptNumber": 1, "isCorrect": false, "correctOptionIds": ["cmsksaxpp00o8nw01em4bzqeo"], "explanation": "The first option is correct." }`
- **`GET /student/practice/questions/:questionId/attempts`**
  - Request: `GET /api/v1/student/practice/questions/cmsksaxk100o2nw01ivrmwuao/attempts`
  - Response — `200 OK`: `{ "data": [{ "attemptNumber": 1, "isCorrect": false }, { "attemptNumber": 2, "isCorrect": true }], "meta": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 } }`

#### Get a practice asset or performance summary

- **`GET /student/practice/questions/:questionId/assets/:assetId/access`**
  - Request: `GET /api/v1/student/practice/questions/cmsks9k1g00bxnw018n39hcnz/assets/cmsks8u1o00adnw015cn556b2/access`
  - Response — `200 OK`: `{ "url": "<signed-token-url>", "expiresAt": "2026-08-08T19:50:17.834Z" }`
- **`GET /student/performance`**
  - Request: `GET /api/v1/student/performance`
  - Response — `200 OK`: `{ "totalQuestions": 1, "attemptedQuestions": 1, "solvedQuestions": 1, "totalAttempts": 2, "accuracyPercent": 50, "firstTryCorrect": 0 }`

### Student assessments and attempts

#### Create and manage a student assessment

- **`POST /student/assessments`**
  - Request: `{ "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }], "questionCount": 2, "mode": "EXAM" }`
  - Response — `201 Created`: `{ "id": "cmsksbb1600sinw01d9ikhjth", "visibility": "MINE", "generationType": "STANDARD", "mode": "EXAM", "questionCount": 2, "attemptStatus": null }`
- **`GET /student/assessments`**
  - Request: `GET /api/v1/student/assessments`
  - Response — `200 OK`: `{ "data": [{ "id": "cmsksbb1600sinw01d9ikhjth", "visibility": "MINE", "attemptStatus": null }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }`
- **`GET /student/assessments/:id`**
  - Request: `GET /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth`
  - Response — `200 OK`: `{ "id": "cmsksbb1600sinw01d9ikhjth", "visibility": "MINE", "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }] }`
- **`PATCH /student/assessments/:id`**
  - Request: `PATCH /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth` with `{ "title": "Renamed student assessment journey-20260808194316-db39-171" }`
  - Response — `200 OK`: `{ "id": "cmsksbb1600sinw01d9ikhjth", "title": "Renamed student assessment journey-20260808194316-db39-171", "visibility": "MINE" }`
- **`DELETE /student/assessments/:id`**
  - Request: `DELETE /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth`
  - Response — `200 OK`: `{ "id": "cmsksbb1600sinw01d9ikhjth", "deleted": true }`

#### Start, save, submit, and review an attempt

- **`POST /student/assessments/:id/attempts/start`**
  - Request: `POST /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth/attempts/start`
  - Response — `201 Created`: `{ "attemptId": "cmsksbc7200sunw01d4sidtcu", "status": "SUSPENDED", "mode": "EXAM", "totalQuestions": 2, "questions": [{ "id": "cmsksbb3o00smnw01iwqu5zux" }] }`
- **`GET /student/assessments/:id/attempts/current`**
  - Request: `GET /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth/attempts/current`
  - Response — `200 OK`: `{ "attemptId": "cmsksbc7200sunw01d4sidtcu", "status": "SUSPENDED", "questions": [{ "id": "cmsksbb3o00smnw01iwqu5zux", "selectedOptionIds": ["cmsksbb3o00snnw0189eq9zzp"], "answered": true }] }`
- **`POST /student/assessments/:id/attempts/current/answers/:questionId`**
  - Request: `POST /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth/attempts/current/answers/cmsksbb3o00smnw01iwqu5zux` with `{ "selectedOptionIds": ["cmsksbb3o00snnw0189eq9zzp"] }`
  - Response — `201 Created`: `{ "assessmentQuestionId": "cmsksbb3o00smnw01iwqu5zux", "selectedOptionIds": ["cmsksbb3o00snnw0189eq9zzp"], "isCorrect": null, "correctOptionIds": null }`
- **`POST /student/assessments/:id/attempts/current/submit`**
  - Request: `POST /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth/attempts/current/submit`
  - Response — `201 Created`: `{ "attemptId": "cmsksbc7200sunw01d4sidtcu", "status": "COMPLETED", "score": 1, "totalQuestions": 2 }`
- **`GET /student/assessments/:id/attempts/current/result`**
  - Request: `GET /api/v1/student/assessments/cmsksbb1600sinw01d9ikhjth/attempts/current/result`
  - Response — `200 OK`: `{ "attemptId": "cmsksbc7200sunw01d4sidtcu", "score": 1, "questions": [{ "id": "cmsksbb3o00smnw01iwqu5zux", "isCorrect": true, "explanation": "Explanation 1" }] }`

### Admin assessments

#### Create a standard assessment — `POST /admin/assessments/standard`

**Request**

```json
{ "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }], "questionCount": 2, "mode": "EXAM", "title": "Disposable standard assessment journey-20260808194316-db39-172" }
```

**Response — `201 Created`**

```json
{ "id": "cmsksbd6h00synw01ebpt732i", "generationType": "STANDARD", "status": "DRAFT", "questionCount": 2 }
```

#### Create a custom assessment — `POST /admin/assessments/custom`

**Request**

```json
{ "questionIds": ["cmsksb7u300qunw01gjab3wwu", "cmsksb8pr00rcnw0156wo7aa2"], "scopes": [{ "courseId": "cmsksb6i600q8nw01kxa4s2se" }], "mode": "TUTOR" }
```

**Response — `201 Created`**

```json
{ "id": "cmsksbe0m00tgnw01bn7mlihq", "generationType": "CUSTOM", "mode": "TUTOR", "status": "DRAFT" }
```

#### List assessments — `GET /admin/assessments`

- Request: `GET /api/v1/admin/assessments?search=Disposable`
- Response — `200 OK`: `{ "data": [{ "id": "cmsksbd6h00synw01ebpt732i", "status": "DRAFT", "generationType": "STANDARD" }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }`

#### Read an assessment — `GET /admin/assessments/:id`

- Request: `GET /api/v1/admin/assessments/cmsksbd6h00synw01ebpt732i`
- Response — `200 OK`: `{ "id": "cmsksbd6h00synw01ebpt732i", "status": "DRAFT", "questions": [{ "id": "cmsksbd6n00t2nw01e70s9guy", "options": [{ "isCorrect": true }] }] }`

#### Update a draft assessment — `PATCH /admin/assessments/:id`

- Request: `PATCH /api/v1/admin/assessments/cmsksbd6h00synw01ebpt732i` with `{ "title": "Updated standard assessment journey-20260808194316-db39-173" }`
- Response — `200 OK`: `{ "id": "cmsksbd6h00synw01ebpt732i", "title": "Updated standard assessment journey-20260808194316-db39-173", "status": "DRAFT" }`

#### Publish an assessment — `POST /admin/assessments/:id/publish`

- Request: `POST /api/v1/admin/assessments/cmsksbe0m00tgnw01bn7mlihq/publish` (no body)
- Response — `201 Created`: `{ "id": "cmsksbe0m00tgnw01bn7mlihq", "status": "READY", "publishedAt": "2026-08-08T19:46:40.167Z" }`

#### Archive an assessment — `POST /admin/assessments/:id/archive`

- Request: `POST /api/v1/admin/assessments/cmsksbe0m00tgnw01bn7mlihq/archive` (no body)
- Response — `201 Created`: `{ "id": "cmsksbe0m00tgnw01bn7mlihq", "status": "ARCHIVED", "archivedAt": "2026-08-08T19:46:41.504Z" }`

#### Delete a draft assessment — `DELETE /admin/assessments/:id`

- Request: `DELETE /api/v1/admin/assessments/cmsksbd6h00synw01ebpt732i` (no body)
- Response — `200 OK`: `{ "id": "cmsksbd6h00synw01ebpt732i", "deleted": true }`
