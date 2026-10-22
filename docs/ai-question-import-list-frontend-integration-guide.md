# AI question import list: frontend integration guide

This guide covers commit `267b868ce95829d3b3ea34837fb24ebfe11ce369`
(`feat: implement filtering and pagination for AI question imports with comprehensive query validation`).
Use it to integrate search, hierarchy filters, status selection, date ranges,
and error filtering into the administrator's AI import history screen.

The contract below is based on the repository implementation. Example IDs are
illustrative; verify that the backend commit is deployed before enabling the
new controls. This commit introduces no database migrations or environment variables.

## Endpoint and access

```http
GET /api/v1/admin/ai/question-imports
Authorization: Bearer <admin-access-token>
```

Requires `ADMIN` or `SUPER_ADMIN`. Missing credentials return HTTP 401;
unsupported roles return HTTP 403.

The collection contains only top-level imports (`parentId: null`). Child imports
are excluded even if they independently match the filters. Omitting filters lists
top-level imports across administrators; use `createdById` for a particular submitter.

## Query parameters

Every parameter is optional. All supplied filters combine with **AND**;
the values within `statuses` combine with **OR**.

| Parameter | Accepted value | Behavior |
| --- | --- | --- |
| `page` | Integer >= 1 | One-based page; defaults to `1` |
| `limit` | Integer from 1 to 100 | Page size; defaults to `20` |
| `q` | Trimmed string, 1–120 characters | Case-insensitive literal substring search |
| `status` | One supported status | Mutually exclusive with `statuses` |
| `statuses` | Comma-separated supported statuses | Matches any listed status; entries are trimmed |
| `courseId` | Nonblank ID | Matches the import's target course at every placement depth |
| `chapterId` | Nonblank ID | Matches direct chapter placements and descendant lesson/section placements |
| `lessonId` | Nonblank ID | Matches direct lesson placements and descendant section placements |
| `sectionId` | Nonblank ID | Matches an exact section placement |
| `bankId` | Nonblank ID | Exact import question bank ID |
| `sourceId` | Nonblank ID | Exact import question source ID |
| `createdById` | Nonblank administrator ID | Exact submitting administrator |
| `inputType` | `RAW_TEXT` or `ASSET` | PDF/TXT uploads use `ASSET`, not `PDF` or `TXT` |
| `createdFrom` | Calendar ISO timestamp with timezone | Inclusive lower bound on `createdAt` |
| `createdTo` | Calendar ISO timestamp with timezone | Exclusive upper bound on `createdAt` |
| `hasErrors` | Literal `true` or `false` | Matches the error condition or its inverse |

Supported statuses:

```text
QUEUED
EXTRACTING
TRANSCRIBING
SEGMENTING
AWAITING_REVIEW
GENERATING
COMPLETED
COMPLETED_WITH_ERRORS
FAILED
```

Use a single comma-separated `statuses` value for multi-select controls. Omit it
when no statuses are selected. Duplicate valid statuses are accepted and do not
duplicate results. Hierarchy and other ID filters each take one ID; plural ID
parameters are not supported by this endpoint.

### Search

`q` searches import ID, source asset `filename`, retained raw source text, and
normalized source text. It does not search bank names, course titles, or
administrator names. It uses literal substring matching: `%` and `_` are ordinary
characters, not wildcards. Do not assume Arabic spelling normalization or
token-based matching. The source text can match even though it is omitted from
list responses.

Omit `q` when the search box is blank. Sending `q=` or whitespace-only search
returns HTTP 400.

### Hierarchy matching

Filters use the import's saved placements and target course, so they work before
questions have been created. Archived hierarchy records remain searchable.

For a hierarchy `course-a > chapter-a > lesson-a > section-a`:

- `chapterId=chapter-a` includes imports placed at that chapter, its lessons,
  or its sections.
- `lessonId=lesson-a` includes imports placed at that lesson or its sections.
- `sectionId=section-a` includes imports placed at that exact section.
- An import placed only at the course does not match a chapter filter; an import
  placed only at a chapter does not match a lesson or section filter.

Combined chapter, lesson, and section filters must match **one saved placement**.
An import with separate placements at `chapter-a` and an unrelated `lesson-b`
does not match `chapterId=chapter-a&lessonId=lesson-b`. Unknown IDs or incompatible
hierarchy combinations produce HTTP 200 with an empty collection, not HTTP 404.

### Error filter

`hasErrors=true` matches an import if any of these is true:

- `status` is `FAILED` or `COMPLETED_WITH_ERRORS`.
- `failedItems > 0`.
- `invalidItems > 0`.

`hasErrors=false` requires the inverse of the entire condition. It does not mean
the import has completed: an in-progress import with zero failures can match.
Likewise, `status=COMPLETED` can match `hasErrors=true` if an error counter is positive.
`status=FAILED&hasErrors=false` is valid but matches nothing.

Use a three-state control: all imports (omit the parameter), with errors (`true`),
and without errors (`false`). Preserve explicit `false` during serialization.

### Date ranges

The interval is `createdFrom <= createdAt < createdTo`. Either bound may be used
alone. If both are present, `createdFrom` must precede `createdTo` after timezone
conversion; equal instants are invalid even when their offsets differ.

Accepted examples are `2026-10-19T00:00:00Z`, `2026-10-19T00:00:00.123Z`, and
`2026-10-19T02:00:00+02:00`. Date-only strings, timestamps without timezones,
invalid calendar dates, ISO week dates, and compact calendar dates are rejected.

For an inclusive date picker covering October 1 through October 19, convert
October 1's start of day and October 20's start of day in the intended reporting
timezone to timestamps. Send the latter as `createdTo`. Use timezone-aware date
handling for local reporting days; UTC midnight only represents UTC days.
`URLSearchParams` encodes the `+` in an offset as `%2B`, preventing it from being
interpreted as a space.

## Requests and response

```http
GET /api/v1/admin/ai/question-imports?courseId=course-a&chapterId=chapter-a&statuses=AWAITING_REVIEW,FAILED&page=1&limit=20
GET /api/v1/admin/ai/question-imports?createdById=admin-a&hasErrors=true&createdFrom=2026-10-01T00:00:00Z&createdTo=2026-10-20T00:00:00Z
GET /api/v1/admin/ai/question-imports?bankId=bank-a&sourceId=source-a&inputType=ASSET&q=biology
```

The response retains `{ data, meta }`. Each `data` entry is an import summary,
including fields such as `id`, `status`, `inputType`, `courseId`, `placements`,
`createdById`, `createdAt`, and the progress/error counters. `rawText`,
`normalizedText`, and `extractionMetadata` are omitted. Source asset information
is not expanded into a nested object by this list endpoint.

An empty result has this complete shape:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

`meta.total` counts all matching top-level imports before pagination;
`totalPages` is `ceil(total / limit)`. A page beyond the last page returns an
empty `data` array while preserving the matching total and requested page.

Results are ordered by `createdAt DESC`, then `id ASC` for timestamp ties.
There is no client-selected sort parameter. Counts and rows are read in one
repeatable-read transaction. Pagination uses offsets; new imports between
separate requests can still shift rows between pages.

## TypeScript integration example

```ts
type ImportStatus =
  | 'QUEUED' | 'EXTRACTING' | 'TRANSCRIBING' | 'SEGMENTING'
  | 'AWAITING_REVIEW' | 'GENERATING' | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS' | 'FAILED';

type ImportFilters = {
  page?: number;
  limit?: number;
  q?: string;
  statuses?: ImportStatus[];
  courseId?: string;
  chapterId?: string;
  lessonId?: string;
  sectionId?: string;
  bankId?: string;
  sourceId?: string;
  createdById?: string;
  inputType?: 'RAW_TEXT' | 'ASSET';
  createdFrom?: string;
  createdTo?: string;
  hasErrors?: boolean;
};

function questionImportsUrl(filters: ImportFilters): string {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    limit: String(filters.limit ?? 20),
  });
  const q = filters.q?.trim();
  if (q) params.set('q', q);

  // This client uses statuses for both single and multiple selections.
  const statuses = [...new Set(filters.statuses ?? [])].sort();
  if (statuses.length) params.set('statuses', statuses.join(','));

  const fields = [
    'courseId', 'chapterId', 'lessonId', 'sectionId', 'bankId', 'sourceId',
    'createdById', 'inputType', 'createdFrom', 'createdTo',
  ] as const;
  for (const field of fields) {
    const value = filters[field]?.trim();
    if (value) params.set(field, value);
  }
  if (filters.hasErrors !== undefined) {
    params.set('hasErrors', String(filters.hasErrors));
  }

  return `/api/v1/admin/ai/question-imports?${params.toString()}`;
}

async function loadQuestionImports(
  filters: ImportFilters,
  accessToken: string,
  signal?: AbortSignal,
) {
  const response = await fetch(questionImportsUrl(filters), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) {
    // Delegate validation and authentication errors to the app's API handler.
    throw new Error(`Import list failed: ${response.status}`);
  }
  return response.json(); // { data: ImportSummary[], meta: PaginationMeta }
}
```

Validate page bounds, search length, and date ranges before submitting. The builder
omits blank UI values; this does not make blank values valid at the API boundary.

Reset `page` to 1 whenever a filter or page size changes. Clear descendant
selections when a parent picker changes. Include all filters, page, and page size
in the query cache key. Debounce search and cancel or ignore superseded requests.
Refresh the active list after create, retry, or review actions, and while tracking
in-progress imports; changes to status or error counters can change membership.

## Validation and compatibility

| Request or condition | Result |
| --- | --- |
| `status=FAILED&statuses=FAILED` | 400; supply only one status parameter form |
| `statuses=`, `statuses=FAILED,`, or an unsupported status | 400 |
| Blank ID, blank search, or search longer than 120 characters | 400 |
| `inputType=PDF`, `hasErrors=1`, or `hasErrors=yes` | 400 |
| `page=0`, fractional page, or `limit=101` | 400 |
| Invalid timestamp or `createdFrom >= createdTo` | 400 |
| Unknown query parameter, including plural hierarchy ID names | 400 |
| Valid filters with no matches | 200 with empty `data` |
| Missing credentials / unsupported role | 401 / 403 |

Existing `page`, `limit`, and single `status` clients keep their parameter names
and response shape. Search now actually filters the collection; previously the
list query accepted `q` without using it. Strict enum validation replaces the
old list status handling, so remove invalid values and empty query parameters.

These filters apply only to the import collection. The candidate endpoint
`GET /api/v1/admin/ai/question-imports/{id}/items` retains its existing query DTO;
forwarding collection-only filters such as `bankId` to it returns HTTP 400.
Keep candidate-list and import-list request builders separate.

## Frontend verification

- Combine hierarchy, bank, source, submitter, input type, and search; confirm each
  result satisfies all selected filters.
- Select multiple statuses, including `TRANSCRIBING`; verify matching rows and totals.
- Check descendant placements, incompatible branches, unknown IDs, archived
  hierarchy records, and imports with no created questions.
- Verify all/with-errors/without-errors selections, including explicit `false`.
- Verify inclusive start and exclusive end boundaries, offset timestamps, and
  rejected equal or reversed date ranges.
- Check tied timestamps, multiple pages, a page beyond the end, and filter changes
  from a later page. Distinguish empty results from validation failures.
- Confirm child imports never appear and source text is absent from list rows.
- Exercise 400, 401, and 403 handling and confirm candidate listing still works
  with its existing query parameters.

## Contract sources

- [Collection query DTO](../src/modules/ai-question-import/dto/list-question-imports.dto.ts)
- [Filter predicate](../src/modules/ai-question-import/question-import-list.query.ts)
- [Controller and role requirements](../src/modules/ai-question-import/question-import.controller.ts)
- [Listing and summary mapping](../src/modules/ai-question-import/question-import.service.ts)
- [Pagination and search validation](../src/common/dto/pagination-query.dto.ts)
- [Collection filter end-to-end tests](../test/question-import-list-filters.e2e-spec.ts)
- [Query validation tests](../src/modules/ai-question-import/dto/list-question-imports.dto.spec.ts)
- [Detailed API reference](api-reference-detailed.md)
