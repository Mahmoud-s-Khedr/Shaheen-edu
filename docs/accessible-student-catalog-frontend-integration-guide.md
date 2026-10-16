# Accessible student catalog: frontend integration guide

This guide covers the new flat lists of lessons and sections accessible to the
signed-in student. Use them for “My lessons”, “My sections”, search, and completion
filters across the student's grade.

The contract below reflects the current working-tree implementation. It does not
confirm deployment to a server. IDs, titles, and cursors in examples are illustrative.

## Endpoints and authentication

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/v1/student/catalog/lessons` | Accessible lessons across the student's grade |
| GET | `/api/v1/student/catalog/sections` | Accessible sections across the student's grade |

Send `Authorization: Bearer <student-access-token>` on every request. Both routes
require a student account, including when requesting `PUBLIC` content. The backend
resolves the grade from the student's profile; do not send a grade or student ID.

Only published nodes with published ancestors are returned. Access is resolved
using the existing inheritance and active course/chapter entitlement rules.
Expired, future, revoked, or inactive entitlements do not grant access. Explicit
public/free access on a descendant can override paid ancestry. A chapter grant
does not unlock sibling chapters.

These endpoints exclude `LOCKED` and `PURCHASABLE` items. For the existing
hierarchical browsing and delivery APIs, see [Student content and catalog API
guide](student-content-catalog-api-guide.md).

## Query parameters

All parameters are optional. Unknown parameters are rejected with HTTP 400.

| Parameter | Accepted value | Behavior |
| --- | --- | --- |
| `subjectId` | Nonempty string | Restrict to one subject |
| `courseId` | Nonempty string | Restrict to one course |
| `chapterIds` | Comma-separated nonempty IDs | Match any listed chapter |
| `lessonIds` | Comma-separated nonempty IDs | **Sections only**; match any listed lesson |
| `accessState` | `PUBLIC`, `FREE`, or `ENTITLED` | Match the resolved access state |
| `isCompleted` | Exact string `true` or `false` | Filter by derived completion |
| `q` | Trimmed text, 1–120 characters | Arabic-normalized, case-insensitive search on the requested node |
| `limit` | Integer, 1–100 | Page size; default `20` |
| `cursor` | Token from `pageInfo.nextCursor` | Continue the same result set |

Separate filters combine with **AND**. IDs within a list combine with **OR**.
Comma-separated strings are trimmed, deduplicated, and sorted by the backend.
Serialize lists as one comma-separated parameter, rather than repeated keys or
bracket notation. Omit an empty filter instead of sending an empty string.

Search applies to the requested lesson or section, not its breadcrumb titles.
All normalized search terms must match. Arabic forms such as `إسلام` and `اسلام`
can match. Blank queries and queries that normalize to no searchable text, such
as `!!!`, are rejected. There is no `search` alias on these endpoints.

Examples:

```http
GET /api/v1/student/catalog/lessons?subjectId=subject-1&isCompleted=false&limit=20
GET /api/v1/student/catalog/sections?chapterIds=chapter-1,chapter-2&lessonIds=lesson-1,lesson-2
GET /api/v1/student/catalog/lessons?accessState=ENTITLED
```

Use `URLSearchParams` to encode search text and cursor values. Conflicting
hierarchy filters or unknown filter IDs produce an empty list, not a 404.
`lessonIds` on the lessons endpoint, `accessState=LOCKED`, `isCompleted=1`, and
lists containing empty entries such as `chapterIds=a,,b` produce HTTP 400.

## Response contract

Both endpoints return HTTP 200 with `{ data, pageInfo }`. There is no top-level
`parent`, `meta`, total count, or page number. Each item carries its own breadcrumb.

```ts
type CatalogNode = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  coverAssetId: string | null;
  coverAssetName: string | null;
};

type CatalogAccess = (
  | { state: 'PUBLIC' | 'FREE' }
  | {
      state: 'ENTITLED';
      entitlementId: string;
      expiresAt: string | null; // ISO timestamp; null means no expiry
    }
) & {
  price?: { amountMinor: number; currency: string };
};

type AccessibleNode = CatalogNode & {
  access: CatalogAccess;
  isLocked: false;
  isCompleted: boolean;
};

type AccessibleLesson = AccessibleNode & {
  hasChildren: boolean; // Whether the lesson has published sections
  breadcrumb: {
    subject: CatalogNode;
    course: CatalogNode;
    chapter: CatalogNode;
  };
};

type AccessibleSection = AccessibleNode & {
  breadcrumb: {
    subject: CatalogNode;
    course: CatalogNode;
    chapter: CatalogNode;
    lesson: CatalogNode;
  };
};

type CatalogPage<T> = {
  data: T[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};
```

Lesson items include `hasChildren`; section items currently omit it. Breadcrumbs
contain basic node metadata, without access or completion state. Titles are
strings, not localized `{ ar, en }` objects. Cover fields are metadata, not
download URLs; use the existing cover asset flow when rendering images.

An active entitlement takes precedence in the access resolver, so an entitled
student can receive `ENTITLED` even for a node whose effective access is public
or free. Render the resolved state returned by the server. Optional pricing can
appear on an accessible node; it does not mean the student must purchase it.

Completion is derived from published descendant content placements and the
student's content progress records. A node with no published descendant content
items is `isCompleted: false`. These endpoints do not return a completion
percentage or change completion state.

### Example lesson response

```json
{
  "data": [
    {
      "id": "lesson-1",
      "title": "قوانين نيوتن",
      "slug": "newtons-laws",
      "description": null,
      "sortOrder": 1,
      "coverAssetId": null,
      "coverAssetName": null,
      "hasChildren": true,
      "access": {
        "state": "ENTITLED",
        "entitlementId": "entitlement-1",
        "expiresAt": null
      },
      "isLocked": false,
      "isCompleted": false,
      "breadcrumb": {
        "subject": {
          "id": "subject-1",
          "title": "الفيزياء",
          "slug": "physics",
          "description": null,
          "sortOrder": 1,
          "coverAssetId": null,
          "coverAssetName": null
        },
        "course": {
          "id": "course-1",
          "title": "الميكانيكا",
          "slug": "mechanics",
          "description": null,
          "sortOrder": 1,
          "coverAssetId": null,
          "coverAssetName": null
        },
        "chapter": {
          "id": "chapter-1",
          "title": "الحركة",
          "slug": "motion",
          "description": null,
          "sortOrder": 1,
          "coverAssetId": null,
          "coverAssetName": null
        }
      }
    }
  ],
  "pageInfo": {
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

The sections response uses the same envelope and basic item fields. Its breadcrumb
adds `lesson` with the same fields as the other breadcrumb nodes.

An empty result is a successful response:

```json
{
  "data": [],
  "pageInfo": { "hasNextPage": false, "nextCursor": null }
}
```

## Pagination and frontend state

Results are ordered globally by the requested node's `sortOrder` ascending, then
ID ascending. They are not grouped or ordered by the ancestor hierarchy. Preserve
the server order when appending pages.

1. Fetch the first page without `cursor`.
2. Render `data`, including the breadcrumb for context.
3. If `hasNextPage` is true, request another page with `nextCursor` and the same
   endpoint and filters. Treat the cursor as opaque.
4. Append results and stop when `hasNextPage` is false.

Cursors are bound to the student, grade, endpoint, and filters. Reset the list and
cursor when any filter, selected resource, or student changes. Reordering the
same chapter/lesson ID list is allowed; changing `limit` is also allowed. A cursor
from lessons cannot be reused for sections. There is no offset/page parameter.

Debounce search and cancel or discard stale requests after a filter change. Keep
student identity, resource, and filters in the query cache key. Refresh from the
first page after progress, grade, or entitlement changes so badges and membership
are recalculated. Pagination is not a snapshot of changing server data.

## TypeScript request example

This helper uses the types above. `apiOrigin` is the configured API origin without
a path, for example `https://api.example.com`.

```ts
type CatalogFilters = {
  subjectId?: string;
  courseId?: string;
  chapterIds?: string[];
  accessState?: 'PUBLIC' | 'FREE' | 'ENTITLED';
  isCompleted?: boolean;
  q?: string;
  limit?: number;
  cursor?: string;
};

type CatalogRequest =
  | { resource: 'lessons'; filters: CatalogFilters }
  | {
      resource: 'sections';
      filters: CatalogFilters & { lessonIds?: string[] };
    };

async function fetchAccessibleCatalog(
  apiOrigin: string,
  token: string,
  request: CatalogRequest,
  signal?: AbortSignal,
): Promise<CatalogPage<AccessibleLesson | AccessibleSection>> {
  const { resource, filters } = request;
  const url = new URL(`/api/v1/student/catalog/${resource}`, apiOrigin);

  for (const key of ['subjectId', 'courseId', 'accessState', 'cursor'] as const) {
    const value = filters[key];
    if (value) url.searchParams.set(key, value);
  }
  if (filters.chapterIds?.length) {
    url.searchParams.set('chapterIds', filters.chapterIds.join(','));
  }
  if (request.resource === 'sections' && request.filters.lessonIds?.length) {
    url.searchParams.set('lessonIds', request.filters.lessonIds.join(','));
  }
  if (filters.isCompleted !== undefined) {
    url.searchParams.set('isCompleted', String(filters.isCompleted));
  }
  if (filters.q?.trim()) url.searchParams.set('q', filters.q.trim());
  if (filters.limit !== undefined) {
    url.searchParams.set('limit', String(filters.limit));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    // Route through the app's shared API error/auth handler in production.
    throw new Error(`Catalog request failed (${response.status})`);
  }
  return response.json();
}
```

Check `isCompleted !== undefined` when serializing: a truthiness check would drop
the valid `false` filter. Use the returned cursor verbatim with `URLSearchParams`;
do not pre-encode it.

## Error handling

| Status | Meaning | Frontend action |
| --- | --- | --- |
| 400 | Invalid/unknown parameter, unsupported value, or invalid/mismatched cursor | Check filter serialization; for a stale cursor, restart pagination without it |
| 401 | Missing or invalid student authentication | Use the application's existing token refresh/login flow |
| 403 | Account is not allowed to use student routes | Show the existing access-denied state |
| 409 | Student has no valid published academic grade | Show a grade/profile configuration state; retry after it is resolved |

Handle other failures through the shared API error UI. Do not turn a failed
request into an empty-results state. The existing global API error format applies.

## Integration checks

- Initial lessons and sections requests render cards and the correct breadcrumbs.
- Completion offers three states: all (omit the parameter), complete, incomplete.
- Search/filter changes clear previous pages and ignore stale responses.
- Load more uses the server cursor and stops at `hasNextPage: false`.
- Empty results, authentication errors, and missing-grade errors have distinct UI states.
- Section requests can filter by multiple lesson IDs; lesson requests omit `lessonIds`.
- Opening a lesson can use `/api/v1/student/catalog/lessons/{lessonId}/sections`.
- Opening a section can use `/api/v1/student/catalog/sections/{sectionId}/content-items`
  for directly placed content previews; use the existing content delivery APIs to
  open individual items. A lesson may also have directly placed content available
  at `/api/v1/student/catalog/lessons/{lessonId}/content-items`.

Backend contract coverage is in `test/accessible-student-catalog.e2e-spec.ts` and
`test/swagger.e2e-spec.ts`. This documentation change does not assert those tests
have been run.
