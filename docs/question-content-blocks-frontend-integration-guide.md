# Question Content Blocks: Frontend Integration Guide

This document is the frontend contract for displaying and authoring structured
question content. It covers question stems, answer options, and reusable
question contexts.

All endpoints are relative to `/api/v1` and require:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

Authoring endpoints require `ADMIN` or `SUPER_ADMIN`. Practice and assessment
delivery endpoints require `STUDENT`.

## 1. Overview

A content block is one ordered piece of rich content. A block sequence is the
canonical renderable content for a question, option, or context. The legacy
`body` field remains in responses for search and older clients. Render a
nonempty `contentBlocks` sequence; fall back to `body` for legacy records with
no blocks.

Blocks occur in three places:

| Owner | Response path | Typical use |
| --- | --- | --- |
| Question | `question.contentBlocks` | Stem text, figures, tables, equations |
| Option | `question.options[].contentBlocks` | Mathematical or image answer options |
| Context | `question.contexts[].contentBlocks` | Shared reading passage, diagram, or data table |

Always sort by `sortOrder` ascending before rendering, even though API
responses are currently returned in that order.

## 2. Block contract

```ts
export type QuestionContentBlockType =
  | 'TEXT'
  | 'IMAGE'
  | 'ASSET'
  | 'TABLE'
  | 'EQUATION';

export interface TableData {
  /** Rectangular matrix: every row has the same number of cells. */
  cells: string[][];
  /** When true, cells[0] is rendered as the table header row. */
  headerRow: boolean;
}

export interface ContentBlock {
  id: string;
  type: QuestionContentBlockType;
  sortOrder: number;
  text?: string | null;
  assetId?: string | null;
  tableData?: TableData | null;
  latex?: string | null;
  mathml?: string | null;
  caption?: string | null;
  altText?: string | null;
  languageCode?: string | null;
  asset?: {
    id: string;
    kind: string | null;
    filename: string | null;
  } | null;
}
```

The meaningful fields depend on `type`:

| Type | Required request data | Rendering |
| --- | --- | --- |
| `TEXT` | Non-blank `text` | Render as escaped text / approved rich-text representation. |
| `IMAGE` | A ready image `assetId` | Request protected asset access, then render an image with `altText` and optional caption. |
| `ASSET` | A ready PDF, document, downloadable-file, or video `assetId` | Render an accessible download/open/play control. |
| `TABLE` | `tableData.cells` and boolean `tableData.headerRow` | Render a semantic HTML table. |
| `EQUATION` | At least one of `latex` or `mathml` | Render with the application's vetted math renderer. Prefer MathML when supported, otherwise LaTex. |

Do not infer an image or table from the `body` string. Use the typed block.

## 3. Authoring requests

### 3.1 Create a question with mixed content

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
      "chapterId": "chapter_123"
    }
  ],
  "contentBlocks": [
    {
      "type": "TEXT",
      "text": "Use the following table to answer the question."
    },
    {
      "type": "TABLE",
      "tableData": {
        "headerRow": true,
        "cells": [
          ["Element", "Atomic number"],
          ["Hydrogen", "1"],
          ["Helium", "2"]
        ]
      }
    },
    {
      "type": "TEXT",
      "text": "Which element has atomic number 2?"
    }
  ],
  "explanation": "Helium is listed with atomic number 2.",
  "maxPoints": 1
}
```

`contentBlocks` do not carry IDs or `sortOrder` in create requests. The server
assigns block IDs and sequential sort orders.

Do not also send `body` when authoring a structured sequence unless an extra
leading text block is intended: a supplied `body` is converted into a `TEXT`
block and placed before `contentBlocks`.

Example response (abridged):

```json
{
  "id": "question_123",
  "type": "SINGLE_CHOICE",
  "body": "Use the following table to answer the question.\n\nElement | Atomic number\nHydrogen | 1\nHelium | 2\n\nWhich element has atomic number 2?",
  "contentBlocks": [
    {
      "id": "block_1",
      "type": "TEXT",
      "sortOrder": 1,
      "text": "Use the following table to answer the question."
    },
    {
      "id": "block_2",
      "type": "TABLE",
      "sortOrder": 2,
      "tableData": {
        "headerRow": true,
        "cells": [
          ["Element", "Atomic number"],
          ["Hydrogen", "1"],
          ["Helium", "2"]
        ]
      }
    },
    {
      "id": "block_3",
      "type": "TEXT",
      "sortOrder": 3,
      "text": "Which element has atomic number 2?"
    }
  ],
  "status": "DRAFT"
}
```

### 3.2 Update a complete sequence

```http
PATCH /admin/questions/question_123
```

```json
{
  "contentBlocks": [
    {
      "type": "TEXT",
      "text": "Study the table."
    },
    {
      "type": "TABLE",
      "tableData": {
        "headerRow": true,
        "cells": [
          ["Planet", "Moons"],
          ["Earth", "1"],
          ["Mars", "2"]
        ]
      }
    }
  ]
}
```

`contentBlocks` is replacement data: the entire old sequence is deleted and
the submitted sequence becomes the new sequence. Retain unchanged blocks in
the frontend state and send them again. Do not submit block IDs or sort orders.

An explicit empty array clears the sequence:

```json
{ "contentBlocks": [] }
```

Use this only for an unfinished draft. A question without visible content
cannot pass the question submission/publishing checks.

For a question containing mixed content, `PATCH` with only `body` is rejected;
send the complete `contentBlocks` sequence instead.

### 3.3 Create an option with an equation

```http
POST /admin/questions/question_123/options
```

```json
{
  "contentBlocks": [
    {
      "type": "EQUATION",
      "latex": "x^2 + 2x + 1 = 0"
    }
  ],
  "isCorrect": false
}
```

Example response is the full updated question. The option shape is:

```json
{
  "id": "option_123",
  "body": "x^2 + 2x + 1 = 0",
  "sortOrder": 1,
  "isCorrect": false,
  "contentBlocks": [
    {
      "id": "option_block_1",
      "type": "EQUATION",
      "sortOrder": 1,
      "latex": "x^2 + 2x + 1 = 0"
    }
  ]
}
```

Use `PATCH /admin/questions/:questionId/options/:optionId` with a complete
replacement `contentBlocks` sequence to edit an option.

### 3.4 Create a reusable context

```http
POST /admin/questions/contexts
```

```json
{
  "type": "TABLE",
  "title": "Population data",
  "languageCode": "en",
  "contentBlocks": [
    {
      "type": "TEXT",
      "text": "Use this data for questions 1 through 3."
    },
    {
      "type": "TABLE",
      "tableData": {
        "headerRow": true,
        "cells": [
          ["Year", "Population (millions)"],
          ["2020", "102"],
          ["2025", "110"]
        ]
      }
    }
  ]
}
```

Attach its returned ID while creating or updating a question:

```json
{
  "contextIds": ["context_123"]
}
```

Contexts are shared. Updating a context changes the live context for all
authoring/practice users who see it; assessment generation copies a snapshot.

## 4. Student-delivery responses

### 4.1 Practice question response

```http
GET /student/practice/questions?courseId=course_123&page=1&limit=20
```

```json
{
  "data": [
    {
      "id": "question_123",
      "type": "SINGLE_CHOICE",
      "body": "Use the table to answer.",
      "contentBlocks": [
        {
          "id": "block_1",
          "type": "TABLE",
          "sortOrder": 1,
          "tableData": {
            "headerRow": true,
            "cells": [["Element", "Atomic number"], ["Helium", "2"]]
          },
          "text": null,
          "assetId": null,
          "latex": null,
          "mathml": null
        }
      ],
      "contexts": [],
      "options": [
        {
          "id": "option_1",
          "body": "Helium",
          "sortOrder": 1,
          "contentBlocks": [
            {
              "id": "option_block_1",
              "type": "TEXT",
              "sortOrder": 1,
              "text": "Helium"
            }
          ]
        }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

Student responses deliberately omit answer-key fields such as `isCorrect`.
They also return only safe asset metadata (`id`, `kind`, `filename`), never a
storage key or direct permanent file URL.

### 4.2 Assessment attempt response

```http
GET /student/assessments/assessment_123/attempts/current
```

```json
{
  "attemptId": "attempt_123",
  "status": "SUSPENDED",
  "mode": "EXAM",
  "questions": [
    {
      "id": "assessment_question_123",
      "type": "SINGLE_CHOICE",
      "contentBlocks": [
        {
          "id": "snapshot_block_1",
          "type": "TABLE",
          "sortOrder": 1,
          "tableData": {
            "headerRow": true,
            "cells": [["Element", "Atomic number"], ["Helium", "2"]]
          }
        }
      ],
      "contexts": [],
      "options": []
    }
  ]
}
```

Assessment IDs are snapshot IDs. Render their blocks exactly as practice
blocks, but use the assessment-specific asset-access endpoint below. Blocks,
options, and contexts are frozen when the assessment is generated, so later
edits to the authored question will not change an existing assessment.

## 5. Rendering implementation

Render the same component for question, option, and context sequences.

```tsx
function ContentBlocks({ blocks, languageCode }: {
  blocks: ContentBlock[];
  languageCode?: string | null;
}) {
  return (
    <div lang={languageCode ?? undefined}>
      {[...blocks]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((block) => <ContentBlockView key={block.id} block={block} />)}
    </div>
  );
}
```

### 5.1 Semantic table rendering

```tsx
function TableBlock({ data }: { data: TableData }) {
  const [firstRow, ...otherRows] = data.cells;
  const rows = data.headerRow ? otherRows : data.cells;

  return (
    <div className="question-table-scroll" role="region" aria-label="Question table" tabIndex={0}>
      <table className="question-table">
        {data.headerRow && (
          <thead>
            <tr>
              {firstRow.map((cell, index) => <th scope="col" key={index}>{cell}</th>)}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```css
.question-table-scroll { overflow-x: auto; max-width: 100%; }
.question-table { border-collapse: collapse; width: max-content; min-width: 100%; }
.question-table th, .question-table td { border: 1px solid #cbd5e1; padding: .5rem .75rem; text-align: start; }
.question-table th { background: #f8fafc; font-weight: 600; }
```

For Arabic content, place `dir="rtl"` on the containing question/context when
appropriate. Do not reverse the data array: preserve its stored reading order.

### 5.2 Security and accessibility rules

- Render `TEXT` and table cell values as text. Do not pass either through
  `dangerouslySetInnerHTML`.
- Use a vetted equation renderer. Do not evaluate LaTex, MathML, or any field
  as application code.
- Render image `altText`; if it is absent, use a caption or a deliberate empty
  alt only when the image is decorative.
- Keep tables horizontally scrollable on small screens; do not silently crop
  columns or transform data in a way that loses header relationships.
- Respect the user-selected text size and preserve native table semantics for
  screen readers.

## 6. Protected media access

Blocks expose asset metadata, not a usable public URL. Request access only
when an `IMAGE` or `ASSET` block needs to be opened or played.

Practice:

```http
GET /student/practice/questions/question_123/assets/asset_123/access
```

Assessment:

```http
GET /student/assessments/assessment_123/questions/assessment_question_123/assets/asset_123/access
```

The successful response is a short-lived protected-access or video-playback
payload. Treat it as ephemeral: do not persist it in the database, logs, or a
long-lived client cache. Refresh it after expiry by calling the same endpoint.

## 7. Client-side validation and server limits

Validate before sending for immediate editor feedback, but always display the
server validation error if the server rejects a request.

| Rule | Limit / requirement |
| --- | --- |
| Blocks per owner | Maximum 100 |
| Complete content payload | Maximum 250,000 UTF-8 bytes |
| Table rows | 1–50 |
| Table columns | 1–30 |
| Table shape | Nonempty rectangular string matrix |
| Table cell | Maximum 2,000 characters |
| Table header flag | Required boolean |
| Text | Nonblank for `TEXT` |
| Equation | `latex` or `mathml` required |
| Media | Asset must exist, be ready, and match the block type |
| Media duplicate | An asset can appear once in one owner’s block sequence |

For media blocks, upload/select the asset before adding the block. `IMAGE`
requires an image asset. `ASSET` supports PDF, document, downloadable-file,
or ready video assets.

## 8. Error handling

Typical error responses use this shape:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": { "ar": "...", "en": "Validation failed" },
  "details": [
    { "field": "contentBlocks", "message": "Table blocks require a rectangular cell matrix and headerRow" }
  ],
  "correlationId": "request_123"
}
```

Map validation failures to the relevant editor block. For `409`, preserve the
editor data and show the lifecycle or media-readiness error; common causes are
attempting to edit a published question or referencing a non-ready asset.

## 9. Recommended frontend data flow

```text
Asset upload/select (only for IMAGE or ASSET)
        ↓
Local block editor state without server IDs or sort orders
        ↓
POST/PATCH complete contentBlocks sequence
        ↓
Store returned canonical block IDs and sort orders
        ↓
Render blocks by type in authoring preview, practice, and assessments
        ↓
Request protected media URL only when a media block is used
```

The editor should keep a single ordered array per owner. Avoid separate text,
image, table, and equation arrays: that makes mixed-content ordering fragile.
