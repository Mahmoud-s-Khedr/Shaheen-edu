# Shaheen Edu API reference

Implementation-backed API contract. Every endpoint below is self-contained: its authorization, parameter/body fields, and success response fields appear in the same section. Base URL is `/api/v1`; `/health` and `/health/ready` are unversioned. Unknown JSON fields are rejected. Errors use `{ statusCode, code, message: { ar, en }, error: { ar, en }, details?, correlationId }`; `details` contains field-level bilingual validation feedback.

## Health

## Student learning

### `GET /api/v1/parent/selected-child/performance`

### `GET /api/v1/parent/selected-child/performance/analysis`

### `GET /api/v1/parent/selected-child/performance/trends`

### `GET /api/v1/parent/selected-child/performance/insights`

### `GET /api/v1/parent/selected-child/analytics/scopes`

### `GET /api/v1/parent/selected-child/analytics/content`

### `GET /api/v1/parent/selected-child/analytics/assessments`

### `GET /api/v1/parent/selected-child/analytics/practice`

### `POST /api/v1/student/content-items/{id}/complete`

### `GET /api/v1/student/library/{targetType}/{targetId}/progress`

### `GET /api/v1/student/performance`

### `GET /api/v1/student/performance/overview`

### `GET /api/v1/student/performance/analysis`

### `GET /api/v1/student/performance/trends`

### `GET /api/v1/student/performance/insights`

### `GET /api/v1/student/performance/peers`

### `GET /api/v1/student/performance/answer-changes`

### Unified performance endpoints

`GET /api/v1/student/performance/overview` returns combined assessment and direct-practice totals, accuracy, omissions, question-bank coverage, and separate source breakdowns. Optional `from` and `to` filters use UTC calendar days.

`GET /api/v1/student/performance/analysis` returns paginated combined rollups for `subject`, `course`, `chapter`, `lesson`, or `section`. The section level is the API's curriculum-topic level. It accepts optional date and hierarchy filters plus `q`.

`GET /api/v1/student/performance/trends` returns combined daily totals, source breakdowns, and a 28-day `IMPROVING`, `STABLE`, `DECLINING`, or `INSUFFICIENT_DATA` classification. Each comparison window requires ten answered attempts.

`GET /api/v1/student/performance/insights` returns strongest and weakest qualifying scopes, omission-heavy scopes, repeated-error questions, trend evidence, and recommendation labels. It accepts the same date and hierarchy filters as trends.

`GET /api/v1/student/performance/peers` requires `subjectId` and `courseId`; optional `chapterId`, `lessonId`, `sectionId`, `from`, and `to` narrow the cohort. It returns only aggregate grade-cohort data. A response is `INSUFFICIENT_DATA` unless the student and at least the configured minimum number of peers each have ten answered attempts in the selected scope. Available responses include percentile, average, median, ten-point histogram buckets, and points versus average/median.

Authorized parent equivalents are `GET /api/v1/parent/selected-child/performance` and its `/analysis`, `/trends`, and `/insights` subroutes. Peer comparison is intentionally not exposed to parents.

### `GET /api/v1/student/leaderboard/current`

### `GET /api/v1/student/leaderboard/history/{weekKey}`

### `GET /api/v1/student/practice/questions`

### `GET /api/v1/student/practice/questions/{questionId}/assets/{assetId}/access`

### `GET /api/v1/student/practice/questions/{questionId}/attempts`

### `POST /api/v1/student/practice/questions/{questionId}/attempts`

### `GET /api/v1/student/progress`

### `GET /health`

**Authorization:** Public

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "status": "ok",
  "timestamp": "ISO-8601 date-time"
}
```

### `GET /health/ready`

**Authorization:** Public

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "status": "ready",
  "dependencies": {
    "database": "up",
    "redis": "up"
  },
  "timestamp": "ISO-8601 date-time"
}
```

## Manual commerce

### `GET /api/v1/admin/manual-payment-methods`

### `POST /api/v1/admin/manual-payment-methods`

### `PATCH /api/v1/admin/manual-payment-methods/{id}`

### `POST /api/v1/admin/manual-payment-methods/reorder`

### `GET /api/v1/admin/payment-submissions`

### `GET /api/v1/admin/payment-submissions/{id}`

### `POST /api/v1/admin/payment-submissions/{id}/approve`

### `POST /api/v1/admin/payment-submissions/{id}/reject`

### `GET /api/v1/student/manual-payment-methods`

### `GET /api/v1/student/cart`

### `POST /api/v1/student/cart/items`

### `DELETE /api/v1/student/cart/items/{id}`

### `POST /api/v1/student/checkout`

### `GET /api/v1/student/orders`

### `GET /api/v1/student/orders/{id}`

### `POST /api/v1/student/orders/{id}/cancel`

### `POST /api/v1/student/orders/{id}/payment-proof`

### `POST /api/v1/student/orders/{orderId}/payment-submissions/{submissionId}/resubmit`

## Assessments

### `POST /api/v1/student/assessments`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

```json
{
  "scopes": [
    {
      "courseId?": "string",
      "chapterId?": "string",
      "lessonId?": "string",
      "sectionId?": "string"
    }
  ],
  "questionCount": "number (1-50)",
  "mode?": "TUTOR | EXAM (default EXAM)",
  "isTimed?": "boolean (default false)",
  "durationSeconds?": "number (required when isTimed is true)",
  "title?": "string"
}
```

**Success response — HTTP 201 (AssessmentDetailDto)**

```json
{
  "id": "string",
  "title": "string",
  "visibility": "MINE | PUBLIC",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "createdAt": "ISO-8601 date-time",
  "attemptStatus?": "string | null",
  "score?": "number | null",
  "scopes": [
    {
      "courseId?": "string",
      "chapterId?": "string",
      "lessonId?": "string",
      "sectionId?": "string"
    }
  ]
}
```

### `GET /api/v1/student/assessments/question-banks`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `subjectId` (optional; limits results to the selected subject)

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "subject": { "id": "string", "title": "string" },
      "availableQuestionCount": "number"
    }
  ]
}
```

### `GET /api/v1/student/assessments/question-sources`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `questionBankId` (required)

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "title": { "ar": "string", "en": "string" },
      "type": "PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL",
      "availableQuestionCount": "number"
    }
  ]
}
```

### `POST /api/v1/student/assessments/question-marks/{questionId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `questionId` (required)

**Success response — HTTP 201**

```json
{
  "questionId": "string",
  "marked": true
}
```

### `GET /api/v1/student/assessments/question-marks`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "questionId": "string",
      "markedAt": "ISO-8601 date-time",
      "bank": {
        "id": "string",
        "title": "string",
        "subject": { "id": "string", "title": "string" }
      },
      "source": {
        "id": "string",
        "type": "string",
        "title": { "ar": "string", "en": "string" }
      },
      "difficultyBand": "A_PLUS | A | B | C | D"
    }
  ]
}
```

### `DELETE /api/v1/student/assessments/question-marks/{questionId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `questionId` (required)

**Success response — HTTP 200**

```json
{
  "questionId": "string",
  "marked": false
}
```

### `PUT /api/v1/student/assessments/question-notes/{questionId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `questionId` (required)
- body `body` (required string; the student's private note for this question)

Creates or updates the student's private note for an accessible question. Validation and access failures return HTTP 400, 401, 403, or 404.

### `DELETE /api/v1/student/assessments/question-notes/{questionId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `questionId` (required)

Deletes the current student's private note for an accessible question. Access failures return HTTP 401, 403, or 404.

### `GET /api/v1/student/assessments`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; ALL | SUSPENDED | COMPLETED — filters by the student's own attempt status)
- query `search` (optional)

**Success response — HTTP 200 (PaginatedAssessmentsResponseDto)**

```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "visibility": "MINE | PUBLIC",
      "generationType": "string",
      "mode": "string",
      "isTimed": "boolean",
      "durationSeconds?": "number | null",
      "questionCount": "number",
      "createdAt": "ISO-8601 date-time",
      "attemptStatus?": "string | null",
      "score?": "number | null"
    }
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/student/assessments/analytics/summary`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `subjectId` (optional)
- query `chapterId` (optional; enables attempt drill-down)
- query `q` (optional case-insensitive, Arabic-normalized hierarchy/assessment-title search)
- query `page` (optional, one-based; default `1`)
- query `limit` (optional, 1–100; default `20`)

**Success response — HTTP 200 (AssessmentAnalyticsResponseDto)**

```json
{
  "level": "subject | chapter | topic",
  "data": ["paginated hierarchy rollups"],
  "attempts": ["paginated completed attempts when chapterId is supplied"],
  "meta": {
    "groups": {
      "page": "number",
      "limit": "number",
      "total": "number",
      "totalPages": "number"
    },
    "attempts?": {
      "page": "number",
      "limit": "number",
      "total": "number",
      "totalPages": "number"
    }
  }
}
```

### `GET /api/v1/student/assessments/{id}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AssessmentDetailDto)**

```json
{
  "id": "string",
  "title": "string",
  "visibility": "MINE | PUBLIC",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "createdAt": "ISO-8601 date-time",
  "attemptStatus?": "string | null",
  "score?": "number | null",
  "scopes": [
    {
      "courseId?": "string",
      "chapterId?": "string",
      "lessonId?": "string",
      "sectionId?": "string"
    }
  ]
}
```

### `PATCH /api/v1/student/assessments/{id}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

```json
{
  "title": "string"
}
```

**Success response — HTTP 200 (AssessmentDetailDto)**

```json
{
  "id": "string",
  "title": "string",
  "visibility": "MINE | PUBLIC",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "createdAt": "ISO-8601 date-time",
  "attemptStatus?": "string | null",
  "score?": "number | null",
  "scopes": [
    {
      "courseId?": "string",
      "chapterId?": "string",
      "lessonId?": "string",
      "sectionId?": "string"
    }
  ]
}
```

### `DELETE /api/v1/student/assessments/{id}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

**Success response — HTTP 200 (IdDeletedResponseDto)**

```json
{
  "id": "string",
  "deleted": "boolean"
}
```

### `POST /api/v1/student/assessments/{id}/attempts/start`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

No path, query, or header input beyond `id`.

**Success response — HTTP 201 (AssessmentAttemptStateDto)**

```json
{
  "attemptId": "string",
  "status": "string",
  "startedAt": "ISO-8601 date-time",
  "expiresAt?": "ISO-8601 date-time | null",
  "submittedAt?": "ISO-8601 date-time | null",
  "score?": "number | null",
  "totalQuestions": "number",
  "mode": "string",
  "questions": [
    {
      "id": "string",
      "sortOrder": "number",
      "type": "string",
      "body": "string",
      "options": [
        {
          "id": "string",
          "body": "string",
          "sortOrder": "number"
        }
      ],
      "selectedOptionIds": ["string"],
      "answered": "boolean",
      "isCorrect?": "boolean | null",
      "correctOptionIds?": "string[] | null",
      "explanation?": "string | null"
    }
  ]
}
```

### `GET /api/v1/student/assessments/{id}/attempts/current`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AssessmentAttemptStateDto)**

```json
{
  "attemptId": "string",
  "status": "string",
  "startedAt": "ISO-8601 date-time",
  "expiresAt?": "ISO-8601 date-time | null",
  "submittedAt?": "ISO-8601 date-time | null",
  "score?": "number | null",
  "totalQuestions": "number",
  "mode": "string",
  "questions": [
    {
      "id": "string",
      "sortOrder": "number",
      "type": "string",
      "body": "string",
      "options": [
        {
          "id": "string",
          "body": "string",
          "sortOrder": "number"
        }
      ],
      "selectedOptionIds": ["string"],
      "answered": "boolean",
      "isCorrect?": "boolean | null",
      "correctOptionIds?": "string[] | null",
      "explanation?": "string | null"
    }
  ]
}
```

### `POST /api/v1/student/assessments/{id}/attempts/current/answers/{questionId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)
- path `questionId` (required)

```json
{
  "selectedOptionIds": ["string"]
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/student/assessments/{id}/attempts/current/submit`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

**Success response — HTTP 201**

No response body.

### `PATCH /api/v1/student/assessments/{id}/attempts/current/questions/{questionId}/active-time`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)
- path `questionId` (required)

```json
{
  "activeSeconds": "integer (0-86400)"
}
```

**Success response — HTTP 200**

```json
{
  "assessmentQuestionId": "string",
  "activeSeconds": "number"
}
```

### `GET /api/v1/student/assessments/{id}/attempts/current/result`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AssessmentResultDto)**

```json
{
  "attemptId": "string",
  "score": "number",
  "totalQuestions": "number",
  "submittedAt?": "ISO-8601 date-time | null",
  "questions": "[[object Object]]"
}
```

### `GET /api/v1/admin/assessments/grading/pending`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Lists submitted long-answer responses that require manual grading (HTTP 200).

### `POST /api/v1/admin/assessments/grading/answers/{answerId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Awards points to one submitted long-answer response using `GradeLongAnswerDto` (HTTP 201).

### `POST /api/v1/admin/assessments/standard`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "scopes": [
    {
      "courseId?": "string",
      "chapterId?": "string",
      "lessonId?": "string",
      "sectionId?": "string"
    }
  ],
  "questionCount": "number (1-50)",
  "mode?": "TUTOR | EXAM (default EXAM)",
  "isTimed?": "boolean (default false)",
  "durationSeconds?": "number (required when isTimed is true)",
  "title?": "string"
}
```

**Success response — HTTP 201 (AdminAssessmentListItemDto)**

```json
{
  "id": "string",
  "title": "string",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "status": "string",
  "createdAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/assessments/custom`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "questionIds": ["string"],
  "scopes": [
    {
      "courseId?": "string",
      "chapterId?": "string",
      "lessonId?": "string",
      "sectionId?": "string"
    }
  ],
  "mode?": "TUTOR | EXAM (default EXAM)",
  "isTimed?": "boolean (default false)",
  "durationSeconds?": "number (required when isTimed is true)",
  "title?": "string"
}
```

**Success response — HTTP 201 (AdminAssessmentListItemDto)**

```json
{
  "id": "string",
  "title": "string",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "status": "string",
  "createdAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `GET /api/v1/admin/assessments`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | READY | ARCHIVED)
- query `search` (optional)

**Success response — HTTP 200 (PaginatedAdminAssessmentsResponseDto)**

```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "generationType": "string",
      "mode": "string",
      "isTimed": "boolean",
      "durationSeconds?": "number | null",
      "questionCount": "number",
      "status": "string",
      "createdAt": "ISO-8601 date-time",
      "publishedAt?": "ISO-8601 date-time | null",
      "archivedAt?": "ISO-8601 date-time | null"
    }
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/assessments/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AdminAssessmentListItemDto)**

```json
{
  "id": "string",
  "title": "string",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "status": "string",
  "createdAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `PATCH /api/v1/admin/assessments/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "mode?": "TUTOR | EXAM",
  "isTimed?": "boolean",
  "durationSeconds?": "number"
}
```

**Success response — HTTP 200 (AdminAssessmentListItemDto)**

```json
{
  "id": "string",
  "title": "string",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "status": "string",
  "createdAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/assessments/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AdminAssessmentListItemDto)**

```json
{
  "id": "string",
  "title": "string",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "status": "string",
  "createdAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/assessments/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AdminAssessmentListItemDto)**

```json
{
  "id": "string",
  "title": "string",
  "generationType": "string",
  "mode": "string",
  "isTimed": "boolean",
  "durationSeconds?": "number | null",
  "questionCount": "number",
  "status": "string",
  "createdAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `DELETE /api/v1/admin/assessments/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (IdDeletedResponseDto)**

```json
{
  "id": "string",
  "deleted": "boolean"
}
```

## Authentication

### `POST /api/v1/auth/students/register`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "fullName": "string",
  "nationalId": "string",
  "phone": "string",
  "parentPhone": "string",
  "governorate": "string",
  "academicGradeId": "string",
  "center?": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/students/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "phone": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/admins/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/partners/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/parents/login`

**Authorization:** Public

**Request**

No path, query, or header input.

```json
{
  "nationalId": "string",
  "parentPhone": "string"
}
```

**Success response — HTTP 201 (ParentAccessTokenResponseDto)**

```json
{
  "accessToken": "string"
}
```

### `GET /api/v1/auth/parents/children`

**Authorization:** Parent bearer token

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedParentChildResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `POST /api/v1/auth/parents/select-child`

**Authorization:** Parent bearer token

**Request**

No path, query, or header input.

```json
{
  "studentUserId": "string"
}
```

**Success response — HTTP 201 (ParentAccessTokenResponseDto)**

```json
{
  "accessToken": "string"
}
```

### `GET /api/v1/auth/parents/selected-child`

**Authorization:** Parent selected-child bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 200 (ParentChildDto)**

```json
{
  "userId": "string",
  "fullName": "string",
  "governorate": "string",
  "center": "string | null"
}
```

### `POST /api/v1/auth/refresh`

**Authorization:** Public

**Request**

No path, query, or header input.

**Success response — HTTP 201 (AuthTokenResponseDto)**

```json
{
  "accessToken": "string",
  "user": {
    "id": "string",
    "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
    "loginIdentifier": "string"
  }
}
```

### `POST /api/v1/auth/logout`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 201 (SuccessResponseDto)**

```json
{
  "success": "boolean"
}
```

### `POST /api/v1/auth/logout-all`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 201 (SuccessResponseDto)**

```json
{
  "success": "boolean"
}
```

### `GET /api/v1/auth/me`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

**Success response — HTTP 200 (CurrentUserDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/auth/change-password`

**Authorization:** Bearer token

**Request**

No path, query, or header input.

```json
{
  "oldPassword": "string",
  "newPassword": "string"
}
```

**Success response — HTTP 201 (SuccessResponseDto)**

```json
{
  "success": "boolean"
}
```

## Identity

### `POST /api/v1/admin/admins`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string"
}
```

**Success response — HTTP 201 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/admins`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedAdminResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/admins/{id}`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `PATCH /api/v1/admin/admins/{id}`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "email": "string"
}
```

**Success response — HTTP 200 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/admins/{id}/suspend`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/admins/{id}/reactivate`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AdminSummaryDto)**

```json
{
  "id": "string",
  "role": "SUPER_ADMIN | ADMIN | PARTNER | STUDENT",
  "loginIdentifier": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/partners`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "email": "string",
  "password": "string",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string",
  "legalName?": "string",
  "phone?": "string"
}
```

**Success response — HTTP 201 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `GET /api/v1/admin/partners`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedPartnerResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/partners/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `PATCH /api/v1/admin/partners/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "displayName?": "string",
  "legalName?": "string",
  "phone?": "string"
}
```

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `POST /api/v1/admin/partners/{id}/suspend`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `POST /api/v1/admin/partners/{id}/reactivate`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `GET /api/v1/partners/me`

**Authorization:** Bearer token; role must be `PARTNER`

**Request**

No path, query, or header input.

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `PATCH /api/v1/partners/me`

**Authorization:** Bearer token; role must be `PARTNER`

**Request**

No path, query, or header input.

```json
{
  "displayName?": "string",
  "legalName?": "string | null",
  "phone?": "string | null"
}
```

**Success response — HTTP 200 (PartnerSummaryDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "partnerType": "CONTENT_PUBLISHER | REFERRAL_PARTNER",
  "displayName": "string | null",
  "legalName": "string | null",
  "phone": "string | null"
}
```

### `GET /api/v1/students/me`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200 (StudentProfileDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "studentProfile": {
    "fullName?": "string",
    "governorate?": "string",
    "center?": "string",
    "nationalIdLast4?": "string",
    "academicGradeId?": "string",
    "parentPhone?": "string"
  }
}
```

### `PATCH /api/v1/students/me`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

```json
{
  "fullName?": "string",
  "parentPhone?": "string",
  "governorateId?": "string",
  "centerId?": "string | null",
  "academicGradeId?": "string"
}
```

**Success response — HTTP 200 (StudentProfileDto)**

```json
{
  "id": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "loginIdentifier": "string",
  "createdAt": "ISO-8601 date-time",
  "studentProfile": {
    "fullName?": "string",
    "governorate?": "string",
    "center?": "string",
    "nationalIdLast4?": "string",
    "academicGradeId?": "string",
    "parentPhone?": "string"
  }
}
```

## Academic hierarchy

### `POST /api/v1/admin/academic-grades`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/academic-grades`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedAcademicGradeResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/academic-grades/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `PATCH /api/v1/admin/academic-grades/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `DELETE /api/v1/admin/academic-grades/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `POST /api/v1/admin/academic-grades/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/academic-grades/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/academic-grades/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/academic-grades/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AcademicGradeSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/academic-grades`

**Authorization:** Public

**Request**

- query `page` (optional)
- query `limit` (optional)

**Success response — HTTP 200 (PaginatedAcademicGradeResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `POST /api/v1/admin/subjects`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "academicGradeId": "string"
}
```

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `GET /api/v1/admin/subjects`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `academicGradeId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedSubjectResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/subjects/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `PATCH /api/v1/admin/subjects/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `DELETE /api/v1/admin/subjects/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `POST /api/v1/admin/subjects/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "academicGradeId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/subjects/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newAcademicGradeId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/subjects/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/subjects/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/subjects/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SubjectSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "academicGradeId": "string"
}
```

### `POST /api/v1/admin/courses`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "subjectId": "string",
  "accessType": "PUBLIC | FREE | PAID"
}
```

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `GET /api/v1/admin/courses`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `subjectId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedCourseResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/courses/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `PATCH /api/v1/admin/courses/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `DELETE /api/v1/admin/courses/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/courses/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "subjectId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/courses/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newSubjectId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/courses/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (CourseSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "subjectId": "string"
}
```

### `POST /api/v1/admin/chapters`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "courseId": "string"
}
```

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `GET /api/v1/admin/chapters`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `courseId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedChapterResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/chapters/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `PATCH /api/v1/admin/chapters/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `DELETE /api/v1/admin/chapters/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/chapters/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (ChapterSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "courseId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/chapters/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newCourseId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/chapters/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ChapterSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "courseId": "string"
}
```

### `POST /api/v1/admin/lessons`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "chapterId": "string"
}
```

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `GET /api/v1/admin/lessons`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `chapterId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedLessonResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/lessons/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `PATCH /api/v1/admin/lessons/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `DELETE /api/v1/admin/lessons/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/lessons/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (LessonSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "chapterId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/lessons/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newChapterId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/lessons/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (LessonSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "chapterId": "string"
}
```

### `POST /api/v1/admin/sections`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "slug?": "string",
  "description?": "string",
  "lessonId": "string"
}
```

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `GET /api/v1/admin/sections`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `lessonId` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200 (PaginatedSectionResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/sections/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `PATCH /api/v1/admin/sections/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "slug?": "string",
  "description?": "string"
}
```

**Success response — HTTP 200 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `DELETE /api/v1/admin/sections/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/sections/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (SectionSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "lessonId": "string",
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201**

No response body.

### `POST /api/v1/admin/sections/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "newLessonId": "string",
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

### `POST /api/v1/admin/sections/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (SectionSummaryDto)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time",
  "lessonId": "string"
}
```

## Content, assets, video, and entitlements

### `POST /api/v1/admin/content-items`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string",
  "textBody?": "string",
  "externalUrl?": "string",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number",
  "placement": {
    "courseId?": "string",
    "chapterId?": "string",
    "lessonId?": "string",
    "sectionId?": "string"
  }
}
```

**Success response — HTTP 201 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/content-items`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)
- query `type` (optional; TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE)
- query `accessType` (optional; PUBLIC | FREE | PAID | INHERIT)
- query `courseId` (optional)
- query `chapterId` (optional)
- query `lessonId` (optional)
- query `sectionId` (optional)

**Success response — HTTP 200 (PaginatedContentItemResponseDto)**

```json
{
  "data": "[[object Object]]",
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/content-items/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (ContentItemDetailDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "attachments": [
    {
      "id": "string",
      "kind": "COVER_IMAGE | IMAGE | PAYMENT_PROOF | PDF | DOCUMENT | DOWNLOADABLE_FILE | VIDEO",
      "filename": "string",
      "mimeType": "string",
      "sizeBytes?": "number | null",
      "sortOrder": "number"
    }
  ],
  "videoOutline": [
    {
      "id": "string",
      "title": "string",
      "startSeconds": "number | null",
      "endSeconds": "number | null",
      "sortOrder": "number",
      "concepts": [{ "id": "string", "title": "string", "sortOrder": "number" }]
    }
  ],
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `PUT /api/v1/admin/content-items/{id}/video-outline`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Replaces the complete optional outline for a `VIDEO` content item. An empty
`topics` array clears the outline. Each topic may have optional non-negative
`startSeconds` and `endSeconds`; when both are supplied, end must be after
start. If Bunny has reported a duration, both timestamps must be within it.

```json
{
  "topics": [
    {
      "title": "Newton's second law",
      "startSeconds": 0,
      "endSeconds": 420,
      "concepts": [{ "title": "force" }, { "title": "mass" }]
    }
  ]
}
```

### `PATCH /api/v1/admin/content-items/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "type?": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title?": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null"
}
```

**Success response — HTTP 200 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `DELETE /api/v1/admin/content-items/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

No response body.

### `PATCH /api/v1/admin/content-items/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "accessType": "PUBLIC | FREE | PAID | INHERIT"
}
```

**Success response — HTTP 200 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "placement": {
    "courseId?": "string",
    "chapterId?": "string",
    "lessonId?": "string",
    "sectionId?": "string"
  },
  "items": "[[object Object]]"
}
```

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/move`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "placement": {
    "courseId?": "string",
    "chapterId?": "string",
    "lessonId?": "string",
    "sectionId?": "string"
  },
  "sortOrder?": "number"
}
```

**Success response — HTTP 201 (ContentItemSummaryDto)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time",
  "archivedAt?": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/content-items/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/primary-asset`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/attachments`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201 (ContentItemSummary)**

```json
{
  "id": "string",
  "type": "TEXT | EXTERNAL_LINK | VIDEO | PDF | IMAGE | DOCUMENT | DOWNLOADABLE_FILE",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "accessType": "PUBLIC | FREE | PAID | INHERIT",
  "estimatedDuration?": "number | null",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "primaryAssetId?": "string | null",
  "placement": {
    "id": "string",
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/content-items/{id}/attachments/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetIds": ["string"]
}
```

**Success response — HTTP 201**

No response body.

### `DELETE /api/v1/admin/content-items/{id}/attachments/{assetId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `assetId` (required)

**Success response — HTTP 200**

No response body.

### `POST /api/v1/admin/assets/upload`

### `POST /api/v1/admin/assets/{id}/complete`

### `POST /api/v1/student/orders/{id}/payment-proof/complete`

### `POST /api/v1/student/orders/{orderId}/payment-submissions/{submissionId}/resubmit/complete`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `kind` (required; COVER_IMAGE | IMAGE | PDF | DOCUMENT | DOWNLOADABLE_FILE)
- multipart field `file` (required; one file)

**Success response — HTTP 201 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `GET /api/v1/admin/assets`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "provider": "BUNNY_STORAGE | BUNNY_STREAM",
      "kind": "AssetKind",
      "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
      "filename": "string",
      "mimeType?": "string | null",
      "sizeBytes?": "number | null",
      "checksum?": "string | null",
      "createdAt": "ISO-8601 date-time",
      "readyAt?": "ISO-8601 date-time | null",
      "failedAt?": "ISO-8601 date-time | null",
      "archivedAt?": "ISO-8601 date-time | null"
    }
  ]
}
```

### `GET /api/v1/admin/assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `DELETE /api/v1/admin/assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `GET /api/v1/admin/assets/{id}/access`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "url": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/assets/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/assets/covers/{resource}/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `resource` (required; grades | subjects | courses | chapters | lessons | sections)
- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201 (AssetSummary)**

```json
{
  "id": "string",
  "provider": "BUNNY_STORAGE | BUNNY_STREAM",
  "kind": "AssetKind",
  "status": "PENDING_UPLOAD | UPLOADING | READY | FAILED | ARCHIVED",
  "filename": "string",
  "mimeType?": "string | null",
  "sizeBytes?": "number | null",
  "checksum?": "string | null",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null"
}
```

### `DELETE /api/v1/admin/assets/covers/{resource}/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `resource` (required; grades | subjects | courses | chapters | lessons | sections)
- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "coverAssetId": null
}
```

### `POST /api/v1/admin/entitlements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "studentUserId": "string",
  "courseId?": "string",
  "chapterId?": "string",
  "source?": "ADMIN | PROMOTION | MIGRATION | PAYMENT",
  "startsAt?": "ISO-8601 date-time",
  "expiresAt?": "ISO-8601 date-time"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "studentUserId": "string",
  "studentName": "string",
  "courseId": "string | null",
  "chapterId": "string | null",
  "targetName": "string | null",
  "orderItemId": "string | null",
  "orderItemName": "string | null",
  "grantedById": "string | null",
  "grantedByName": "string | null",
  "revokedById": "string | null",
  "revokedByName": "string | null"
}
```

### `GET /api/v1/admin/entitlements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `studentUserId` (required)

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "studentUserId": "string",
      "studentName": "string",
      "courseId": "string | null",
      "chapterId": "string | null",
      "targetName": "string | null",
      "orderItemId": "string | null",
      "orderItemName": "string | null",
      "grantedById": "string | null",
      "grantedByName": "string | null",
      "revokedById": "string | null",
      "revokedByName": "string | null"
    }
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `POST /api/v1/admin/entitlements/{id}/revoke`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "studentUserId": "string",
  "studentName": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "targetName": "string | null",
  "orderItemId": "string | null",
  "orderItemName": "string | null",
  "grantedById": "string | null",
  "grantedByName": "string | null",
  "revokedById": "string | null",
  "revokedByName": "string | null",
  "source": "ADMIN | PROMOTION | MIGRATION | PAYMENT",
  "status": "ACTIVE | REVOKED",
  "startsAt": "ISO-8601 date-time",
  "expiresAt?": "ISO-8601 date-time | null",
  "revokedAt?": "ISO-8601 date-time | null",
  "createdAt": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/entitlements/archived-access/{id}/revoke`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required; retained archived-access snapshot ID)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "revokedAt": "ISO-8601 date-time"
}
```

### `GET /api/v1/student/content-items/{id}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `includeVideoOutline=true` (optional; applies to `VIDEO` items only)

- path `id` (required)

**Success response — HTTP 200 (DeliveryItem)**

```json
{
  "id": "string",
  "type": "ContentItemType",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "estimatedDuration?": "number | null",
  "placement": {
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "primaryAsset?": {
    "id": "string",
    "kind": "AssetKind",
    "filename": "string",
    "mimeType": "string",
    "sizeBytes": "number"
  },
  "attachments": ["AssetSummary plus sortOrder"],
  "progress": {
    "completed": "boolean",
    "completedAt": "ISO-8601 date-time | null"
  },
  "studyState": {
    "lastOpenedAt": "ISO-8601 date-time | null",
    "playbackPositionSeconds": "number | null"
  },
  "videoOutline?": [
    {
      "id": "string",
      "title": "string",
      "startSeconds": "number | null",
      "endSeconds": "number | null",
      "sortOrder": "number",
      "concepts": [{ "id": "string", "title": "string", "sortOrder": "number" }]
    }
  ]
}
```

`videoOutline` is omitted unless `includeVideoOutline=true` is sent. A video
with no authored outline returns an empty array when the flag is present.

### `PUT /api/v1/student/content-items/{id}/study-state`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `id` (required; accessible content item)
- body `playbackPositionSeconds` (optional non-negative integer; `null` clears)

**Success response — HTTP 200**

Returns the content ID and its persisted `{ lastOpenedAt, playbackPositionSeconds }`.
The server owns the timestamp; omitted playback position leaves the existing
saved value unchanged.

### `GET /api/v1/student/learning/continue`

**Authorization:** Bearer token; role must be `STUDENT`

**Success response — HTTP 200**

Returns `{ "data": null }` when no accessible activity exists. Otherwise,
`data` contains safe content metadata and progress, saved study state, subject
through section hierarchy context, subject cover ID, and calculated subject
progress. Expired, revoked, unpublished, and inaccessible activity is skipped.

### `GET /api/v1/catalog/content-items/{id}`

**Authorization:** Public

**Request**

- path `id` (required)

**Success response — HTTP 200 (DeliveryItem)**

```json
{
  "id": "string",
  "type": "ContentItemType",
  "title": "string",
  "description?": "string | null",
  "textBody?": "string | null",
  "externalUrl?": "string | null",
  "estimatedDuration?": "number | null",
  "placement": {
    "courseId?": "string | null",
    "chapterId?": "string | null",
    "lessonId?": "string | null",
    "sectionId?": "string | null",
    "sortOrder": "number"
  },
  "primaryAsset?": {
    "id": "string",
    "kind": "AssetKind",
    "filename": "string",
    "mimeType": "string",
    "sizeBytes": "number"
  },
  "attachments": ["AssetSummary plus sortOrder"]
}
```

### `GET /api/v1/catalog/content-items/{contentItemId}/assets/{assetId}/access`

**Authorization:** Public

**Request**

- path `contentItemId` (required)
- path `assetId` (required)

**Success response — HTTP 200**

```json
{
  "url": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `GET /api/v1/student/content-items/{contentItemId}/assets/{assetId}/access`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `contentItemId` (required)
- path `assetId` (required)

**Success response — HTTP 200**

```json
{
  "url": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `GET /api/v1/catalog/{resource}/{id}/cover/access`

**Authorization:** Public; an archived cover requires an authenticated student with retained archived access.

**Request**

- path `resource` (required; `grades | subjects | courses | chapters | lessons | sections`)
- path `id` (required)

**Success response — HTTP 200**

```json
{
  "url": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `POST /api/v1/admin/video-assets`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "filename?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "clientUploadCompletedAt?": "ISO-8601 date-time | null",
    "attempt": "number"
  }
}
```

### `GET /api/v1/admin/video-assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "clientUploadCompletedAt?": "ISO-8601 date-time | null",
    "attempt": "number"
  }
}
```

### `GET /api/v1/admin/video-assets/{id}/playback`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Returns a short-lived Bunny Stream iframe URL for a ready video, without
requiring the video to be attached to content.

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "embedUrl": "string",
  "expiresAt": "ISO-8601 date-time"
}
```

### `DELETE /api/v1/admin/video-assets/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/video-assets/{id}/upload-authorization`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "endpoint": "string",
  "videoId": "string",
  "libraryId": "string",
  "expires": "unix timestamp",
  "signature": "string"
}
```

### `POST /api/v1/admin/video-assets/{id}/upload-confirmation`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Records the client-reported successful completion of its TUS upload. It does
not verify Bunny received the video. If Bunny has not yet sent a processing
webhook, the asset transitions from `UPLOADING` to
`UPLOADED_AWAITING_PROCESSING`. If Bunny has already advanced the asset, that
newer provider state is preserved. Repeat calls are safe, preserve the original
client-completion timestamp, and return the current asset state.

**Request**

- path `id` (required)
- no request body

**Success response — HTTP 201**

Returns the video asset summary, including
`video.clientUploadCompletedAt`.

### `POST /api/v1/admin/video-assets/{id}/retry`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "clientUploadCompletedAt?": "ISO-8601 date-time | null",
    "attempt": "number"
  }
}
```

### `POST /api/v1/admin/video-assets/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "provider": "BUNNY_STREAM",
  "kind": "VIDEO",
  "status": "AssetStatus",
  "filename": "string",
  "createdAt": "ISO-8601 date-time",
  "readyAt?": "ISO-8601 date-time | null",
  "failedAt?": "ISO-8601 date-time | null",
  "video": {
    "processingStatus": "CREATED | UPLOADING | PROCESSING | READY | FAILED",
    "processingProgress": "number",
    "durationSeconds?": "number | null",
    "thumbnailUrl?": "string | null",
    "clientUploadCompletedAt?": "ISO-8601 date-time | null",
    "attempt": "number"
  }
}
```

**Conflict response — HTTP 409**

Returned when the video asset is still referenced by content or another supported asset relation. Detach or replace every reference before archiving it.

### `POST /api/v1/integrations/bunny-stream/webhook`

**Authorization:** Signed Bunny webhook (not bearer authentication)

**Request**

- headers `x-bunnystream-signature`, `x-bunnystream-signature-version` (= v1), and `x-bunnystream-signature-algorithm` (= hmac-sha256), all required

```json
{
  "VideoGuid": "string",
  "Status": "number",
  "EncodeProgress?": "number",
  "Length?": "number",
  "ThumbnailFileName?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "received": true,
  "duplicate?": true
}
```

## Catalog

### `GET /api/v1/catalog/subjects`

**Authorization:** Public

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `academicGradeId` (optional)

**Success response — HTTP 200 (SubjectSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "academicGradeId": "string"
}
```

### `GET /api/v1/catalog/courses`

**Authorization:** Public

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `subjectId` (optional)

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### `GET /api/v1/catalog/courses/{id}`

**Authorization:** Public

**Request**

- path `id` (required)

**Success response — HTTP 200 (CourseSummary)**

```json
{
  "id": "string",
  "title": "string",
  "slug": "string",
  "description?": "string | null",
  "sortOrder": "number",
  "status": "DRAFT | PUBLISHED | ARCHIVED",
  "accessType?": "PUBLIC | FREE | PAID | INHERIT",
  "createdAt": "ISO-8601 date-time",
  "updatedAt": "ISO-8601 date-time",
  "publishedAt?": "ISO-8601 date-time | null",
  "archivedAt?": "ISO-8601 date-time | null",
  "subjectId": "string"
}
```

### Cursor-paginated catalog children

### `GET /api/v1/catalog/courses/{id}/chapters`

### `GET /api/v1/catalog/chapters/{id}/lessons`

### `GET /api/v1/catalog/lessons/{id}/sections`

### `GET /api/v1/catalog/{resource}/{id}/content-items`

These public routes list direct children or direct content previews for `courses`, `chapters`, `lessons`, or `sections`.

Each takes path `id`, optional opaque query `cursor`, and optional query `limit` (`1..100`, default `20`). The response is:

```json
{
  "parent": {
    "id": "string",
    "title": "string",
    "coverAssetId": "string | null"
  },
  "data": [],
  "pageInfo": { "hasNextPage": "boolean", "nextCursor": "string | null" }
}
```

### `GET /api/v1/student/catalog`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "academicGrade": {
    "id": "string",
    "title": { "ar": "string", "en": "string | null" },
    "slug": "string",
    "description": { "ar": "string | null", "en": "string | null" },
    "sortOrder": "number"
  },
  "summary": { "subjects": "number", "courses": "number", "chapters": "number" }
}
```

### `GET /api/v1/student/catalog/subjects`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "slug": "string",
      "description": "string | null",
      "sortOrder": "number"
    }
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/student/catalog/search`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `subjectId` (required; published subject in the student's current grade)
- query `q` (required; `1..120` trimmed characters)
- query `types` (optional comma-separated `CHAPTER`, `LESSON`, `SECTION`)
- query `cursor`, `limit` (optional cursor pagination; default `20`, maximum `100`)

**Success response — HTTP 200**

Returns `{ data, pageInfo }`. Each item has `type`, safe node metadata,
`breadcrumb` (subject through the matched node), and the standard `access` and
`isLocked` fields. Draft/archived content, other grades, protected bodies, and
asset URLs are never returned.

### `GET /api/v1/student/catalog/subjects/{subjectId}/courses`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `subjectId` (required)
- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "slug": "string",
      "description": "string | null",
      "sortOrder": "number",
      "access": {
        "state": "ENTITLED | FREE | PUBLIC | PURCHASABLE | LOCKED",
        "entitlementId?": "string",
        "expiresAt?": "ISO-8601 date-time | null",
        "price?": { "amountMinor": "number", "currency": "EGP" }
      },
      "isLocked": "boolean"
    }
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/student/catalog/courses/{courseId}`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- path `courseId` (required)

**Success response — HTTP 200**

Returns the grade-scoped course and subject. Chapters are fetched separately.

### Cursor-paginated student catalog children

### `GET /api/v1/student/catalog/courses/{courseId}/chapters`

### `GET /api/v1/student/catalog/chapters/{chapterId}/lessons`

### `GET /api/v1/student/catalog/lessons/{lessonId}/sections`

### `GET /api/v1/student/catalog/{resource}/{id}/content-items`

These are the student equivalents of the public child routes.

They require a student bearer token and use the same `cursor`, `limit`, and response envelope as the public child routes. Each hierarchy node and content preview includes effective `access` and `isLocked`; content responses never include protected bodies or asset URLs.

### `GET /api/v1/student/library`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "entitlementId": "string",
      "targetType": "COURSE | CHAPTER",
      "target": {
        "id": "string",
        "title": "string",
        "slug": "string",
        "description": "string | null",
        "sortOrder": "number"
      },
      "course": {
        "id": "string",
        "title": "string",
        "slug": "string",
        "description": "string | null",
        "sortOrder": "number"
      },
      "subject": {
        "id": "string",
        "title": "string",
        "slug": "string",
        "description": "string | null",
        "sortOrder": "number"
      },
      "academicGrade": {
        "id": "string",
        "title": { "ar": "string", "en": "string | null" },
        "slug": "string",
        "description": { "ar": "string | null", "en": "string | null" },
        "sortOrder": "number"
      },
      "startsAt": "ISO-8601 date-time",
      "expiresAt": "ISO-8601 date-time | null"
    }
  ]
}
```

### `GET /api/v1/student/my-subjects`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

Returns active subjects derived from the student's active course/chapter
entitlements across grades. Each row has `subject`, `subscription` (active
entitlement summaries), and `progress` (`totalContentItems`,
`completedContentItems`, `completionPercent`). It is not a subject-purchase
or entitlement-creation API.

### `GET /api/v1/student/entitlements`

**Authorization:** Bearer token; role must be `STUDENT`

**Request**

- query `page` (optional; one-based, default `1`)
- query `limit` (optional; `1..100`, default `20`)

**Success response — HTTP 200**

```json
{
  "data": [
    {
      "id": "string",
      "courseId": "string | null",
      "chapterId": "string | null",
      "targetType": "COURSE | CHAPTER",
      "targetId": "string",
      "targetName": "string | null",
      "source": "ADMIN | PROMOTION | MIGRATION | PAYMENT",
      "status": "ACTIVE",
      "startsAt": "ISO-8601 date-time",
      "expiresAt": "ISO-8601 date-time | null",
      "createdAt": "ISO-8601 date-time"
    }
  ],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

## Publisher agreements and pricing

### `POST /api/v1/admin/publisher-agreements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "publisherUserId": "string",
  "revenueShareBps": "integer 0..10000",
  "startsAt": "ISO-8601 date-time",
  "endsAt?": "ISO-8601 date-time",
  "isPrimary?": "boolean",
  "courseId?": "string (exactly one target ID)",
  "chapterId?": "string (exactly one target ID)",
  "lessonId?": "string (exactly one target ID)"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `GET /api/v1/admin/publisher-agreements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `history` (required)

**Success response — HTTP 200**

```json
["PublisherAgreement records with publisher"]
```

### `PATCH /api/v1/admin/publisher-agreements/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "publisherUserId?": "string",
  "revenueShareBps?": "integer 0..10000",
  "startsAt?": "ISO-8601 date-time",
  "endsAt?": "ISO-8601 date-time",
  "isPrimary?": "boolean"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `POST /api/v1/admin/publisher-agreements/{id}/activate`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `POST /api/v1/admin/publisher-agreements/{id}/end`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "endsAt?": "ISO-8601 date-time (defaults to now)"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "publisherUserId": "string",
  "courseId?": "string | null",
  "chapterId?": "string | null",
  "lessonId?": "string | null",
  "revenueShareBps": "number",
  "startsAt": "ISO date-time",
  "endsAt?": "ISO date-time | null",
  "isPrimary": "boolean",
  "status": "DRAFT | ACTIVE | ENDED",
  "createdAt": "ISO date-time"
}
```

### `GET /api/v1/admin/publisher-agreements/effective`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `at` (required)

**Success response — HTTP 200**

```json
{
  "agreement": "PublisherAgreement | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?} | null"
}
```

### `POST /api/v1/admin/publisher-agreements/earnings-statements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "periodStartsAt": "ISO-8601 date-time",
  "periodEndsAt": "ISO-8601 date-time",
  "grossRevenueMinor": "integer >= 0",
  "currency": "string (must be EGP)",
  "courseId?": "string (exactly one target ID)",
  "chapterId?": "string (exactly one target ID)",
  "lessonId?": "string (exactly one target ID)"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "agreementId": "string",
  "periodStartsAt": "ISO date-time",
  "periodEndsAt": "ISO date-time",
  "grossRevenueMinor": "number",
  "publisherEarningsMinor": "number",
  "currency": "EGP",
  "revenueShareBps": "number",
  "createdAt": "ISO date-time"
}
```

### `GET /api/v1/admin/publisher-agreements/earnings-statements`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
["PublisherEarningsStatement records with agreement.publisher"]
```

### `POST /api/v1/admin/pricing/course/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "isPurchasable": "boolean",
  "priceMinor?": "integer >= 0; required when isPurchasable is true",
  "currency?": "string EGP; required when isPurchasable is true"
}
```

**Success response — HTTP 201**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

### `POST /api/v1/admin/pricing/chapter/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "isPurchasable": "boolean",
  "priceMinor?": "integer >= 0; required when isPurchasable is true",
  "currency?": "string EGP; required when isPurchasable is true"
}
```

**Success response — HTTP 201**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

### `POST /api/v1/admin/pricing/lesson/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "isPurchasable": "boolean",
  "priceMinor?": "integer >= 0; required when isPurchasable is true",
  "currency?": "string EGP; required when isPurchasable is true"
}
```

**Success response — HTTP 201**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

### `GET /api/v1/admin/pricing/effective`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

**Success response — HTTP 200**

```json
{
  "priceMinor?": "number | null",
  "currency?": "string | null",
  "isPurchasable?": "boolean | null",
  "resolvedFrom": "{courseId? | chapterId? | lessonId?}"
}
```

## Question banks and questions

### `POST /api/v1/admin/question-banks/sources`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "type": "PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL",
  "title": "string",
  "note?": "string",
  "publisherUserId?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `GET /api/v1/admin/question-banks/sources`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)
- query `type` (optional; PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL)

**Success response — HTTP 200**

```json
{
  "data": ["QuestionSource records"],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/question-banks/sources/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `PATCH /api/v1/admin/question-banks/sources/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "type?": "PLATFORM | CONTENT_PUBLISHER | EXTERNAL_BOOK | PREVIOUS_EXAM | MINISTRY_MODEL",
  "title?": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `DELETE /api/v1/admin/question-banks/sources/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/question-banks/sources/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/sources/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/sources/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "type": "QuestionSourceType",
  "title": "string",
  "note?": "string | null",
  "publisherUserId?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "title": "string",
  "description?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `GET /api/v1/admin/question-banks`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | PUBLISHED | ARCHIVED)

**Success response — HTTP 200**

```json
{
  "data": ["QuestionBank records"],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/question-banks/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `PATCH /api/v1/admin/question-banks/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "title?": "string",
  "description?": "string | null"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `DELETE /api/v1/admin/question-banks/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/question-banks/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/question-banks/{id}/restore`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "title": "string",
  "description?": "string | null",
  "status": "ContentStatus",
  "createdAt": "ISO date-time",
  "updatedAt": "ISO date-time"
}
```

### `POST /api/v1/admin/questions`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type?": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "placements": "[[object Object]]",
  "body": "string",
  "explanation?": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `GET /api/v1/admin/questions`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page` (optional)
- query `limit` (optional)
- query `status` (optional; DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED)
- query `bankId` (optional)
- query `sourceId` (optional)
- query `chapterId` (optional)
- query `lessonId` (optional)
- query `sectionId` (optional)
- query `courseId` (optional)
- query `subjectId` (optional)
- query `academicGradeId` (optional)

**Success response — HTTP 200**

```json
{
  "data": ["Question records with placements, options, assets, and videoLink"],
  "meta": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "totalPages": "number"
  }
}
```

### `GET /api/v1/admin/questions/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `PATCH /api/v1/admin/questions/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "bankId?": "string",
  "sourceId?": "string",
  "courseId?": "string",
  "type?": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "placements?": "[[object Object]]",
  "body?": "string",
  "explanation?": "string | null"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `POST /api/v1/admin/questions/{id}/submit`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/publish`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/reject`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "reviewNote": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/archive`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/options`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "body": "string",
  "isCorrect?": "boolean"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `PATCH /api/v1/admin/questions/{id}/options/{optionId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `optionId` (required)

```json
{
  "body?": "string",
  "isCorrect?": "boolean"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}/options/{optionId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `optionId` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/options/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "optionIds": "[string]"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/assets`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetId": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}/assets/{assetId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)
- path `assetId` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/assets/reorder`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "assetIds": "[string]"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{id}/video-link`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "videoAssetId": "string",
  "timestampSeconds": "number"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `DELETE /api/v1/admin/questions/{id}/video-link`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "bankId": "string",
  "sourceId": "string",
  "courseId": "string",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE",
  "body": "string",
  "explanation?": "string | null",
  "status": "DRAFT | IN_REVIEW | PUBLISHED | REJECTED | ARCHIVED",
  "placements": ["QuestionPlacement"],
  "options": ["QuestionOption"],
  "assets": ["QuestionAsset"],
  "videoLink": "QuestionVideoLink | null"
}
```

### `POST /api/v1/admin/questions/{questionId}/ai/re-answer`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Creates one retained AI answer-and-explanation review run. `INFER` asks AI to
propose the answer; `GROUNDED` requires the admin-supplied answer and uses it as
the authoritative answer while generating the explanation.

**Request**

- path `questionId` (required)

```json
{
  "mode": "INFER | GROUNDED",
  "suppliedAnswer?": {
    "selectedOptionIndexes?": [0],
    "acceptedAnswers?": ["string"],
    "gradingRubric?": "string"
  },
  "additionalContext?": "string"
}
```

For `GROUNDED`, provide exactly the answer format that matches the question:
`selectedOptionIndexes` for choice questions, `acceptedAnswers` for written
questions, or `gradingRubric` for long-answer questions. Do not provide
`suppliedAnswer` with `INFER`.

**Success response — HTTP 201**

Returns the retained `QuestionAiExplanationRun`, including its proposed answer,
six-part structured explanation, confidence, warnings, model metadata, and
`PENDING_REVIEW` status.

### `GET /api/v1/admin/questions/{questionId}/ai/re-answer`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `questionId` (required)

**Success response — HTTP 200**

Returns retained `QuestionAiExplanationRun` records for the question, newest
first.

### `GET /api/v1/admin/questions/{questionId}/ai/re-answer/{runId}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `questionId` (required)
- path `runId` (required)

**Success response — HTTP 200**

Returns the requested retained `QuestionAiExplanationRun`.

### `POST /api/v1/admin/questions/{questionId}/ai/re-answer/{runId}/apply`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Applies the reviewed answer, explanation, or both. When the source question is
published, the result is applied to a replacement draft; publishing that draft
archives the original question.

**Request**

- path `questionId` (required)
- path `runId` (required)

```json
{
  "applyAnswer": "boolean",
  "applyExplanation": "boolean",
  "note?": "string"
}
```

**Success response — HTTP 201**

Returns the changed question, or the replacement draft for a published source
question.

### `POST /api/v1/admin/questions/{questionId}/ai/re-answer/{runId}/reject`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

Rejects a pending AI review run while preserving its audit record and output.

**Request**

- path `questionId` (required)
- path `runId` (required)

```json
{
  "note": "string"
}
```

**Success response — HTTP 201**

Returns the rejected `QuestionAiExplanationRun`.

## Student administration

### `POST /api/v1/admin/admins/{id}/reset-password`

**Authorization:** Bearer token; role must be `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 201 (PasswordResetResponseDto)**

```json
{
  "temporaryPassword": "string",
  "passwordResetAt": "ISO-8601 date-time"
}
```

### `GET /api/v1/admin/students`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- query `page`, `limit`, `search`, `status` (`ACTIVE | SUSPENDED | DISABLED`), `governorateId`, `centerId`, and `academicGradeId` (all optional)

**Success response — HTTP 200 (PaginatedAdminStudentResponseDto)**

```json
{
  "data": ["AdminStudentSummaryDto"],
  "meta": "PaginationMetaDto"
}
```

### `GET /api/v1/admin/students/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AdminStudentDetailDto)**

```json
{
  "id": "string",
  "fullName": "string",
  "phone": "string",
  "status": "ACTIVE | SUSPENDED | DISABLED",
  "nationalIdLast4": "string",
  "academicGradeId": "string | null",
  "academicGrade": "{ ar, en } | null",
  "governorate": "{ id, name } | null",
  "center": "{ id, name, governorateId } | null",
  "createdAt": "ISO-8601 date-time",
  "lastLoginAt": "ISO-8601 date-time | null",
  "deletedAt": "ISO-8601 date-time | null"
}
```

### `POST /api/v1/admin/students/{id}/suspend`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AdminStudentSummaryDto)**

Returns the student summary with `status` set to `SUSPENDED`.

### `POST /api/v1/admin/students/{id}/reactivate`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (AdminStudentSummaryDto)**

Returns the reactivated student summary.

### `POST /api/v1/admin/students/{id}/reset-password`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200 (PasswordResetResponseDto)**

```json
{
  "temporaryPassword": "string",
  "passwordResetAt": "ISO-8601 date-time"
}
```

### `DELETE /api/v1/admin/students/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

```json
{
  "deletionReason": "string (1-2000 characters)"
}
```

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

## Geography

### `GET /api/v1/geography/governorates`

**Authorization:** Public

**Request**

Optional query: `q` (Arabic-aware search over governorate and center names),
`page` (default `1`), `limit` (default `100`, max `200` — high enough to return
every governorate in a single page for the registration dropdown).

**Success response — HTTP 200**

Returns the governorates and centers available for student registration, using
the localized `name` shape (`{ "ar": "string", "en": "string | null" }`), wrapped
in the standard offset-pagination envelope.

```json
{
  "data": ["{id, name, centers:[{id, name, governorateId}]}"],
  "meta": { "page": 1, "limit": 100, "total": 27, "totalPages": 1 }
}
```

### `GET /api/v1/admin/geography/governorates`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

Optional query: `q`, `page` (default `1`), `limit` (default `100`, max `200`).

**Success response — HTTP 200**

```json
{
  "data": ["{id, name, centers:[{id, name, governorateId}]}"],
  "meta": { "page": 1, "limit": 100, "total": 27, "totalPages": 1 }
}
```

### `POST /api/v1/admin/geography/governorates`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

No path, query, or header input.

```json
{
  "name": "string"
}
```

**Success response — HTTP 201**

```json
["{id, name, centers:[{id, name, governorateId}]}"]
```

### `POST /api/v1/admin/geography/governorates/{governorateId}/centers`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `governorateId` (required)

```json
{
  "name": "string"
}
```

**Success response — HTTP 201**

```json
{
  "id": "string",
  "name": "string",
  "governorateId": "string"
}
```

### `DELETE /api/v1/admin/geography/centers/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `DELETE /api/v1/admin/geography/governorates/{id}`

**Authorization:** Bearer token; role must be `ADMIN` or `SUPER_ADMIN`

**Request**

- path `id` (required)

**Success response — HTTP 200**

```json
{
  "id": "string",
  "deleted": true
}
```

### `GET /api/v1/partners/dashboard`

**Authorization:** Bearer token; role must be `PARTNER` with type `CONTENT_PUBLISHER`

**Request**

- query `from` / `to` (optional `YYYY-MM-DD` Cairo dates; default current Cairo month)

**Success response — HTTP 200**

Returns Cairo-period KPIs, including separate realized statement values and approved-order estimates, compact daily earnings trends, agreement/content counts, and latest issued statements. All money is EGP minor units; no learner-identifying data is returned.

### `GET /api/v1/partners/analytics/earnings`

**Authorization:** Bearer token; role must be `PARTNER` with type `CONTENT_PUBLISHER`

**Request**

- query `from` / `to` (optional `YYYY-MM-DD` Cairo dates)
- query `granularity` (optional `day | month`)

**Success response — HTTP 200**

Returns date-bucketed estimated approved-order gross/earnings and realized statement gross/earnings. Estimated values are explicitly not settlement records.

### `GET /api/v1/partners/analytics/content`

**Authorization:** Bearer token; role must be `PARTNER` with type `CONTENT_PUBLISHER`

**Request**

- query `status` (optional publisher agreement status)
- query `page` / `limit` (optional offset pagination)

**Success response — HTTP 200**

Returns the authenticated publisher's course, chapter, and lesson agreements with target hierarchy context, revenue-share terms, historical status, and current-activity state.

### `GET /api/v1/partners/earnings-statements`

**Authorization:** Bearer token; role must be `PARTNER` with type `CONTENT_PUBLISHER`

**Request**

- query `from` / `to` (optional `YYYY-MM-DD` Cairo date filter on statement period end)
- query `page` / `limit` (optional offset pagination)

**Success response — HTTP 200**

Returns only the authenticated publisher's issued statements, including period, target, revenue share, gross revenue, and publisher earnings.

## Question contexts

### `POST /api/v1/admin/questions/contexts`

**Authorization:** Bearer token; admin role required.

Creates a reusable question context from `CreateQuestionContextDto`; returns the created context (HTTP 201).

### `GET /api/v1/admin/questions/contexts`

**Authorization:** Bearer token; admin role required.

Lists reusable question contexts (HTTP 200).

### `PATCH /api/v1/admin/questions/contexts/{contextId}`

**Authorization:** Bearer token; admin role required.

Updates the path-selected context using `UpdateQuestionContextDto`; returns the updated context (HTTP 200).

### `DELETE /api/v1/admin/questions/contexts/{contextId}`

**Authorization:** Bearer token; admin role required.

Deletes an unreferenced context; returns the deletion result (HTTP 200).

## Student-protected media

### `GET /api/v1/student/video-assets/{assetId}/playback`

**Authorization:** Bearer token; student role required.

Returns playback details for a video the student may access (HTTP 200).

### `GET /api/v1/student/assessments/{id}/questions/{questionId}/assets/{assetId}/access`

**Authorization:** Bearer token; student role required.

Returns protected access details for an attachment belonging to an accessible assessment question. It can return HTTP 401, 403, 404, or 409 when access or the assessment state prevents delivery.

## AI question imports

All endpoints in this section require an administrator Bearer token.

### `POST /api/v1/admin/ai/question-imports`

Creates and queues an import from `CreateQuestionImportDto`; returns the queued import (HTTP 201).

### `GET /api/v1/admin/ai/question-imports`

Lists imports (HTTP 200). Optional query parameters: `page`, `limit`, `q`, and `status` (`QUEUED`, `EXTRACTING`, `SEGMENTING`, `AWAITING_REVIEW`, `GENERATING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, or `FAILED`).

### `GET /api/v1/admin/ai/question-imports/{id}`

Returns an import's progress and diagnostics (HTTP 200).

### `GET /api/v1/admin/ai/question-imports/{id}/source-text`

Returns the retained normalized source text for review (HTTP 200).

### `PATCH /api/v1/admin/ai/question-imports/{id}/source-text`

Corrects retained source text with `UpdateQuestionImportSourceTextDto` and reruns boundary identification (HTTP 200).

### `GET /api/v1/admin/ai/question-imports/{id}/items`

Lists candidate question items (HTTP 200). Supports the same optional `page`, `limit`, `q`, and `status` filters as the import list.

### `GET /api/v1/admin/ai/question-imports/{id}/media`

Lists the extracted PDF visual regions with their review status and protected previews (HTTP 200).

### `POST /api/v1/admin/ai/question-imports/{id}/media`

Adds and materializes a manual visual region from `CreateQuestionImportMediaDto` (HTTP 201).

### `PATCH /api/v1/admin/ai/question-imports/{id}/media/{mediaKey}`

Reviews, reclassifies, or resizes an extracted visual region with `UpdateQuestionImportMediaDto` (HTTP 200).

### `POST /api/v1/admin/ai/question-imports/{id}/media/{mediaKey}/retry`

Retries a failed visual crop without retranscribing the page (HTTP 201).

### `PATCH /api/v1/admin/ai/question-imports/{id}/items/{itemId}/media`

Approves, rejects, moves, or reorders visual ownership assignments with `UpdateQuestionImportItemMediaAssignmentsDto` (HTTP 200).

### `POST /api/v1/admin/ai/question-imports/{id}/retry`

Retries failed import chunks and returns the restarted import (HTTP 201).

### `POST /api/v1/admin/ai/question-imports/{id}/chunks/{chunkId}/retry`

Retries one failed import chunk and returns the restarted chunk (HTTP 201).

### `POST /api/v1/admin/ai/question-imports/{id}/pages/{pageNumber}/retry`

Retries one failed or review-required PDF transcription page (HTTP 201).

### `POST /api/v1/admin/ai/question-imports/{id}/children/{childId}/retry`

Retries one failed page-range child import (HTTP 201).

### `POST /api/v1/admin/ai/question-imports/{id}/items/{itemId}/retry`

Retries one failed import item and returns the restarted item (HTTP 201).

### `POST /api/v1/admin/ai/question-imports/{id}/items/{itemId}/accept`

Creates a `HUMAN_REVIEWED` draft question from a corrected `AcceptQuestionImportItemDto` review candidate (HTTP 201).

### `POST /api/v1/admin/ai/question-imports/{id}/items/{itemId}/reject`

Records the required rejection reason from `RejectQuestionImportItemDto` and excludes the review candidate (HTTP 201).

### `POST /api/v1/student/assessments/ai-prompt`

Create a private, AI-planned assessment from `prompt`, `scopes`, and normal
assessment settings. The selection is limited to the student's entitled,
published question pool.

### `GET /api/v1/student/assessments/community-most-incorrect`

Legacy assessment-path alias for the student-safe community ranking.

### `POST /api/v1/student/assessments/community-tutor`

Create a private tutor assessment from eligible ranked `questionIds` and
`scopes`.

### `POST /api/v1/student/assessments/question-reports/{questionId}`

Legacy assessment-path alias for reporting an accessible question.

### `GET /api/v1/admin/assessments/question-reports`

Legacy assessment-path alias for question-report moderation.

### `POST /api/v1/admin/assessments/question-reports/{reportId}/review`

Legacy assessment-path alias for transitioning a question report.

### `GET /api/v1/student/questions/community-most-incorrect`

List entitled question cards ranked by community incorrect rate. Supports
`subjectId`, hierarchy scope filters, `page`, and `limit`; answers and
explanations are not returned.

### `POST /api/v1/student/questions/{questionId}/reports`

Create a student report using `WRONG_ANSWER`, `UNCLEAR_WORDING`,
`TYPO_LANGUAGE`, `MISSING_OR_BROKEN_MEDIA`, `DUPLICATE`, or `OTHER`.

### `GET /api/v1/admin/question-reports`

List question reports for moderators, optionally filtered by status.

### `POST /api/v1/admin/question-reports/{reportId}/review`

Assign and transition a question report. Closing reports requires a resolution
note.

### `POST /api/v1/student/voice/transcriptions`

Accept a multipart `file` recording and optional `language` query parameter,
send the bytes to OpenRouter speech-to-text, and return its transcript without
retaining the audio.
