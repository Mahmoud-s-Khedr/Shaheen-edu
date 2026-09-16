# Delete API behavior report

## Scope and shared behavior

The system exposes **30 `DELETE` endpoints**, all under `/api/v1`. Every one
requires an active authenticated user; the global auth guard rejects revoked
sessions and users whose status is not `ACTIVE`. Admin endpoints additionally
require `ADMIN` or `SUPER_ADMIN`; student endpoints require `STUDENT`.

Evidence: `src/app.factory.ts:75`, `src/common/guards/user-auth.guard.ts:84`.

There is no server-side generic “confirm deletion” mechanism. The one exception
is student-account deletion, which requires a reason.

## Student account

| Endpoint | Who | Actual behavior |
| --- | --- | --- |
| `DELETE /admin/students/:id` | Admin | **Soft delete.** Requires `deletionReason` (1–2,000 chars, nonblank). It changes the student to `DISABLED`, sets `deletedAt`, `deletedById`, and the reason; revokes all normal and parent-access sessions; and writes `STUDENT_SOFT_DELETED` to the audit log. It returns `{ id, deleted: true }`. It does not delete the User, StudentProfile, purchases, attempts, or other history. A second delete returns `409`. There is no restore API. Evidence: `src/modules/students/students.controller.ts:183`, `src/modules/students/students.service.ts:643`, `src/modules/students/dto/delete-student.dto.ts:4`. |

## Curriculum and admin content

All of these are hard database deletes, restricted to drafts. Published and
archived records must be archived/restored through their respective `POST`
endpoints instead.

| Endpoint | Explicit checks and result |
| --- | --- |
| `DELETE /admin/academic-grades/:id` | Draft only. Refuses if any `SubjectGrade` exists. Then calls `academicGrade.deleteMany`; writes `GRADE_DELETED`. Evidence: `src/modules/academic-grades/academic-grades.service.ts:351`. |
| `DELETE /admin/subjects/:id` | Draft only. Refuses if it has courses; logs `SUBJECT_DELETED`. It does not explicitly check grade assignments, though those are database `Restrict` relations and can still prevent deletion. Evidence: `src/modules/subjects/subjects.service.ts:618`, `prisma/schema.prisma:792`. |
| `DELETE /admin/courses/:id` | Draft only. Refuses if it has chapters; logs `COURSE_DELETED`. Other dependent records are left to database constraints. Evidence: `src/modules/courses/courses.service.ts:484`. |
| `DELETE /admin/chapters/:id` | Draft only. Refuses if it has lessons; logs `CHAPTER_DELETED`. Evidence: `src/modules/chapters/chapters.service.ts:484`. |
| `DELETE /admin/lessons/:id` | Draft only. Refuses if it has sections; logs `LESSON_DELETED`. Evidence: `src/modules/lessons/lessons.service.ts:457`. |
| `DELETE /admin/sections/:id` | Draft only, with no application-level child-count check; logs `SECTION_DELETED`. References such as placements may still block it at the database level. Evidence: `src/modules/sections/sections.service.ts:451`. |
| `DELETE /admin/content-items/:id` | Draft only; hard-deletes the content item and logs `CONTENT_ITEM_DELETED`. Database cascades remove its placement, asset-reference rows, video-outline data, and student progress/study-state rows. Evidence: `src/modules/content-items/content-items.service.ts:719`, `prisma/schema.prisma:1063`, `prisma/schema.prisma:2301`. |
| `DELETE /admin/content-items/:id/attachments/:assetId` | **Unlinks only**: deletes the `AssetReference`, compacts attachment ordering, and logs `CONTENT_ATTACHMENT_REMOVED`. It does not delete the Asset file/row. The service returns no payload. Evidence: `src/modules/content-items/content-items.service.ts:788`. |
| `DELETE /admin/testimonials/:id` | Draft only; hard-deletes the testimonial and logs `TESTIMONIAL_DELETED`; returns `{ id, deleted: true }`. Evidence: `src/modules/testimonials/testimonials.service.ts:354`. |
| `DELETE /admin/subjects/:subjectId/constants/:id` | Hard-deletes the constant only after confirming it belongs to the stated subject; logs `SUBJECT_CONSTANT_DELETED`; returns `{ id, deleted: true }`. Evidence: `src/modules/subjects/subject-constants.service.ts:126`. |

The hierarchy/content-item handlers resolve `void`, so their successful response
is the framework’s default empty `200` response rather than `{ deleted: true }`.

## Assessments and student study data

| Endpoint | Actual behavior |
| --- | --- |
| `DELETE /student/assessments/question-marks/:questionId` | Removes the current student’s mark with `deleteMany` and returns `{ questionId, marked: false }`. It is effectively idempotent if no mark exists. Evidence: `src/modules/assessments/assessments.service.ts:1301`. |
| `DELETE /student/assessments/question-notes/:questionId` | First verifies the question is accessible, then deletes only the current student’s note. It returns `{ questionId, deleted: true }`, even when no note existed. Evidence: `src/modules/assessments/assessments.service.ts:1361`. |
| `DELETE /student/assessments/:id` | Hard-deletes an assessment only if it is student-owned by the caller; otherwise `403`. There is **no status or attempt-history guard**. Database cascades remove its scopes, snapshot questions, attempts, answers, and related assessment children. Returns `{ id, deleted: true }`. Evidence: `src/modules/assessments/assessments.service.ts:1971`, `prisma/schema.prisma:1826`, `prisma/schema.prisma:2041`. |
| `DELETE /admin/assessments/:id` | Hard-deletes an admin assessment only if its current status is `DRAFT`; logs `ASSESSMENT_DELETED`; returns `{ id, deleted: true }`. The OpenAPI wording says “never-published,” but the implementation checks only `status === DRAFT`, not `publishedAt`. Evidence: `src/modules/assessments/assessments.service.ts:3867`. |

## Question bank and question authoring

| Endpoint | Actual behavior |
| --- | --- |
| `DELETE /admin/question-banks/sources/:id` | Draft source only; refuses if any live `Question` references it; hard-deletes and audit-logs `QUESTION_SOURCE_DELETED`. Returns `{ id, deleted: true }`. Evidence: `src/modules/question-banks/question-banks.service.ts:476`. |
| `DELETE /admin/question-banks/:id` | Same as source deletion, but for a question bank; refuses if referenced by any `Question`; logs `QUESTION_BANK_DELETED`. Evidence: `src/modules/question-banks/question-banks.service.ts:476`. |
| `DELETE /admin/questions/contexts/:contextId` | Refuses if any question uses the reusable context. Otherwise hard-deletes it and logs `QUESTION_CONTEXT_DELETED`. Evidence: `src/modules/question-banks/question-banks.service.ts:1389`. |
| `DELETE /admin/questions/:id` | Draft only and must have no options, legacy assets, or video link. Then hard-deletes and logs `QUESTION_DELETED`. It does not explicitly inspect every possible relationship; the remaining database foreign-key rules apply. Evidence: `src/modules/question-banks/question-banks.service.ts:1679`. |
| `DELETE /admin/questions/:id/options/:optionId` | Deletes an option only when the question is editable—anything except `PUBLISHED` or `ARCHIVED`. It decrements later option sort orders, invalidates the structured explanation, logs the action, and returns the updated question. Evidence: `src/modules/question-banks/question-banks.service.ts:1763`, `src/modules/question-banks/question-banks.service.ts:200`. |
| `DELETE /admin/questions/:id/assets/:assetId` | **Unlinks the asset from the question**, decrements subsequent attachment ordering, and removes question content blocks using that asset. The underlying Asset remains. Only editable questions are allowed. Evidence: `src/modules/question-banks/question-banks.service.ts:1850`. |
| `DELETE /admin/questions/:id/video-link` | Deletes all video-link rows for the editable question using `deleteMany`, logs `QUESTION_VIDEO_REMOVED`, and returns the updated question. It is idempotent when no video link exists and does not delete the video asset. Evidence: `src/modules/question-banks/question-banks.service.ts:1967`. |

## Assets, videos, covers, and geography

| Endpoint | Actual behavior |
| --- | --- |
| `DELETE /admin/assets/:id` | Hard-deletes a non-video, non-payment-proof Asset only if `isReferenced()` finds zero references across content, covers, questions, assessment snapshots, import media, testimonials, and payment proofs. It deletes the DB row first, then starts object-storage deletion without awaiting it. Logs `ASSET_DELETED`. Despite the controller description, the service does **not** check that the asset status is draft. Evidence: `src/modules/assets/assets.service.ts:334`, `src/modules/assets/assets.service.ts:390`. |
| `DELETE /admin/assets/covers/:resource/:id` | Does not delete an asset. It accepts only `grades`, `subjects`, `courses`, `chapters`, `lessons`, or `sections`, sets the selected record’s `coverAssetId` to `null`, logs `HIERARCHY_COVER_REMOVED`, and returns `{ id, coverAssetId: null }`. Evidence: `src/modules/assets/assets.service.ts:695`. |
| `DELETE /admin/video-assets/:id` | Hard-deletes an unreferenced Bunny video asset. It calls Bunny’s remote `DELETE`; a remote `404` is deliberately accepted as already removed. It then deletes the local Asset row and logs `VIDEO_ASSET_DELETED`. There is no draft-status check. A non-404 remote failure returns `400`, leaving the local record. Evidence: `src/modules/videos/videos.service.ts:220`. |
| `DELETE /admin/geography/centers/:id` | Calls a direct hard delete. Any error—including a missing ID or an FK/reference failure—is converted to `409 Center cannot be deleted while referenced`. Returns `{ id, deleted: true }` on success; no audit record is written. Evidence: `src/modules/geography/geography.service.ts:84`. |
| `DELETE /admin/geography/governorates/:id` | Same pattern as centers: direct hard delete, all errors mapped to `409`, no audit log. Evidence: `src/modules/geography/geography.service.ts:92`. |

## Student workspace and cart

| Endpoint | Actual behavior |
| --- | --- |
| `DELETE /student/questions/:questionId/highlights/:highlightId` | Verifies the question is accessible and that the highlight belongs to the current student and that question. Otherwise `404`; on success hard-deletes and returns `{ id, deleted: true }`. Evidence: `src/modules/student-workspace/student-workspace.service.ts:79`. |
| `DELETE /student/notebook/pages/:pageId` | Finds the page using both page ID and current student ID, then hard-deletes it. Another student’s page produces `404`; returns `{ id, deleted: true }`. Evidence: `src/modules/student-workspace/student-workspace.service.ts:147`. |
| `DELETE /student/cart/items/:id` | Finds the cart item through the caller’s cart, then hard-deletes only that item. Another student’s or absent item produces `404`; returns `{ id, deleted: true }`. Evidence: `src/modules/commerce/commerce.service.ts:518`. |

## Notable implementation observations

- Admin delete operations are normally audit logged. Exceptions include
  geography deletion; student workspace/cart deletes also have no audit log.
- Hard-delete safety is uneven: some endpoints pre-check important
  relationships, while others rely on database foreign-key constraints.
- Several “remove” endpoints unlink a relationship rather than delete the
  referenced asset or video.
- The student’s own assessment delete is the widest cascade: it can remove
  attempts and answers, not merely the assessment shell.
