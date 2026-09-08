# Academic grades and testimonials frontend integration guide

This guide covers the frontend contract introduced by commits `2678063`
(multi-grade subjects and grade-scoped courses) and `11beb1d` (testimonials).
It is for the admin application, public storefront, and student application.

All paths below are relative to `/api/v1`. The current Swagger document at
`/api/docs` is the canonical contract. Admin routes require an `ADMIN` or
`SUPER_ADMIN` bearer token; testimonial public routes do not require a token.

## What changed

```text
Academic grade
  └─ SubjectGrade placement (one Subject can be placed in several grades)
       └─ Subject identity
            └─ Course (exactly one course grade)

Published testimonial
  ├─ written review and/or ready IMAGE asset
  └─ public list → short-lived screenshot URL, when a screenshot exists
```

A subject is now reusable across grades. Its `academicGradeId` and
`sortOrder` are legacy compatibility fields and describe only its primary
placement. A course's `academicGradeId` is the authoritative grade for that
course and its descendants.

## 1. Integrating reusable subjects and grade-scoped courses

### Admin: create and edit a subject

Use `academicGradeIds` for all new subject creation. It must contain at least
one valid, non-archived academic-grade ID.

```http
POST /admin/subjects
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "title": "Mathematics",
  "slug": "mathematics",
  "description": "Core mathematics",
  "academicGradeIds": ["grade-10-id", "grade-11-id"]
}
```

`academicGradeId` is still accepted on creation for old clients, but is
deprecated. Do not send it from new UI. If an old client sends both fields,
the single ID must equal the first `academicGradeIds` value.

The subject response now includes all placements:

```json
{
  "id": "subject-id",
  "academicGradeId": "grade-10-id",
  "academicGradeIds": ["grade-10-id", "grade-11-id"],
  "academicGrades": [
    { "id": "grade-10-id", "name": { "ar": "...", "en": "..." }, "sortOrder": 1 },
    { "id": "grade-11-id", "name": { "ar": "...", "en": "..." }, "sortOrder": 3 }
  ],
  "sortOrder": 1
}
```

Render the grade chips from `academicGrades`, not from the single legacy
`academicGradeId`. When the screen is scoped to a selected grade, use that
placement's `sortOrder`; it can differ for the same subject in another grade.

To change memberships, submit the complete desired set:

```http
PATCH /admin/subjects/subject-id

{ "academicGradeIds": ["grade-10-id", "grade-12-id"] }
```

The server rejects removal of a grade that still has courses for this subject
(`409`). Guide users to move or archive those courses first. The legacy
`POST /admin/subjects/{id}/move` action is only valid for a subject assigned to
one grade; for a shared subject, edit `academicGradeIds` instead.

### Grade-scoped lists and reordering

Always pass the selected grade to these admin list routes:

| UI | Request | Important response rule |
| --- | --- | --- |
| Subject list within a grade | `GET /admin/subjects?academicGradeId={gradeId}&page=1&limit=100` | Each returned `sortOrder`, `academicGradeId`, `academicGradeName`, and `hasChildren` is scoped to this grade. |
| Course list within a subject and grade | `GET /admin/courses?subjectId={subjectId}&academicGradeId={gradeId}&page=1&limit=100` | Each course includes its `academicGradeId`; use it as the selected-grade guard. |

The reorder request is a full replacement of the applicable sequence, not a
move-by-index request. Send every sibling, numbered consecutively from 1.

```http
POST /admin/subjects/reorder

{
  "academicGradeId": "grade-11-id",
  "items": [
    { "id": "geometry-subject-id", "sortOrder": 1 },
    { "id": "mathematics-subject-id", "sortOrder": 2 }
  ]
}
```

```http
POST /admin/courses/reorder

{
  "subjectId": "mathematics-subject-id",
  "academicGradeId": "grade-11-id",
  "items": [
    { "id": "algebra-2-id", "sortOrder": 1 },
    { "id": "algebra-1-id", "sortOrder": 2 }
  ]
}
```

Reorder all pages before submitting. The server validates the complete sibling
set, including archived records. The normal list omits archived records, so a
reorder UI must additionally fetch `status=ARCHIVED` (and paginate it) or
disable reordering while archived siblings exist. Refresh the scoped list on a
`409`, since another administrator may have changed the sequence.

### Courses: creation, move, publish, and cataloguing

For a subject with one grade, `academicGradeId` may be omitted on create. For a
shared subject it is required and must be one of `academicGradeIds`.

```http
POST /admin/courses

{
  "title": "Grade 11 Algebra",
  "subjectId": "mathematics-subject-id",
  "academicGradeId": "grade-11-id",
  "accessType": "PUBLIC"
}
```

Courses may share a slug and a sort-order number only when they are in
different `(subjectId, academicGradeId)` scopes. When moving a course,
`POST /admin/courses/{id}/move` preserves its grade; therefore the destination
subject must be assigned to that same grade. Show the server's `409` error as a
membership problem rather than offering a grade picker on the move form.

Publishing now checks the course grade as well as its subject and ancestors.
Before publishing a course or child content, ensure the course's academic
grade is published. A shared subject can be published, but content in one of
its courses is still unavailable until that course's own grade is published.

### Public and student catalogue

Public subject browsing remains `GET /catalog/subjects`; supply
`academicGradeId` whenever the page represents a grade. The grade-scoped
response is correctly ordered for that grade and its `hasChildren` count only
counts published courses for that grade.

For a shared subject, the public course list must include the grade:

```text
GET /catalog/courses?subjectId={subjectId}&academicGradeId={gradeId}
```

Calling this route with a shared `subjectId` but no `academicGradeId` returns
`400`. A course-detail response (`GET /catalog/courses/{courseId}`) includes
both its `subject` and its authoritative `academicGrade`; use the latter for
breadcrumbs and grade labels.

Student screens need no new query parameter. They are already grade-scoped by
the student's profile:

```text
GET /student/catalog/subjects
GET /student/catalog/subjects/{subjectId}/courses
GET /student/catalog/courses/{courseId}
```

Do not merge results from two grades by subject ID in client state. A shared
subject has one ID but has separate grade placement and separate courses.

## 2. Testimonials

### Admin lifecycle

Testimonials are curated records with `DRAFT`, `PUBLISHED`, and `ARCHIVED`
status. Create and edit them only in the admin application.

| Intent | Endpoint |
| --- | --- |
| Create draft | `POST /admin/testimonials` |
| List | `GET /admin/testimonials?page=1&limit=20&status=DRAFT` |
| Read or edit | `GET` / `PATCH /admin/testimonials/{id}` |
| Set visible order | `POST /admin/testimonials/reorder` |
| Publish / return to draft | `POST /admin/testimonials/{id}/publish` / `unpublish` |
| Archive / restore | `POST /admin/testimonials/{id}/archive` / `restore` |
| Delete | `DELETE /admin/testimonials/{id}` |

The list defaults to non-archived records. `status` is optional and accepts a
single status. All list responses use `{ data, meta }`, with one-based `page`,
`limit` 1–100, and `meta.totalPages`.

Create a text-only testimonial:

```json
{
  "reviewText": "Clear explanations made a real difference.",
  "reviewerName": "A student"
}
```

Or attach a review screenshot:

```json
{
  "reviewText": "Optional supporting text",
  "reviewerName": "Parent of a Grade 10 student",
  "screenshotAssetId": "ready-image-asset-id",
  "screenshotAltText": "A parent review praising the lessons and teacher support."
}
```

At least one of `reviewText` and `screenshotAssetId` is required. A screenshot
must be a ready `IMAGE` asset, can belong to only one testimonial, and always
requires non-empty `screenshotAltText`. Do not use reviewer photos: the
feature intentionally supports a review screenshot only.

`PATCH` is partial. To remove a screenshot, send **both** fields as `null` in
the same request; otherwise the existing alt text makes the final record
invalid.

```json
{ "screenshotAssetId": null, "screenshotAltText": null }
```

Only drafts can be deleted. Archive retains the record; restore puts it back
into `DRAFT` and appends it to the end of the active ordering. Do not offer a
delete button for published or archived records.

Use the existing direct asset flow before saving a screenshot:

1. `POST /admin/assets/upload?kind=IMAGE` as multipart form data.
2. Upload the file bytes to the returned `upload.url` with the returned method
   and headers.
3. `POST /admin/assets/{assetId}/complete`.
4. Wait for the ready asset response, then send that `assetId` in the
   testimonial request.

### Ordering and public rendering

`POST /admin/testimonials/reorder` accepts all non-archived testimonials,
exactly once, in a consecutive sequence. Use the default admin list, load all
pages, and send the entire sequence—not just the visible page.

```json
{
  "items": [
    { "id": "testimonial-a", "sortOrder": 1 },
    { "id": "testimonial-b", "sortOrder": 2 }
  ]
}
```

The storefront uses only these public routes:

```text
GET /testimonials?page=1&limit=20
GET /testimonials/{testimonialId}/screenshot/access
```

The public list includes only published records, in `sortOrder` order. It does
not expose `status`, asset IDs, audit fields, or a file URL. Each item is shaped
like this:

```json
{
  "id": "testimonial-id",
  "reviewText": "Clear explanations made a real difference.",
  "reviewerName": "A student",
  "screenshotAltText": "A parent review praising the lessons.",
  "screenshotAccessPath": "/api/v1/testimonials/testimonial-id/screenshot/access",
  "sortOrder": 1
}
```

When `screenshotAccessPath` is `null`, render no image. Otherwise request that
path only when the image is needed. The response contains `{ url, expiresAt }`.
Set the returned `url` directly on the image; do not construct a Bunny URL or
cache it after `expiresAt`. If it expires or returns `404`, fetch a fresh URL;
an unavailable screenshot should not hide the written review.

## 3. Error handling and rollout checklist

The API's non-2xx responses use the standard localized envelope:

```json
{
  "statusCode": 409,
  "code": "...",
  "message": { "en": "...", "ar": "..." },
  "error": { "en": "...", "ar": "..." },
  "correlationId": "..."
}
```

Use `message` for user feedback and retain `correlationId` in client error
reports. Treat `400` as malformed input or a missing shared-subject grade,
`404` as an unavailable record or screenshot, and `409` as a state or
concurrency conflict that normally needs a refresh.

Before releasing the frontend:

- Replace new subject-create calls with `academicGradeIds`.
- Scope every course list and reorder operation by both subject and grade.
- Add `academicGradeId` to the public course-list cache key.
- Keep student catalogue cache keys grade-aware; do not de-duplicate shared
  subjects across grade contexts.
- Add the testimonials admin lifecycle, image-upload state, and full-list
  reorder behavior.
- Render public screenshots through their short-lived access path only.
