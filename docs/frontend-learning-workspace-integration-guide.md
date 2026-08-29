# Frontend integration guide: learning, assessments, and workspace updates

This guide covers the learning-facing API additions and response changes. The
base URL in the examples is `$BASE_URL`; all `student/*` routes require
`Authorization: Bearer <student-access-token>`. Admin constant routes require
an `ADMIN` or `SUPER_ADMIN` token.

The checked-in [OpenAPI document](../docs-json.json) remains the source of
truth for the complete request and response schema.

## What changed

| Area                         | Frontend-facing change                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assessment lists and details | `attemptStatus` is always `NOT_STARTED`, `SUSPENDED`, or `COMPLETED`. Assessment lists can be filtered by `NOT_STARTED`.                                           |
| Written answer grading       | Tutor assessments return safe written-answer AI feedback after each save; exam assessments grade written answers after submission. |
| Student entitlement          | Each entitlement supplies its owning `courseId` and `progress` percentage.                                                                                         |
| Learning state               | Catalogue, library, continue-learning, and progress views now use consistent `isCompleted` rollups.                                                                |
| Public course                | Course details include counts of published chapters, lessons, and sections.                                                                                        |
| Question workspace           | Students can save private text highlights on accessible questions.                                                                                                 |
| Notebook                     | Students can create and manage global private notebook pages.                                                                                                      |
| Subject constants            | Published calculator constants are public; administrators can manage them.                                                                                         |

## 1. Assessment attempt status

### List assessments

`GET /api/v1/student/assessments?status=NOT_STARTED`

Supported `status` values are `NOT_STARTED`, `SUSPENDED`, and `COMPLETED`.
Do not use a missing or `null` attempt status to represent an unstarted
assessment anymore.

```ts
type AttemptStatus = 'NOT_STARTED' | 'SUSPENDED' | 'COMPLETED';

type AssessmentListItem = {
  id: string;
  title: string;
  attemptStatus: AttemptStatus;
  score: number | null;
};

const assessments = await api.get<{ data: AssessmentListItem[] }>(
  '/student/assessments?status=NOT_STARTED',
);
```

Recommended UI behavior:

- `NOT_STARTED`: show **Start**.
- `SUSPENDED`: show **Resume**.
- `COMPLETED`: show the result/review action and score when present.
- Apply the same mapping in assessment cards, detail pages, and any continue
  learning surface.

## 2. Entitlements and completion rollups

### Entitlements

`GET /api/v1/student/entitlements`

Each entitlement now includes the course that owns the access target and a
completion percentage from `0` to `100`.

```json
{
  "data": [
    {
      "id": "entitlement_123",
      "targetType": "CHAPTER",
      "targetId": "chapter_123",
      "targetName": "Motion",
      "courseId": "course_123",
      "progress": 67,
      "status": "ACTIVE",
      "startsAt": "2026-08-28T08:00:00.000Z",
      "expiresAt": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Use `courseId` to group course and chapter purchases under one course in the
library or purchases UI. Render `progress` as a percentage; it is already
rounded by the API, so do not recompute it on the client.

### Completion-aware views

The following routes now agree on the `isCompleted` value they expose for
eligible catalogue nodes or content items:

- `GET /api/v1/student/catalog/{resource}/{id}/content-items`
- `GET /api/v1/student/catalog/search`
- `GET /api/v1/student/library`
- `GET /api/v1/student/learning/continue`
- `GET /api/v1/student/progress`

Use the returned completion flag directly. In particular, do not infer a
parent's completion from a visible child count: a hierarchy node is complete
only when all of its relevant descendant content is complete. A node with no
content is not complete.

After a student completes an item with
`POST /api/v1/student/content-items/{contentItemId}/complete`, invalidate or
refetch every cached view above that is visible in the current screen.

## 3. Public course content counts

`GET /api/v1/catalog/courses/{id}` now includes `contentCounts`:

```json
{
  "id": "course_123",
  "title": "Physics",
  "contentCounts": {
    "chapters": 4,
    "lessons": 18,
    "sections": 42
  }
}
```

These are counts of published nested catalogue records. Use them for course
metadata (for example, “4 chapters · 18 lessons”); they are not completion
counts and do not grant access to protected content.

## 4. Private question highlights

Highlights belong to the signed-in student and to one accessible question.
They must never be shared in another student's workspace.

### Endpoints

| Method   | Path                                                              | Body                                                 |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/api/v1/student/questions/{questionId}/highlights`               | —                                                    |
| `POST`   | `/api/v1/student/questions/{questionId}/highlights`               | `selectedText`, `startOffset`, `endOffset`, `color?` |
| `DELETE` | `/api/v1/student/questions/{questionId}/highlights/{highlightId}` | —                                                    |

```json
{
  "selectedText": "Question",
  "startOffset": 0,
  "endOffset": 8,
  "color": "yellow"
}
```

`startOffset` and `endOffset` are zero-based character offsets in the exact
question body. `selectedText` must exactly equal the slice between them.
Create requests return `201`; an invalid range or mismatched text returns
`400`. Deleting a highlight not owned by the current student returns `404`.

The list response is wrapped as `{ "data": Highlight[] }`.

```ts
type Highlight = {
  id: string;
  questionId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Store the highlight ID returned by the API for deletion. To render highlights,
use the returned offsets against the same question text used to create them;
do not trust a previously cached question body after it changes.

## 5. Private notebook pages

Notebook pages are global to one student, rather than attached to a course or
question. Their HTML/text content should be rendered using the application's
normal safe rich-text strategy.

| Method   | Path                                      | Body                 |
| -------- | ----------------------------------------- | -------------------- |
| `GET`    | `/api/v1/student/notebook/pages`          | —                    |
| `POST`   | `/api/v1/student/notebook/pages`          | `title`, `content`   |
| `GET`    | `/api/v1/student/notebook/pages/{pageId}` | —                    |
| `PATCH`  | `/api/v1/student/notebook/pages/{pageId}` | `title?`, `content?` |
| `DELETE` | `/api/v1/student/notebook/pages/{pageId}` | —                    |

```json
{
  "title": "Revision notes",
  "content": "<p>My note</p>"
}
```

Create returns `201`; read and update return `200`. List responses are wrapped
as `{ "data": NotebookPage[] }`. A `PATCH` must include at least one field.
Treat `404` as “not found or not owned by this student”; do not expose an
ownership distinction in the UI.

```ts
type NotebookPage = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};
```

## 6. Subject calculator constants

### Read published constants

`GET /api/v1/subjects/{subjectId}/constants`

This route is public and returns `{ "data": SubjectConstant[] }`. It is the
only constants route a student calculator should use.

### Manage constants (admin UI only)

| Method   | Path                                                |
| -------- | --------------------------------------------------- |
| `GET`    | `/api/v1/admin/subjects/{subjectId}/constants`      |
| `POST`   | `/api/v1/admin/subjects/{subjectId}/constants`      |
| `GET`    | `/api/v1/admin/subjects/{subjectId}/constants/{id}` |
| `PATCH`  | `/api/v1/admin/subjects/{subjectId}/constants/{id}` |
| `DELETE` | `/api/v1/admin/subjects/{subjectId}/constants/{id}` |

```json
{ "key": "gravity", "value": "9.8" }
```

Keys are unique within a subject. Show a duplicate-key message on `409`; the
same key can be used in a different subject. Student tokens receive `403` on
admin routes. The admin list response is also `{ "data": SubjectConstant[] }`.

```ts
type SubjectConstant = {
  id: string;
  subjectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};
```

## Frontend verification checklist

1. Filter assessments with each of `NOT_STARTED`, `SUSPENDED`, and
   `COMPLETED`, and confirm every list/detail item has `attemptStatus`.
2. Check that entitlement cards use the API's `courseId` and `progress`.
3. Complete content and confirm all cached catalogue, library, continue, and
   progress screens agree on `isCompleted`; confirm partially completed and
   empty containers remain incomplete.
4. Compare public-course `contentCounts` with the published nested catalogue.
5. Create, list, and delete a highlight; verify invalid offsets return `400`
   and another student's highlight cannot be deleted.
6. Create, read, update, list, and delete a notebook page; verify another
   student receives `404` for that page.
7. As an admin, create, list, read, edit, and delete a constant; verify a
   duplicate key returns `409` and a student token receives `403`.

## Captured request and response examples

The following examples are taken from
`reports/api-tests/api-2026-08-28T08-51-47-172Z.json`. IDs and titles are real
values from that acceptance run, but are test data and must not be hard-coded.
Bearer tokens are intentionally replaced with `$STUDENT_TOKEN` and
`$ADMIN_TOKEN`.

### `GET /student/assessments?status=NOT_STARTED`

```http
GET /api/v1/student/assessments?status=NOT_STARTED
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpo5am04gvnz017sve0iv6",
      "title": "Exam - 2026-08-28 08:50",
      "visibility": "MINE",
      "generationType": "STANDARD",
      "mode": "EXAM",
      "isTimed": false,
      "durationSeconds": null,
      "questionCount": 2,
      "createdAt": "2026-08-28T08:50:08.974Z",
      "attemptStatus": "NOT_STARTED",
      "score": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
}
```

### `GET /student/entitlements`

```http
GET /api/v1/student/entitlements?page=1&limit=1
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpizm703punz01nh4um7be",
      "courseId": "cmtcpivug03ohnz010jz3wjey",
      "chapterId": "cmtcpivzt03olnz017scstr7w",
      "course": null,
      "chapter": {
        "title": "Entitled chapter journey-20260828084459-e330-66",
        "courseId": "cmtcpivug03ohnz010jz3wjey"
      },
      "source": "ADMIN",
      "status": "ACTIVE",
      "startsAt": "2026-08-28T08:46:08.335Z",
      "expiresAt": null,
      "targetType": "CHAPTER",
      "targetId": "cmtcpivzt03olnz017scstr7w",
      "targetName": "Entitled chapter journey-20260828084459-e330-66",
      "progress": 0
    }
  ],
  "meta": { "page": 1, "limit": 1, "total": 1, "totalPages": 1 }
}
```

### `GET /student/catalog/{resource}/{id}/content-items`

```http
GET /api/v1/student/catalog/chapters/cmtcpivzt03olnz017scstr7w/content-items
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "parent": {
    "id": "cmtcpivzt03olnz017scstr7w",
    "title": "Entitled chapter journey-20260828084459-e330-66",
    "access": {
      "state": "ENTITLED",
      "entitlementId": "cmtcpizm703punz01nh4um7be"
    },
    "isLocked": false,
    "isCompleted": false
  },
  "data": [
    {
      "id": "cmtcpiwnn03p1nz0185uggxr0",
      "type": "TEXT",
      "title": "Entitled chapter content journey-20260828084459-e330-74",
      "accessType": "PUBLIC",
      "isCompleted": false,
      "isLocked": false
    }
  ],
  "pageInfo": { "hasNextPage": false, "nextCursor": null }
}
```

### `GET /student/catalog/search`

```http
GET /api/v1/student/catalog/search?subjectId=cmtcpnfpw047znz0147b1bwx1&q=Learning
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpng1l0487nz017eq29u6q",
      "title": "Learning chapter journey-20260828084459-e330-158",
      "type": "CHAPTER",
      "access": { "state": "PUBLIC" },
      "isLocked": false,
      "breadcrumb": {
        "course": { "id": "cmtcpnfvg0483nz01cr0eqpfu", "isCompleted": false },
        "chapter": { "id": "cmtcpng1l0487nz017eq29u6q", "isCompleted": false }
      },
      "isCompleted": false
    }
  ],
  "pageInfo": { "hasNextPage": false, "nextCursor": null }
}
```

### `GET /student/library`

```http
GET /api/v1/student/library
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "entitlementId": "cmtcpizm703punz01nh4um7be",
      "targetType": "CHAPTER",
      "target": {
        "id": "cmtcpivzt03olnz017scstr7w",
        "title": "Entitled chapter journey-20260828084459-e330-66",
        "isCompleted": false,
        "courseId": "cmtcpivug03ohnz010jz3wjey"
      },
      "course": {
        "id": "cmtcpivug03ohnz010jz3wjey",
        "title": "Student catalog paid course journey-20260828084459-e330-64",
        "isCompleted": false
      },
      "startsAt": "2026-08-28T08:46:08.335Z",
      "expiresAt": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `GET /student/learning/continue`

```http
GET /api/v1/student/learning/continue
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": {
    "contentItem": {
      "id": "cmtcpngj1048jnz01qq4z8joe",
      "type": "TEXT",
      "title": "Learning text journey-20260828084459-e330-164",
      "progress": { "completed": false, "completedAt": null }
    },
    "studyState": {
      "lastOpenedAt": "2026-08-28T08:49:41.769Z",
      "playbackPositionSeconds": null
    },
    "course": { "id": "cmtcpnfvg0483nz01cr0eqpfu", "isCompleted": false },
    "chapter": { "id": "cmtcpng1l0487nz017eq29u6q", "isCompleted": false },
    "lesson": { "id": "cmtcpng75048bnz01e7n5uk1j", "isCompleted": false },
    "section": { "id": "cmtcpngdt048fnz017xsmlbk9", "isCompleted": false },
    "subjectProgress": {
      "totalContentItems": 2,
      "completedContentItems": 0,
      "completionPercent": 0
    }
  }
}
```

### `GET /student/progress`

```http
GET /api/v1/student/progress
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "content": { "totalItems": 2, "completedItems": 1, "completionPercent": 50 },
  "courses": [
    {
      "id": "cmtcpnfvg0483nz01cr0eqpfu",
      "totalContentItems": 2,
      "completedContentItems": 1,
      "completionPercent": 50,
      "completed": false,
      "isCompleted": false
    }
  ],
  "lessons": [
    {
      "id": "cmtcpng75048bnz01e7n5uk1j",
      "totalContentItems": 1,
      "completedContentItems": 1,
      "completionPercent": 100,
      "completed": true,
      "isCompleted": true
    }
  ]
}
```

### `GET /catalog/courses/{id}`

```http
GET /api/v1/catalog/courses/cmtcpit5403njnz01jly2do8c

200 OK
```

```json
{
  "id": "cmtcpit5403njnz01jly2do8c",
  "title": "Catalog paid course journey-20260828084459-e330-56",
  "accessType": "PAID",
  "hasChildren": false,
  "contentCounts": { "chapters": 0, "lessons": 0, "sections": 0 }
}
```

### `GET /student/questions/{questionId}/highlights`

```http
GET /api/v1/student/questions/cmtcpnvs304cwnz01zh7qmqb4/highlights
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpnzrz04fenz01jjmvn79q",
      "questionId": "cmtcpnvs304cwnz01zh7qmqb4",
      "selectedText": "Assessment",
      "startOffset": 0,
      "endOffset": 10,
      "color": "yellow",
      "createdAt": "2026-08-28T08:50:01.823Z",
      "updatedAt": "2026-08-28T08:50:01.823Z"
    }
  ]
}
```

### `POST /student/questions/{questionId}/highlights`

```http
POST /api/v1/student/questions/cmtcpnvs304cwnz01zh7qmqb4/highlights
Authorization: Bearer $STUDENT_TOKEN
Content-Type: application/json

{ "selectedText": "Assessment", "startOffset": 0, "endOffset": 10, "color": "yellow" }

201 Created
```

```json
{
  "id": "cmtcpnzrz04fenz01jjmvn79q",
  "questionId": "cmtcpnvs304cwnz01zh7qmqb4",
  "selectedText": "Assessment",
  "startOffset": 0,
  "endOffset": 10,
  "color": "yellow",
  "createdAt": "2026-08-28T08:50:01.823Z",
  "updatedAt": "2026-08-28T08:50:01.823Z"
}
```

### `DELETE /student/questions/{questionId}/highlights/{highlightId}`

```http
DELETE /api/v1/student/questions/cmtcpnvs304cwnz01zh7qmqb4/highlights/cmtcpnzrz04fenz01jjmvn79q
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{ "id": "cmtcpnzrz04fenz01jjmvn79q", "deleted": true }
```

### `GET /student/notebook/pages`

```http
GET /api/v1/student/notebook/pages
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpo0ki04fgnz01degmruto",
      "studentUserId": "cmtcpnzd604f7nz01ogw42tla",
      "title": "Assessment revision",
      "content": "<p>Updated private notes</p>",
      "createdAt": "2026-08-28T08:50:02.850Z",
      "updatedAt": "2026-08-28T08:50:03.214Z"
    }
  ]
}
```

### `POST /student/notebook/pages`

```http
POST /api/v1/student/notebook/pages
Authorization: Bearer $STUDENT_TOKEN
Content-Type: application/json

{ "title": "Assessment revision", "content": "<p>Private notes</p>" }

201 Created
```

```json
{
  "id": "cmtcpo0ki04fgnz01degmruto",
  "studentUserId": "cmtcpnzd604f7nz01ogw42tla",
  "title": "Assessment revision",
  "content": "<p>Private notes</p>",
  "createdAt": "2026-08-28T08:50:02.850Z",
  "updatedAt": "2026-08-28T08:50:02.850Z"
}
```

### `GET /student/notebook/pages/{pageId}`

The acceptance run captured this access-control request from a different
student, so the real response is `404` rather than a successful page read.

```http
GET /api/v1/student/notebook/pages/cmtcpo0ki04fgnz01degmruto
Authorization: Bearer $SECOND_STUDENT_TOKEN

404 Not Found
```

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND.NOTEBOOK_PAGE_NOT_FOUND",
  "message": {
    "en": "Notebook page not found",
    "ar": "تعذر تنفيذ الطلب: غير موجود"
  },
  "error": { "ar": "غير موجود", "en": "Not Found" }
}
```

### `PATCH /student/notebook/pages/{pageId}`

```http
PATCH /api/v1/student/notebook/pages/cmtcpo0ki04fgnz01degmruto
Authorization: Bearer $STUDENT_TOKEN
Content-Type: application/json

{ "content": "<p>Updated private notes</p>" }

200 OK
```

```json
{
  "id": "cmtcpo0ki04fgnz01degmruto",
  "studentUserId": "cmtcpnzd604f7nz01ogw42tla",
  "title": "Assessment revision",
  "content": "<p>Updated private notes</p>",
  "createdAt": "2026-08-28T08:50:02.850Z",
  "updatedAt": "2026-08-28T08:50:03.214Z"
}
```

### `DELETE /student/notebook/pages/{pageId}`

```http
DELETE /api/v1/student/notebook/pages/cmtcpo0ki04fgnz01degmruto
Authorization: Bearer $STUDENT_TOKEN

200 OK
```

```json
{ "id": "cmtcpo0ki04fgnz01degmruto", "deleted": true }
```

### `GET /subjects/{subjectId}/constants`

```http
GET /api/v1/subjects/cmtcpntnh04bunz015hr9sk4e/constants

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpo19f04finz01tl7s2lb1",
      "subjectId": "cmtcpntnh04bunz015hr9sk4e",
      "key": "gravity",
      "value": "9.81",
      "createdAt": "2026-08-28T08:50:03.747Z",
      "updatedAt": "2026-08-28T08:50:04.379Z"
    }
  ]
}
```

### `GET /admin/subjects/{subjectId}/constants`

```http
GET /api/v1/admin/subjects/cmtcpntnh04bunz015hr9sk4e/constants
Authorization: Bearer $ADMIN_TOKEN

200 OK
```

```json
{
  "data": [
    {
      "id": "cmtcpo19f04finz01tl7s2lb1",
      "subjectId": "cmtcpntnh04bunz015hr9sk4e",
      "key": "gravity",
      "value": "9.8",
      "createdAt": "2026-08-28T08:50:03.747Z",
      "updatedAt": "2026-08-28T08:50:03.747Z"
    }
  ]
}
```

### `POST /admin/subjects/{subjectId}/constants`

```http
POST /api/v1/admin/subjects/cmtcpntnh04bunz015hr9sk4e/constants
Authorization: Bearer $ADMIN_TOKEN
Content-Type: application/json

{ "key": "gravity", "value": "9.8" }

201 Created
```

```json
{
  "id": "cmtcpo19f04finz01tl7s2lb1",
  "subjectId": "cmtcpntnh04bunz015hr9sk4e",
  "key": "gravity",
  "value": "9.8",
  "createdAt": "2026-08-28T08:50:03.747Z",
  "updatedAt": "2026-08-28T08:50:03.747Z"
}
```

### `GET /admin/subjects/{subjectId}/constants/{id}`

```http
GET /api/v1/admin/subjects/cmtcpntnh04bunz015hr9sk4e/constants/cmtcpo19f04finz01tl7s2lb1
Authorization: Bearer $ADMIN_TOKEN

200 OK
```

```json
{
  "id": "cmtcpo19f04finz01tl7s2lb1",
  "subjectId": "cmtcpntnh04bunz015hr9sk4e",
  "key": "gravity",
  "value": "9.8",
  "createdAt": "2026-08-28T08:50:03.747Z",
  "updatedAt": "2026-08-28T08:50:03.747Z"
}
```

### `PATCH /admin/subjects/{subjectId}/constants/{id}`

```http
PATCH /api/v1/admin/subjects/cmtcpntnh04bunz015hr9sk4e/constants/cmtcpo19f04finz01tl7s2lb1
Authorization: Bearer $ADMIN_TOKEN
Content-Type: application/json

{ "value": "9.81" }

200 OK
```

```json
{
  "id": "cmtcpo19f04finz01tl7s2lb1",
  "subjectId": "cmtcpntnh04bunz015hr9sk4e",
  "key": "gravity",
  "value": "9.81",
  "createdAt": "2026-08-28T08:50:03.747Z",
  "updatedAt": "2026-08-28T08:50:04.379Z"
}
```

### `DELETE /admin/subjects/{subjectId}/constants/{id}`

```http
DELETE /api/v1/admin/subjects/cmtcpntnh04bunz015hr9sk4e/constants/cmtcpo19f04finz01tl7s2lb1
Authorization: Bearer $ADMIN_TOKEN

200 OK
```

```json
{ "id": "cmtcpo19f04finz01tl7s2lb1", "deleted": true }
```
