# Commit 2ea6f731e724bb1d8ac10e09711feb1d41c6d595 — Local API Test Report

**Result:** Passed, with two findings documented below.  
**Date:** 2026-09-28  
**Deployment:** local Docker Compose project `shaheen-test2ea6`  
**Target source:** detached worktree at the requested commit  
**API:** http://localhost:3000/api/v1  
**PDF fixture:** example-questions/test-2027.pdf (630,024 bytes)  
**Focused automated tests:** 8 suites / 130 tests passed  
**Live trace:** 56 HTTP/storage requests

The complete redacted request/response transcript, including all response
correlation IDs and generated IDs, is
[2ea6f73-live-api.json](./2ea6f73-live-api.json). It redacts tokens,
passwords, signed URLs, provider raw responses, and retained source text.

## Scope

- PDF-backed v7 question extraction
- Answerless extracted drafts
- Admin-verified answers for explanation generation
- Human editing of all six explanation sections
- Applying verified answers and explanations
- Publishing a question with an advisory-stale explanation

## Deployment and automated verification

| Check | Result |
|---|---|
| API readiness | 200; database and Redis reported up |
| Compose PostgreSQL / Redis / API / worker | Healthy |
| Exact-commit image build | Passed |
| Focused Jest suites | 8 passed, 130 tests passed |
| Live API and storage requests | 56 recorded |

Executed suites: question-import.service, question-import-v7.worker,
openrouter-question-import.client, question-ai-explanation.dto,
question-ai-explanation.client, question-ai-explanations.service,
question-extracted-draft, and question-publication-staleness.

## Full API inventory

The following table accounts for every live request. Exact JSON bodies and
responses are in the companion JSON transcript.

| Calls | API | Request | Response |
|---:|---|---|---|
| 3 | POST /auth/admins/login | Super-admin credentials | 201; bearer token (redacted) |
| 1 | POST /admin/academic-grades | Localized title, unique slug | 201; grade created |
| 1 | POST /admin/subjects | Title, slug, grade ID | 201; subject created |
| 1 | POST /admin/courses | Title, slug, subject ID, PUBLIC access | 201; course created |
| 1 | POST /admin/chapters | Title, slug, course ID | 201; chapter created |
| 4 | POST publish hierarchy endpoints | No body | 201; grade, subject, course, chapter published |
| 1 | POST /admin/question-banks/sources | PLATFORM source and localized title | 201; source created |
| 1 | POST /admin/question-banks | Subject ID, title, description | 201; bank created |
| 2 | POST publish source/bank endpoints | No body | 201; source and bank published |
| 1 | POST /admin/assets/upload?kind=PDF | Multipart test-2027.pdf | 201; asset plus signed PUT request |
| 1 | Signed object-storage PUT | 630,024-byte PDF, application/pdf | 200 |
| 1 | POST /admin/assets/:id/complete | No body | 201; PDF asset READY |
| 1 | POST /admin/ai/question-imports | Target IDs, chapter placement, PDF asset ID | 201; QUEUED import |
| 17 | GET /admin/ai/question-imports/:id | No body; polling | 200 on every poll; terminal AWAITING_REVIEW |
| 1 | GET /admin/ai/question-imports | page=1, limit=100 | 200; import listed |
| 1 | GET /admin/ai/question-imports/:id/source-text | No body | 200; two retained PDF pages |
| 1 | GET /admin/ai/question-imports/:id/items | page=1, limit=100 | 200; 15 candidates |
| 1 | GET /admin/ai/question-imports/:id/media | No body | 200; six visual regions |
| 2 | POST /admin/ai/question-imports/:id/items/:itemId/accept | Invalid then answerless candidate | 400, then 201 |
| 4 | GET /admin/questions/:questionId | No body | 200; draft, persisted answer, stale state, published state |
| 3 | POST /admin/questions/:questionId/ai/re-answer | Missing answer, legacy mode, valid verified answer | 400, 400, 201 |
| 2 | POST /admin/questions/:questionId/ai/re-answer/:runId/apply | Invalid editing flags, valid apply | 400, then 201 |
| 1 | PATCH /admin/questions/:questionId | Changed question body | 200 |
| 1 | POST /admin/questions/bulk-publish | One question ID | 201; publishedIds contains question |
| 1 | GET /admin/questions/:questionId/ai/re-answer | No body | 200; run listed |
| 1 | GET /admin/questions/:questionId/ai/re-answer/:runId | No body | 200; APPLIED run |
| 1 | POST /admin/questions/:questionId/ai/re-answer/:runId/reject | Note on already-applied run | 409; only pending runs rejectable |

## PDF import details

### Import creation

Request:

```json
{
  "bankId": "<published bank>",
  "sourceId": "<published source>",
  "courseId": "<published course>",
  "placements": [{ "chapterId": "<published chapter>" }],
  "sourceAssetId": "<READY PDF asset>"
}
```

Response: HTTP 201 with import ID cmuks9qxk004dr0011wbs9epb,
inputType ASSET, schemaVersion question-import-v7, and status QUEUED.

### Worker progression

| Polls | State | Result |
|---|---|---|
| 1 | QUEUED | Accepted for worker processing |
| 2–7 | TRANSCRIBING | PDF pages created and transcribed |
| 8–9 | SEGMENTING | Question boundaries identified |
| 10–16 | GENERATING | 15 chunks/candidates generated |
| 17 | AWAITING_REVIEW | 15 completed chunks and 15 review items |

The final import review APIs returned two retained pages, 15 candidates, and
six visual media regions.

### Answerless acceptance

Invalid request:

```json
{
  "candidate": {
    "type": "SINGLE_CHOICE",
    "body": "Forbidden answer candidate",
    "options": [{ "body": "A" }, { "body": "B" }],
    "selectedOptionIndexes": [0]
  }
}
```

Response: HTTP 400, code
BAD_REQUEST.EXTRACTED_DRAFTS_CANNOT_INCLUDE_SELECTEDOPTIONINDEXES.

Accepted request:

```json
{
  "candidate": {
    "type": "SINGLE_CHOICE",
    "body": "Which statement is verified by the reviewer?",
    "options": [
      { "body": "Verified option" },
      { "body": "Other option" }
    ]
  },
  "note": "Accepted as an answerless draft for commit verification."
}
```

Response: HTTP 201 with question ID cmuksbhdv004hr001pn1azndh and item status
CREATED.

Follow-up GET response verified the question was DRAFT, had
answerOrigin null, acceptedAnswers null, gradingRubric null, and both options
had isCorrect false.

## Verified-answer explanation details

| Test | Request | Response |
|---|---|---|
| Missing verified answer | empty object | 400; suppliedAnswer required |
| Legacy inference contract | mode INFER plus selectedOptionIndexes | 400; mode is not allowed |
| Valid generation | suppliedAnswer selectedOptionIndexes [0], context string | 201; PENDING_REVIEW |
| Invalid edited apply | applyAnswer true, applyExplanation false, six sections | 400; edited explanation requires applyExplanation true |
| Valid edited apply | both flags true, complete six-section object, note | 201 |
| Read run list | no body | 200 |
| Read applied run | no body | 200; APPLIED |
| Reject applied run | reviewer note | 409; only pending runs may be rejected |

The valid generation response retained the supplied answer exactly:

```json
{
  "suppliedAnswer": {
    "selectedOptionIndexes": [0],
    "acceptedAnswers": null,
    "gradingRubric": null
  },
  "proposedAnswer": {
    "selectedOptionIndexes": [0],
    "acceptedAnswers": null,
    "gradingRubric": null
  }
}
```

After the valid apply, a GET showed the selected option correct,
answerOrigin HUMAN_REVIEWED, and structuredExplanation origin HUMAN with no
AI model retained.

## Staleness and publication details

A question-body PATCH returned 200. The following GET returned a populated
structuredExplanation.staleAt value.

Bulk-publication request:

```json
{
  "questionIds": ["cmuksbhdv004hr001pn1azndh"]
}
```

Response:

```json
{
  "publishedIds": ["cmuksbhdv004hr001pn1azndh"],
  "failed": []
}
```

The final GET returned status PUBLISHED while retaining the advisory staleAt
timestamp. This confirms stale explanations no longer block bulk publication.

## Findings

### 1. Apply response is stale

**Severity:** Medium; client response consistency.

POST /admin/questions/:questionId/ai/re-answer/:runId/apply returned HTTP 201,
but its response body still represented the pre-apply question:

```json
{
  "answerOrigin": null,
  "options": [
    { "body": "Verified option", "isCorrect": false },
    { "body": "Other option", "isCorrect": false }
  ]
}
```

The immediate GET returned the persisted state:

```json
{
  "answerOrigin": "HUMAN_REVIEWED",
  "options": [
    { "body": "Verified option", "isCorrect": true },
    { "body": "Other option", "isCorrect": false }
  ],
  "structuredExplanation": { "origin": "HUMAN" }
}
```

The apply handler appears to return the question loaded before its transactional
updates. Clients should refresh after apply until the endpoint re-reads and
returns the final question.

### 2. Local refresh-session configuration

**Severity:** Test-environment configuration issue, not a commit regression.

The copied local environment used NODE_ENV=production and COOKIE_SECURE=true.
The repository's existing auth journey logged in, then POST /auth/refresh
returned 401 over plain HTTP localhost because the Secure cookie is not sent
over HTTP. Use development settings with COOKIE_SECURE=false, or HTTPS, for
browser-style local auth testing.

## Retained deployment

The isolated stack remains available for inspection:

```text
Project: shaheen-test2ea6
API:     http://localhost:3000
```
