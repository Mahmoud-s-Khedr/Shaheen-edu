# Reorder APIs — Frontend Integration Guide

This is the implementation-backed contract for every admin endpoint that
changes display order. It covers the endpoint family that includes
`POST /api/v1/admin/courses/reorder`.

Production base URL:

```text
https://api.jibal-platform.com/api/v1
```

All endpoints in this guide require an access token for a user with the
`ADMIN` or `SUPER_ADMIN` role.

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

## The important rule: each request replaces one complete list

Reorder is atomic and scoped. It is **not** a "move this one item" API.
Before sending a request, the client must have the complete current list for
the target scope and submit every item exactly once.

- Do not submit only the moved item or a changed pair.
- Use the exact reorderable scope described below. In particular, child
  hierarchy and content-item reorder operations include archived siblings,
  even though their normal list endpoints hide archived records by default.
- For explicit-position endpoints, `sortOrder` must be each integer from `1`
  through `N`, exactly once.
- For ordered-ID endpoints, the array index is the new position: first ID is
  position `1`.
- The server writes the whole change in a transaction. A rejected request
  leaves the previous order unchanged.

Use a resource's `move` endpoint, where one exists, to move it to a different
parent. Use its `reorder` endpoint only to reorder siblings already under the
same parent.

## Endpoint index

| Scope                                             | Endpoint                                             | Body form          | Success body                |
| ------------------------------------------------- | ---------------------------------------------------- | ------------------ | --------------------------- |
| All non-archived academic grades                  | `POST /admin/academic-grades/reorder`                | explicit positions | Empty (`201`)               |
| Subjects in one academic grade                    | `POST /admin/subjects/reorder`                       | explicit positions | Empty (`201`)               |
| Courses in one subject                            | `POST /admin/courses/reorder`                        | explicit positions | Empty (`201`)               |
| Chapters in one course                            | `POST /admin/chapters/reorder`                       | explicit positions | Empty (`201`)               |
| Lessons in one chapter                            | `POST /admin/lessons/reorder`                        | explicit positions | Empty (`201`)               |
| Sections in one lesson                            | `POST /admin/sections/reorder`                       | explicit positions | Empty (`201`)               |
| Content items at one placement                    | `POST /admin/content-items/reorder`                  | explicit positions | Empty (`201`)               |
| Attachments of one content item                   | `POST /admin/content-items/{id}/attachments/reorder` | ordered IDs        | Empty (`201`)               |
| Options of one editable question                  | `POST /admin/questions/{id}/options/reorder`         | ordered IDs        | Updated question (`201`)    |
| Legacy-compatible assets of one editable question | `POST /admin/questions/{id}/assets/reorder`          | ordered IDs        | Updated question (`201`)    |
| All manual payment methods                        | `POST /admin/manual-payment-methods/reorder`         | ordered IDs        | `{ "data": [...] }` (`201`) |
| All non-archived testimonials                     | `POST /admin/testimonials/reorder`                   | explicit positions | Empty (`201`)               |

All paths in the table are relative to `/api/v1`. The testimonial route is
implemented in the application but is currently absent from the checked-in
generated OpenAPI JSON; use the contract in this guide for it.

## 1. Explicit-position endpoints

The hierarchy, content-placement, and testimonial endpoints use this entry
shape:

```ts
type ReorderEntry = {
  id: string;
  sortOrder: number; // a unique integer from 1 through N
};
```

Build it from the final drag-and-drop array, rather than carrying stale
`sortOrder` values from before the drag:

```ts
const items = finalItems.map((item, index) => ({
  id: item.id,
  sortOrder: index + 1,
}));
```

### Academic hierarchy

| Endpoint                              | Request body                                             |
| ------------------------------------- | -------------------------------------------------------- |
| `POST /admin/academic-grades/reorder` | `{ "items": ReorderEntry[] }`                            |
| `POST /admin/subjects/reorder`        | `{ "academicGradeId": string, "items": ReorderEntry[] }` |
| `POST /admin/courses/reorder`         | `{ "subjectId": string, "items": ReorderEntry[] }`       |
| `POST /admin/chapters/reorder`        | `{ "courseId": string, "items": ReorderEntry[] }`        |
| `POST /admin/lessons/reorder`         | `{ "chapterId": string, "items": ReorderEntry[] }`       |
| `POST /admin/sections/reorder`        | `{ "lessonId": string, "items": ReorderEntry[] }`        |

#### 1. Academic grades

```http
POST /api/v1/admin/academic-grades/reorder
```

```json
{
  "items": [
    { "id": "grade_2", "sortOrder": 1 },
    { "id": "grade_1", "sortOrder": 2 }
  ]
}
```

#### 2. Subjects in an academic grade

```http
POST /api/v1/admin/subjects/reorder
```

```json
{
  "academicGradeId": "grade_123",
  "items": [
    { "id": "subject_2", "sortOrder": 1 },
    { "id": "subject_1", "sortOrder": 2 }
  ]
}
```

#### 3. Courses in a subject

```http
POST /api/v1/admin/courses/reorder
```

```json
{
  "subjectId": "subject_123",
  "items": [
    { "id": "course_2", "sortOrder": 1 },
    { "id": "course_1", "sortOrder": 2 },
    { "id": "course_3", "sortOrder": 3 }
  ]
}
```

#### 4. Chapters in a course

```http
POST /api/v1/admin/chapters/reorder
```

```json
{
  "courseId": "course_123",
  "items": [
    { "id": "chapter_2", "sortOrder": 1 },
    { "id": "chapter_1", "sortOrder": 2 }
  ]
}
```

#### 5. Lessons in a chapter

```http
POST /api/v1/admin/lessons/reorder
```

```json
{
  "chapterId": "chapter_123",
  "items": [
    { "id": "lesson_2", "sortOrder": 1 },
    { "id": "lesson_1", "sortOrder": 2 }
  ]
}
```

#### 6. Sections in a lesson

```http
POST /api/v1/admin/sections/reorder
```

```json
{
  "lessonId": "lesson_123",
  "items": [
    { "id": "section_2", "sortOrder": 1 },
    { "id": "section_1", "sortOrder": 2 }
  ]
}
```

Successful hierarchy reorders return `201 Created` with no body. Do not call
`response.json()` unconditionally for these endpoints. Keep the final local
order or refetch the relevant list.

Academic-grade and testimonial reorder scopes exclude archived records. In
contrast, child hierarchy reorders include **all** children of the parent,
including archived ones. The normal child list defaults to hiding archived
records, so load both the normal list and the same parent-scoped list with
`status=ARCHIVED`, merge them by `sortOrder`, then submit the complete merged
set. For example, load both
`GET /admin/courses?subjectId=<id>` and
`GET /admin/courses?subjectId=<id>&status=ARCHIVED` before reordering courses.
For child hierarchy endpoints, the parent ID selects the exact sibling scope;
the parent must exist.

### 7. Content items

```http
POST /api/v1/admin/content-items/reorder
```

```json
{
  "placement": { "lessonId": "lesson_123" },
  "items": [
    { "id": "content_3", "sortOrder": 1 },
    { "id": "content_1", "sortOrder": 2 },
    { "id": "content_2", "sortOrder": 3 }
  ]
}
```

`placement` must contain exactly one non-empty target ID. Valid keys are
`courseId`, `chapterId`, `lessonId`, and `sectionId`. Do not send two keys,
even if one refers to an ancestor. `items[].id` is the **content item ID**,
not the placement-record ID. Success is `201` with an empty body.

Like child hierarchy reorders, this endpoint includes archived items at the
placement. Load the normal placement-filtered list and a second list with
`status=ARCHIVED`, merge by `placement.sortOrder`, and submit both sets. For a
lesson placement, those calls are
`GET /admin/content-items?lessonId=<id>` and
`GET /admin/content-items?lessonId=<id>&status=ARCHIVED`.

### 8. Testimonials

```http
POST /api/v1/admin/testimonials/reorder
```

```json
{
  "items": [
    { "id": "testimonial_2", "sortOrder": 1 },
    { "id": "testimonial_1", "sortOrder": 2 }
  ]
}
```

Send every non-archived testimonial. Success is `201` with an empty body.

## 2. Ordered-ID endpoints

These endpoints infer positions from the array order. Send every existing ID
once, with no duplicates or foreign IDs.

### 9. Content-item attachments

```http
POST /api/v1/admin/content-items/content_123/attachments/reorder
```

```json
{
  "assetIds": ["asset_3", "asset_1", "asset_2"]
}
```

The path `id` is the content item ID. The body must list all of that item's
attachments, exactly once. Success is `201` with an empty body.

### 10. Question options

```http
POST /api/v1/admin/questions/question_123/options/reorder
```

```json
{ "optionIds": ["option_2", "option_1", "option_3"] }
```

### 11. Question assets

```http
POST /api/v1/admin/questions/question_123/assets/reorder
```

```json
{ "assetIds": ["asset_2", "asset_1"] }
```

The question must be editable: `PUBLISHED` and `ARCHIVED` questions cannot be
changed. Both endpoints return `201` and the refreshed question object, whose
`options` or `assets` are ordered by the newly assigned `sortOrder`. Asset
reordering also preserves the order of legacy-compatible media blocks when
those blocks correspond one-to-one with the attached assets.

### 12. Manual payment methods

```http
POST /api/v1/admin/manual-payment-methods/reorder
```

```json
{
  "methodIds": ["payment_method_3", "payment_method_1", "payment_method_2"]
}
```

This global list includes active and inactive payment methods. On `201`, the
server returns the authoritative ordered list:

```json
{
  "data": [
    { "id": "payment_method_3", "sortOrder": 1 },
    { "id": "payment_method_1", "sortOrder": 2 }
  ]
}
```

Use `response.data` as the next local state rather than reconstructing it.

## Recommended drag-and-drop flow

1. Load the complete reorderable sibling set for one scope. If the list is
   paginated, request enough records to include that entire scope before
   enabling reorder. For child hierarchy/content items, also load the
   parent/placement-scoped `status=ARCHIVED` list and merge it by `sortOrder`;
   archived siblings are required by the reorder endpoint even though the
   default list excludes them.
2. Permit a drag only within that scope. For a cross-parent drop, use the
   resource's `move` endpoint, then refetch both affected scopes.
3. On drop, update the UI optimistically and build the full replacement body
   from the final array.
4. Disable another reorder for that same scope while the request is pending.
   Debounce a "Save order" button if the UI supports multiple moves before
   save; issue one final full-list request.
5. On `201`, accept the local order for empty responses, use the returned
   question/payment-method state where provided, and optionally refetch.
6. On failure, restore the pre-drag snapshot and refetch the scope. This is
   particularly important after `409`, because another administrator may have
   changed related state.

## Error handling

The API error payload has the standard shape:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST.VALIDATION_FAILED",
  "message": { "en": "…", "ar": "…" },
  "error": { "en": "Bad Request", "ar": "…" },
  "details": [],
  "correlationId": "…"
}
```

Use the `correlationId` in frontend logs and support reports. Expected status
handling:

| Status | Frontend action                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | Restore/refetch. The body is malformed, not a full list, has duplicate IDs/positions, contains an ID outside the scope, or a content placement has zero/multiple targets. Show the validation message. |
| `401`  | Start the token refresh/sign-in flow.                                                                                                                                                                  |
| `403`  | Show an authorization state; the session is not an admin session.                                                                                                                                      |
| `404`  | Refetch and leave reorder mode; the parent, content item, question, or another target no longer exists.                                                                                                |
| `409`  | Restore/refetch. This can represent a lifecycle conflict (for example, a question was published) or a concurrent ordering conflict.                                                                    |

## Client helper example

```ts
type ReorderEntry = { id: string; sortOrder: number };

const toEntries = (ids: string[]): ReorderEntry[] =>
  ids.map((id, index) => ({ id, sortOrder: index + 1 }));

async function reorderCourses(subjectId: string, courseIds: string[]) {
  const response = await api.post('/admin/courses/reorder', {
    subjectId,
    items: toEntries(courseIds),
  });

  // HTTP 201; this endpoint deliberately has no JSON response body.
  return response;
}

async function reorderQuestionOptions(questionId: string, optionIds: string[]) {
  const response = await api.post(
    `/admin/questions/${questionId}/options/reorder`,
    { optionIds },
  );

  return response.data; // Updated question
}
```

Do not add UI-only fields (for example, `index`, `isDragging`, or a parent
object) to these requests. The request validator rejects unknown fields.

## Contract source and verification

This guide was checked against the reorder controllers, DTOs, service
validation, generated OpenAPI document, and integration tests in this
repository. The supplied production course-reorder URL responds with `401`
without a bearer token, confirming that it is an authenticated admin route;
request/response behavior above is derived from the implementation contract.
