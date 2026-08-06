# Student Portal API Roadmap

> **Status: proposed reference only.** This is a logical API and schema roadmap
> based on the current repository. It is not an implemented API contract.
> Implemented endpoints remain documented in
> [api-reference-compact.md](api-reference-compact.md).

## Implementation status (reviewed 2026-08-06)

- [x] Student registration and profile updates persist a published
      `academicGradeId`.
- [x] The published public catalogue supports grades, grade-filtered subjects,
      subject-filtered courses, course details, and a full course outline with
      entitlement-aware lock indicators.
- [x] Course/chapter pricing and course/chapter `StudentEntitlement` records
      exist; entitled students can retrieve published content and protected assets.
- [x] Manual commerce supports carts, immutable EGP orders, receipt-proof
      submission, staff review, and payment-backed course/chapter entitlements.
- [x] Content-item completion, current-grade and library progress, direct
      practice, immutable practice attempts, student performance, and selected-child
      parent performance are implemented.
- [x] Generated assessments (student-owned private quizzes/exams and
      admin-owned public quizzes/exams) exist, built from standard random
      sampling or admin hand-picked questions, with a full attempt lifecycle
      (start/resume, autosave, submit, result).
- [ ] AI-assisted question selection and the broader student analytics APIs in
      this roadmap remain not implemented.

`[x]` means the backend implementation exists. `[ ]` means the item remains
planned; frontend rendering, response composition, and client-side navigation
are outside this API roadmap. An existing endpoint with a narrower or
different server-side response is called out in the relevant section rather
than being marked complete.

## Core product rule

A student has one current `academicGradeId`, selected at registration and
changeable from their profile. Their **student catalogue must show published
content for that grade only**. It must not expose subjects, courses, chapters,
or questions from lower or higher grades.

Changing grade affects future catalogue discovery only. It must **not** revoke
access to courses or chapters already purchased; those continue to appear in
the student's library until their entitlement expires or is revoked.

```text
StudentProfile.academicGradeId
  → AcademicGrade → Subject → Course → Chapter → Lesson → Section
```

This relationship already exists in the schema: `StudentProfile` has
`academicGradeId`, a `Subject` belongs to an academic grade, a `Course` belongs
to a subject, and a chapter belongs to a course.

## Current API and schema findings

| Area             | Status                                      | Already present                                                                                                                                                                                                                                         | Gap to close                                                                                      |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Grade selection  | [x]                                         | Registration accepts `academicGradeId`; `PATCH /api/v1/students/me` can change it.                                                                                                                                                                      | —                                                                                                 |
| Public hierarchy | [x]                                         | Published grade/subject/course discovery plus cursor-paginated course chapters, chapter lessons, lesson sections, and direct content previews.                                                                                                          | —                                                                                                 |
| Paid access      | [x]                                         | Course/chapter pricing, `StudentEntitlement`, carts, manual-payment orders, proof review, and payment-backed grants exist.                                                                                                                              | No refunds, payment expiry, or PSP integration.                                                   |
| Questions        | [x] Authoring, direct practice, and assessments | Questions are linked to a course and may be placed at course/chapter/lesson/section level; eligible published questions can be delivered for direct practice with immutable answer-attempt history. Student- and admin-generated assessments freeze an immutable question/option snapshot with a full attempt lifecycle. | No AI-assisted selection, difficulty bands, marked/omitted-question filters, or assessment-history analytics. |
| Content delivery | [x] Foundation, completion, and study state | An entitled student can fetch a content item and its protected assets, view completion/study state, record activity/resume position, and retrieve the next continue-learning item. Current-grade and accessible-library progress rollups are available. | Higher-level completion remains derived from content-item completion.                             |

Question banks and sources are authoring/provenance metadata. They are not a
student catalogue concept and must not be exposed in learner responses.

## API design: two catalogue views

### A. Public catalogue — published hierarchy only

These routes support registration, marketing pages, and visitors. They return
only published records and contain no personal entitlement information.

| Proposed endpoint                                 | Purpose                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/v1/academic-grades`                     | Existing public grade list; retain as the registration grade selector.        |
| `GET /api/v1/catalog/grades/:gradeId`             | Published grade detail and its published subjects.                            |
| `GET /api/v1/catalog/grades/:gradeId/subjects`    | Subjects belonging to one published grade.                                    |
| `GET /api/v1/catalog/subjects/:subjectId/courses` | Courses belonging to one published subject.                                   |
| `GET /api/v1/catalog/courses/:courseId`           | Existing public course detail; include effective public price/purchasability. |
| `GET /api/v1/catalog/courses/:courseId/chapters`  | Cursor-paginated published chapter list.                                      |
| `GET /api/v1/catalog/chapters/:chapterId/lessons` | Cursor-paginated published lesson list.                                       |
| `GET /api/v1/catalog/lessons/:lessonId/sections`  | Cursor-paginated published section list.                                      |

Completed equivalents:

- [x] `GET /api/v1/academic-grades`
- [x] `GET /api/v1/catalog/subjects?academicGradeId=`
- [x] `GET /api/v1/catalog/courses?subjectId=`
- [x] `GET /api/v1/catalog/courses/:courseId`
- [x] Cursor-paginated child routes replace the former nested outline endpoint.

The existing `GET /api/v1/catalog/subjects?academicGradeId=` and
`GET /api/v1/catalog/courses?subjectId=` can remain. The nested routes above make the
hierarchy discoverable without the frontend constructing filters itself.

### B. Student catalogue — current grade and personal access state

These routes require `STUDENT`. The server reads `StudentProfile.academicGradeId`
from the token; clients must not choose a grade ID in this API. This prevents a
student from browsing other grades by changing a query parameter.

| Status | Endpoint                                                  | Purpose                                                                                               |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [x]    | `GET /api/v1/student/catalog`                             | Current grade and published hierarchy summary counts.                                                 |
| [x]    | `GET /api/v1/student/catalog/subjects`                    | Only published subjects of the student's current grade.                                               |
| [x]    | `GET /api/v1/student/catalog/subjects/:subjectId/courses` | Grade-scoped published courses with server-resolved `access`, lock state, and effective course price. |
| [x]    | `GET /api/v1/student/catalog/courses/:courseId`           | Grade-scoped course detail.                                                                           |
| [x]    | Cursor-paginated student child routes                     | Chapters, lessons, sections, and content previews with server-resolved access, price, and lock state. |
| [x]    | `GET /api/v1/student/library`                             | Active course/chapter entitlements across grades, grouped with their published hierarchy and expiry.  |
| [x]    | `GET /api/v1/student/entitlements`                        | The authenticated student's raw, paginated active entitlement records.                                |

Completion/progress summaries, persisted study activity, and continue-learning
delivery are implemented. Public and student catalogue routes
traverse one hierarchy level at a time; composing their ordered responses into
cards, outlines, or previous/next controls is client work and requires no
additional API.

For a course/chapter response, return one explicit `access` object rather than
forcing the frontend to infer it from many fields:

```json
{
  "access": {
    "state": "ENTITLED | FREE | PUBLIC | PURCHASABLE | LOCKED",
    "entitlementId": "optional",
    "expiresAt": "optional ISO date",
    "price": { "amountMinor": 0, "currency": "EGP" }
  }
}
```

`PURCHASABLE` means the student may buy that exact course or chapter. A chapter
covered by a course entitlement is `ENTITLED`; it should never be offered for
sale again. A course page may show a purchasable chapter only when the student
does not already own the whole course or that chapter.

## Purchase model: courses and chapters

The first commerce model should sell only the things the current access schema
can grant: **a complete course or an individual chapter**. Do not introduce a
lesson purchase until `StudentEntitlement` explicitly supports it; lesson
pricing exists today, but lesson-level access does not.

### Required schema additions

Keep current `Course`, `Chapter`, pricing, and `StudentEntitlement` records.
Add a financial ledger rather than duplicating course/chapter as a new product
catalogue. Payments are **manual for this phase**: the student follows a
payment instruction shown by the frontend, uploads a proof image, and an
administrator approves or rejects the submission. There is no PSP redirect,
card capture, provider callback, or payment webhook in this model.

| Status | Model                     | Essential responsibility                                                                                                                                                                                                                      |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]    | `Cart` / `CartItem`       | One active cart per student; item targets exactly one course or chapter.                                                                                                                                                                      |
| [x]    | `ManualPaymentMethod`     | Admin-managed, active payment instructions shown to students (for example, transfer account/wallet details, title, and display order). The order snapshots the selected method text so later edits do not change an existing payment request. |
| [x]    | `Order`                   | Immutable purchase snapshot: student, total EGP amount, selected manual-payment instruction snapshot, lifecycle status, timestamps.                                                                                                           |
| [x]    | `OrderItem`               | Immutable price and target snapshot for each purchased course/chapter.                                                                                                                                                                        |
| [x]    | `ManualPaymentSubmission` | A student's submitted transfer reference, optional note, receipt-proof asset, review status, reviewer, rejection reason, and timestamps. Rejected orders preserve submission history and accept replacement proof.                            |
| [ ]    | `Refund`                  | Refund/cancellation history and corresponding entitlement action, when refunds become part of the operating process.                                                                                                                          |

All listed commerce schema additions except `Refund` are implemented. The
existing `StudentEntitlement` model supports exactly one course or chapter
target and is the implemented foundation for the fulfilment flow.

`StudentEntitlement` remains the authoritative access record. An **approved**
manual-payment submission creates exactly one entitlement per order item with
`source = PAYMENT`. The implemented optional `orderItemId` reference makes the
grant traceable and prevents duplication.

Recommended lifecycle:

```text
DRAFT_CART → AWAITING_PAYMENT → SUBMITTED → APPROVED
                                    └──→ REJECTED → SUBMITTED (replacement proof)
AWAITING_PAYMENT / REJECTED → CANCELLED
```

Only an administrator may transition a submission to `APPROVED` or `REJECTED`.
Approval, order status change, and entitlement creation must run in one
database transaction. Repeating the approval request must be idempotent and
must never create a second entitlement. A receipt proof is private: only its
owner and authorized administrators may retrieve it; it must not use the
existing admin-only general asset upload endpoint.

### Proposed commerce APIs

| Status | Proposed endpoint                                                                 | Purpose                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]    | `POST /api/v1/student/cart/items`                                                 | Add an eligible course or chapter. The server validates grade, publication, purchasability, price, and existing access.                            |
| [x]    | `GET /api/v1/student/cart`                                                        | Cart lines with server-calculated current totals and EGP prices.                                                                                   |
| [x]    | `DELETE /api/v1/student/cart/items/:itemId`                                       | Remove a line.                                                                                                                                     |
| [x]    | `GET /api/v1/student/manual-payment-methods`                                      | Active payment instructions the frontend can present before the student creates an order.                                                          |
| [x]    | `POST /api/v1/student/checkout`                                                   | Atomically create an `AWAITING_PAYMENT` order and immutable order items, snapshotting the selected payment method and server-calculated EGP total. |
| [x]    | `GET /api/v1/student/orders`                                                      | Student purchase history.                                                                                                                          |
| [x]    | `GET /api/v1/student/orders/:orderId`                                             | One order, selected instruction snapshot, submission/review state, any safe rejection reason, purchased targets, and fulfilment state.             |
| [x]    | `POST /api/v1/student/orders/:orderId/payment-proof`                              | Upload one receipt image and transfer reference for an eligible order, creating a `SUBMITTED` manual-payment submission.                           |
| [x]    | `POST /api/v1/student/orders/:orderId/payment-submissions/:submissionId/resubmit` | Submit replacement proof after a rejection; preserve the rejected submission as audit history.                                                     |
| [x]    | `GET /api/v1/admin/manual-payment-methods`                                        | List configured payment instructions, including inactive methods.                                                                                  |
| [x]    | `POST /api/v1/admin/manual-payment-methods`                                       | Create a payment instruction.                                                                                                                      |
| [x]    | `PATCH /api/v1/admin/manual-payment-methods/:id`                                  | Update, reorder, activate, or deactivate a payment instruction.                                                                                    |
| [x]    | `GET /api/v1/admin/payment-submissions`                                           | Queue of submitted/reviewable payments, filterable by status, student, and date.                                                                   |
| [x]    | `GET /api/v1/admin/payment-submissions/:id`                                       | Full review view, including the private proof asset and immutable order snapshot.                                                                  |
| [x]    | `POST /api/v1/admin/payment-submissions/:id/approve`                              | Atomically approve the submission and grant its order's entitlements once.                                                                         |
| [x]    | `POST /api/v1/admin/payment-submissions/:id/reject`                               | Reject with a staff-visible and student-safe reason; the student may resubmit if the order remains eligible.                                       |

`POST /api/v1/student/orders/:orderId/payment-proof` accepts an initial proof
only; rejected orders must use the dedicated resubmission route. `POST
/api/v1/student/orders/:orderId/cancel` is also implemented for awaiting-payment
or rejected orders.

The API server—not the client—is authoritative for price, total, eligibility,
payment state, review decisions, and entitlement fulfilment. Checkout and proof
submission require idempotency keys; repeating approval is safe because an
already approved submission is returned without creating a second entitlement.
The displayed payment
instruction is guidance only; an uploaded proof is not itself a verified
payment and must grant no access until approved.

## Learning and completion APIs

| Proposed endpoint                                                           | Purpose                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/v1/student/content-items/:contentItemId`                          | [x] Protected delivery with the student's item completion state.                              |
| `POST /api/v1/student/content-items/:contentItemId/complete`                | [x] Idempotently mark one accessible published item complete.                                 |
| `GET /api/v1/student/progress`                                              | [x] Current-grade course/chapter/lesson/section completion totals.                            |
| `GET /api/v1/student/library/:targetType/:targetId/progress`                | [x] Detailed course or chapter progress for accessible library content.                       |
| `GET /api/v1/student/practice/questions`                                    | [x] Learner-safe published direct-practice questions for one hierarchy scope and descendants. |
| `POST /api/v1/student/practice/questions/:questionId/attempts`              | [x] Store an immutable selected-answer attempt and return immediate feedback.                 |
| `GET /api/v1/student/practice/questions/:questionId/attempts`               | [x] Paginated personal retry history.                                                         |
| `GET /api/v1/student/practice/questions/:questionId/assets/:assetId/access` | [x] Protected access to an asset or video attached to an eligible direct-practice question.   |
| `GET /api/v1/student/performance`                                           | [x] Current-grade question totals, accuracy, solved count, and first-try correctness.         |
| `GET /api/v1/parent/selected-child/performance`                             | [x] Selected-child summary-only progress and question performance.                            |

Completion records are keyed by `(studentUserId, contentItemId)` and store the
completion timestamp. The client marks only an item complete; all hierarchy
completion is derived from accessible published content and these records. A
direct command to mark a course, chapter, lesson, or section complete is not
implemented.

## Generated quizzes and exams from the existing question bank

The generated-assessment domain is implemented for both owners. A student can
generate their own private quiz/exam, and an admin can build a public one, in
both cases from **existing reviewed, published questions** only. AI-assisted
selection is explicitly **deferred by product decision** (not a gap to close
yet) — every generation path today is either random sampling (`STANDARD`) or
exact hand-picked question IDs (`CUSTOM`, admin only). No path creates
unreviewed live questions or changes correct answers.

Visibility is owner-based: a `STUDENT`-owned assessment is private to its
creator; an `ADMIN`-owned assessment becomes public, once published, to any
student entitled to every one of its target scopes — the frozen snapshot is
the union of all scopes' questions, so partial entitlement to only some
scopes must not surface the whole assessment.

Question selection is always limited to:

1. Published questions whose course/chapter/lesson/section placement is
   published.
2. For student-owned generation, the student's current academic grade and
   their own entitlement on the selected scope (mirroring direct practice's
   eligibility rule).
3. For admin-owned generation, any published question in the given scope;
   visibility to a given student is enforced separately, at read/attempt time,
   against that student's grade and entitlement.

"Quiz" vs "exam" is not two separate models — it is the assessment's `mode`
(`TUTOR` reveals per-question correctness immediately; `EXAM` withholds it
until submission) plus an optional `isTimed`/`durationSeconds` pair. There is
no retry: one attempt per (assessment, student), which is `SUSPENDED`
(resumable) until submitted, then `COMPLETED`.

### Implemented assessment schema

| Model                       | Essential responsibility                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Assessment`                | Owner (`STUDENT` private or `ADMIN` public), title, generation type, mode, timer, question count, and status.                  |
| `AssessmentScope`           | One or more course/chapter/lesson/section targets used to generate/visibility-gate the assessment.                            |
| `AssessmentQuestion`        | Ordered immutable snapshot of a selected question's body/type/explanation, with a non-FK `sourceQuestionId` for traceability.  |
| `AssessmentQuestionOption`  | Immutable snapshot of each option's body and correctness.                                                                     |
| `AssessmentAttempt`         | One resumable attempt per (assessment, student): start/expiry/submit state and score.                                        |
| `AssessmentAttemptAnswer`   | Autosaved selected options per snapshot question, upserted while the attempt is in progress.                                  |

All rows above are `[x]`. `QuestionReport` (student flag for a broken/unclear
question) remains `[ ]` — not part of this pass.

The snapshot is enforced: editing or archiving an authoring `Question` never
changes an assessment already generated or completed from it, since
`AssessmentQuestion`/`AssessmentQuestionOption` hold their own copies and
`sourceQuestionId` is a plain non-relational reference.

### Implemented assessment APIs

| Status | Endpoint                                                                       | Purpose                                                                                                    |
| ------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [x]    | `POST /api/v1/student/assessments`                                             | Generate a private `STANDARD` (random-sample) assessment from a chosen scope/count/mode/timer.             |
| [x]    | `GET /api/v1/student/assessments`                                              | Paginated list merging the student's own assessments with visible public admin assessments.                |
| [x]    | `GET /api/v1/student/assessments/:id`                                          | Read one owned or publicly visible assessment's metadata.                                                  |
| [x]    | `PATCH /api/v1/student/assessments/:id`                                        | Rename an owned assessment.                                                                                |
| [x]    | `DELETE /api/v1/student/assessments/:id`                                       | Delete an owned assessment.                                                                                |
| [x]    | `POST /api/v1/student/assessments/:id/attempts/start`                          | Start or idempotently resume the student's attempt.                                                        |
| [x]    | `GET /api/v1/student/assessments/:id/attempts/current`                        | Resumable state: per-question answered flags and remaining time, with mode-aware answer visibility.        |
| [x]    | `POST /api/v1/student/assessments/:id/attempts/current/answers/:questionId`   | Autosave one selected answer; force-submits if the timer has already expired.                              |
| [x]    | `POST /api/v1/student/assessments/:id/attempts/current/submit`                | Idempotently finalize and score the attempt.                                                                |
| [x]    | `GET /api/v1/student/assessments/:id/attempts/current/result`                 | Full review after submission: every question, correct answers, explanations, and the student's answers.   |
| [x]    | `POST /api/v1/admin/assessments/standard`                                     | Admin: create via random sample.                                                                           |
| [x]    | `POST /api/v1/admin/assessments/custom`                                       | Admin: create by hand-picking exact question IDs from the question bank.                                   |
| [x]    | `GET /api/v1/admin/assessments`, `GET /api/v1/admin/assessments/:id`          | Admin listing/detail, including correct answers.                                                            |
| [x]    | `PATCH /api/v1/admin/assessments/:id`                                          | Update title/mode/timer while still `DRAFT`.                                                                |
| [x]    | `POST /api/v1/admin/assessments/:id/publish`                                   | `DRAFT` → `READY`, making it publicly visible to entitled students.                                          |
| [x]    | `POST /api/v1/admin/assessments/:id/archive`                                   | `READY` → `ARCHIVED`, removing it from student lists; past attempts remain readable.                        |
| [x]    | `DELETE /api/v1/admin/assessments/:id`                                        | Hard delete, `DRAFT` only.                                                                                  |
| [ ]    | AI Prompt generation, difficulty bands, source/bank filters, marked/omitted/community-incorrect filters, multiple attempts, question reporting | Explicitly deferred; not built in this pass. |

Do not add a generic `GET /api/v1/student/questions` endpoint that returns raw
question records. Questions are delivered only within an owned/visible
assessment's snapshot, so correct answers and explanations stay protected
until the appropriate reveal point (immediately in `TUTOR` mode, or after
submission in `EXAM` mode).

## Analytics to expose to students

Analytics must come from progress and submitted assessment attempts, not from
the question bank alone.

| Proposed endpoint                                   | Presentation purpose                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/student/analytics/overview`            | Courses owned/completed, chapters completed, study time, latest scores, and continue-learning action.                  |
| `GET /api/v1/student/analytics/courses/:courseId`   | Course and chapter completion plus quiz/exam score history for an entitled course.                                     |
| `GET /api/v1/student/analytics/chapters/:chapterId` | Chapter progress and related practice history.                                                                         |
| `GET /api/v1/student/analytics/questions`           | Optional personal accuracy, skipped count, and average time grouped by the question's course/chapter/lesson placement. |

All student analytics APIs above remain [ ].

Present these as simple Arabic-first student metrics: owned courses, completed
courses/chapters, current completion percentage, study time, recent practice
score, and topics needing more practice. Do not expose question-bank sources,
answer keys, or staff-only question-quality data.

## Future additions, after the core flow

- In-app notifications for payment success, entitlement expiry, generated quiz
  readiness, and result availability.
- Comments tied to a course/chapter/lesson/content item, plus reporting and
  staff moderation. Do not add unrestricted private messaging initially.
- Parent purchase/progress views, where purchaser and entitled student can be
  different users.
- Curriculum objectives/mastery and adaptive question selection once sufficient
  trustworthy response data exists.
- Coupons, subscriptions, bundles, refunds, and referral programs.

## Cross-cutting implementation rules

- [x] Existing student delivery/profile endpoints scope the student to the
      authenticated user; the client does not supply a `studentUserId`.
- [x] Student catalogue APIs obtain grade from the profile, not a request parameter.
- [x] Library APIs return active entitlements across all grades so a grade change
      cannot hide paid content.
- [x] The implemented public catalogue and student content-delivery paths only
      return published hierarchy/content records.
- [x] `Course` ownership covers its chapters; a chapter entitlement covers that
      chapter and descendants only.
- [x] Checkout and manual-payment proof submission require idempotency keys;
      approval is safe to retry and cannot grant a second entitlement.
- [x] Assessment answer autosave upserts per question, and submission is
      idempotent (resubmitting a completed attempt returns the existing score
      rather than rescoring); neither uses an explicit `idempotency-key`
      header the way checkout/payment-proof do.
- [x] Entitlement grants/revocations and admin assessment publish/archive
      actions are audited; grade-change audits remain [ ].
- [x] Existing APIs use the current error envelope, bearer authentication,
      correlation IDs, and pagination conventions.
