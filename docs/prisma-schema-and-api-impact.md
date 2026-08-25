# Prisma schema and API data-impact reference

Reviewed: 2026-08-24  
Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma), Nest controllers,
and the services they call. All versioned endpoints below are prefixed with
`/api/v1`.

For a field-by-field reference to every model, including the direct API route
families that read or write it, see
[the detailed Prisma reference](prisma-schema-detailed-reference.md).

## How to read this document

- **Table** means a Prisma model. No model in the schema has an `@@map`, so its
  PostgreSQL table name is the model name (quoted/case-sensitive when addressed in
  raw SQL).
- **Read** includes a lookup made for authorization, validation, aggregation, or
  response construction. **Write** includes create, update, delete, upsert, and
  transactional child writes.
- The API matrix records the tables directly used by the feature's services. A
  relation included by Prisma may cause an additional SQL read; it is not expanded
  into every row. Background workers/webhooks are called out separately.
- Most administrative mutations also write `AdminAuditLog` through the shared audit
  service. Treat that as an additional write when an endpoint performs an admin
  action, even where it is not listed in the compact matrix.

## Schema at a glance

The database is a PostgreSQL application database. `User` is the account root;
`StudentProfile` and `PartnerProfile` are role-specific one-to-one extensions.
The curriculum is a strict `AcademicGrade → Subject → Course → Chapter → Lesson →
Section` hierarchy. Content, questions, commerce, access grants, and partner
settlement are attached to that hierarchy rather than embedded in it.

Important lifecycle fields recur throughout the schema:

- `status`, `publishedAt`, and `archivedAt` control publishability of curriculum,
  content, questions, and commercial configuration.
- `createdById` / `updatedById` identify staff changes; `createdAt` / `updatedAt`
  support audit and optimistic-concurrency-style API checks.
- Money is stored as integer minor units (`priceMinor`, amounts) with a separate
  currency where applicable.
- Several business rules that Prisma cannot represent (partial unique indexes,
  polymorphic-target checks, lifecycle checks, and triggers) live in
  [`prisma/migrations`](../prisma/migrations/). Read migrations alongside the
  schema before changing an invariant.

## Model catalogue

| Domain | Models and purpose |
| --- | --- |
| Identity and access | `User` — credentials, role, status, soft-deletion metadata; `StudentProfile` — student identity, grade, geography, parent phone; `PartnerProfile` — publisher/referral-partner business profile; `AuthSession` — rotating refresh-token session; `ParentAccessSession` — parent’s selected-child session; `AdminAuditLog` — staff-action audit trail. |
| Geography | `Governorate` — managed governorate; `Center` — governorate-owned education center. Student profiles retain legacy text geography as well as these references. |
| Curriculum | `AcademicGrade`, `Subject`, `Course`, `Chapter`, `Lesson`, `Section` — ordered curriculum hierarchy with publishing/access fields and optional cover assets. |
| Content and assets | `ContentItem` — reusable text/link/media content; `ContentPlacement` — its one curriculum placement; `Asset` — stored/Bunny asset and processing state; `AssetReference` — additional content attachment; `VideoAsset` — Bunny Stream subtype; `VideoOutlineTopic`, `VideoOutlineConcept` — video navigation/learning outline. |
| Question authoring | `QuestionSource` — provenance/publisher source; `QuestionBank` — subject-scoped or general bank; `Question` — authored, reviewed, and published question; `QuestionOption` — answer option; `QuestionAsset` — question attachment; `QuestionVideoLink` — linked `VideoAsset`; `QuestionPlacement` — one-or-more curriculum locations; `QuestionContext` and `QuestionContextQuestion` — shared passage/context and join; `QuestionContentBlock`, `QuestionOptionContentBlock`, `QuestionContextContentBlock` — structured rich content; `QuestionExplanation` — reviewed structured explanation; `QuestionAiExplanationRun` — retained AI proposal and its review outcome. |
| Question import pipeline | `QuestionImportBatch` — import job; `QuestionImportPage` — PDF/page OCR state; `QuestionImportChunk` — LLM work chunk; `QuestionImportItem` — extracted candidate; `QuestionImportSourceBlock`, `QuestionImportAnswerEvidence`, `QuestionImportSkippedRange` — source traceability; `QuestionImportMedia` and `QuestionImportMediaDetection` — detected visual crop/evidence; `QuestionImportMediaAssignment` — candidate-to-question ownership/review; `QuestionImportVisualRequirement` — unresolved visual requirement; `QuestionImportContext` — imported shared context mapped to `QuestionContext`. |
| Assessment definition | `Assessment` — standard/custom assessment; `AssessmentQuestionBank` and `AssessmentScope` — source/scope selectors; `AssessmentQuestion` — frozen question instance; `AssessmentQuestionOption`, `AssessmentQuestionAsset`, `AssessmentQuestionContentBlock` — frozen child content; `AssessmentContext`, `AssessmentQuestionContext`, `AssessmentContextContentBlock` — frozen context; `AssessmentQuestionPlacement` — frozen curriculum placement; `AssessmentQuestionAttribution` — publisher/author attribution. |
| Learning and assessment activity | `AssessmentAttempt` — student attempt; `AssessmentAttemptAnswer` — submitted answer/grade; `AssessmentAnswerAiGradingRun` — AI grading trace; `AssessmentAnswerChange` — answer-change event; `StudentContentProgress` — content completion; `StudentContentStudyState` — resume/last-opened state; `StudentQuestionAttempt` and `StudentQuestionAttemptAnswer` — practice attempts; `StudentQuestionMark`, `StudentQuestionNote` — personal study annotations; `QuestionCommunityStat` — aggregate question statistics; `QuestionReport`, `QuestionReportAction` — student content/report moderation; `AiQuizGenerationRun` — generated quiz trace. |
| Leaderboard | `LeaderboardWeek` — weekly period; `LeaderboardEntry` — ranked student result; `LeaderboardAward` — granted award metadata. |
| Entitlement and archived access | `StudentEntitlement` — active/revoked paid/promotional access to a course/chapter; `ArchivedAccessSnapshot` — retained access snapshot when content is archived. |
| Cart, checkout, and payments | `Cart`, `CartItem` — student shopping cart; `ManualPaymentMethod` — staff-managed payment instruction; `Order`, `OrderItem` — checkout snapshot; `PaymentAttempt` — manual/Paymob attempt; `PaymentReceipt` — payment receipt; `ManualPaymentSubmission` — uploaded proof and staff decision; `PaymobWebhookEvent` — retained provider callback; `CommerceIdempotencyKey` — request replay protection. |
| Promotions and refunds | `DiscountCampaign`, `DiscountCampaignTarget` — discount and course/chapter targets; `Coupon`, `CouponTarget`, `CouponReservation` — coupon definition, target, and checkout reservation; `RefundPolicy` — current policy; `RefundRequest`, `RefundRequestItem` — refund request and its order items. |
| Publisher/referral finance | `PublisherAgreement` — publisher/content terms; `ReferralProgram`, `ReferralCode`, `ReferralCommissionRule`, `ReferralReviewRule` — referral configuration; `OrderReferralAttribution` — accepted order/code attribution; `ReferralReviewFlag`, `ReferralReviewNote` — fraud/review queue; `PartnerAllocation` — payable publisher/referrer share; `PartnerSettlement`, `PartnerSettlementLine` — settlement statement and allocated lines; `PartnerFinanceReconciliationRun`, `PartnerFinanceReconciliationOrder`, `PartnerFinanceDiscrepancy` — reconciliation work and findings; `PublisherUsageDailyRollup`, `PublisherUsageDailySolver` — daily usage reporting and deduplication/solver state. |
| Operations/reporting | `BunnyStreamWebhookEvent` — retained Bunny callback; `ReportExportJob` — requested/processed report export. |

## API-to-table impact matrix

Route fragments in the first column are relative to `/api/v1`. A plural route with
an ID, lifecycle, reorder, or move suffix includes the corresponding controller
actions in that feature.

| API family / route fragments | Read tables | Write tables |
| --- | --- | --- |
| `GET /health`, `/health/ready` | Database connectivity only; no application model is a business target | — |
| `/auth/admins/login`, `/auth/partners/login`, `/auth/students/login`, `/auth/refresh`, `/auth/logout*`, `/auth/me`, `/auth/change-password` | `User`, `AuthSession` | `User` (login/password metadata), `AuthSession` |
| `POST /auth/students/register` | `User`, `StudentProfile`, `AcademicGrade`, `Governorate`, `Center` | `User`, `StudentProfile`, `AuthSession` |
| `/auth/parents/login`, `/auth/parents/children`, `/auth/parents/select-child`, `/auth/parents/selected-child` | `StudentProfile`, `ParentAccessSession` | `ParentAccessSession` |
| `/admin/admins` and `/admin/admins/:id/*` | `User`, `AuthSession` | `User`, `AuthSession`, `AdminAuditLog` |
| `/admin/partners`, `/admin/partners/:id/*`, `/partners/me` | `User`, `PartnerProfile`, `PublisherAgreement`, `PartnerAllocation`, `ReferralProgram` | `User`, `PartnerProfile`, `AuthSession`, `AdminAuditLog` |
| `/students/me`, `/admin/students`, `/admin/students/:id/360*`, `/admin/students/:id/*` | `User`, `StudentProfile`, `AcademicGrade`, `Governorate`, `Center`, `Order`, `StudentEntitlement`, `AssessmentAttempt`, `AdminAuditLog` | `User`, `StudentProfile`, `AuthSession`, `AdminAuditLog` |
| `/geography/governorates`, `/admin/geography/*` | `Governorate`, `Center`, `StudentProfile` (delete safety) | `Governorate`, `Center` |
| `/academic-grades`, `/admin/academic-grades/*` | `AcademicGrade`, `Subject` | `AcademicGrade`, `AdminAuditLog` |
| `/admin/subjects/*` | `AcademicGrade`, `Subject`, `Course` | `Subject`, `AdminAuditLog` |
| `/admin/courses/*` | `Subject`, `Course`, `Chapter` | `Course`, `AdminAuditLog` |
| `/admin/chapters/*` | `Course`, `Chapter`, `Lesson` | `Chapter`, `AdminAuditLog` |
| `/admin/lessons/*` | `Chapter`, `Lesson`, `Section` | `Lesson`, `AdminAuditLog` |
| `/admin/sections/*` | `Lesson`, `Section` | `Section`, `AdminAuditLog` |
| `/admin/content-items/*` | `ContentItem`, `ContentPlacement`, `Course`, `Chapter`, `Lesson`, `Section`, `AssetReference` | `ContentItem`, `ContentPlacement`, `AssetReference`, `AdminAuditLog` |
| `/admin/assets/*`, `/admin/*/cover*`, protected asset-access routes | `Asset`, `AssetReference`, `VideoAsset`, curriculum cover owners, question/assessment content-block and asset-link tables, `ManualPaymentSubmission`, `QuestionImportMedia` | `Asset`, `AssetReference`, `VideoAsset`, cover-owner records, `AdminAuditLog` |
| `/admin/videos/*`, Bunny video webhook endpoint | `Asset`, `VideoAsset`, `BunnyStreamWebhookEvent` | `Asset`, `VideoAsset`, `BunnyStreamWebhookEvent` |
| `/admin/question-banks/*`, question-source/question CRUD and review routes | `QuestionBank`, `QuestionSource`, `Question`, `QuestionOption`, `QuestionAsset`, `QuestionVideoLink`, `QuestionPlacement`, `QuestionContext*`, `Question*ContentBlock`, `QuestionExplanation`, curriculum tables, `Asset`, `PartnerProfile` | The same authoring tables except curriculum; also `AdminAuditLog` |
| `/admin/questions/:questionId/ai/re-answer/*` | `Question`, `QuestionAiExplanationRun` | `QuestionAiExplanationRun`; applying an approved run may update `Question` and `QuestionExplanation`; `AdminAuditLog` |
| `/admin/question-imports/*` | `QuestionImportBatch`, `QuestionImportPage`, `QuestionImportChunk`, `QuestionImportItem`, import evidence/media tables, `Asset`, `QuestionBank`, `QuestionSource`, `Course` | Import batch/page/chunk/item/evidence/media tables; materialization can write `Asset`, `Question`, question child/link tables, and `AdminAuditLog` |
| `/student/assessments/*` (create AI prompt, lists, marks/notes/reports) | `Assessment`, `QuestionBank`, `QuestionSource`, `Question`, `StudentProfile`, `StudentEntitlement`, `QuestionCommunityStat`, personal assessment tables | `AiQuizGenerationRun`, `StudentQuestionMark`, `StudentQuestionNote`, `QuestionReport` |
| `/student/assessments/:id/attempts/*` and result/analytics | `Assessment`, frozen `Assessment*` tables, `AssessmentAttempt`, `AssessmentAttemptAnswer`, `Question`, `StudentEntitlement` | `AssessmentAttempt`, `AssessmentAttemptAnswer`, `AssessmentAnswerChange`, `QuestionCommunityStat` |
| `/admin/assessments/*`, grading, question-report review | `Assessment`, frozen `Assessment*` tables, attempts/answers, `QuestionReport`, `Question`, curriculum tables | `Assessment` and frozen `Assessment*` tables, `AssessmentAttemptAnswer`, `AssessmentAnswerAiGradingRun`, `QuestionReport`, `QuestionReportAction`, `AdminAuditLog` |
| `/student/content-items/:id`, `/catalog/content-items/:id`, protected content asset access | `ContentItem`, `AssetReference`, `StudentEntitlement`, `StudentContentProgress`, `StudentContentStudyState`, `VideoOutlineTopic` | — |
| `/student/content-items/:id/complete`, `/student/content-items/:id/study-state`, `/student/learning/*` | `ContentItem`, `StudentProfile`, `StudentEntitlement`, `Order`, `Question`, `AssessmentAttemptAnswer` | `StudentContentProgress`, `StudentContentStudyState`, `StudentQuestionAttempt`, `StudentQuestionAttemptAnswer`, `StudentQuestionMark`, `StudentQuestionNote` |
| `/student/performance/*`, `/parent/selected-child/performance/*` | `StudentProfile`, `AssessmentAttemptAnswer`, `StudentQuestionAttempt`, `AssessmentAnswerChange`, `Question` | — |
| `/leaderboard/*` | `LeaderboardWeek`, `LeaderboardEntry`, `LeaderboardAward`, `AssessmentAttempt`, `StudentProfile` | `LeaderboardWeek`, `LeaderboardEntry`, `LeaderboardAward` (week finalization) |
| `/catalog/*`, `/student/my-subjects`, `/student/catalog/search` | Published curriculum, `ContentItem`, `ContentPlacement`, `StudentEntitlement`, `StudentContentProgress`, `StudentProfile` | — |
| `/admin/entitlements/*`, archived-access actions | `StudentEntitlement`, `User`, curriculum, `ContentItem`, `StudentContentProgress`, `StudentContentStudyState` | `StudentEntitlement`, `ArchivedAccessSnapshot`, `AdminAuditLog` |
| `/student/cart*`, `/student/price-preview`, `/student/checkout` | `Cart`, `CartItem`, purchasable `Course`/`Chapter`, promotions/coupons, `StudentProfile`, existing entitlements | `Cart`, `CartItem`, `CouponReservation`, `CommerceIdempotencyKey`, `Order`, `OrderItem`, `PaymentAttempt`, `OrderReferralAttribution` |
| `/student/orders/*`, Paymob attempt/webhook, payment-proof upload/resubmit | `Order`, `OrderItem`, `PaymentAttempt`, `ManualPaymentSubmission`, `ManualPaymentMethod`, `Asset`, `PaymobWebhookEvent` | `Order`, `PaymentAttempt`, `ManualPaymentSubmission`, payment-proof `Asset`, `PaymobWebhookEvent`, `StudentEntitlement`, `PartnerAllocation` |
| `/student/orders/:id/refund-requests`, `/student/refund-requests` | `Order`, `OrderItem`, `RefundPolicy`, `RefundRequest` | `RefundRequest`, `RefundRequestItem` |
| `/admin/refunds/*` and policy | `RefundRequest`, `RefundRequestItem`, `RefundPolicy`, `Order`, `StudentProfile` | `RefundPolicy`, `RefundRequest`, `Order`, `StudentEntitlement`, `PartnerAllocation`, `AdminAuditLog` |
| `/admin/publisher-agreements/*` | `PartnerProfile`, `PublisherAgreement`, `Course`, `Chapter`, `Lesson` | `PublisherAgreement`, `AdminAuditLog` |
| `/partners/analytics/*` | `PartnerProfile`, `PartnerAllocation`, `AssessmentAttempt`, `Question`, `PublisherUsageDailyRollup`, `PublisherUsageDailySolver`, `PublisherAgreement` | — |
| `/admin/partner-finance/*` | `PartnerAllocation`, `PartnerSettlement`, `PartnerSettlementLine`, `PublisherAgreement`, `Order`, `PaymobWebhookEvent` | `PartnerSettlement`, `PartnerSettlementLine`, `PublisherUsageDailyRollup`, `PublisherUsageDailySolver`, `PartnerFinanceReconciliationRun`, `PartnerFinanceReconciliationOrder`, `PartnerFinanceDiscrepancy`, `AdminAuditLog` |
| `/admin/referral-programs/*` and review-flag routes | `ReferralProgram`, `ReferralCode`, `ReferralCommissionRule`, `ReferralReviewRule`, `OrderReferralAttribution`, `ReferralReviewFlag`, `ReferralReviewNote`, partner/curriculum tables | Referral configuration/review tables plus `AdminAuditLog` |
| `/partners/referrals/*`, `/admin/referral-reporting` | `PartnerProfile`, `ReferralProgram`, `OrderReferralAttribution`, `PartnerAllocation`, `PartnerSettlement`, `Order`, `Course`, `Chapter` | — |
| `/admin/reports/*` | `Order`, `PaymentAttempt`, `RefundRequest`, `RefundRequestItem`, `StudentProfile`, `StudentEntitlement`, `PartnerAllocation`, `PartnerSettlement`, `ReportExportJob` | `ReportExportJob` (queue, cancel, processing state) |

## Non-request writers and side effects

Some records are changed outside the ordinary request that originally created them:

- The question-import worker advances `QuestionImportBatch`, page/chunk/item and
  evidence/media records; on materialization it creates authoring records and assets.
- Bunny and Paymob callbacks persist `BunnyStreamWebhookEvent` / `PaymobWebhookEvent`
  and update the corresponding video or payment/order state.
- Publisher-usage rebuild and finance reconciliation create rollups, solver rows,
  reconciliation runs/orders/discrepancies, settlements, and settlement lines.
- Leaderboard finalization creates/updates week, entries, and awards.
- Report-export processing advances `ReportExportJob`; the table stores status and
  download metadata rather than the report's transactional source data.

## Change-impact checklist

Before changing a model, start with its row in the API matrix, then check:

1. Its foreign-key relations and all matching `onDelete` behavior in the schema.
2. Any raw SQL constraint or trigger in the migration that introduced or altered it.
3. The feature service and its controller DTOs, including authorization checks.
4. Background workers/webhook handlers for asynchronously maintained tables.
5. Existing API reference and integration tests; the older testing inventory may not
   reflect newer controllers, so controllers and services remain authoritative.
