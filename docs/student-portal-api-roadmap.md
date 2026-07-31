# Student Portal API Roadmap

> **Status: proposed reference only.** This is a logical API and schema roadmap
> based on the current repository. It is not an implemented API contract.
> Implemented endpoints remain documented in
> [api-reference-compact.md](api-reference-compact.md).

## Implementation status (reviewed 2026-07-30)

- [x] Student registration and profile updates persist a published
  `academicGradeId`.
- [x] The published public catalogue supports grades, grade-filtered subjects,
  subject-filtered courses, course details, and a full course outline with
  entitlement-aware lock indicators.
- [x] Course/chapter pricing and course/chapter `StudentEntitlement` records
  exist; entitled students can retrieve published content and protected assets.
- [ ] Commerce, progress, assessments, and analytics APIs in this roadmap are
  not implemented.

`[x]` means the implementation exists. `[ ]` means the item remains planned;
an existing endpoint with a narrower or different response is called out in
the relevant section rather than being marked complete.

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

| Area | Status | Already present | Gap to close |
| --- | --- | --- | --- |
| Grade selection | [x] | Registration accepts `academicGradeId`; `PATCH /api/v1/students/me` can change it. | — |
| Public hierarchy | [x] Foundation | `GET /api/v1/academic-grades`, `GET /api/v1/catalog/subjects`, `GET /api/v1/catalog/courses`, and `GET /api/v1/catalog/courses/:id/outline` exist. | No public chapter/lesson hierarchy APIs; list APIs require callers to know parent IDs. |
| Paid access | [x] Foundation | Course and chapter have price/purchasable fields; `StudentEntitlement` supports course or chapter; student library and entitlement views exist. | No order, payment, or checkout. |
| Questions | [x] Authoring only | Questions are linked to a course and may be placed at course/chapter/lesson/section level. | No learner-safe question delivery, generated quiz, attempt, answer, result, or history model. |
| Content delivery | [x] Foundation | An entitled student can fetch a content item and its protected assets. | No progress, resume, next-item navigation, or completion view. |

Question banks and sources are authoring/provenance metadata. They are not a
student catalogue concept and must not be exposed in learner responses.

## API design: two catalogue views

### A. Public catalogue — published hierarchy only

These routes support registration, marketing pages, and visitors. They return
only published records and contain no personal entitlement information.

| Proposed endpoint | Purpose |
| --- | --- |
| `GET /api/v1/academic-grades` | Existing public grade list; retain as the registration grade selector. |
| `GET /api/v1/catalog/grades/:gradeId` | Published grade detail and its published subjects. |
| `GET /api/v1/catalog/grades/:gradeId/subjects` | Subjects belonging to one published grade. |
| `GET /api/v1/catalog/subjects/:subjectId/courses` | Courses belonging to one published subject. |
| `GET /api/v1/catalog/courses/:courseId` | Existing public course detail; include effective public price/purchasability. |
| `GET /api/v1/catalog/courses/:courseId/chapters` | Published chapter list, with public price/purchasability and no student access state. |
| `GET /api/v1/catalog/chapters/:chapterId` | Published chapter detail and its lessons/sections/content preview metadata. |

Completed equivalents:

- [x] `GET /api/v1/academic-grades`
- [x] `GET /api/v1/catalog/subjects?academicGradeId=`
- [x] `GET /api/v1/catalog/courses?subjectId=`
- [x] `GET /api/v1/catalog/courses/:courseId`
- [x] `GET /api/v1/catalog/courses/:courseId/outline` — an implemented equivalent
  that returns the published nested outline and entitlement-aware locks. It
  does not yet expose the proposed public pricing fields or dedicated chapter
  routes.

The existing `GET /api/v1/catalog/subjects?academicGradeId=` and
`GET /api/v1/catalog/courses?subjectId=` can remain. The nested routes above make the
hierarchy discoverable without the frontend constructing filters itself.

### B. Student catalogue — current grade and personal access state

These routes require `STUDENT`. The server reads `StudentProfile.academicGradeId`
from the token; clients must not choose a grade ID in this API. This prevents a
student from browsing other grades by changing a query parameter.

| Status | Endpoint | Purpose |
| --- | --- | --- |
| [x] | `GET /api/v1/student/catalog` | Current grade and published hierarchy summary counts. |
| [x] | `GET /api/v1/student/catalog/subjects` | Only published subjects of the student's current grade. |
| [x] | `GET /api/v1/student/catalog/subjects/:subjectId/courses` | Grade-scoped published courses with server-resolved `access`, lock state, and effective course price. |
| [x] | `GET /api/v1/student/catalog/courses/:courseId` | Grade-scoped course detail and published chapters, each with server-resolved access, price, and lock state. |
| [x] | `GET /api/v1/student/catalog/chapters/:chapterId` | Grade-scoped chapter detail with published lessons, sections, content preview metadata, and lock/access states. |
| [x] | `GET /api/v1/student/library` | Active course/chapter entitlements across grades, grouped with their published hierarchy and expiry. |
| [x] | `GET /api/v1/student/entitlements` | The authenticated student's raw, paginated active entitlement records. |

Completion/progress summaries and last activity remain future work. The public
course outline continues to provide a visitor-friendly alternative, but the
routes above are the grade-scoped student catalogue.

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

| Model | Essential responsibility |
| --- | --- |
| `Cart` / `CartItem` | One active cart per student; item targets exactly one course or chapter. |
| `ManualPaymentMethod` | Admin-managed, active payment instructions shown to students (for example, transfer account/wallet details, title, and display order). The order snapshots the selected method text so later edits do not change an existing payment request. |
| `Order` | Immutable purchase snapshot: student, total EGP amount, selected manual-payment instruction snapshot, lifecycle status, timestamps. |
| `OrderItem` | Immutable price and target snapshot for each purchased course/chapter. |
| `ManualPaymentSubmission` | A student's submitted transfer reference, optional note, receipt-proof asset, review status, reviewer, rejection reason, and timestamps. Keep the submission history so a rejected order can be corrected and resubmitted. |
| `Refund` | Refund/cancellation history and corresponding entitlement action, when refunds become part of the operating process. |

All schema additions above remain [ ]. The existing `StudentEntitlement` model
already supports exactly one course or chapter target and is the implemented
foundation for the proposed fulfilment flow.

`StudentEntitlement` remains the authoritative access record. An **approved**
manual-payment submission creates exactly one entitlement per order item with
`source = PAYMENT`. Add an optional `orderItemId` reference (or equivalent
immutable source reference) to make the grant traceable and prevent
duplication.

Recommended lifecycle:

```text
DRAFT_CART → AWAITING_PAYMENT → SUBMITTED → UNDER_REVIEW → APPROVED
                                        └──→ REJECTED → SUBMITTED (replacement proof)
AWAITING_PAYMENT / REJECTED → CANCELLED or EXPIRED
```

Only an administrator may transition a submission to `APPROVED` or `REJECTED`.
Approval, order status change, and entitlement creation must run in one
database transaction. Repeating the approval request must be idempotent and
must never create a second entitlement. A receipt proof is private: only its
owner and authorized administrators may retrieve it; it must not use the
existing admin-only general asset upload endpoint.

### Proposed commerce APIs

| Proposed endpoint | Purpose |
| --- | --- |
| `POST /api/v1/student/cart/items` | Add an eligible course or chapter. The server validates grade, publication, purchasability, price, and existing access. |
| `GET /api/v1/student/cart` | Cart lines with server-calculated current totals and EGP prices. |
| `DELETE /api/v1/student/cart/items/:itemId` | Remove a line. |
| `GET /api/v1/student/manual-payment-methods` | Active payment instructions the frontend can present before the student creates an order. |
| `POST /api/v1/student/checkout` | Atomically create an `AWAITING_PAYMENT` order and immutable order items, snapshotting the selected payment method and server-calculated EGP total. |
| `GET /api/v1/student/orders` | Student purchase history. |
| `GET /api/v1/student/orders/:orderId` | One order, selected instruction snapshot, submission/review state, any safe rejection reason, purchased targets, and fulfilment state. |
| `POST /api/v1/student/orders/:orderId/payment-proof` | Upload one receipt image and transfer reference for an eligible order, creating a `SUBMITTED` manual-payment submission. |
| `POST /api/v1/student/orders/:orderId/payment-submissions/:submissionId/resubmit` | Submit replacement proof after a rejection; preserve the rejected submission as audit history. |
| `GET /api/v1/admin/manual-payment-methods` | List configured payment instructions, including inactive methods. |
| `POST /api/v1/admin/manual-payment-methods` | Create a payment instruction. |
| `PATCH /api/v1/admin/manual-payment-methods/:id` | Update, reorder, activate, or deactivate a payment instruction. |
| `GET /api/v1/admin/payment-submissions` | Queue of submitted/reviewable payments, filterable by status, student, and date. |
| `GET /api/v1/admin/payment-submissions/:id` | Full review view, including the private proof asset and immutable order snapshot. |
| `POST /api/v1/admin/payment-submissions/:id/approve` | Atomically approve the submission and grant its order's entitlements once. |
| `POST /api/v1/admin/payment-submissions/:id/reject` | Reject with a staff-visible and student-safe reason; the student may resubmit if the order remains eligible. |

All commerce APIs above remain [ ].

The API server—not the client—is authoritative for price, total, eligibility,
payment state, review decisions, and entitlement fulfilment. Checkout, proof
submission, and approval require idempotency. The displayed payment
instruction is guidance only; an uploaded proof is not itself a verified
payment and must grant no access until approved.

## Learning and completion APIs

| Proposed endpoint | Purpose |
| --- | --- |
| `GET /api/v1/student/content-items/:contentItemId` | Extend the existing protected delivery response with navigation and the student's saved progress. |
| `PUT /api/v1/student/content-items/:contentItemId/progress` | Idempotently save read/watch position, elapsed seconds, and client completion signal. |
| `POST /api/v1/student/content-items/:contentItemId/complete` | Mark eligible non-media content complete. |
| `GET /api/v1/student/progress` | Course/chapter/lesson completion totals for the current grade. |
| `GET /api/v1/student/library/:targetType/:targetId/progress` | Detailed course or chapter progress for an owned target. |
| `GET /api/v1/student/home` | Continue-learning item, owned-course count, completed-course/chapter count, and latest generated practice result. |

All progress APIs above remain [ ]. `GET /api/v1/student/content-items/:contentItemId`
is implemented for access-controlled delivery, but does not yet return
navigation or saved progress.

Add `StudentContentProgress` keyed by `(studentUserId, contentItemId)`, with
position, elapsed time, completion status, and last-accessed timestamp. Derive
course/chapter/lesson completion from accessible published content and these
records; do not store competing totals unless they are deliberate cached
aggregates.

## AI-generated quizzes and exams from the existing question bank

There is no assessment domain today. The student creates a quiz/exam request;
AI may help choose a balanced set of **existing reviewed, published questions**.
AI must not create unreviewed live questions or change correct answers.

Question selection must always be limited to:

1. The student's current academic grade.
2. A selected course, chapter, lesson, or section in that grade.
3. Published questions whose course and placement are published.
4. Content the student is entitled to, unless the product explicitly defines a
   free public practice set.

### Required assessment schema

| Model | Essential responsibility |
| --- | --- |
| `StudentAssessment` | Student-owned generated quiz/exam: requested scope, type, question count, timing rules, generation status, and creation time. |
| `StudentAssessmentQuestion` | Ordered immutable snapshot of selected question body, options, answer key, explanation, assets, and placement. |
| `StudentAssessmentAttempt` | Start/submit/expiry state, score, duration, and result-release state. |
| `StudentAssessmentAnswer` | One saved selected-option set per attempt question, with timestamps. |
| `QuestionReport` | Student flag for a broken, incorrect, or unclear question. |

All assessment schema additions above remain [ ]. Existing question-bank
records provide authoring data only; they are not a learner assessment model.

The snapshot is required: editing or archiving an authoring question must not
change an assessment that a student has already created or completed.

### Proposed student assessment APIs

| Proposed endpoint | Purpose |
| --- | --- |
| `POST /api/v1/student/assessments` | Create an AI-assisted generation request. Input: scope (`courseId`/`chapterId`/`lessonId`/`sectionId`), quiz type, question count, optional duration/difficulty preference. |
| `GET /api/v1/student/assessments` | List only assessments created by the authenticated student, with generation, attempt, and result status. |
| `GET /api/v1/student/assessments/:assessmentId` | Read one owned assessment's metadata and generation state. |
| `POST /api/v1/student/assessments/:assessmentId/attempts` | Start or resume the student's attempt; return learner-safe question snapshots with no answer keys/explanations. |
| `GET /api/v1/student/attempts/:attemptId` | Resume active attempt with saved answers and server-calculated remaining time. |
| `PUT /api/v1/student/attempts/:attemptId/answers/:questionId` | Idempotently autosave selected option IDs. |
| `POST /api/v1/student/attempts/:attemptId/submit` | Idempotently submit and score the attempt; server time controls expiry. |
| `GET /api/v1/student/attempts/:attemptId/result` | Score, correct/incorrect/unanswered outcomes, explanations, time, and scope breakdown after submission. |
| `POST /api/v1/student/attempts/:attemptId/questions/:questionId/report` | Flag a question for staff review. |

All student assessment APIs above remain [ ].

Do not add a generic `GET /api/v1/student/questions` endpoint that returns raw question
records. Questions must be delivered within an owned assessment attempt so
correct answers, explanations, option metadata, and question exposure stay
protected. If the product later wants a free question browser, it should still
create a lightweight practice attempt behind the scenes.

## Analytics to expose to students

Analytics must come from progress and submitted assessment attempts, not from
the question bank alone.

| Proposed endpoint | Presentation purpose |
| --- | --- |
| `GET /api/v1/student/analytics/overview` | Courses owned/completed, chapters completed, study time, latest scores, and continue-learning action. |
| `GET /api/v1/student/analytics/courses/:courseId` | Course and chapter completion plus quiz/exam score history for an entitled course. |
| `GET /api/v1/student/analytics/chapters/:chapterId` | Chapter progress and related practice history. |
| `GET /api/v1/student/analytics/questions` | Optional personal accuracy, skipped count, and average time grouped by the question's course/chapter/lesson placement. |

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
- Use idempotency keys for checkout, manual-payment proof submission, payment
  approval, answer autosave, and assessment submission.
- [x] Entitlement grants and revocations are audited; payment, grade-change,
  and generated-assessment audits remain [ ].
- [x] Existing APIs use the current error envelope, bearer authentication,
  correlation IDs, and pagination conventions.
