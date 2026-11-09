# Student catalog question counts: integration guide

This guide describes the working-tree update that adds `availableQuestionCount` to student catalog responses. It does not confirm that the update has been deployed. IDs and counts in examples are illustrative.

## Authentication and requests

Use the existing catalog requests with `Authorization: Bearer <student-access-token>`. The endpoints require the student role. The backend derives the student and grade from the authenticated account; no new query parameter or request body is needed. Existing pagination and filters remain unchanged.

## Affected endpoints

| Method and path | Where `availableQuestionCount` appears |
| --- | --- |
| `GET /api/v1/student/catalog/subjects` | Each subject in `data` |
| `GET /api/v1/student/catalog/subjects/:subjectId/courses` | Each course in `data` |
| `GET /api/v1/student/catalog/courses/:courseId` | The course object and its `subject` |
| `GET /api/v1/student/catalog/courses/:courseId/chapters` | Each chapter in `data` and `parent` (course) |
| `GET /api/v1/student/catalog/chapters/:chapterId/lessons` | Each lesson in `data` and `parent` (chapter) |
| `GET /api/v1/student/catalog/lessons` | Each lesson in `data` |
| `GET /api/v1/student/catalog/sections` | Each section in `data` |
| `GET /api/v1/student/catalog/lessons/:lessonId/sections` | Each section in `data` and `parent` (lesson) |

The count is not added to breadcrumbs in the flat lesson and section lists. The catalog summary and search endpoints are unchanged. The shared OpenAPI node schema marks the field optional because not every endpoint or nested node includes it.

## Response example

For `GET /api/v1/student/catalog/courses/course-1/chapters`, the relevant fields look like this (other existing fields are omitted):

```json
{
  "parent": { "id": "course-1", "availableQuestionCount": 12 },
  "data": [
    { "id": "chapter-1", "availableQuestionCount": 5 },
    { "id": "chapter-2", "availableQuestionCount": 0 }
  ],
  "pageInfo": { "hasNextPage": false, "nextCursor": null }
}
```

`availableQuestionCount` is a non-negative JSON number. `0` means no eligible questions were found for that node and student; it is different from a missing field. The parent count covers the whole parent, not just the returned page. Counts for different children can overlap, so their sum need not equal the parent count.

## What the count means

The count includes distinct questions placed directly on the node or under its descendants. A question with multiple qualifying placements within a node is counted once for that node. A question placed directly on a parent does not count toward a child unless it also has a qualifying placement under that child.

A qualifying question, its bank, source, course and subject must be published. Its matching placement and all placement ancestors must also be published. Long-answer questions need a nonblank grading rubric. Access is evaluated for the current student and the matching placement: public or free content is available within the student's grade; active course or chapter entitlements can also grant access, including outside the grade. Entitlements that are inactive, revoked, not yet started or expired do not grant access.

Counts are calculated before assessment filters such as source, difficulty, marks or question status. They are an availability indicator, not a guarantee that a filtered assessment can contain that many questions. Counts can change as content, the student's grade, or entitlements change.

## Frontend integration

1. Add `availableQuestionCount?: number` to the shared catalog node type to support both updated and older servers, as well as nodes that do not receive the field.
2. Render the count when it is a number, including zero. Treat an absent field as unavailable rather than zero.
3. Read the count from the node being displayed. For hierarchical lists, `parent` has its own count; for course details, the nested `subject` has its own count.
4. Keep existing pagination and filters. Do not sum child counts to derive a parent total, and refresh student-specific cached responses when the account, grade, entitlement or content state changes.

```ts
type CatalogNode = {
  id: string;
  title: string;
  availableQuestionCount?: number;
  // Existing catalog fields remain unchanged.
};

function questionCountLabel(node: CatalogNode): string | null {
  return typeof node.availableQuestionCount === 'number'
    ? `${node.availableQuestionCount} available questions`
    : null;
}
```

For existing request parameters and full response shapes, see the [student catalog guide](student-content-catalog-api-guide.md) and [accessible catalog guide](accessible-student-catalog-frontend-integration-guide.md).
