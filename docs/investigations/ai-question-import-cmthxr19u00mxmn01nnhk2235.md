# AI question-import review — `cmthxr19u00mxmn01nnhk2235`

Reviewed on 2026-09-02 against `https://api-edu.mydevtest.website` with the supplied `SUPER_ADMIN` account. This record intentionally excludes credentials, bearer tokens, signed URLs, and provider-encrypted reasoning data.

## Read-only request record

| Method | Path | Status | Material result |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/ai/question-imports/:id` | `200` | The batch is a root `RAW_TEXT` import, `sourceAssetId: null`, `parentId: null`, status `AWAITING_REVIEW`. |
| `GET` | `/api/v1/admin/ai/question-imports/:id/source-text` | `200` | 10,451 characters of normalized text; no PDF-page records. |
| `GET` | `/api/v1/admin/ai/question-imports/:id/items?page=1&limit=100` | `200` | All 25 candidates returned. All say visual media is not required and none has a media assignment. |
| `GET` | `/api/v1/admin/ai/question-imports/:id/media` | `409` | `CONFLICT.VISUAL_MEDIA_IS_AVAILABLE_ONLY_FOR_ROOT_PDF_IMPORTS`. |
| `GET` | `/api/v1/admin/ai/question-imports?page=1&limit=100&status=AWAITING_REVIEW` | `200` | The batch is the single matching root import and retains `RAW_TEXT` / no source asset. |

These are all GET endpoints exposed by the AI-question-import API for this import: list, detail, source text, candidates, and PDF visual media. There is no per-candidate GET endpoint; candidate data is returned by the items collection endpoint.

## Sanitized response facts

```json
{
  "import": {
    "inputType": "RAW_TEXT",
    "sourceAssetId": null,
    "parentId": null,
    "status": "AWAITING_REVIEW",
    "totalItems": 25,
    "createdQuestions": 7,
    "invalidItems": 18,
    "failedItems": 0
  },
  "candidateVisuals": {
    "NOT_REQUIRED": 25,
    "requirements": { "NONE": 25 },
    "mediaAssignments": 0
  },
  "mediaEndpoint": {
    "status": 409,
    "code": "CONFLICT.VISUAL_MEDIA_IS_AVAILABLE_ONLY_FOR_ROOT_PDF_IMPORTS"
  }
}
```

## Finding

This is not a media conflict that an administrator can review. The batch was created from pasted/raw text, not an uploaded PDF, so it has no original PDF, no page images, no detected regions, and no crop candidates. The apparent `page: 5` on Candidate 21 is a logical page label inferred by the AI from the text; it is not a physical PDF page.

The `409` is technically consistent with the existing backend guard, but it is the wrong admin experience. The UI opens the PDF-visuals workflow and calls the PDF-only `media` route for a raw-text import. The response then looks like an unresolved media problem even though every candidate explicitly has `visualState: NOT_REQUIRED`.

The 18 review-required candidates are a separate content-review state. Seventeen carry `Visual ownership or answer evidence requires admin review`; their answer origin is AI-inferred. They are not evidence of visual media that the server is withholding.

## Recommended product behavior

1. The client must not request `/media` for imports whose detail reports `inputType: RAW_TEXT` or lack a PDF source asset.
2. For such imports, the Visuals dialog should say: “This import was created from text, so it has no extracted PDF visuals.” It may still offer the existing manual/additional-media flow.
3. The API should preferably return `200` with `{ available: false, reason: "RAW_TEXT_IMPORT", data: [] }` for the read-only media endpoint, rather than `409`. A missing visual-media capability is state to display, not an edit conflict.
4. Keep approval/rejection of AI candidates separate from visual-media availability: the administrator’s explicit review decision remains authoritative.
