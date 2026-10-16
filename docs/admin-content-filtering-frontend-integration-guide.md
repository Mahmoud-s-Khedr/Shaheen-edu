# Admin content filtering: frontend integration guide

This guide covers the expanded hierarchy filters on the admin content-item list
introduced in commit `fd3b228`. Use them to build content searches spanning
multiple courses, chapters, lessons, or sections.

The contract is based on the repository implementation; deployment to a server
must be verified separately. Example IDs are illustrative.

## Endpoint and authentication

```http
GET /api/v1/admin/content-items
Authorization: Bearer <admin-access-token>
```

Requires an `ADMIN` or `SUPER_ADMIN` account. An unauthenticated request returns
401; a student or another unsupported role receives 403.

This is an admin listing. It does not apply the student's grade, entitlement, or
effective access rules from the [accessible student catalog](accessible-student-catalog-frontend-integration-guide.md).

## Hierarchy filter contract

All filters are optional. Prefer plural parameters for new multi-select controls.

| Singular parameter | Plural parameter | Matches |
| --- | --- | --- |
| `courseId` | `courseIds` | Content directly attached to selected courses, or any of their chapters, lessons, or sections |
| `chapterId` | `chapterIds` | Content directly attached to selected chapters, or any of their lessons or sections |
| `lessonId` | `lessonIds` | Content directly attached to selected lessons, or any of their sections |
| `sectionId` | `sectionIds` | Content directly attached to selected sections |

Plural parameters accept either comma-separated IDs or repeated keys, including
both formats together:

```http
GET /api/v1/admin/content-items?courseIds=course-a,course-b
GET /api/v1/admin/content-items?courseIds=course-a&courseIds=course-b
GET /api/v1/admin/content-items?courseIds=course-a,course-b&courseIds=course-c
```

The backend trims each plural-list entry and removes duplicate IDs. Singular
values merge with the corresponding plural list:

```http
GET /api/v1/admin/content-items?courseId=course-a&courseIds=course-b,course-a
```

This selects the same course scope as `courseIds=course-a,course-b`. Singular
parameters take one ID; use plural parameters for lists. Omit empty selections
instead of sending an empty string or a comma with no ID on one side.

### All hierarchy selections combine with OR

IDs within a level and selections across different levels form one union.
For example:

```http
GET /api/v1/admin/content-items?courseIds=course-a&sectionIds=section-b
```

This returns all content in course A's subtree **plus** content directly attached
to section B, even if section B belongs to a different course. If section B is
already within course A, its items appear only once.

Adding a narrower hierarchy selection does not narrow an ancestor selection.
To show only section B's content, send `sectionIds=section-b` and omit broader
hierarchy filters. Dependent pickers may use a course selection to load chapter
options without also sending that course as a content-list filter.

Unknown IDs match nothing and do not produce 404. A mixture of known and unknown
IDs still returns matches for the known IDs. Omitting every hierarchy parameter
lists content across all placements, subject to the remaining filters.

## Other filters and pagination

| Parameter | Values | Default / behavior |
| --- | --- | --- |
| `status` | `DRAFT`, `PUBLISHED`, `ARCHIVED` | Omitted: all statuses except `ARCHIVED` |
| `type` | `TEXT`, `EXTERNAL_LINK`, `VIDEO`, `PDF`, `IMAGE`, `DOCUMENT`, `DOWNLOADABLE_FILE` | Omitted: any type |
| `accessType` | `PUBLIC`, `FREE`, `PAID`, `INHERIT` | Matches the item's stored access type, not inherited effective access |
| `q` | Trimmed string, 1–120 characters | Arabic-normalized, case-insensitive search across item title, description, and text body |
| `page` | Integer, at least 1 | `1` |
| `limit` | Integer, 1–100 | `20` |

These filters combine with **AND** around the complete hierarchy union:

```text
(matches any selected hierarchy target or its descendants)
AND status condition
AND type condition, if supplied
AND stored accessType condition, if supplied
AND search condition, if supplied
```

```http
GET /api/v1/admin/content-items?courseIds=course-a,course-b&sectionIds=section-c&type=VIDEO&status=PUBLISHED&accessType=FREE&page=1&limit=20
```

Every returned item must be a published video with stored `FREE` access and match
at least one selected hierarchy scope. Search matches the content item's fields,
not course/chapter/lesson/section names. All normalized search terms must match.
Omit `q` when the search box is blank; blank or non-searchable text such as `!!!`
is rejected.

Results are ordered by placement `sortOrder` ascending, then content-item `id`
ascending. The order applies across the entire union; items are not grouped by
course or hierarchy depth. Sort orders can repeat across different direct parents.
There is no client-selected sort parameter.

## Response

The response remains `{ data, meta }` with offset pagination. It does not use the
student catalog's `pageInfo` or cursors. This example shows one section-attached
item that could be returned by a course filter:

```json
{
  "data": [
    {
      "id": "item-1",
      "type": "TEXT",
      "title": "Lesson notes",
      "description": null,
      "textBody": "Revision notes",
      "externalUrl": null,
      "accessType": "FREE",
      "estimatedDuration": null,
      "status": "PUBLISHED",
      "placement": {
        "id": "placement-1",
        "courseId": null,
        "courseName": null,
        "chapterId": null,
        "chapterName": null,
        "lessonId": null,
        "lessonName": null,
        "sectionId": "section-1",
        "sectionName": "Revision",
        "sortOrder": 1
      },
      "createdAt": "2026-10-16T12:00:00.000Z",
      "updatedAt": "2026-10-16T12:00:00.000Z",
      "publishedAt": "2026-10-16T12:00:00.000Z",
      "archivedAt": null,
      "primaryAssetId": null,
      "primaryAsset": null
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`meta.total` counts distinct matching items across the full union before
pagination. `totalPages` is `ceil(total / limit)` and is zero for no matches.
Overlapping selections do not duplicate items or inflate the count.

The placement describes the **direct attachment target**. A section-attached item
returned by `courseIds=course-a` still has `placement.courseId: null`; its section
ID and name identify where it is attached. Ancestor IDs used for filtering are
not exposed as breadcrumbs in this response. Use the frontend's hierarchy data
if the UI needs a full path. `primaryAsset`, when present, contains `id`,
`filename`, `kind`, `status`, `processingStatus`, and `processingProgress`.

## TypeScript request builder

Use a single comma-separated parameter per level to avoid serializer-specific
array conventions such as `courseIds[]` or `courseIds[0]`.

```ts
type ContentFilters = {
  courseIds?: string[];
  chapterIds?: string[];
  lessonIds?: string[];
  sectionIds?: string[];
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  type?: 'TEXT' | 'EXTERNAL_LINK' | 'VIDEO' | 'PDF' | 'IMAGE'
    | 'DOCUMENT' | 'DOWNLOADABLE_FILE';
  accessType?: 'PUBLIC' | 'FREE' | 'PAID' | 'INHERIT';
  q?: string;
  page?: number;
  limit?: number;
};

function contentItemsUrl(filters: ContentFilters): string {
  const params = new URLSearchParams();
  const levels = ['courseIds', 'chapterIds', 'lessonIds', 'sectionIds'] as const;

  for (const level of levels) {
    const ids = [...new Set(
      (filters[level] ?? []).map(id => id.trim()).filter(Boolean),
    )].sort();
    if (ids.length) params.set(level, ids.join(','));
  }

  if (filters.status) params.set('status', filters.status);
  if (filters.type) params.set('type', filters.type);
  if (filters.accessType) params.set('accessType', filters.accessType);
  const q = filters.q?.trim();
  if (q) params.set('q', q);
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 20));

  return `/api/v1/admin/content-items?${params.toString()}`;
}

async function loadContentItems(
  filters: ContentFilters,
  accessToken: string,
  signal?: AbortSignal,
) {
  const response = await fetch(contentItemsUrl(filters), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) throw new Error(`Content list failed: ${response.status}`);
  return response.json(); // { data: ContentItemSummary[], meta: PaginationMeta }
}
```

The builder removes blank UI selections; the API itself rejects blank entries in
supplied plural lists. Keep `page` and `limit` within the documented bounds.
Use your application's existing API error handling around this example.

Reset `page` to 1 whenever hierarchy selections, search, status, type, access
type, or page size change. Include all those values and the page in the query
cache key. Debounce search input and cancel superseded requests, or otherwise
ignore their responses, so older results cannot replace a newer selection.

After a move, invalidate affected content-list queries: the item will match the
new ancestor scopes and stop matching the old ones. Refresh after archive,
restore, or edits that change list membership or displayed fields as well.

## Validation and error handling

| Request | Result |
| --- | --- |
| `courseIds=a,b,a` | Accepted; duplicate IDs are removed |
| Repeated `courseIds=a&courseIds=b` | Accepted; lists are merged |
| `courseId=a&sectionId=b` | Accepted; scopes combine with OR |
| `courseIds=` or whitespace-only entries | 400 |
| `courseIds=a,`, `courseIds=,a`, or `courseIds=a,,b` | 400 |
| Unknown query parameters | 400 |
| Invalid enum, `page=0`, or `limit=101` | 400 |
| Only unknown hierarchy IDs | 200 with empty `data` and `meta.total: 0` |
| No matching content | 200 with empty `data` |

Use plural parameters without bracket notation. Show an empty state for a valid
request with no results; treat validation failures separately from empty results.

## Updating existing screens

Existing singular parameter names still work, but their scope has changed:
`courseId`, `chapterId`, and `lessonId` now include descendant content. Remove
client validation that prohibits combining hierarchy filters and explain union
behavior in multi-select controls.

For a view that needs only content directly attached to one target, compare the
corresponding `placement.*Id` on returned rows. This endpoint has no direct-only
query flag. Filtering one paginated response locally does not produce a complete
direct-only list or accurate direct-only totals; a complete set requires fetching
all relevant pages, or a separate backend capability.

Do not feed a mixed or filtered page into the reorder endpoint. Reordering still
targets exactly one direct parent and requires the complete sibling set, including
archived items. See the [reorder integration guide](reorder-api-integration-guide.md).

## Frontend verification

- Select two courses and verify content from both subtrees appears.
- Select a course plus one of its sections and verify no duplicate rows or counts.
- Select a course plus an unrelated section and verify both scopes appear.
- Apply type, status, access type, and search filters to the union and verify each
  row satisfies all of them.
- Clear all hierarchy selections and verify their query parameters are omitted.
- Change a filter while on a later page and verify the next request uses page 1.
- Verify section-attached results display the section name even when selected via
  a course filter and the response's direct course ID is null.
- Move an item across branches and verify refreshed old/new scopes update.
- Verify empty, validation-error, unauthenticated, and forbidden states separately.

## Contract sources

- [Controller and authorization](../src/modules/content-items/content-items.controller.ts)
- [Query parameters and normalization](../src/modules/content-items/dto/query-content-item.dto.ts)
- [Filtering, ordering, and response mapping](../src/modules/content-items/content-items.service.ts)
- [Response DTOs](../src/common/dto/api-response.dto.ts)
- [Pagination contract](../src/common/dto/pagination-query.dto.ts)
- [Hierarchy filter end-to-end tests](../test/content-items.e2e-spec.ts)
- [Query validation tests](../src/modules/content-items/dto/query-content-item.dto.spec.ts)
