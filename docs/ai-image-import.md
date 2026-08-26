• # Final plan: image-aware AI question import

> **Implementation note (2026-08-19):** This historical design predates
> ordered content blocks and Phase 7 input simplification. Phase 6 uses
> `QuestionImportMediaAssignment` plus question/option/context `IMAGE` content
> blocks instead of separate attachment tables, and new visual imports are PDF
> based. `question-system-expansion-plan.md` is authoritative.

  ## 1. Goal

  The importer must correctly identify:

  - Images belonging to the question stem.
  - Images belonging to answer options.
  - Images shared by multiple questions as reusable contexts.
  - Equations, diagrams, charts, and vector drawings.
  - Questions and answers that continue across page boundaries.
  - Image-only answers.
  - Text-and-image answers.

  The key rule is:

  Page boundaries do not define question boundaries.
  AI proposes relationships.
  The backend validates relationships.
  Only validated relationships become final question attachments.

  ———

  # 2. Final data flow

  Original PDF/DOCX
    ↓
  Layout extraction
    ↓
  Text blocks + page metadata + visual regions
    ↓
  Create image Assets
    ↓
  Create QuestionImportMedia records
    ↓
  Build global document sequence
    ↓
  AI identifies question/context boundaries
    ↓
  AI assigns media to:
      - question stem
      - answer option
      - shared context
    ↓
  Backend validates all assignments
    ↓
  Admin reviews uncertain assignments
    ↓
  Create draft Question and QuestionOptions
    ↓
  Attach:
      - QuestionAsset
      - QuestionOptionAsset
      - QuestionContextAsset
    ↓
  Create immutable assessment asset snapshots

  ———

  # 3. Extend the import source model

  The current importer uses prisma/schema.prisma:905, but it currently stores mostly text and basic source location.

  It needs to represent global document order.

  Add fields similar to:

  QuestionImportSourceBlock
  - id
  - batchId
  - sequence
  - blockKey
  - blockType: TEXT | PAGE_BREAK | CAPTION
  - text
  - pageNumber
  - boundingBox
  - documentOrder
  - sourceLocator

  sequence and documentOrder should be global across the entire document, not reset per page.

  Example:

  B0101 → page 2 → question text
  B0102 → page 2 → question continuation
  P002  → page break
  B0103 → page 3 → option A
  M0201 → page 3 → option A image
  B0104 → page 3 → option B
  M0202 → page 3 → option B image

  A question may therefore have:

  pageStart = 2
  pageEnd = 3
  firstBlock = B0101
  lastBlock = B0104

  ———

  # 4. Extract text and visual regions

  Replace the current text-only behavior in src/modules/ai-question-import/document-text-extractor.service.ts:8 with a layout extraction interface.

  interface ExtractedDocument {
    pages: ExtractedPage[];
    blocks: ExtractedBlock[];
    media: ExtractedMedia[];
    metadata: Record<string, unknown>;
  }

  Each page should produce:

  interface ExtractedPage {
    pageNumber: number;
    width: number;
    height: number;
    rotation: number;
    renderedImage?: Buffer;
  }

  Each visual should produce:

  interface ExtractedMedia {
    pageNumber: number;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    documentOrder: number;
    sourceBlockIds: string[];
    extractionMethod:
      | 'EMBEDDED_IMAGE'
      | 'PAGE_CROP'
      | 'VECTOR_RENDER'
      | 'OCR_REGION';
    buffer: Buffer;
    mimeType: string;
    checksum: string;
  }

  ## PDF handling

  For every PDF page:

  1. Extract text spans with coordinates.
  2. Extract embedded image objects where possible.
  3. Render the page at a fixed high resolution.
  4. Detect visual regions that are not available as embedded images.
  5. Crop charts, equations, diagrams, and vector drawings.
  6. Associate each crop with nearby text blocks.
  7. Preserve page dimensions and rotation.

  Embedded images should use the original image where possible. Rendered crops should be used for vectors and diagrams.

  ## DOCX handling

  Convert DOCX to a pinned PDF-rendering pipeline, or use a layout-aware DOCX parser that can produce equivalent coordinates.

  The important result is consistency:

  DOCX → pages → text blocks → visual regions
  PDF  → pages → text blocks → visual regions

  The original DOCX must still be retained as the import source.

  ## Scanned documents

  If the PDF has insufficient text extraction:

  1. Render the page.
  2. Run OCR/layout detection.
  3. Extract question and option regions from the rendered page.
  4. Mark the extraction method as OCR_REGION.
  5. Lower confidence and require review when the layout is uncertain.

  A scanned PDF should not simply fail because PDF.js returned little text.

  ———

  # 5. Create import media records and Assets

  Every extracted visual becomes an existing Asset with kind IMAGE.

  Add:

  QuestionImportMedia
  - id
  - batchId
  - assetId
  - mediaKey
  - pageNumber
  - pageWidth
  - pageHeight
  - boundingBox
  - documentOrder
  - sourceBlockIds
  - extractionMethod
  - checksum
  - reviewStatus
  - createdAt

  The mediaKey is stable within the import:

  M0001
  M0002
  M0003

  The AI receives M0001, not the database asset ID.

  The worker needs a server-side asset creation method because the current asset flow is designed for browser uploads. The worker must be able to:

  1. Create an asset record under the importing admin.
  2. Upload the crop to Bunny.
  3. Mark it READY.
  4. Store its checksum and dimensions.
  5. Reuse an existing asset if the checksum already exists in the same batch.

  Failed imports must clean up unreferenced generated assets after a retention period.

  ———

  # 6. Build the AI input representation

  The AI input should contain both structured text and actual images.

  Example:

  [PAGE_2]

  [B0101]
  Question 12: Which diagram represents acceleration?

  [B0102]
  Choose the correct diagram.

  [MEDIA_M0101]
  Page 2, visual at x=100 y=420 width=500 height=260

  [PAGE_BREAK]

  [PAGE_3]

  [B0103]
  A.

  [MEDIA_M0102]
  Page 3, visual at x=120 y=80 width=180 height=120

  [B0104]
  B.

  [MEDIA_M0103]
  Page 3, visual at x=120 y=240 width=180 height=120

  The multimodal request should include:

  - Text blocks.
  - Media labels.
  - Actual image crops.
  - Page thumbnails for difficult layout cases.
  - Adjacent pages when a question may continue across a page boundary.

  Do not send every image from the full document with every question. Send only:

  - Relevant crops.
  - The question’s page range.
  - Neighboring page thumbnails when required.
  - Shared contexts referenced by the question.

  ———

  # 7. Use two AI stages

  ## Stage A: document segmentation

  The first AI call identifies:

  - Question boundaries.
  - Multi-page question continuation.
  - Shared contexts.
  - Excluded or unsupported content.
  - Candidate question-level media.

  The response should support page ranges:

  {
    "questions": [
      {
        "id": "Q12",
        "sourceNumber": "12",
        "firstBlock": "B0101",
        "lastBlock": "B0104",
        "pageStart": 2,
        "pageEnd": 3,
        "contextIds": [],
        "questionMediaIds": []
      }
    ],
    "contexts": [
      {
        "id": "CTX001",
        "firstBlock": "B0090",
        "lastBlock": "B0095",
        "pageStart": 2,
        "pageEnd": 2,
        "mediaIds": ["M0099"]
      }
    ]
  }

  A question may begin on page 2 and end on page 3.

  A shared figure on page 2 may belong to a context used by questions on page 3.

  ## Stage B: question extraction

  The second AI call extracts the structured question and identifies media roles:

  {
    "body": "Which diagram represents acceleration?",
    "questionMediaIds": ["M0101"],
    "options": [
      {
        "body": null,
        "mediaIds": ["M0102"]
      },
      {
        "body": null,
        "mediaIds": ["M0103"]
      }
    ],
    "answer": {
      "selectedOptionIndexes": [1],
      "confidence": 0.94,
      "origin": "EXPLICIT"
    }
  }

  The options output must support:

  body: string | null
  mediaIds: string[]

  This allows:

  - Text-only option.
  - Image-only option.
  - Text plus image option.

  The existing ImportedCandidate and extraction schema in src/modules/ai-question-import/openrouter-question-import.client.ts:1 need to be extended
  accordingly.

  ———

  # 8. Handle multi-page questions

  Page boundaries must be treated as layout information only.

  The segmentation logic must support:

  Question start: page 2
  Question end: page 3

  Use overlapping page windows when processing large documents:

  Pages 1–2
  Pages 2–3
  Pages 3–4
  Pages 4–5

  Then merge candidates using their stable block IDs.

  Continuation signals include:

  - Page 3 begins with A, B, C, or D.
  - Page 2 ends with an incomplete question.
  - The next page continues the same question numbering.
  - The next page uses the same typography and answer layout.
  - The question has missing options that appear on the next page.
  - The page begins with an image or option continuation rather than a new question.
  - A figure caption or instruction explicitly references a previous page.

  If page windows disagree, do not silently choose one. Create a review warning.

  ———

  # 9. Store media ownership explicitly

  Add a first-class assignment model:

  QuestionImportMediaAssignment
  - id
  - importItemId
  - mediaId
  - targetType: QUESTION | OPTION | CONTEXT
  - optionIndex nullable
  - confidence
  - evidence
  - reviewStatus
  - createdAt
  - updatedAt

  Examples:

  M0101 → Question 12 → QUESTION
  M0102 → Question 12 → OPTION, index 0
  M0103 → Question 12 → OPTION, index 1
  M0099 → Context CTX001 → CONTEXT

  This is better than storing only media IDs inside normalizedOutput because it supports:

  - Admin corrections.
  - Auditing.
  - Confidence tracking.
  - Retry behavior.
  - Validation.
  - Import review UI.

  ———

  # 10. Validate every media assignment

  The backend must validate AI output before creating a question.

  ## Identity validation

  Reject references where:

  - mediaKey does not belong to the current batch.
  - The media belongs to another import.
  - The asset is missing or not ready.
  - The same media key is duplicated incorrectly.

  ## Geometry validation

  Check:

  - Page number compatibility.
  - Bounding-box overlap.
  - Document order.
  - Whether the media is located within the question or option region.
  - Whether an option image aligns with its option label.

  Geometry should be evidence, not an absolute rule. A shared context may appear before the question range.

  ## Structural validation

  Check:

  - Option index exists.
  - Image-only options have at least one image.
  - Text-only options have non-empty text.
  - The question has text or a question image.
  - No invalid media role is returned.
  - Correct option indexes are valid.
  - Every referenced visual is accounted for.

  ## Ambiguity validation

  Require review when:

  - A visual could belong to two questions.
  - A figure may be either a shared context or a question attachment.
  - An option continues across pages but the boundary is unclear.
  - OCR/layout extraction is low quality.
  - AI output conflicts with page geometry.
  - A visual appears unused or unexplained.
  - Two overlapping page windows produce different ownership.

  ———

  # 11. Add final question and option asset models

  The existing prisma/schema.prisma:987 can continue to represent stem attachments.

  Add:

  QuestionOptionAsset
  - id
  - optionId
  - assetId
  - sortOrder
  - altText
  - createdAt

  QuestionContextAsset
  - id
  - contextId
  - assetId
  - sortOrder
  - altText
  - createdAt

  The option model should support image-only options:

  QuestionOption
  - body nullable
  - isCorrect
  - sortOrder

  Validation becomes:

  body is not empty
  OR
  option has at least one asset

  Do not use QuestionAsset for answer images. The option owns the answer image.

  For image-only question stems, either:

  - Allow the question body to be nullable when it has a visual stem; or
  - Store extracted OCR separately and keep the visual as the authoritative content.

  The system should not force the AI to invent question text for an image-only question.

  ———

  # 12. Attach assets during draft creation

  Extend createImportedDraftWithClient in src/modules/question-banks/question-banks.service.ts:83 to accept validated media assignments.

  The transaction should:

  1. Create the Question.
  2. Create its QuestionOption rows.
  3. Resolve question media keys to assets.
  4. Create QuestionAsset rows.
  5. Resolve option media keys to option IDs.
  6. Create QuestionOptionAsset rows.
  7. Link shared contexts and QuestionContextAsset rows.
  8. Mark the import item as CREATED.

  Everything must happen inside one transaction.

  If any asset reference is invalid, the transaction must roll back.

  ———

  # 13. Shared context handling

  A context can contain:

  - Text only.
  - Image only.
  - Text plus image.
  - A table.
  - An equation.
  - Multiple visuals.

  The existing QuestionContext model needs asset support.

  QuestionContext
    → QuestionContextAsset
    → Asset

  A figure used by Questions 12, 13, and 14 should be stored once:

  Context 1
    └── Figure Asset M0099

  Question 12 → Context 1
  Question 13 → Context 1
  Question 14 → Context 1

  Do not duplicate the same image as three question attachments unless the image is genuinely question-specific.

  ———

  # 14. Admin review flow

  The existing item endpoint should return the complete visual review model:

  GET /admin/ai/question-imports/:id/items

  Each item should include:

  {
    "candidate": {},
    "pageStart": 2,
    "pageEnd": 3,
    "sourceBlocks": [],
    "media": [
      {
        "mediaKey": "M0102",
        "assetId": "...",
        "pageNumber": 3,
        "boundingBox": {},
        "previewUrl": "..."
      }
    ],
    "assignments": [
      {
        "mediaKey": "M0102",
        "targetType": "OPTION",
        "optionIndex": 0,
        "confidence": 0.96,
        "reviewStatus": "PROPOSED"
      }
    ],
    "warnings": []
  }

  The review UI should show:

  - Full page 2.
  - Full page 3.
  - The question boundary.
  - Extracted crop previews.
  - Proposed target.
  - Confidence.
  - Evidence.
  - Controls to assign an image to:
      - Question.
      - Option A/B/C/D.
      - Shared context.
      - Nothing.

  Recommended operations:

  PATCH /admin/ai/question-imports/:id/items/:itemId/media
  POST  /admin/ai/question-imports/:id/items/:itemId/accept
  POST  /admin/ai/question-imports/:id/items/:itemId/reject

  Accepting an item should materialize the draft question using the reviewed assignments.

  Visual safeguards are review guidance, never a lock. The admin may accept a
  candidate or reuse a visual whenever the original book or publisher confirms
  that decision. The UI should display unresolved requirements and ownership
  conflicts prominently, allow an optional reviewer note, and let the admin
  proceed without an override flag. The backend retains advisory/conflict data
  in its audit trail.

  ———

  # 15. Assessment snapshots

  The current snapshot process copies question text, options, contexts, and explanations in src/modules/assessments/assessments.service.ts:469, but it must
  also copy assets.

  Add:

  AssessmentQuestionAsset
  - assessmentQuestionId
  - assetId
  - sortOrder
  - altText

  AssessmentQuestionOptionAsset
  - assessmentQuestionOptionId
  - assetId
  - sortOrder
  - altText

  AssessmentContextAsset
  - assessmentContextId
  - assetId
  - sortOrder
  - altText

  During snapshot creation:

  QuestionAsset
    → AssessmentQuestionAsset

  QuestionOptionAsset
    → AssessmentQuestionOptionAsset

  QuestionContextAsset
    → AssessmentContextAsset

  Update the central snapshot logic so all assessment creation paths inherit the behavior.

  Then update:

  - Student assessment creation.
  - Admin standard assessments.
  - Admin custom assessments.
  - Current attempt response.
  - Result response.
  - Admin assessment response.
  - Any question selection or preview query.

  The student response must return assets under the correct owner:

  {
    "body": "...",
    "assets": [],
    "options": [
      {
        "body": null,
        "assets": [
          {
            "assetId": "...",
            "url": "..."
          }
        ]
      }
    ]
  }

  Asset delivery must use authorized, short-lived URLs. Signed URLs should not be stored in the database or sent to the AI logs.

  ———

  # 16. Raw text imports

  Raw text has no document coordinates.

  Support explicitly supplied media:

  rawText
  mediaAssetIds

  The user can reference media using stable tokens:

  [MEDIA_M001]
  Question text...

  A. [MEDIA_M002]
  B. [MEDIA_M003]

  For raw text:

  - Do not infer ownership from physical layout.
  - Require explicit markers or admin assignment.
  - Mark unreferenced uploaded images for review.
  - Keep the same final QuestionAsset and QuestionOptionAsset flow.

  ———

  # 17. Reliability and operational safeguards

  ## Idempotency

  The worker must safely retry:

  - Media extraction.
  - Asset creation.
  - Segmentation.
  - Question extraction.
  - Draft creation.

  Use:

  (batchId, mediaKey)
  (batchId, chunkId, sequence)
  (questionId, assetId)
  (optionId, assetId)

  with uniqueness constraints.

  ## Cost control

  Do not send the entire document repeatedly.

  Use:

  - Relevant image crops.
  - Page thumbnails.
  - Overlapping page windows only for segmentation.
  - Full-resolution crops only when needed.
  - Maximum media count per AI request.
  - Configurable image resolution.

  ## Security

  - Treat document text as untrusted input.
  - Do not allow document content to override system instructions.
  - Use short-lived Bunny URLs or base64 image content.
  - Do not persist signed URLs.
  - Verify that every media reference belongs to the current batch.
  - Prevent an import from attaching arbitrary existing assets.

  ## Asset lifecycle

  Generated assets should be:

  - Retained when attached to a question, option, context, or assessment snapshot.
  - Deleted or archived when an import is rejected.
  - Cleaned up after failed imports.
  - Protected from deletion while referenced by an assessment snapshot.

  Update asset reference checks to include all new relation tables.

  ———

  # 18. Implementation phases

  ## Phase 1: schema and domain model

  Implement:

  - QuestionImportMedia.
  - QuestionImportMediaAssignment.
  - QuestionOptionAsset.
  - QuestionContextAsset.
  - AssessmentQuestionAsset.
  - AssessmentQuestionOptionAsset.
  - AssessmentContextAsset.
  - Nullable or visual-compatible option/question content.
  - New enums and indexes.

  ## Phase 2: extraction pipeline

  Implement:

  - Page rendering.
  - Text coordinates.
  - Embedded image extraction.
  - Visual crop extraction.
  - DOCX-to-layout conversion.
  - OCR fallback.
  - Global document ordering.
  - Cross-page source blocks.

  ## Phase 3: asset management

  Implement:

  - Worker-generated Bunny assets.
  - Checksum deduplication.
  - Import asset cleanup.
  - Protected asset access.
  - Asset retention through assessment snapshots.

  ## Phase 4: AI pipeline

  Update:

  - Segmentation schema.
  - Cross-page page-window processing.
  - Media-aware extraction schema.
  - Option-level media references.
  - Stable media key validation.
  - AI prompt and multimodal requests.
  - Chunk construction to include media metadata.

  ## Phase 5: draft creation

  Update:

  - Imported question DTOs.
  - Question creation transaction.
  - Question asset linking.
  - Option asset linking.
  - Shared context asset linking.
  - Image-only validation.

  ## Phase 6: admin review

  Implement:

  - Media previews.
  - Full-page review.
  - Cross-page question display.
  - Ownership reassignment.
  - Accept/reject behavior.
  - Confidence and evidence display.

  ## Phase 7: assessment delivery

  Update:

  - Snapshot creation.
  - Student assessment responses.
  - Result responses.
  - Admin assessment responses.
  - Asset access authorization.
  - Asset retention rules.

  ## Phase 8: testing and rollout

  Add fixtures for:

  - Same-page stem image.
  - Question on page 2 and options on page 3.
  - Figure on page 2 used by questions on page 3.
  - Image before question.
  - Image-only answer options.
  - Text-and-image options.
  - Multi-page answer groups.
  - Shared figure used by multiple questions.
  - Ambiguous cross-page boundary.
  - Scanned PDF.
  - DOCX with images.
  - Import retry after partial failure.
  - Assessment snapshot after original question changes.

  Release under a new schema version, for example:

  question-import-v3

  Keep the existing text-only flow available until the new pipeline passes the multi-page and image-answer test suite.

  The final success criterion is:

  Any extracted visual can be traced from:
  original page
  → crop and coordinates
  → import media record
  → AI assignment
  → reviewed ownership
  → question/option/context asset
  → assessment snapshot
  → student display

  No image should be attached merely because it is on the same page.
