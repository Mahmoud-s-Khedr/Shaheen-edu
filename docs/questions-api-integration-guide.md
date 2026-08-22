# Questions API Integration Guide

This guide documents the question-related APIs in dependency order. It is intended for frontend integration.

All URLs below are relative to:

```text
/api/v1
```

The API uses bearer authentication unless noted otherwise:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

Admin endpoints require `ADMIN` or `SUPER_ADMIN`. Student endpoints require `STUDENT`.

## 1. Integration order and dependencies

Use the following order when building the frontend:

```text
Authentication and existing academic hierarchy
  ↓
Admin assets (only when questions contain files, images, PDFs, or PDFs are imported)
  ↓
Question sources
  ↓
Question banks
  ↓
Reusable question contexts
  ↓
Questions and answer options
  ↓
Question review and publishing
  ↓
Optional AI question import
  ↓
Student practice
  ↓
Assessment creation
  ↓
Assessment attempt and answer submission
  ↓
Assessment results and manual long-answer grading
```

The frontend must already have valid IDs for the academic hierarchy used by questions: `subjectId`, `courseId`, and optionally `chapterId`, `lessonId`, or `sectionId`.

### Important status rules

| Resource | Usable by students when |
|---|---|
| Question source | `PUBLISHED` |
| Question bank | `PUBLISHED` |
| Question | `PUBLISHED` |
| Assessment | `READY` and visible to the student |
| AI import candidate | Accepted by an admin; it then becomes a question in `DRAFT` status |

An accepted AI candidate is not automatically visible to students. It still needs the normal question edit, review, and publish workflow.

## 2. Common response formats

Paginated list endpoints return this shape:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Successful create/update/action endpoints generally return the created or updated resource. Errors are returned as HTTP errors with a message and validation details where applicable.

The exact IDs in examples such as `bank_123` and `question_123` are placeholders. The frontend must store IDs returned by earlier calls.

## 3. Admin asset preparation

This section is only needed when a question contains an image, document, PDF, downloadable file, video, or when the AI importer will read a PDF/TXT asset.

### 3.1 Authorize an upload

```http
POST /admin/assets/upload?kind=IMAGE
Content-Type: multipart/form-data
```

Send one multipart file field. The API validates the filename and MIME type, creates an uploading asset, and returns a temporary direct-upload URL.

Typical response:

```json
{
  "asset": {
    "id": "asset_123",
    "kind": "IMAGE",
    "status": "UPLOADING",
    "filename": "diagram.png",
    "mimeType": "image/png"
  },
  "upload": {
    "url": "https://storage-upload-url",
    "method": "PUT",
    "headers": { "content-type": "image/png" },
    "expiresAt": "2026-08-21T12:00:00.000Z"
  }
}
```

The frontend must then upload the file bytes directly to `upload.url` using the returned method and headers.

Supported question-related kinds include `IMAGE`, `PDF`, `DOCUMENT`, and `DOWNLOADABLE_FILE`. Videos use the video asset APIs rather than this upload endpoint.

### 3.2 Complete an upload

```http
POST /admin/assets/:assetId/complete
```

Call this after the direct upload succeeds.

Response: the asset with its status changed to `READY`.

The returned `asset.id` is used in question content blocks, question attachments, video links, or AI import creation.

### 3.3 Other admin asset endpoints

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/assets` | Query: `page`, `limit`, optional search/pagination fields | Paginated admin asset list. |
| `GET /admin/assets/:assetId` | No body | One asset and its status/metadata. |
| `GET /admin/assets/:assetId/access` | No body | Short-lived preview/access URL for an admin. |
| `POST /admin/assets/:assetId/archive` | No body | Archives the asset. |
| `DELETE /admin/assets/:assetId` | No body | Deletes an unused draft asset. |

## 4. Question source setup

A source identifies where questions came from, for example a ministry exam, external book, or teacher-created content. It is metadata and is also part of the eligibility checks for student question selection.

### 4.1 Create a source

```http
POST /admin/question-banks/sources
```

```json
{
  "type": "MINISTRY_MODEL",
  "title": {
    "ar": "نموذج وزارة 2025",
    "en": "Ministry Model 2025"
  },
  "note": {
    "ar": "اختبار تجريبي",
    "en": "Practice exam"
  }
}
```

`type` can be `PLATFORM`, `CONTENT_PUBLISHER`, `EXTERNAL_BOOK`, `PREVIOUS_EXAM`, or `MINISTRY_MODEL`.

For `CONTENT_PUBLISHER`, `publisherUserId` is required and must identify a content-publisher account.

Response: a source object containing at least `id`, `type`, localized title/note, `status`, `createdAt`, and `updatedAt`.

### 4.2 Manage sources

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/question-banks/sources` | Query: `page`, `limit`, optional `q`, `status`, `type` | Paginated source list. |
| `GET /admin/question-banks/sources/:sourceId` | No body | One source. |
| `PATCH /admin/question-banks/sources/:sourceId` | Any editable subset of `type`, `title`, `note`, `publisherUserId` | Updated source. Editing is for draft sources. |
| `DELETE /admin/question-banks/sources/:sourceId` | No body | `{ "id": "source_123", "deleted": true }` when eligible. |
| `POST /admin/question-banks/sources/:sourceId/publish` | No body | Changes a draft source to `PUBLISHED`. |
| `POST /admin/question-banks/sources/:sourceId/archive` | No body | Changes the source to `ARCHIVED`; published questions may prevent archiving. |
| `POST /admin/question-banks/sources/:sourceId/restore` | No body | Restores an archived source. |

Publish the source before expecting its questions to be eligible for student practice or generated assessments.

## 5. Question bank setup

A question bank groups questions, usually by subject or collection.

### 5.1 Create a question bank

```http
POST /admin/question-banks
```

```json
{
  "subjectId": "subject_123",
  "title": "Biology Question Bank",
  "description": "Questions for the secondary biology course"
}
```

Response: a question-bank object containing `id`, `subjectId`, `title`, `description`, `status`, `createdAt`, and `updatedAt`.

### 5.2 Manage question banks

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/question-banks` | Query: `page`, `limit`, optional `q`, `status` | Paginated bank list. |
| `GET /admin/question-banks/:bankId` | No body | One question bank. |
| `PATCH /admin/question-banks/:bankId` | Any editable subset of `subjectId`, `title`, `description` | Updated bank. Subject changes are restricted after questions are attached. |
| `DELETE /admin/question-banks/:bankId` | No body | Deletes an eligible bank. |
| `POST /admin/question-banks/:bankId/publish` | No body | Changes the bank to `PUBLISHED`. |
| `POST /admin/question-banks/:bankId/archive` | No body | Archives the bank if it has no published questions. |
| `POST /admin/question-banks/:bankId/restore` | No body | Restores an archived bank. |

Publish the bank before student-facing question selection.

## 6. Reusable question contexts

A context is shared material used by one or more questions, such as a reading passage, diagram, table, or scenario.

### 6.1 Create a context

```http
POST /admin/questions/contexts
```

```json
{
  "type": "TEXT",
  "title": "Cell passage",
  "body": "Read the following passage and answer questions 1–3.",
  "languageCode": "en"
}
```

For structured content, use `contentBlocks`:

```json
{
  "type": "IMAGE",
  "contentBlocks": [
    {
      "type": "IMAGE",
      "assetId": "asset_123",
      "altText": "Cell diagram"
    }
  ]
}
```

Response: a context object containing its `id`, content, and content blocks.

### 6.2 Manage contexts

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/questions/contexts` | No body | List of reusable contexts. |
| `PATCH /admin/questions/contexts/:contextId` | Any editable context fields; an empty `contentBlocks` array clears blocks | Updated context. |
| `DELETE /admin/questions/contexts/:contextId` | No body | Deletes an unreferenced context. |

## 7. Create and edit questions

### 7.1 Create a question

```http
POST /admin/questions
```

```json
{
  "bankId": "bank_123",
  "sourceId": "source_123",
  "courseId": "course_123",
  "type": "SINGLE_CHOICE",
  "placements": [
    {
      "courseId": "course_123",
      "chapterId": "chapter_123",
      "lessonId": "lesson_123"
    }
  ],
  "body": "What is the powerhouse of the cell?",
  "explanation": "Mitochondria produce energy for the cell.",
  "maxPoints": 1
}
```

`placements` must contain at least one hierarchy location. The question starts in `DRAFT` status.

For a short-answer or fill-in-the-blank question, include accepted answers:

```json
{
  "type": "SHORT_ANSWER",
  "body": "What is 2 + 2?",
  "acceptedAnswers": ["4", "four"],
  "maxPoints": 1
}
```

For a long-answer question that should receive AI grading, include a grading
rubric. Omitting it is supported when a human grader should assess responses:

```json
{
  "type": "LONG_ANSWER",
  "body": "Explain photosynthesis.",
  "gradingRubric": "Award points for sunlight, carbon dioxide, water, and glucose.",
  "maxPoints": 4
}
```

Response: the created question, including its `id`, status, placements, content, options, assets, and video link.

### 7.2 List and retrieve questions

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/questions` | Query: `page`, `limit`, optional `q`, `status`, `bankId`, `sourceId`, `courseId`, `chapterId`, `lessonId`, `sectionId`, `subjectId`, `academicGradeId` | Paginated question list. |
| `GET /admin/questions/:questionId` | No body | Full question detail, including options, contexts, placements, assets, and video. |

### 7.3 Edit a question

```http
PATCH /admin/questions/:questionId
```

Send only the fields being changed:

```json
{
  "body": "Updated question wording",
  "explanation": "Updated explanation",
  "maxPoints": 2,
  "placements": [
    { "courseId": "course_123", "chapterId": "chapter_123" }
  ]
}
```

The question body, type, answer settings, placements, contexts, and content blocks can be updated while the question is editable. Published or archived questions cannot be edited directly.

Response: the updated question.

### 7.4 Manage options

| Method and endpoint | Request | Response/job |
|---|---|---|
| `POST /admin/questions/:questionId/options` | `{ "body": "Mitochondria", "isCorrect": true }` | Creates and returns the new option. |
| `PATCH /admin/questions/:questionId/options/:optionId` | Any subset of `body`, `contentBlocks`, `isCorrect` | Updated option. |
| `DELETE /admin/questions/:questionId/options/:optionId` | No body | Removes the option. |
| `POST /admin/questions/:questionId/options/reorder` | `{ "optionIds": ["option_2", "option_1"] }` | Question/options with new order, or the updated question representation. |

The frontend should ensure that the correct answer is set before submitting the question for review.

### 7.5 Manage question assets and video

| Method and endpoint | Request | Response/job |
|---|---|---|
| `POST /admin/questions/:questionId/assets` | `{ "assetId": "asset_123" }` | Attaches an existing ready asset. |
| `DELETE /admin/questions/:questionId/assets/:assetId` | No body | Removes the question attachment. |
| `POST /admin/questions/:questionId/assets/reorder` | `{ "assetIds": ["asset_2", "asset_1"] }` | Updated question asset order. |
| `POST /admin/questions/:questionId/video-link` | `{ "videoAssetId": "video_123", "timestampSeconds": 30 }` | Creates/updates the question video link. |
| `DELETE /admin/questions/:questionId/video-link` | No body | Removes the question video link. |

The asset must be ready and compatible with the content block or attachment being created.

## 8. Review and publish questions

The normal question lifecycle is:

```text
DRAFT → IN_REVIEW → PUBLISHED
                  ↘ REJECTED → edit and resubmit
PUBLISHED → ARCHIVED
```

### 8.1 Submit for review

```http
POST /admin/questions/:questionId/submit
```

No body is required. The API validates the question and changes it from `DRAFT` or `REJECTED` to `IN_REVIEW`.

Response: the question with status `IN_REVIEW`.

### 8.2 Publish

```http
POST /admin/questions/:questionId/publish
```

No body is required. The API approves the question and changes it from `IN_REVIEW` to `PUBLISHED`.

Response: the question with status `PUBLISHED`.

Only published questions can normally be selected for student practice or generated assessments.

### 8.3 Reject

```http
POST /admin/questions/:questionId/reject
```

```json
{
  "reviewNote": "The correct answer is missing."
}
```

The question changes to `REJECTED`. The frontend should display the review note so the author can fix the question and submit it again.

### 8.4 Archive or delete

| Method and endpoint | Request | Response/job |
|---|---|---|
| `POST /admin/questions/:questionId/archive` | No body | Moves the question to `ARCHIVED`; it is no longer selected for future student activity. |
| `DELETE /admin/questions/:questionId` | No body | Permanently deletes only an unreferenced draft question. |

## 9. AI question import

AI import depends on the asset, source, bank, course, and placements being available first.

### 9.1 Create an import

```http
POST /admin/ai/question-imports
```

Send exactly one of `rawText` or `sourceAssetId`:

```json
{
  "bankId": "bank_123",
  "sourceId": "source_123",
  "courseId": "course_123",
  "placements": [{ "courseId": "course_123" }],
  "sourceAssetId": "pdf_asset_123"
}
```

Or:

```json
{
  "bankId": "bank_123",
  "sourceId": "source_123",
  "courseId": "course_123",
  "placements": [{ "courseId": "course_123" }],
  "rawText": "Question 1. What is ...?\nA. ...\nB. ..."
}
```

For a file import, the asset must be a ready PDF or TXT asset. The response contains the import batch `id`, status, and processing summary.

### 9.2 Monitor and inspect an import

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/ai/question-imports` | Query: `page`, `limit`, optional `status` | Paginated import jobs. |
| `GET /admin/ai/question-imports/:importId` | No body | Import progress, status, diagnostics, warnings, and counters. |
| `GET /admin/ai/question-imports/:importId/source-text` | No body | Normalized source text, pages, extraction metadata, and warnings. |
| `GET /admin/ai/question-imports/:importId/items` | Query: `page`, `limit`, optional candidate `status` | Extracted question candidates with options, evidence, warnings, and visual requirements. |
| `GET /admin/ai/question-imports/:importId/media` | No body | Detected PDF visual regions and protected previews. |

An AI candidate is not yet a question in the question bank.

### 9.3 Correct source text

```http
PATCH /admin/ai/question-imports/:importId/source-text
```

```json
{
  "normalizedText": "Corrected and normalized source text..."
}
```

The import is queued again and question boundary detection is rerun. This is available only for an import waiting for review with no accepted items.

### 9.4 Correct extracted media

| Method and endpoint | Request | Response/job |
|---|---|---|
| `POST /admin/ai/question-imports/:importId/media` | `{ "pageNumber": 3, "type": "QUESTION_FIGURE", "bounds": { "left": 100, "top": 100, "right": 800, "bottom": 600 }, "description": "Question diagram" }` | Creates a manually selected visual region and preview asset. |
| `PATCH /admin/ai/question-imports/:importId/media/:mediaKey` | Any subset of `status`, `type`, `bounds`, `description`, `note` | Updates/re-crops/reclassifies the visual region. |
| `POST /admin/ai/question-imports/:importId/media/:mediaKey/retry` | No body | Reprocesses a failed visual crop. |
| `PATCH /admin/ai/question-imports/:importId/items/:itemId/media` | `{ "assignments": [...] }` | Approves which visual belongs to the question, option, or context. |

Example media assignment:

```json
{
  "assignments": [
    {
      "mediaKey": "M0001",
      "owner": "QUESTION",
      "ownerReference": "QUESTION",
      "placementAnchor": "START",
      "status": "APPROVED",
      "reason": "Diagram belongs above the question text"
    },
    {
      "mediaKey": "M0002",
      "owner": "OPTION",
      "ownerReference": "OPTION:0",
      "status": "APPROVED"
    }
  ]
}
```

`OPTION:0` means the first option. Visual requirements must be resolved before the candidate can be accepted.

### 9.5 Retry failed import work

| Method and endpoint | Request | Response/job |
|---|---|---|
| `POST /admin/ai/question-imports/:importId/retry` | No body | Retries all failed import chunks. |
| `POST /admin/ai/question-imports/:importId/chunks/:chunkId/retry` | No body | Retries one failed AI-processing chunk. |
| `POST /admin/ai/question-imports/:importId/pages/:pageNumber/retry` | No body | Retries transcription/OCR for one PDF page. |
| `POST /admin/ai/question-imports/:importId/children/:childId/retry` | No body | Retries one page-range child import. |
| `POST /admin/ai/question-imports/:importId/items/:itemId/retry` | No body | Retries one failed question candidate. |

Use the smallest retry endpoint that matches the failure. Use the batch retry only when multiple chunks failed.

### 9.6 Accept or reject candidates

Accept a corrected candidate:

```http
POST /admin/ai/question-imports/:importId/items/:itemId/accept
```

```json
{
  "candidate": {
    "type": "SINGLE_CHOICE",
    "body": "Corrected question text",
    "options": [
      { "body": "Incorrect answer", "isCorrect": false },
      { "body": "Correct answer", "isCorrect": true }
    ],
    "explanation": "Corrected explanation"
  },
  "note": "Corrected wording and answer before acceptance."
}
```

The `candidate` is the admin-reviewed version. The endpoint creates a normal question in `DRAFT` status and returns the import item with the created `questionId`.

The frontend can then use the normal question APIs from sections 7 and 8.

Reject a candidate:

```http
POST /admin/ai/question-imports/:importId/items/:itemId/reject
```

```json
{
  "reason": "The question is incomplete and cannot be verified."
}
```

The candidate becomes excluded and no question is created.

## 10. Student question discovery and practice

These endpoints depend on published sources, banks, questions, and published content placements.

### 10.1 List practice questions

```http
GET /student/practice/questions?courseId=course_123&page=1&limit=20
```

Optional scope query parameters: `courseId`, `chapterId`, `lessonId`, `sectionId`, `page`, and `limit`.

Response: paginated eligible questions. The response includes the question body, options, explanations/content needed by the student UI, and the student’s previous status where applicable.

### 10.2 Submit a practice answer

```http
POST /student/practice/questions/:questionId/attempts
```

```json
{
  "optionIds": ["option_123"]
}
```

Response: the attempt result, including whether it was correct and the relevant answer information.

### 10.3 Read practice history and assets

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /student/practice/questions/:questionId/attempts` | Query: optional scope and pagination fields | The student’s attempt history for that question. |
| `GET /student/practice/questions/:questionId/assets/:assetId/access` | No body | Short-lived protected access URL for the question asset. |

## 11. Student assessment creation

An assessment is a quiz/exam containing a frozen snapshot of questions. This means later edits to the original question do not unexpectedly change an assessment already created.

### 11.1 Create a random assessment

```http
POST /student/assessments
```

```json
{
  "questionCount": 10,
  "mode": "EXAM",
  "isTimed": true,
  "durationSeconds": 1800,
  "title": "Biology practice exam",
  "courseIds": ["course_123"],
  "chapterIds": ["chapter_123"],
  "questionBankIds": ["bank_123"],
  "sourceTypes": ["MINISTRY_MODEL"],
  "difficultyBands": ["B", "C"]
}
```

`questionCount` must be between 1 and 50. If `isTimed` is true, `durationSeconds` is required and must be at least 30 seconds.

The backend selects only eligible published questions. Response: an assessment with its `id`, `questionCount`, `mode`, status, and selected question snapshot.

### 11.2 Student assessment management

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /student/assessments` | Query: pagination, optional `status=ALL\|SUSPENDED\|COMPLETED`, search | Student assessment list. |
| `GET /student/assessments/:assessmentId` | No body | Assessment details and its question snapshot. |
| `PATCH /student/assessments/:assessmentId` | `{ "title": "New title" }` | Renamed assessment. |
| `DELETE /student/assessments/:assessmentId` | No body | Deletes an assessment owned by the student. |
| `GET /student/assessments/question-banks` | Optional `subjectId` query | Question banks accessible to the student, with available counts. |
| `GET /student/assessments/question-sources` | Required `questionBankId` query | Sources available in the selected question bank. |

### 11.3 Student marks and notes

| Method and endpoint | Request | Response/job |
|---|---|---|
| `POST /student/assessments/question-marks/:questionId` | No body | Marks an accessible question for later review. |
| `GET /student/assessments/question-marks` | No body | Lists the student’s marked questions. |
| `DELETE /student/assessments/question-marks/:questionId` | No body | Removes a mark. |
| `PUT /student/assessments/question-notes/:questionId` | `{ "body": "Review this formula" }` | Creates or updates the student’s private note. |
| `DELETE /student/assessments/question-notes/:questionId` | No body | Deletes the private note. |

## 12. Admin assessment creation

These APIs are used when an administrator prepares a quiz/exam for students.

### 12.1 Create a random assessment

```http
POST /admin/assessments/standard
```

```json
{
  "scopes": [{ "courseId": "course_123" }],
  "questionCount": 20,
  "mode": "EXAM",
  "isTimed": true,
  "durationSeconds": 3600,
  "title": "Biology final exam"
}
```

The backend randomly selects published eligible questions from the supplied scope.

### 12.2 Create a custom assessment

```http
POST /admin/assessments/custom
```

```json
{
  "questionIds": ["question_1", "question_2", "question_3"],
  "scopes": [{ "courseId": "course_123" }],
  "mode": "EXAM",
  "title": "Revision quiz"
}
```

Every question ID must refer to a published question with a published placement inside one of the supplied scopes.

### 12.3 Manage admin assessments

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /admin/assessments` | Query: pagination, optional `status`, `search` | Paginated admin assessment list. |
| `GET /admin/assessments/:assessmentId` | No body | Assessment details including questions and correct answers for admin use. |
| `PATCH /admin/assessments/:assessmentId` | Any subset of `title`, `mode`, `isTimed`, `durationSeconds` | Updated draft assessment. |
| `POST /admin/assessments/:assessmentId/publish` | No body | Publishes the assessment and makes it available according to its visibility rules. |
| `POST /admin/assessments/:assessmentId/archive` | No body | Archives the assessment. |
| `DELETE /admin/assessments/:assessmentId` | No body | Deletes a never-published draft assessment. |

## 13. Student assessment attempt

### 13.1 Start or resume an attempt

```http
POST /student/assessments/:assessmentId/attempts/start
```

No body is required.

Response includes:

```json
{
  "attemptId": "attempt_123",
  "status": "SUSPENDED",
  "mode": "EXAM",
  "totalQuestions": 10,
  "totalPoints": 10,
  "expiresAt": "2026-08-21T13:00:00.000Z",
  "questions": [
    {
      "id": "assessment_question_123",
      "type": "SINGLE_CHOICE",
      "body": "What is the powerhouse of the cell?",
      "options": [
        { "id": "option_1", "body": "Nucleus" },
        { "id": "option_2", "body": "Mitochondria" }
      ],
      "selectedOptionIds": [],
      "answered": false,
      "maxPoints": 1
    }
  ]
}
```

The frontend renders the `questions` array. Use the question `id` from this response when saving answers. Do not substitute the original admin question ID.

### 13.2 Read the current attempt

```http
GET /student/assessments/:assessmentId/attempts/current
```

Response: the same attempt state, including saved answers and progress. Use this when the student refreshes the page or returns to an unfinished assessment.

### 13.3 Save an answer

```http
POST /student/assessments/:assessmentId/attempts/current/answers/:assessmentQuestionId
```

For single-choice or multiple-choice questions:

```json
{
  "selectedOptionIds": ["option_2"]
}
```

For short-answer, fill-in-the-blank, or long-answer questions:

```json
{
  "responseText": "The mitochondria produce energy for the cell."
}
```

The frontend should call this endpoint on answer selection or text changes. The endpoint upserts the answer, so the same question can be saved again if the student changes their answer.

The response may include immediate correctness data in `TUTOR` mode. In `EXAM` mode, correctness and correct answers remain hidden until submission.

### 13.4 Report time spent

```http
PATCH /student/assessments/:assessmentId/attempts/current/questions/:assessmentQuestionId/active-time
```

```json
{
  "activeSeconds": 45
}
```

Send the monotonic total active time for that question. The server keeps the greatest value received, so retries do not reduce the total.

### 13.5 Access question assets

```http
GET /student/assessments/:assessmentId/questions/:assessmentQuestionId/assets/:assetId/access
```

Response: a protected short-lived access URL for an image, PDF, or other assessment attachment.

### 13.6 Submit the attempt

```http
POST /student/assessments/:assessmentId/attempts/current/submit
```

No body is required. The attempt changes from `SUSPENDED` to `COMPLETED` and the server finalizes every question as correct, incorrect, omitted, or pending manual grading.

Response:

```json
{
  "attemptId": "attempt_123",
  "status": "COMPLETED",
  "score": 8,
  "totalQuestions": 10,
  "submittedAt": "2026-08-21T12:30:00.000Z"
}
```

### 13.7 Read the result

```http
GET /student/assessments/:assessmentId/attempts/current/result
```

Optional query parameter: `includeComparison=true|false`. The response includes the score and per-question result information:

```json
{
  "attemptId": "attempt_123",
  "score": 8,
  "totalPoints": 10,
  "questions": [
    {
      "id": "assessment_question_123",
      "outcome": "CORRECT",
      "awardedPoints": 1,
      "isCorrect": true,
      "selectedOptionIds": ["option_2"],
      "correctOptionIds": ["option_2"],
      "explanation": "Mitochondria produce energy for the cell."
    }
  ]
}
```

## 14. Grading behavior

### Automatically graded questions

The following are graded by the server:

- `SINGLE_CHOICE`: the selected option must exactly match the correct option.
- `MULTIPLE_CHOICE`: the selected option set must exactly match all correct options.
- `SHORT_ANSWER`: the response is compared with configured `acceptedAnswers`.
- `FILL_IN_THE_BLANK`: the response is compared with configured `acceptedAnswers`.

A correct answer receives the question’s `maxPoints`. Incorrect and omitted answers receive zero points.

### Manually graded long answers

Long answers become `PENDING_GRADING` after submission.

List pending answers:

```http
GET /admin/assessments/grading/pending
```

Response: submitted long-answer responses with the student, assessment, question, answer text, and answer ID.

Grade one long answer:

```http
POST /admin/assessments/grading/answers/:answerId
```

```json
{
  "awardedPoints": 3,
  "feedback": "Good answer, but the final step is missing."
}
```

`awardedPoints` cannot exceed the question’s `maxPoints`. The answer becomes `CORRECT`, `PARTIALLY_CORRECT`, or `INCORRECT`, and the assessment score is updated.

The student can call the result endpoint again after manual grading to see the updated score and feedback.

## 15. Question-related analytics

These read-only endpoints depend on practice attempts or completed assessment attempts. They are placed after the attempt and grading sections because they summarize data produced by those workflows.

### 15.1 Student direct-practice performance

```http
GET /student/performance
```

No body is required. The response contains the current student’s direct-practice totals, accuracy, and related performance summary.

### 15.2 Student assessment analytics

```http
GET /student/assessments/analytics/summary?subjectId=subject_123&chapterId=chapter_123&page=1&limit=20
```

All query parameters are optional. The response contains paginated performance rollups at the requested hierarchy level and, when `chapterId` is supplied, completed attempts for that chapter.

### 15.3 Parent view of a selected child

These endpoints use the parent session and selected-child context. They do not create or modify questions.

| Method and endpoint | Request | Response/job |
|---|---|---|
| `GET /parent/selected-child/performance` | Parent session; no body | Selected child’s learning summary. |
| `GET /parent/selected-child/analytics/scopes` | Query: optional `subjectId`, `orderItemId`, `page`, `limit` | Approved/purchased scopes available for analytics. |
| `GET /parent/selected-child/analytics/assessments` | Same scope query | Selected child’s assessment performance for the approved scope. |
| `GET /parent/selected-child/analytics/practice` | Same scope query | Selected child’s direct-practice performance for the approved scope. |

## 16. Recommended frontend implementation

### Admin question editor

1. Load subjects/courses from the existing academic APIs.
2. Create or select a published source and bank.
3. Load or create reusable contexts if needed.
4. Upload required assets and wait for `READY` status.
5. Create or accept a question as `DRAFT`.
6. Load the full question using `GET /admin/questions/:questionId`.
7. Edit the question and options.
8. Submit it for review.
9. Display validation/review errors.
10. Publish after approval.

### AI import screen

1. Upload and complete the PDF/TXT asset.
2. Create the import batch.
3. Poll the import detail endpoint or refresh it after queue activity.
4. Display source text, candidate questions, warnings, and media previews.
5. Allow corrections to text, crops, and media assignments.
6. Allow the admin to edit the candidate payload before accepting it.
7. Accept good candidates and reject unusable candidates.
8. Open accepted question IDs in the normal question editor.
9. Submit and publish accepted questions through the normal lifecycle.

### Student assessment screen

1. Create or select an assessment.
2. Start/resume the attempt.
3. Render each returned question and its options/content blocks.
4. Autosave each answer.
5. Restore saved answers using the current-attempt endpoint after reload.
6. Submit the attempt.
7. Show the result endpoint response according to the assessment mode.
8. Refresh results later if long answers were manually graded.

## 17. Main source files

- [Question banks and questions controller](../src/modules/question-banks/question-banks.controller.ts)
- [Question banks and questions DTOs](../src/modules/question-banks/dto/question-banks.dto.ts)
- [Assessments controller](../src/modules/assessments/assessments.controller.ts)
- [Assessment DTOs](../src/modules/assessments/dto/assessments.dto.ts)
- [Learning/practice controller](../src/modules/learning/learning.controller.ts)
- [AI question import controller](../src/modules/ai-question-import/question-import.controller.ts)
- [AI question import DTOs](../src/modules/ai-question-import/dto/question-import.dto.ts)
- [Detailed API reference](./api-reference-detailed.md)
