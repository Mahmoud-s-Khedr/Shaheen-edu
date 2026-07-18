# Content milestone plan

## Scope and exclusions

This milestone adds manually authored academic content and secure student delivery.

- Admins create, edit, organize, review, publish, archive, and replace content one record at a time.
- Questions are authored one question and one option at a time.
- Students browse published catalog information and consume only content they are authorized to access.
- `ADMIN` and `SUPER_ADMIN` perform all content mutations. Partners Ihave no content-management or protected student-content access in this milestone.

The milestone must not add `ContentImport`, `ContentImportRow`, `QuestionImport`, import jobs, CSV/Excel/PDF parsers, AI generation or explanations, OpenRouter integration, prompts, bulk-create/bulk-update endpoints, BullMQ queues, payment processing, orders, commissions, payouts, refunds, or quiz-taking/submission.

## Shared conventions

- Every lifecycle-managed record uses `DRAFT`, `PUBLISHED`, and `ARCHIVED` status unless a phase defines a stricter workflow.
- Records include `createdAt`, `updatedAt`, `createdById`, `updatedById`, `publishedAt`, `archivedAt`, and an integer `version` where concurrent mutations are possible.
- Mutation DTOs must not accept status, timestamps, audit actor IDs, storage keys, provider IDs, or `version` changes directly. PATCH, reorder, publish, archive, restore, and move requests require the caller's current `version`; a mismatch returns `409 Conflict`.
- Published or referenced records are archived rather than deleted. A draft record may be physically deleted only when it has no dependents or references.
- List endpoints use the existing offset-pagination contract, deterministic ordering, and filters appropriate to their resource. Normal reads exclude archived records by default.
- Every admin mutation writes an `AdminAuditLog` record with an action, target, actor, correlation ID, and safe metadata.
- Services use Prisma transactions for sibling reorder, multi-record state changes, and any operation that could otherwise partially succeed.
- All public and student response DTOs deliberately select fields; they never serialize Prisma models directly.

## Phase 1 — Academic hierarchy ✅ Complete

### Goal

Allow admins to manage:

```text
AcademicGrade → Subject → Course → Chapter → Lesson → Section
```

### Data model and rules

- [x] Add `AcademicGrade`, `Subject`, `Course`, `Chapter`, `Lesson`, and `Section` with title, scoped slug, description, `sortOrder`, lifecycle fields, audit actors, and `version`.
- [x] Each child has one required parent foreign key. Define restrictive referential actions so a parent with children cannot be deleted.
- [x] Convert `StudentProfile.academicGradeId` from its current nullable string placeholder into an optional relation to `AcademicGrade`; preserve existing nullable data in the migration.
- [x] Slugs are unique within their parent scope. Sibling records have a unique ordering scope and are returned by `sortOrder` followed by ID.
- [x] Reordering uses sequential integer sort orders and atomically renumbers every affected sibling. Moving a record validates the new parent and atomically updates both sibling groups.
- [x] A record can publish only when its required parent is published. Publishing is independent: publishing a course does not publish draft chapters, lessons, sections, or content.

### APIs and tests

- [x] Add admin create, get, paginated list/filter, PATCH, reorder, archive, restore, and eligible-draft-delete operations for each level. (A minimal `publish` action per level was also added in this phase, ahead of Phase 5's full `PublicationValidator`.)
- [x] Verify a complete hierarchy can be created; invalid parents, duplicate scoped slugs, stale versions, and unauthorized roles are rejected; reorder/move is atomic; and archived records are hidden from normal lists.

## Phase 2 — Manual content items

### Goal

Allow manual text and external-resource authoring at course, chapter, lesson, or section level.

### Data model and rules

> Phase note: asset, primary-asset, and `AssetReference` relations are deferred to Phase 3, when `Asset` and ready-asset upload semantics are introduced. Phase 2 retains asset-backed content types as draft-only placeholders. Content publication endpoints and full publication validation are deferred to Phase 5.

- [x] Add `ContentItem` with `type` (`TEXT`, `EXTERNAL_LINK`, `VIDEO`, `PDF`, `IMAGE`, `DOCUMENT`, `DOWNLOADABLE_FILE`), title, description, `textBody`, `externalUrl`, `accessLevel` (`PUBLIC`, `AUTHENTICATED`, `ENTITLED`), `isPreview`, estimated duration, lifecycle fields, audit actors, and `version`.
- [x] Add `ContentPlacement`, with exactly one non-null target among course, chapter, lesson, and section. Enforce this with a PostgreSQL `CHECK` constraint as well as DTO validation.
- A content item has one optional primary asset. Ordered optional attachments use `AssetReference`, with a typed relationship and explicit foreign keys; do not use an unenforceable polymorphic target. Hierarchy cover images use dedicated relations, not `AssetReference`.
- [x] `TEXT` requires non-empty `textBody`; `EXTERNAL_LINK` requires a valid HTTPS URL.
- Asset-backed types require a compatible ready asset before publication.
- [x] Content may move only to a valid hierarchy target; archived content cannot be moved.
- Archived content cannot be newly placed or published.

### APIs and tests

- [x] Add admin create, get, paginated list/filter, PATCH, move, reorder, archive, restore, and eligible-draft-delete endpoints.
- [x] Verify type-specific validation, exclusive placement enforcement, transactional ordering, and draft/archived visibility.
- Verify role protection.

## Phase 3 — Manual Bunny Storage uploads

### Goal

Support individual upload and protected delivery of covers, PDFs, images, documents, downloadable resources, and future question attachments.

### Data model and provider interface

- Add `Asset` with provider, kind, status (`PENDING_UPLOAD`, `UPLOADING`, `READY`, `FAILED`, `ARCHIVED`), original/sanitized filename, generated storage key, MIME type, size, checksum, safe metadata, uploader, ready/failed/archive timestamps, and lifecycle data.
- Define `FileStorageProvider` with upload, delete, and protected-URL creation operations. Implement it as `BunnyStorageProvider`.
- Store Bunny credentials only in validated server configuration. Never return credentials, storage keys, provider internals, or unrestricted origin URLs.

### Upload and delivery rules

- Use Fastify-compatible multipart streaming; do not use Nest's Multer integration or buffer large uploads in memory.
- Validate size limits by asset kind, extension, declared MIME type, magic-byte signature, empty payload, and sanitized display filename before accepting an upload.
- The backend streams one validated file to Bunny Storage, records success/failure, and permits attachment only after the asset is `READY`.
- A protected asset URL is a short-lived Bunny CDN token-authenticated URL. The API performs authorization first and never proxies file bytes.
- Unused draft assets may be deleted. Referenced assets cannot be deleted. Replacing an asset creates a new asset and archives the old reference only after it is no longer needed by published content.

### Tests

- Cover supported types, oversize/unsupported/spoofed files, empty files, provider failure recording, no credential disclosure, reference protection, attachment flow, short-lived access URLs, and admin-only uploads.

## Phase 4 — Manual Bunny Stream video uploads

### Goal

Allow admins to add one video at a time without exposing Bunny secrets.

### Data model and flow

- Add a one-to-one `VideoAsset` extension of `Asset` containing Bunny library/video IDs, duration, thumbnail URL, processing status/progress, webhook timestamp, and safe error metadata. `Asset` remains the single resource identity used by content and access control.
- Admin creates a video asset; the backend creates the Bunny video object and returns short-lived direct-upload authorization; the browser uploads with Bunny's resumable flow; Bunny processing updates the backend through a verified webhook; the asset becomes ready only after processing completes.
- Verify webhook signatures, persist an idempotency key/event record, accept repeated deliveries safely, and reject state regressions. A failed asset keeps failure metadata and can be retried explicitly.
- A video cannot publish or issue playback authorization until its asset is ready.

### APIs and tests

- Add admin create/get/upload-authorization/retry/archive video operations and one public webhook endpoint exempt only from user authentication, not signature verification.
- Add student playback-authorization through the central access policy in Phase 7.
- Test secret non-disclosure, invalid signatures, repeated webhooks, valid transitions, failure preservation, retry, and publication blocking while unready.

## Phase 5 — Publication and public catalog

### Goal

Separate editable draft records from student-visible published records.

### Rules

- Implement `PublicationValidator`/`PublicationService` and catalog validation per resource. Normal PATCH cannot set `PUBLISHED`.
- Publishing any resource validates its parent ancestry, required fields, current ordering, required ready assets, video readiness, external-link validity, access level, and absence of archived parents.
- A course publish validates the course and its ancestry only; independently published descendants remain published, and drafts remain drafts. Publishing never silently changes another record's lifecycle.
- Unpublish/archive hides the affected resource from catalog and student delivery without deleting historical records. Parents with published descendants cannot be archived until descendants are unpublished or archived.

### Catalog behavior

- Published grade, subject, course, course-detail, and outline metadata is public. Draft and archived records are never returned.
- Public outlines show allowed metadata and locked indicators only. They never include protected URLs, storage keys, Bunny IDs, draft details, or question answers.
- Add public catalog endpoints for grades, subjects, courses, course detail, and course outline, with published-only filtering and pagination where relevant.

### Tests

- Test invalid validation reports, independently published records, draft/archive exclusion, protected-field exclusion, video readiness, stale publication conflicts, and atomic multi-record checks where a validator updates related state.

## Phase 6 — Pricing and publisher agreements

### Goal

Store future purchase and publisher-resolution metadata without implementing financial processing.

### Data model and rules

- Add nullable `priceMinor`, `currency`, and `isPurchasable` to courses and chapters. Use integer minor units and initialize supported currency as `EGP`.
- Add `PublisherAgreement` with a content-publisher partner, exactly one target (`courseId` or `chapterId`), revenue share in basis points, schedule, status, `isPrimary`, creator, timestamps, and version.
- Enforce exactly one target with a database `CHECK`. Validate that the partner has `CONTENT_PUBLISHER` type, `revenueShareBps` is in range, and start/end dates are valid.
- Active chapter agreements override active course agreements. If neither applies, there is no publisher revenue share.
- Reject overlapping time windows for active primary agreements on the same target. Historical and ended agreements remain immutable records apart from permitted lifecycle fields.

### APIs and tests

- Add admin create/update/end/list/history/effective-resolution operations.
- Test invalid targets/partners/ranges/dates, overlap rejection, schedule behavior, chapter override, historical retention, and absence of financial records.

## Phase 7 — Manual entitlements and student delivery

### Goal

Allow admins to grant access for testing before payments exist, and securely deliver published content.

### Data model and access policy

- Add `StudentEntitlement` with exactly one target (`courseId` or `chapterId`), source (`ADMIN`, `PROMOTION`, `MIGRATION`, reserved `PAYMENT`), status, start/expiry dates, grant actor, revoke timestamp, and audit fields. Enforce the exclusive target with a `CHECK` constraint.
- Overlapping grants are allowed: access is the union of all active grants. An entitlement is active only when its status permits it, it has started, it is not revoked, and it has not expired.
- Implement one `ContentAccessPolicyService` for course, chapter, lesson, section, content, asset, and video playback checks. It evaluates publication, non-archived ancestry, access level, preview flag, active course/chapter grants, and the student's identity.
- `PUBLIC` content is available without login; `AUTHENTICATED` requires an authenticated student; `ENTITLED` requires a valid relevant entitlement unless preview is explicitly enabled.

### APIs and tests

- Add admin grant/revoke/list entitlement operations, student `me/courses` and hierarchy/content reads, plus protected asset-access and video-playback authorization endpoints.
- Verify course versus chapter boundaries, preview behavior, expired/revoked grants, public catalog versus protected delivery, draft exclusion despite entitlement, IDOR resistance, URL expiry, and denial for partners/unrelated students.

## Phase 8 — Manual question-bank authoring

### Goal

Allow admins to author and maintain single-choice questions without building quiz delivery.

### Data model and workflow

- Add `QuestionSource`, `QuestionBank`, `Question`, `QuestionOption`, `QuestionAsset`, and `QuestionVideoLink`.
- Sources support `PLATFORM`, `CONTENT_PUBLISHER`, `EXTERNAL_BOOK`, `PREVIOUS_EXAM`, and `MINISTRY_MODEL`. Questions use `DRAFT`, `IN_REVIEW`, `PUBLISHED`, `REJECTED`, and `ARCHIVED` lifecycle states.
- Initially support `SINGLE_CHOICE` only. Every question belongs to one bank, source, and chapter; course, subject, and grade scope derive from the selected chapter's published ancestry.
- Admins create a source, bank, question, options, optional ready attachments, optional ready-video timestamp link, explanation, and then submit for review. Authorized admins publish, reject, or archive after validation.
- Publication requires non-empty body, at least two options, exactly one correct option, source, bank, valid chapter ancestry, required explanation, ready attachments, and a valid video timestamp whenever duration is known.

### Representation and tests

- Define separate admin, review, and future student DTOs. Student representation excludes correctness, correct-option ID, explanation, review notes, and internal status.
- Do not add quiz-taking or student question-delivery endpoints in this milestone.
- Test valid manual creation, option constraints, source and hierarchy validation, linked-video timestamps, review transitions, archive behavior, role protection, and answer-field exclusion.

## Phase 9 — Integration and hardening

### End-to-end acceptance scenario

1. Admin creates a grade, subject, course, chapters, lessons, and sections.
2. Admin uploads a cover, PDF, and video; Bunny marks the video ready.
3. Admin creates text and multimedia content, assigns a publisher, and manually creates/publishes a question bank.
4. Admin validates and independently publishes the appropriate hierarchy and content.
5. Admin grants a student course or chapter access.
6. Anyone can browse the published course catalog and locked outline.
7. The entitled student sees the course, opens its hierarchy, receives a short-lived protected PDF URL, and receives authorized video playback.
8. A non-entitled student and all partners are denied protected resources.

### Hardening checklist

- Review audit events, pagination/filtering, indexes, transaction boundaries, optimistic concurrency, ownership/IDOR protection, archive behavior, orphaned asset cleanup, webhook idempotency, access URL expiration, query counts, migrations, Swagger, e2e coverage, and production build.
- Each implementation phase is delivered in its own commit with its migration and focused unit/e2e tests.
