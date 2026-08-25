# Detailed Prisma schema, business logic, and API impact

Reviewed: 2026-08-24  
Source: prisma/schema.prisma, controllers, and non-test service code. The business narrative is inferred only from those sources.

For a compact endpoint-family read/write matrix, see
[Prisma schema and API data-impact reference](prisma-schema-and-api-impact.md).

## How the system works

1. **Accounts:** User is the root account; students and partners have role-specific profiles. Refresh and parent access use distinct session records.
2. **Curriculum:** staff publish an ordered AcademicGrade -> Subject -> Course -> Chapter -> Lesson -> Section hierarchy. Content is separately authored and placed in that hierarchy.
3. **Learning:** entitlements grant paid/promotional access. Progress, private study state, practice, attempts, and leaderboard results are separate histories.
4. **Commerce:** carts are priced using promotions/coupons; checkout creates orders and payment attempts; payment can grant access and create partner allocations. Refunds can unwind those outcomes.
5. **Partners:** publisher/referral configuration produces attribution and allocations, then settlements, reconciliation, and reporting.

## Reading this reference

- Each heading is a Prisma model and database table. There is no @@map, so model names are PostgreSQL table names.
- ? means nullable. [] is an inverse Prisma relation, not a physical array column.
- Direct API use is a static trace of direct Prisma reads/writes. It lists route families, not every nested relation or worker write. Administrative mutations generally also create AdminAuditLog rows.

## Enumerations

- Role: SUPER_ADMIN, ADMIN, PARTNER, STUDENT.
- AccountStatus: ACTIVE, SUSPENDED, DISABLED.
- PartnerType: CONTENT_PUBLISHER, REFERRAL_PARTNER.
- ContentStatus: DRAFT, PUBLISHED, ARCHIVED.
- ContentItemType: TEXT, EXTERNAL_LINK, VIDEO, PDF, IMAGE, DOCUMENT, DOWNLOADABLE_FILE.
- AccessType: PUBLIC, FREE, PAID, INHERIT.
- EntitlementSource: ADMIN, PROMOTION, MIGRATION, PAYMENT.
- EntitlementStatus: ACTIVE, REVOKED.
- CommerceTargetType: COURSE, CHAPTER.
- OrderStatus: AWAITING_PAYMENT, SUBMITTED, APPROVED, REJECTED, CANCELLED, EXPIRED.
- PaymentChannel: MANUAL, PAYMOB.
- PaymentAttemptStatus: INITIATED, PENDING, PAID, DECLINED, FAILED, EXPIRED.
- PromotionKind: PERCENTAGE, FIXED.
- CouponReservationStatus: RESERVED, REDEEMED, RELEASED.
- ManualPaymentSubmissionStatus: SUBMITTED, APPROVED, REJECTED.
- RefundRequestStatus: PENDING, APPROVED, REJECTED.
- PublisherAgreementStatus: DRAFT, ACTIVE, ENDED.
- PartnerAllocationKind: PUBLISHER_SALE, REFERRAL_COMMISSION.
- PartnerAllocationState: PENDING, PAYABLE, PAID, REVERSED.
- PublisherUsageScope: ALL, SUBJECT, COURSE, CHAPTER, LESSON, SECTION.
- PartnerFinanceReconciliationStatus: DRAFT, RUNNING, COMPLETED.
- PartnerFinanceDiscrepancySeverity: INFO, WARNING, ERROR.
- PartnerFinanceDiscrepancyStatus: OPEN, ASSIGNED, RESOLVED, ACCEPTED.
- ReferralProgramStatus: DRAFT, ACTIVE, ENDED, SUSPENDED.
- ReferralCommissionKind: PERCENTAGE, FIXED_PER_SALE, PERCENTAGE_CAPPED.
- ReferralReviewRuleKind: STUDENT_PROGRAM_APPROVED_SALES, STUDENT_CODE_APPROVED_SALES.
- ReferralReviewAction: BLOCK_CHECKOUT, QUEUE_REVIEW.
- ReferralReviewFlagSource: AUTOMATED, MANUAL.
- ReferralReviewStatus: OPEN, ASSIGNED, RESOLVED, ACCEPTED.
- ReferralReviewDisposition: CLEARED, CONFIRMED_FRAUD, NO_ACTION, ESCALATED.
- AssessmentAttributionRole: PRIMARY, CONTRIBUTOR, UNKNOWN_LEGACY.
- ReportExportStatus: QUEUED, PROCESSING, COMPLETED, FAILED, CANCELLED, EXPIRED.
- ReportDataClassification: NON_PII, PII_RESTRICTED.
- AssetProvider: BUNNY_STORAGE, BUNNY_STREAM.
- AssetKind: COVER_IMAGE, IMAGE, PAYMENT_PROOF, PDF, DOCUMENT, DOWNLOADABLE_FILE, VIDEO.
- AssetStatus: PENDING_UPLOAD, UPLOADING, UPLOADED_AWAITING_PROCESSING, PROCESSING, READY, FAILED, ARCHIVED.
- AssetReferenceType: CONTENT_ATTACHMENT.
- ArchivedAccessResourceType: ACADEMIC_GRADE, SUBJECT, COURSE, CHAPTER, LESSON, SECTION.
- VideoProcessingStatus: CREATED, UPLOADING, QUEUED, PROCESSING, READY, FAILED.
- QuestionSourceType: PLATFORM, CONTENT_PUBLISHER, EXTERNAL_BOOK, PREVIOUS_EXAM, MINISTRY_MODEL.
- QuestionStatus: DRAFT, IN_REVIEW, PUBLISHED, REJECTED, ARCHIVED.
- QuestionType: SINGLE_CHOICE, MULTIPLE_CHOICE, SHORT_ANSWER, FILL_IN_THE_BLANK, LONG_ANSWER.
- QuestionContextType: TEXT, IMAGE, TABLE, EQUATION.
- QuestionContentBlockType: TEXT, IMAGE, ASSET, TABLE, EQUATION.
- QuestionExplanationOrigin: AI, HUMAN.
- QuestionAiExplanationRunMode: INFER, GROUNDED.
- QuestionAiExplanationRunStatus: PENDING_REVIEW, APPLIED, REJECTED, FAILED.
- QuestionAnswerOrigin: EXPLICIT, INFERRED.
- QuestionAnswerProvenance: OFFICIAL, SOURCE_MARKED, AI_INFERRED, HUMAN_REVIEWED.
- QuestionImportInputType: RAW_TEXT, ASSET.
- QuestionImportStatus: QUEUED, EXTRACTING, TRANSCRIBING, SEGMENTING, AWAITING_REVIEW, GENERATING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED.
- QuestionImportPageStatus: PENDING, PROCESSING, EXCLUDED, AI_TRANSCRIBED, REVIEW_REQUIRED, FAILED.
- QuestionImportPageKind: COVER_OR_INDEX, QUESTION, ANSWER_FORM.
- QuestionImportChunkStatus: PENDING, PROCESSING, COMPLETED, FAILED.
- QuestionImportItemStatus: PROCESSING, CREATED, REVIEW_REQUIRED, EXCLUDED, INVALID, FAILED.
- QuestionImportMediaStatus: REVIEW_REQUIRED, ELIGIBLE, REJECTED, FAILED.
- QuestionImportMediaType: DIAGRAM, CHART, MAP, TABLE, EQUATION, PHOTO, OPTION_IMAGE, OTHER_INSTRUCTIONAL.
- QuestionImportMediaDetectionSource: AI, MANUAL.
- QuestionImportMediaAssignmentOwner: QUESTION, OPTION, CONTEXT.
- QuestionImportMediaAssignmentStatus: PROPOSED, VERIFIED, APPROVED, REJECTED.
- QuestionImportVisualRequirementKind: NONE, QUESTION_FIGURE, COMPOSITE_OPTION_FIGURE, OPTION_IMAGE_SET, SHARED_STIMULUS.
- QuestionImportVisualResolutionState: NOT_REQUIRED, PENDING, RESOLVED, UNRESOLVED, AMBIGUOUS, INCOMPLETE_CROP.
- QuestionImportMediaCropCompleteness: UNKNOWN, COMPLETE, POSSIBLY_CLIPPED, INCOMPLETE.
- AssessmentOwnerType: STUDENT, ADMIN.
- AssessmentGenerationType: STANDARD, CUSTOM, AI_PROMPT.
- AssessmentMode: TUTOR, EXAM.
- AssessmentStatus: DRAFT, READY, ARCHIVED.
- AssessmentAttemptStatus: SUSPENDED, COMPLETED.
- AssessmentQuestionOutcome: CORRECT, PARTIALLY_CORRECT, INCORRECT, OMITTED, PENDING_GRADING, PENDING_AI_GRADING.
- AnswerInputMethod: TEXT, VOICE_TRANSCRIPT.
- AiRunStatus: PENDING, COMPLETED, FAILED.
- QuestionReportType: WRONG_ANSWER, UNCLEAR_WORDING, TYPO_LANGUAGE, MISSING_OR_BROKEN_MEDIA, DUPLICATE, OTHER.
- QuestionReportStatus: OPEN, UNDER_REVIEW, RESOLVED, REJECTED.
- QuestionDifficultyBand: A_PLUS, A, B, C, D.

## Tables

### User

**Domain:** identity and audit  
**Why this table exists:** The login/account root for every role.

**Direct API use (static trace)**

- Read by: /admin/admins/*; application module; /auth/*; entitlement and content-access routes; /partners/me and /admin/partners/*; referral-program and reporting routes; /students/me and /admin/students/*; internal account service
- Written by: /admin/admins/*; /auth/*; /partners/me and /admin/partners/*; internal account service

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| role | Role | Controlled value from Role. |
| status | AccountStatus | Lifecycle state from AccountStatus. |
| loginIdentifier | String | Normalized sign-in identifier. |
| passwordHash | String | One-way password hash. |
| mustChangePassword | Boolean | Flag indicating whether must change password applies. |
| passwordResetAt | DateTime? | Timestamp for password reset at. Optional. |
| deletedAt | DateTime? | Soft-deletion timestamp. |
| deletedById | String? | Reference ID for deleted by. Optional. |
| deletionReason | String? | Stored string value for deletion reason. Optional. |
| deletedBy | User? | Relation to User. Optional. |
| deletedUsers | User[] | Inverse collection of related User records. |
| lastLoginAt | DateTime? | Timestamp for last login at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| studentProfile | StudentProfile? | Relation to StudentProfile. Optional. |
| partnerProfile | PartnerProfile? | Relation to PartnerProfile. Optional. |
| authSessions | AuthSession[] | Inverse collection of related AuthSession records. |
| auditLogsActor | AdminAuditLog[] | Inverse collection of related AdminAuditLog records. |
| partnerProfilesCreated | PartnerProfile[] | Inverse collection of related PartnerProfile records. |
| entitlementsGranted | StudentEntitlement[] | Inverse collection of related StudentEntitlement records. |
| entitlementsRevoked | StudentEntitlement[] | Inverse collection of related StudentEntitlement records. |
| manualPaymentMethodsCreated | ManualPaymentMethod[] | Inverse collection of related ManualPaymentMethod records. |
| manualPaymentSubmissionsReviewed | ManualPaymentSubmission[] | Inverse collection of related ManualPaymentSubmission records. |
| refundRequestsReviewed | RefundRequest[] | Inverse collection of related RefundRequest records. |
| publisherAgreementsCreated | PublisherAgreement[] | Inverse collection of related PublisherAgreement records. |
| refundPoliciesUpdated | RefundPolicy[] | Inverse collection of related RefundPolicy records. |
| reconciliationRunsCreated | PartnerFinanceReconciliationRun[] | Inverse collection of related PartnerFinanceReconciliationRun records. |
| reconciliationDiscrepanciesAssigned | PartnerFinanceDiscrepancy[] | Inverse collection of related PartnerFinanceDiscrepancy records. |
| reconciliationDiscrepanciesResolved | PartnerFinanceDiscrepancy[] | Inverse collection of related PartnerFinanceDiscrepancy records. |
| referralReviewRulesCreated | ReferralReviewRule[] | Inverse collection of related ReferralReviewRule records. |
| referralReviewFlagsAssigned | ReferralReviewFlag[] | Inverse collection of related ReferralReviewFlag records. |
| referralReviewFlagsResolved | ReferralReviewFlag[] | Inverse collection of related ReferralReviewFlag records. |
| referralReviewNotesCreated | ReferralReviewNote[] | Inverse collection of related ReferralReviewNote records. |
| reportExportsRequested | ReportExportJob[] | Inverse collection of related ReportExportJob records. |
| academicGradesCreated | AcademicGrade[] | Inverse collection of related AcademicGrade records. |
| academicGradesUpdated | AcademicGrade[] | Inverse collection of related AcademicGrade records. |
| subjectsCreated | Subject[] | Inverse collection of related Subject records. |
| subjectsUpdated | Subject[] | Inverse collection of related Subject records. |
| coursesCreated | Course[] | Inverse collection of related Course records. |
| coursesUpdated | Course[] | Inverse collection of related Course records. |
| chaptersCreated | Chapter[] | Inverse collection of related Chapter records. |
| chaptersUpdated | Chapter[] | Inverse collection of related Chapter records. |
| lessonsCreated | Lesson[] | Inverse collection of related Lesson records. |
| lessonsUpdated | Lesson[] | Inverse collection of related Lesson records. |
| sectionsCreated | Section[] | Inverse collection of related Section records. |
| sectionsUpdated | Section[] | Inverse collection of related Section records. |
| contentItemsCreated | ContentItem[] | Inverse collection of related ContentItem records. |
| contentItemsUpdated | ContentItem[] | Inverse collection of related ContentItem records. |
| assetsUploaded | Asset[] | Inverse collection of related Asset records. |
| archivedAccessRevocations | ArchivedAccessSnapshot[] | Inverse collection of related ArchivedAccessSnapshot records. |
| questionSourcesCreated | QuestionSource[] | Inverse collection of related QuestionSource records. |
| questionSourcesUpdated | QuestionSource[] | Inverse collection of related QuestionSource records. |
| questionBanksCreated | QuestionBank[] | Inverse collection of related QuestionBank records. |
| questionBanksUpdated | QuestionBank[] | Inverse collection of related QuestionBank records. |
| questionsCreated | Question[] | Inverse collection of related Question records. |
| questionsUpdated | Question[] | Inverse collection of related Question records. |
| questionsReviewed | Question[] | Inverse collection of related Question records. |
| questionAnswersReviewed | Question[] | Inverse collection of related Question records. |
| assessmentAnswersGraded | AssessmentAttemptAnswer[] | Inverse collection of related AssessmentAttemptAnswer records. |
| questionReportsReviewed | QuestionReport[] | Inverse collection of related QuestionReport records. |
| questionReportActions | QuestionReportAction[] | Inverse collection of related QuestionReportAction records. |
| questionImportsCreated | QuestionImportBatch[] | Inverse collection of related QuestionImportBatch records. |
| assessmentsCreated | Assessment[] | Inverse collection of related Assessment records. |
| leaderboardWeeksFinalized | LeaderboardWeek[] | Inverse collection of related LeaderboardWeek records. |
| discountCampaignsCreated | DiscountCampaign[] | Inverse collection of related DiscountCampaign records. |
| discountCampaignsUpdated | DiscountCampaign[] | Inverse collection of related DiscountCampaign records. |
| couponsCreated | Coupon[] | Inverse collection of related Coupon records. |
| couponsUpdated | Coupon[] | Inverse collection of related Coupon records. |

### StudentProfile

**Domain:** identity and audit  
**Why this table exists:** Student-only identity and learning/commercial relationships.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /auth/*; /catalog/* and student catalog; student cart/order/refund routes; /leaderboard/*; /student/learning/* and student content routes; /auth/parents/*; student/parent performance routes; /admin/reports/*; /students/me and /admin/students/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| userId | String | Reference ID for user. |
| user | User | Relation to User. |
| archivedAccessSnapshots | ArchivedAccessSnapshot[] | Inverse collection of related ArchivedAccessSnapshot records. |
| questionMarks | StudentQuestionMark[] | Inverse collection of related StudentQuestionMark records. |
| questionNotes | StudentQuestionNote[] | Inverse collection of related StudentQuestionNote records. |
| couponReservations | CouponReservation[] | Inverse collection of related CouponReservation records. |
| questionReports | QuestionReport[] | Inverse collection of related QuestionReport records. |
| aiQuizRuns | AiQuizGenerationRun[] | Inverse collection of related AiQuizGenerationRun records. |
| fullName | String | Student display/legal name. |
| nationalIdHash | String | Stored string value for national id hash. |
| nationalIdEncrypted | String? | Stored string value for national id encrypted. Optional. |
| nationalIdLast4 | String | Stored string value for national id last4. |
| nationalIdKeyVersion | Int | Numeric value for national id key version. |
| academicGradeId | String? | Reference ID for academic grade. Optional. |
| academicGrade | AcademicGrade? | Relation to AcademicGrade. Optional. |
| governorate | String | Stored string value for governorate. |
| center | String? | Stored string value for center. Optional. |
| governorateId | String | Reference ID for governorate. |
| centerId | String? | Reference ID for center. Optional. |
| governorateRef | Governorate? | Relation to Governorate. Optional. |
| centerRef | Center? | Relation to Center. Optional. |
| parentPhoneNormalized | String | Stored string value for parent phone normalized. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| entitlements | StudentEntitlement[] | Inverse collection of related StudentEntitlement records. |
| contentStudyStates | StudentContentStudyState[] | Inverse collection of related StudentContentStudyState records. |
| cart | Cart? | Relation to Cart. Optional. |
| orders | Order[] | Inverse collection of related Order records. |
| refundRequests | RefundRequest[] | Inverse collection of related RefundRequest records. |
| referralAttributions | OrderReferralAttribution[] | Inverse collection of related OrderReferralAttribution records. |
| parentAccessSessions | ParentAccessSession[] | Inverse collection of related ParentAccessSession records. |
| contentProgress | StudentContentProgress[] | Inverse collection of related StudentContentProgress records. |
| questionAttempts | StudentQuestionAttempt[] | Inverse collection of related StudentQuestionAttempt records. |
| assessments | Assessment[] | Inverse collection of related Assessment records. |
| assessmentAttempts | AssessmentAttempt[] | Inverse collection of related AssessmentAttempt records. |
| leaderboardEntries | LeaderboardEntry[] | Inverse collection of related LeaderboardEntry records. |

### PartnerProfile

**Domain:** identity and audit  
**Why this table exists:** Publisher or referral partner commercial profile.

**Direct API use (static trace)**

- Read by: /partners/analytics/*; /admin/publisher-agreements/*; question-bank, question-source, and admin-question routes; referral-program and reporting routes
- Written by: /partners/me and /admin/partners/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| userId | String | Reference ID for user. |
| user | User | Relation to User. |
| partnerType | PartnerType | Controlled value from PartnerType. |
| displayName | String | Stored string value for display name. |
| legalName | String? | Stored string value for legal name. Optional. |
| phone | String? | Stored string value for phone. Optional. |
| createdByAdminId | String | Reference ID for created by admin. |
| createdByAdmin | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publisherAgreements | PublisherAgreement[] | Inverse collection of related PublisherAgreement records. |
| questionSources | QuestionSource[] | Inverse collection of related QuestionSource records. |
| referralPrograms | ReferralProgram[] | Inverse collection of related ReferralProgram records. |
| allocations | PartnerAllocation[] | Inverse collection of related PartnerAllocation records. |
| settlements | PartnerSettlement[] | Inverse collection of related PartnerSettlement records. |
| usageRollups | PublisherUsageDailyRollup[] | Inverse collection of related PublisherUsageDailyRollup records. |
| usageSolverPresence | PublisherUsageDailySolver[] | Inverse collection of related PublisherUsageDailySolver records. |

### AuthSession

**Domain:** identity and audit  
**Why this table exists:** Hashed refresh-token sessions, used for rotation and revocation.

**Direct API use (static trace)**

- Read by: application module
- Written by: /auth/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| userId | String | Reference ID for user. |
| user | User | Relation to User. |
| refreshTokenHash | String | Stored string value for refresh token hash. |
| familyId | String | Reference ID for family. |
| revoked | Boolean | Whether this record is revoked. |
| revokedAt | DateTime? | Revocation timestamp. Optional. |
| replacedBySessionId | String? | Reference ID for replaced by session. Optional. |
| replacedBy | AuthSession? | Relation to AuthSession. Optional. |
| replaces | AuthSession? | Relation to AuthSession. Optional. |
| ipAddress | String? | Stored string value for ip address. Optional. |
| userAgent | String? | Stored string value for user agent. Optional. |
| expiresAt | DateTime | Validity expiry timestamp. |
| createdAt | DateTime | Creation timestamp. |

### ParentAccessSession

**Domain:** identity and audit  
**Why this table exists:** Parent authentication state and selected child.

**Direct API use (static trace)**

- Read by: application module; /auth/*
- Written by: /auth/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| parentPhoneNormalized | String | Stored string value for parent phone normalized. |
| activeStudentId | String? | Reference ID for active student. Optional. |
| activeStudent | StudentProfile? | Relation to StudentProfile. Optional. |
| revoked | Boolean | Whether this record is revoked. |
| revokedAt | DateTime? | Revocation timestamp. Optional. |
| ipAddress | String? | Stored string value for ip address. Optional. |
| userAgent | String? | Stored string value for user agent. Optional. |
| expiresAt | DateTime | Validity expiry timestamp. |
| createdAt | DateTime | Creation timestamp. |

### AdminAuditLog

**Domain:** identity and audit  
**Why this table exists:** Append-only administrative action trail.

**Direct API use (static trace)**

- Read by: /partners/me and /admin/partners/*; /students/me and /admin/students/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| actorUserId | String | Reference ID for actor user. |
| actor | User | Relation to User. |
| action | String | Stored string value for action. |
| targetType | String | Stored string value for target type. |
| targetId | String | Reference ID for target. |
| metadata | Json? | Extensible structured JSON metadata. Optional. |
| correlationId | String? | Reference ID for correlation. Optional. |
| createdAt | DateTime | Creation timestamp. |

### AcademicGrade

**Domain:** curriculum  
**Why this table exists:** A durable academic grade record for the curriculum domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /academic-grades, /admin/academic-grades/*; /admin/assets/* plus asset/cover access; /auth/*; /catalog/* and student catalog; /students/me and /admin/students/*; /admin/subjects/*
- Written by: /academic-grades, /admin/academic-grades/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| titleAr | String | Arabic display title. |
| titleEn | String? | English display title. Optional. |
| slug | String | Stable URL/API identifier. |
| descriptionAr | String? | Arabic description. Optional. |
| descriptionEn | String? | English description. Optional. |
| sortOrder | Int | Sibling display order. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| subjects | Subject[] | Inverse collection of related Subject records. |
| studentProfiles | StudentProfile[] | Inverse collection of related StudentProfile records. |
| coverAsset | Asset? | Relation to Asset. Optional. |
| coverAssetId | String? | Reference ID for cover asset. Optional. |

### Subject

**Domain:** curriculum  
**Why this table exists:** A durable subject record for the curriculum domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /academic-grades, /admin/academic-grades/*; /admin/assets/* plus asset/cover access; /catalog/* and student catalog; /admin/courses/*; question-bank, question-source, and admin-question routes; /admin/subjects/*
- Written by: /admin/subjects/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| academicGradeId | String | Reference ID for academic grade. |
| academicGrade | AcademicGrade | Relation to AcademicGrade. |
| title | String | Human-readable title. |
| slug | String | Stable URL/API identifier. |
| description | String? | Human-readable description. Optional. |
| sortOrder | Int | Sibling display order. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| courses | Course[] | Inverse collection of related Course records. |
| questionBanks | QuestionBank[] | Inverse collection of related QuestionBank records. |
| coverAsset | Asset? | Relation to Asset. Optional. |
| coverAssetId | String? | Reference ID for cover asset. Optional. |

### Course

**Domain:** curriculum  
**Why this table exists:** A durable course record for the curriculum domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /admin/assets/* plus asset/cover access; /catalog/* and student catalog; /admin/chapters/*; student cart/order/refund routes; /admin/content-items/*; /admin/courses/*; entitlement and content-access routes; internal publication lifecycle; /admin/publisher-agreements/*; question-bank, question-source, and admin-question routes; referral-program and reporting routes; /admin/subjects/*
- Written by: /admin/courses/*; /admin/publisher-agreements/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| subjectId | String | Reference ID for subject. |
| subject | Subject | Relation to Subject. |
| title | String | Human-readable title. |
| slug | String | Stable URL/API identifier. |
| description | String? | Human-readable description. Optional. |
| sortOrder | Int | Sibling display order. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| accessType | AccessType | Controlled value from AccessType. |
| priceMinor | Int? | Money in minor currency units. Optional. |
| currency | String? | Currency code for monetary values. Optional. |
| isPurchasable | Boolean | Flag indicating whether is purchasable applies. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| chapters | Chapter[] | Inverse collection of related Chapter records. |
| questions | Question[] | Inverse collection of related Question records. |
| questionPlacements | QuestionPlacement[] | Inverse collection of related QuestionPlacement records. |
| assessmentScopes | AssessmentScope[] | Inverse collection of related AssessmentScope records. |
| entitlements | StudentEntitlement[] | Inverse collection of related StudentEntitlement records. |
| cartItems | CartItem[] | Inverse collection of related CartItem records. |
| orderItems | OrderItem[] | Inverse collection of related OrderItem records. |
| discountTargets | DiscountCampaignTarget[] | Inverse collection of related DiscountCampaignTarget records. |
| couponTargets | CouponTarget[] | Inverse collection of related CouponTarget records. |
| publisherAgreements | PublisherAgreement[] | Inverse collection of related PublisherAgreement records. |
| referralPrograms | ReferralProgram[] | Inverse collection of related ReferralProgram records. |
| contentPlacements | ContentPlacement[] | Inverse collection of related ContentPlacement records. |
| coverAsset | Asset? | Relation to Asset. Optional. |
| coverAssetId | String? | Reference ID for cover asset. Optional. |

### Chapter

**Domain:** curriculum  
**Why this table exists:** A durable chapter record for the curriculum domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /admin/assets/* plus asset/cover access; /catalog/* and student catalog; /admin/chapters/*; student cart/order/refund routes; /admin/content-items/*; /admin/courses/*; entitlement and content-access routes; /admin/lessons/*; internal publication lifecycle; /admin/publisher-agreements/*; question-bank, question-source, and admin-question routes; referral-program and reporting routes
- Written by: /admin/chapters/*; /admin/publisher-agreements/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| courseId | String | Reference ID for course. |
| course | Course | Relation to Course. |
| title | String | Human-readable title. |
| slug | String | Stable URL/API identifier. |
| description | String? | Human-readable description. Optional. |
| sortOrder | Int | Sibling display order. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| accessType | AccessType | Controlled value from AccessType. |
| priceMinor | Int? | Money in minor currency units. Optional. |
| currency | String? | Currency code for monetary values. Optional. |
| isPurchasable | Boolean? | Flag indicating whether is purchasable applies. Optional. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| lessons | Lesson[] | Inverse collection of related Lesson records. |
| entitlements | StudentEntitlement[] | Inverse collection of related StudentEntitlement records. |
| cartItems | CartItem[] | Inverse collection of related CartItem records. |
| orderItems | OrderItem[] | Inverse collection of related OrderItem records. |
| discountTargets | DiscountCampaignTarget[] | Inverse collection of related DiscountCampaignTarget records. |
| couponTargets | CouponTarget[] | Inverse collection of related CouponTarget records. |
| publisherAgreements | PublisherAgreement[] | Inverse collection of related PublisherAgreement records. |
| referralPrograms | ReferralProgram[] | Inverse collection of related ReferralProgram records. |
| contentPlacements | ContentPlacement[] | Inverse collection of related ContentPlacement records. |
| questionPlacements | QuestionPlacement[] | Inverse collection of related QuestionPlacement records. |
| assessmentScopes | AssessmentScope[] | Inverse collection of related AssessmentScope records. |
| coverAsset | Asset? | Relation to Asset. Optional. |
| coverAssetId | String? | Reference ID for cover asset. Optional. |

### Lesson

**Domain:** curriculum  
**Why this table exists:** A durable lesson record for the curriculum domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /admin/assets/* plus asset/cover access; /catalog/* and student catalog; /admin/chapters/*; /admin/content-items/*; /admin/lessons/*; internal publication lifecycle; /admin/publisher-agreements/*; question-bank, question-source, and admin-question routes; /admin/sections/*
- Written by: /admin/lessons/*; /admin/publisher-agreements/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| chapterId | String | Reference ID for chapter. |
| chapter | Chapter | Relation to Chapter. |
| title | String | Human-readable title. |
| slug | String | Stable URL/API identifier. |
| description | String? | Human-readable description. Optional. |
| sortOrder | Int | Sibling display order. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| accessType | AccessType | Controlled value from AccessType. |
| priceMinor | Int? | Money in minor currency units. Optional. |
| currency | String? | Currency code for monetary values. Optional. |
| isPurchasable | Boolean? | Flag indicating whether is purchasable applies. Optional. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| sections | Section[] | Inverse collection of related Section records. |
| publisherAgreements | PublisherAgreement[] | Inverse collection of related PublisherAgreement records. |
| contentPlacements | ContentPlacement[] | Inverse collection of related ContentPlacement records. |
| coverAsset | Asset? | Relation to Asset. Optional. |
| coverAssetId | String? | Reference ID for cover asset. Optional. |
| questionPlacements | QuestionPlacement[] | Inverse collection of related QuestionPlacement records. |
| assessmentScopes | AssessmentScope[] | Inverse collection of related AssessmentScope records. |

### Section

**Domain:** curriculum  
**Why this table exists:** A durable section record for the curriculum domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /admin/assets/* plus asset/cover access; /catalog/* and student catalog; /admin/content-items/*; /admin/lessons/*; internal publication lifecycle; question-bank, question-source, and admin-question routes; /admin/sections/*
- Written by: /admin/sections/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| lessonId | String | Reference ID for lesson. |
| lesson | Lesson | Relation to Lesson. |
| title | String | Human-readable title. |
| slug | String | Stable URL/API identifier. |
| description | String? | Human-readable description. Optional. |
| sortOrder | Int | Sibling display order. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| accessType | AccessType | Controlled value from AccessType. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| contentPlacements | ContentPlacement[] | Inverse collection of related ContentPlacement records. |
| coverAsset | Asset? | Relation to Asset. Optional. |
| coverAssetId | String? | Reference ID for cover asset. Optional. |
| questionPlacements | QuestionPlacement[] | Inverse collection of related QuestionPlacement records. |
| assessmentScopes | AssessmentScope[] | Inverse collection of related AssessmentScope records. |

### ContentItem

**Domain:** platform operations  
**Why this table exists:** A durable content item record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access; /catalog/* and student catalog; /admin/content-items/*; entitlement and content-access routes; /student/learning/* and student content routes; internal publication lifecycle
- Written by: /admin/content-items/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| type | ContentItemType | Business classification from ContentItemType. |
| title | String | Human-readable title. |
| description | String? | Human-readable description. Optional. |
| textBody | String? | Stored string value for text body. Optional. |
| externalUrl | String? | Stored string value for external url. Optional. |
| accessType | AccessType | Controlled value from AccessType. |
| estimatedDuration | Int? | Numeric value for estimated duration. Optional. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| placement | ContentPlacement? | Relation to ContentPlacement. Optional. |
| primaryAssetId | String? | Reference ID for primary asset. Optional. |
| primaryAsset | Asset? | Relation to Asset. Optional. |
| assetReferences | AssetReference[] | Inverse collection of related AssetReference records. |
| videoOutlineTopics | VideoOutlineTopic[] | Inverse collection of related VideoOutlineTopic records. |
| studentProgress | StudentContentProgress[] | Inverse collection of related StudentContentProgress records. |
| studentStudyStates | StudentContentStudyState[] | Inverse collection of related StudentContentStudyState records. |

### Asset

**Domain:** platform operations  
**Why this table exists:** Provider-neutral uploaded media and processing state.

**Direct API use (static trace)**

- Read by: /admin/question-imports/*; /admin/assets/* plus asset/cover access; question-bank, question-source, and admin-question routes; /admin/videos/* and webhook handling
- Written by: /admin/question-imports/*; /admin/assets/* plus asset/cover access; /admin/videos/* and webhook handling

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| provider | AssetProvider | Controlled value from AssetProvider. |
| kind | AssetKind | Controlled value from AssetKind. |
| status | AssetStatus | Lifecycle state from AssetStatus. |
| originalFilename | String | Stored string value for original filename. |
| filename | String | Stored string value for filename. |
| storageKey | String? | Provider object key. Optional. |
| mimeType | String | Media MIME type. |
| sizeBytes | Int? | Asset size in bytes. Optional. |
| checksum | String? | Integrity/deduplication checksum. Optional. |
| metadata | Json? | Extensible structured JSON metadata. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| readyAt | DateTime? | Timestamp for ready at. Optional. |
| failedAt | DateTime? | Timestamp for failed at. Optional. |
| archivedAt | DateTime? | Archive timestamp. |
| uploadedById | String | Reference ID for uploaded by. |
| uploadedBy | User | Relation to User. |
| primaryFor | ContentItem[] | Inverse collection of related ContentItem records. |
| references | AssetReference[] | Inverse collection of related AssetReference records. |
| gradeCovers | AcademicGrade[] | Inverse collection of related AcademicGrade records. |
| subjectCovers | Subject[] | Inverse collection of related Subject records. |
| courseCovers | Course[] | Inverse collection of related Course records. |
| chapterCovers | Chapter[] | Inverse collection of related Chapter records. |
| lessonCovers | Lesson[] | Inverse collection of related Lesson records. |
| sectionCovers | Section[] | Inverse collection of related Section records. |
| video | VideoAsset? | Relation to VideoAsset. Optional. |
| questionAssets | QuestionAsset[] | Inverse collection of related QuestionAsset records. |
| questionContentBlocks | QuestionContentBlock[] | Inverse collection of related QuestionContentBlock records. |
| questionOptionContentBlocks | QuestionOptionContentBlock[] | Inverse collection of related QuestionOptionContentBlock records. |
| questionContextContentBlocks | QuestionContextContentBlock[] | Inverse collection of related QuestionContextContentBlock records. |
| paymentProofFor | ManualPaymentSubmission[] | Inverse collection of related ManualPaymentSubmission records. |
| questionImportBatches | QuestionImportBatch[] | Inverse collection of related QuestionImportBatch records. |
| questionImportMedia | QuestionImportMedia[] | Inverse collection of related QuestionImportMedia records. |

### AssetReference

**Domain:** platform operations  
**Why this table exists:** A durable asset reference record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access; /admin/content-items/*; entitlement and content-access routes
- Written by: /admin/content-items/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| contentItemId | String | Reference ID for content item. |
| assetId | String | Reference ID for asset. |
| type | AssetReferenceType | Business classification from AssetReferenceType. |
| sortOrder | Int | Sibling display order. |
| createdAt | DateTime | Creation timestamp. |
| contentItem | ContentItem | Relation to ContentItem. |
| asset | Asset | Relation to Asset. |

### VideoAsset

**Domain:** platform operations  
**Why this table exists:** A durable video asset record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: /admin/videos/* and webhook handling

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| assetId | String | Reference ID for asset. |
| asset | Asset | Relation to Asset. |
| libraryId | String | Reference ID for library. |
| bunnyVideoId | String | Reference ID for bunny video. |
| processingStatus | VideoProcessingStatus | Controlled value from VideoProcessingStatus. |
| processingProgress | Int | Numeric value for processing progress. |
| durationSeconds | Int? | Numeric value for duration seconds. Optional. |
| thumbnailUrl | String? | Stored string value for thumbnail url. Optional. |
| clientUploadCompletedAt | DateTime? | Timestamp for client upload completed at. Optional. |
| lastWebhookAt | DateTime? | Timestamp for last webhook at. Optional. |
| failureMetadata | Json? | Structured JSON for failure metadata. Optional. |
| attempt | Int | Numeric value for attempt. |
| questionVideoLinks | QuestionVideoLink[] | Inverse collection of related QuestionVideoLink records. |

### VideoOutlineTopic

**Domain:** platform operations  
**Why this table exists:** A durable video outline topic record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: entitlement and content-access routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| contentItemId | String | Reference ID for content item. |
| title | String | Human-readable title. |
| startSeconds | Int? | Numeric value for start seconds. Optional. |
| endSeconds | Int? | Numeric value for end seconds. Optional. |
| sortOrder | Int | Sibling display order. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| contentItem | ContentItem | Relation to ContentItem. |
| concepts | VideoOutlineConcept[] | Inverse collection of related VideoOutlineConcept records. |

### VideoOutlineConcept

**Domain:** platform operations  
**Why this table exists:** A durable video outline concept record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| topicId | String | Reference ID for topic. |
| title | String | Human-readable title. |
| sortOrder | Int | Sibling display order. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| topic | VideoOutlineTopic | Relation to VideoOutlineTopic. |

### QuestionSource

**Domain:** question authoring  
**Why this table exists:** A durable question source record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; question-bank, question-source, and admin-question routes
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| type | QuestionSourceType | Business classification from QuestionSourceType. |
| titleAr | String | Arabic display title. |
| titleEn | String? | English display title. Optional. |
| noteAr | String? | Stored string value for note ar. Optional. |
| noteEn | String? | Stored string value for note en. Optional. |
| publisherUserId | String? | Reference ID for publisher user. Optional. |
| publisher | PartnerProfile? | Relation to PartnerProfile. Optional. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| questions | Question[] | Inverse collection of related Question records. |

### QuestionBank

**Domain:** question authoring  
**Why this table exists:** A durable question bank record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; question-bank, question-source, and admin-question routes
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| subjectId | String? | Reference ID for subject. Optional. |
| subject | Subject? | Relation to Subject. Optional. |
| title | String | Human-readable title. |
| description | String? | Human-readable description. Optional. |
| status | ContentStatus | Lifecycle state from ContentStatus. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| questions | Question[] | Inverse collection of related Question records. |
| assessments | Assessment[] | Inverse collection of related Assessment records. |
| assessmentQuestionBanks | AssessmentQuestionBank[] | Inverse collection of related AssessmentQuestionBank records. |

### Question

**Domain:** question authoring  
**Why this table exists:** Canonical authored, reviewed, and published question.

**Direct API use (static trace)**

- Read by: /admin/questions/:questionId/ai/re-answer/*; /student/assessments/* and /admin/assessments/*; /student/learning/* and student content routes; /partners/analytics/*; student/parent performance routes; question-bank, question-source, and admin-question routes
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| bankId | String | Reference ID for bank. |
| sourceId | String | Reference ID for source. |
| courseId | String | Reference ID for course. |
| type | QuestionType | Business classification from QuestionType. |
| body | String | Main authored text. |
| explanation | String? | Teaching/explanatory text. Optional. |
| maxPoints | Int | Maximum available score. |
| acceptedAnswers | Json? | Structured JSON for accepted answers. Optional. |
| gradingRubric | String? | Stored string value for grading rubric. Optional. |
| answerOrigin | QuestionAnswerProvenance? | Controlled value from QuestionAnswerProvenance. Optional. |
| answerReviewedAt | DateTime? | Timestamp for answer reviewed at. Optional. |
| answerReviewedById | String? | Reference ID for answer reviewed by. Optional. |
| status | QuestionStatus | Lifecycle state from QuestionStatus. |
| reviewNote | String? | Reviewer rationale. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| createdById | String | Reference ID for created by. |
| updatedById | String | Reference ID for updated by. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| bank | QuestionBank | Relation to QuestionBank. |
| source | QuestionSource | Relation to QuestionSource. |
| course | Course | Relation to Course. |
| createdBy | User | Relation to User. |
| updatedBy | User | Relation to User. |
| reviewedBy | User? | Relation to User. Optional. |
| answerReviewedBy | User? | Relation to User. Optional. |
| options | QuestionOption[] | Inverse collection of related QuestionOption records. |
| assets | QuestionAsset[] | Inverse collection of related QuestionAsset records. |
| videoLink | QuestionVideoLink? | Relation to QuestionVideoLink. Optional. |
| placements | QuestionPlacement[] | Inverse collection of related QuestionPlacement records. |
| studentAttempts | StudentQuestionAttempt[] | Inverse collection of related StudentQuestionAttempt records. |
| marks | StudentQuestionMark[] | Inverse collection of related StudentQuestionMark records. |
| notes | StudentQuestionNote[] | Inverse collection of related StudentQuestionNote records. |
| communityStats | QuestionCommunityStat? | Relation to QuestionCommunityStat. Optional. |
| importItem | QuestionImportItem? | Relation to QuestionImportItem. Optional. |
| contexts | QuestionContextQuestion[] | Inverse collection of related QuestionContextQuestion records. |
| structuredExplanation | QuestionExplanation? | Relation to QuestionExplanation. Optional. |
| explanationRuns | QuestionAiExplanationRun[] | Inverse collection of related QuestionAiExplanationRun records. |
| reports | QuestionReport[] | Inverse collection of related QuestionReport records. |
| replacesQuestionId | String? | Reference ID for replaces question. Optional. |
| replacesQuestion | Question? | Relation to Question. Optional. |
| replacementQuestions | Question[] | Inverse collection of related Question records. |
| contentBlocks | QuestionContentBlock[] | Inverse collection of related QuestionContentBlock records. |

### QuestionContext

**Domain:** question authoring  
**Why this table exists:** A durable question context record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: question-bank, question-source, and admin-question routes
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| type | QuestionContextType | Business classification from QuestionContextType. |
| title | String? | Human-readable title. Optional. |
| body | String | Main authored text. |
| languageCode | String | Stored string value for language code. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| questions | QuestionContextQuestion[] | Inverse collection of related QuestionContextQuestion records. |
| contentBlocks | QuestionContextContentBlock[] | Inverse collection of related QuestionContextContentBlock records. |
| importContexts | QuestionImportContext[] | Inverse collection of related QuestionImportContext records. |

### QuestionContextQuestion

**Domain:** question authoring  
**Why this table exists:** A durable question context question record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: question-bank, question-source, and admin-question routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| questionId | String | Reference ID for question. |
| contextId | String | Reference ID for context. |
| sortOrder | Int | Sibling display order. |
| question | Question | Relation to Question. |
| context | QuestionContext | Relation to QuestionContext. |

### QuestionExplanation

**Domain:** question authoring  
**Why this table exists:** Reviewed structured teaching explanation.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| question | Question | Relation to Question. |
| languageCode | String | Stored string value for language code. |
| keywords | String | Stored string value for keywords. |
| eliminationStrategy | String | Stored string value for elimination strategy. |
| whyCorrect | String | Stored string value for why correct. |
| generalRule | String | Stored string value for general rule. |
| whatIf | String | Stored string value for what if. |
| commonMistakes | String | Stored string value for common mistakes. |
| origin | QuestionExplanationOrigin | Controlled value from QuestionExplanationOrigin. |
| model | String? | Stored string value for model. Optional. |
| confidence | Float? | Numeric value for confidence. Optional. |
| answerOrigin | QuestionAnswerOrigin? | Controlled value from QuestionAnswerOrigin. Optional. |
| warnings | Json? | Structured JSON for warnings. Optional. |
| sourceFingerprint | String? | Stored string value for source fingerprint. Optional. |
| staleAt | DateTime? | Timestamp for stale at. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionAiExplanationRun

**Domain:** question authoring  
**Why this table exists:** AI proposal retained before it can alter a canonical question.

**Direct API use (static trace)**

- Read by: /admin/questions/:questionId/ai/re-answer/*
- Written by: /admin/questions/:questionId/ai/re-answer/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| question | Question | Relation to Question. |
| mode | QuestionAiExplanationRunMode | Controlled value from QuestionAiExplanationRunMode. |
| status | QuestionAiExplanationRunStatus | Lifecycle state from QuestionAiExplanationRunStatus. |
| questionSnapshot | Json | Structured JSON for question snapshot. |
| sourceFingerprint | String | Stored string value for source fingerprint. |
| languageCode | String | Stored string value for language code. |
| suppliedAnswer | Json? | Structured JSON for supplied answer. Optional. |
| additionalContext | String? | Stored string value for additional context. Optional. |
| proposedAnswer | Json? | Structured JSON for proposed answer. Optional. |
| structuredExplanation | Json? | Structured JSON for structured explanation. Optional. |
| confidence | Float? | Numeric value for confidence. Optional. |
| warnings | Json? | Structured JSON for warnings. Optional. |
| conflictWarning | String? | Stored string value for conflict warning. Optional. |
| model | String | Stored string value for model. |
| promptVersion | String | Stored string value for prompt version. |
| rawResponse | Json? | Retained provider/model response. Optional. |
| usage | Json? | Provider/model usage metadata. Optional. |
| createdById | String | Reference ID for created by. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| applyAnswer | Boolean? | Flag indicating whether apply answer applies. Optional. |
| applyExplanation | Boolean? | Flag indicating whether apply explanation applies. Optional. |
| appliedQuestionId | String? | Reference ID for applied question. Optional. |
| reviewNote | String? | Reviewer rationale. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionImportBatch

**Domain:** question import  
**Why this table exists:** A durable question import batch record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/question-imports/*
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| inputType | QuestionImportInputType | Controlled value from QuestionImportInputType. |
| rawText | String? | Stored string value for raw text. Optional. |
| sourceAssetId | String? | Reference ID for source asset. Optional. |
| sourceAsset | Asset? | Relation to Asset. Optional. |
| parentId | String? | Reference ID for parent. Optional. |
| parent | QuestionImportBatch? | Relation to QuestionImportBatch. Optional. |
| children | QuestionImportBatch[] | Inverse collection of related QuestionImportBatch records. |
| childSequence | Int? | Numeric value for child sequence. Optional. |
| pageScope | Json? | Structured JSON for page scope. Optional. |
| bankId | String | Reference ID for bank. |
| sourceId | String | Reference ID for source. |
| courseId | String | Reference ID for course. |
| placements | Json | Structured JSON for placements. |
| status | QuestionImportStatus | Lifecycle state from QuestionImportStatus. |
| normalizedText | String? | Stored string value for normalized text. Optional. |
| extractionMetadata | Json? | Structured JSON for extraction metadata. Optional. |
| segmentationRawOutput | Json? | Structured JSON for segmentation raw output. Optional. |
| segmentationUsage | Json? | Structured JSON for segmentation usage. Optional. |
| segmentationWarnings | Json? | Structured JSON for segmentation warnings. Optional. |
| sourceTextEditedAt | DateTime? | Timestamp for source text edited at. Optional. |
| errorSummary | String? | Stored string value for error summary. Optional. |
| model | String | Stored string value for model. |
| schemaVersion | String | Stored string value for schema version. |
| totalChunks | Int | Numeric value for total chunks. |
| completedChunks | Int | Numeric value for completed chunks. |
| totalItems | Int | Numeric value for total items. |
| createdQuestions | Int | Numeric value for created questions. |
| invalidItems | Int | Numeric value for invalid items. |
| failedItems | Int | Numeric value for failed items. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| startedAt | DateTime? | Timestamp for started at. Optional. |
| completedAt | DateTime? | Timestamp for completed at. Optional. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| chunks | QuestionImportChunk[] | Inverse collection of related QuestionImportChunk records. |
| items | QuestionImportItem[] | Inverse collection of related QuestionImportItem records. |
| sourceBlocks | QuestionImportSourceBlock[] | Inverse collection of related QuestionImportSourceBlock records. |
| answerEvidence | QuestionImportAnswerEvidence[] | Inverse collection of related QuestionImportAnswerEvidence records. |
| skippedRanges | QuestionImportSkippedRange[] | Inverse collection of related QuestionImportSkippedRange records. |
| pages | QuestionImportPage[] | Inverse collection of related QuestionImportPage records. |
| media | QuestionImportMedia[] | Inverse collection of related QuestionImportMedia records. |
| importContexts | QuestionImportContext[] | Inverse collection of related QuestionImportContext records. |

### QuestionImportPage

**Domain:** question import  
**Why this table exists:** A durable question import page record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/question-imports/*
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| pageNumber | Int | Numeric value for page number. |
| kind | QuestionImportPageKind | Controlled value from QuestionImportPageKind. |
| status | QuestionImportPageStatus | Lifecycle state from QuestionImportPageStatus. |
| aiText | String? | Stored string value for ai text. Optional. |
| canonicalText | String? | Stored string value for canonical text. Optional. |
| confidence | Float? | Numeric value for confidence. Optional. |
| uncertainSpans | Json? | Structured JSON for uncertain spans. Optional. |
| warnings | Json? | Structured JSON for warnings. Optional. |
| layoutEnvelopes | Json? | Structured JSON for layout envelopes. Optional. |
| attemptCount | Int | Numeric value for attempt count. |
| providerFileId | String? | Reference ID for provider file. Optional. |
| rawProviderResponse | Json? | Structured JSON for raw provider response. Optional. |
| initialAiText | String? | Stored string value for initial ai text. Optional. |
| initialCanonicalText | String? | Stored string value for initial canonical text. Optional. |
| initialProviderResponse | Json? | Structured JSON for initial provider response. Optional. |
| initialUsage | Json? | Structured JSON for initial usage. Optional. |
| verificationProviderResponse | Json? | Structured JSON for verification provider response. Optional. |
| verificationUsage | Json? | Structured JSON for verification usage. Optional. |
| verifiedAt | DateTime? | Timestamp for verified at. Optional. |
| usage | Json? | Provider/model usage metadata. Optional. |
| errorDetail | String? | Stored string value for error detail. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionImportMedia

**Domain:** question import  
**Why this table exists:** A durable question import media record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/question-imports/*; /admin/assets/* plus asset/cover access
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| mediaKey | String | Stored string value for media key. |
| pageNumber | Int | Numeric value for page number. |
| normalizedBounds | Json | Structured JSON for normalized bounds. |
| renderedBounds | Json | Structured JSON for rendered bounds. |
| pageDimensions | Json | Structured JSON for page dimensions. |
| rotation | Int | Numeric value for rotation. |
| renderDpi | Int | Numeric value for render dpi. |
| type | QuestionImportMediaType | Business classification from QuestionImportMediaType. |
| confidence | Float | Numeric value for confidence. |
| description | String | Human-readable description. |
| warnings | Json? | Structured JSON for warnings. Optional. |
| validationFlags | Json? | Structured JSON for validation flags. Optional. |
| cropCompleteness | QuestionImportMediaCropCompleteness | Controlled value from QuestionImportMediaCropCompleteness. |
| cropVerification | Json? | Structured JSON for crop verification. Optional. |
| checksum | String? | Integrity/deduplication checksum. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| asset | Asset? | Relation to Asset. Optional. |
| status | QuestionImportMediaStatus | Lifecycle state from QuestionImportMediaStatus. |
| materializedAt | DateTime? | Timestamp for materialized at. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| reviewNote | String? | Reviewer rationale. Optional. |
| errorDetail | String? | Stored string value for error detail. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| detections | QuestionImportMediaDetection[] | Inverse collection of related QuestionImportMediaDetection records. |
| assignments | QuestionImportMediaAssignment[] | Inverse collection of related QuestionImportMediaAssignment records. |

### QuestionImportContext

**Domain:** question import  
**Why this table exists:** A durable question import context record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| contextKey | String | Stored string value for context key. |
| contextId | String | Reference ID for context. |
| context | QuestionContext | Relation to QuestionContext. |
| firstBlock | String | Stored string value for first block. |
| lastBlock | String | Stored string value for last block. |
| createdAt | DateTime | Creation timestamp. |

### QuestionImportMediaAssignment

**Domain:** question import  
**Why this table exists:** A durable question import media assignment record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| importItemId | String | Reference ID for import item. |
| importItem | QuestionImportItem | Relation to QuestionImportItem. |
| mediaId | String | Reference ID for media. |
| media | QuestionImportMedia | Relation to QuestionImportMedia. |
| assignmentKey | String | Stored string value for assignment key. |
| exclusiveOwnershipKey | String? | Stored string value for exclusive ownership key. Optional. |
| owner | QuestionImportMediaAssignmentOwner | Controlled value from QuestionImportMediaAssignmentOwner. |
| ownerReference | String | Stored string value for owner reference. |
| placementAnchor | String? | Stored string value for placement anchor. Optional. |
| confidence | Float? | Numeric value for confidence. Optional. |
| reason | String? | Stored string value for reason. Optional. |
| status | QuestionImportMediaAssignmentStatus | Lifecycle state from QuestionImportMediaAssignmentStatus. |
| scoreComponents | Json? | Structured JSON for score components. Optional. |
| evidenceVersion | String? | Stored string value for evidence version. Optional. |
| reviewNote | String? | Reviewer rationale. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| finalContentBlockId | String? | Reference ID for final content block. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionImportVisualRequirement

**Domain:** question import  
**Why this table exists:** A durable question import visual requirement record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| importItemId | String | Reference ID for import item. |
| importItem | QuestionImportItem | Relation to QuestionImportItem. |
| requirementKey | String | Stored string value for requirement key. |
| kind | QuestionImportVisualRequirementKind | Controlled value from QuestionImportVisualRequirementKind. |
| sourcePage | Int? | Numeric value for source page. Optional. |
| sourceEnvelope | Json? | Structured JSON for source envelope. Optional. |
| owner | QuestionImportMediaAssignmentOwner? | Controlled value from QuestionImportMediaAssignmentOwner. Optional. |
| ownerReference | String? | Stored string value for owner reference. Optional. |
| optionIndexes | Json? | Structured JSON for option indexes. Optional. |
| expectedCardinality | Int | Numeric value for expected cardinality. |
| interpretationRequired | Boolean | Flag indicating whether interpretation required applies. |
| resolutionState | QuestionImportVisualResolutionState | Controlled value from QuestionImportVisualResolutionState. |
| unresolvedReason | String? | Stored string value for unresolved reason. Optional. |
| candidateRankings | Json? | Structured JSON for candidate rankings. Optional. |
| evidenceVersion | String? | Stored string value for evidence version. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionImportMediaDetection

**Domain:** question import  
**Why this table exists:** A durable question import media detection record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| mediaId | String | Reference ID for media. |
| media | QuestionImportMedia | Relation to QuestionImportMedia. |
| source | QuestionImportMediaDetectionSource | Controlled value from QuestionImportMediaDetectionSource. |
| normalizedBounds | Json | Structured JSON for normalized bounds. |
| type | QuestionImportMediaType | Business classification from QuestionImportMediaType. |
| confidence | Float? | Numeric value for confidence. Optional. |
| description | String? | Human-readable description. Optional. |
| warnings | Json? | Structured JSON for warnings. Optional. |
| rawEvidence | Json? | Structured JSON for raw evidence. Optional. |
| validationFlags | Json? | Structured JSON for validation flags. Optional. |
| accepted | Boolean | Flag indicating whether accepted applies. |
| createdById | String? | Reference ID for created by. Optional. |
| createdAt | DateTime | Creation timestamp. |

### QuestionImportSourceBlock

**Domain:** question import  
**Why this table exists:** A durable question import source block record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| sequence | Int | Numeric value for sequence. |
| blockKey | String | Stored string value for block key. |
| text | String | Stored string value for text. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| envelope | Json? | Structured JSON for envelope. Optional. |
| assignment | Json? | Structured JSON for assignment. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionImportAnswerEvidence

**Domain:** question import  
**Why this table exists:** A durable question import answer evidence record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| evidenceKey | String | Stored string value for evidence key. |
| firstBlock | String | Stored string value for first block. |
| lastBlock | String | Stored string value for last block. |
| text | String | Stored string value for text. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| questionIds | Json | Structured JSON for question ids. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### QuestionImportSkippedRange

**Domain:** question import  
**Why this table exists:** A durable question import skipped range record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| sequence | Int | Numeric value for sequence. |
| firstBlock | String | Stored string value for first block. |
| lastBlock | String | Stored string value for last block. |
| reason | String | Stored string value for reason. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| createdAt | DateTime | Creation timestamp. |

### QuestionImportChunk

**Domain:** question import  
**Why this table exists:** A durable question import chunk record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/question-imports/*
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| sequence | Int | Numeric value for sequence. |
| text | String | Stored string value for text. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| checksum | String | Integrity/deduplication checksum. |
| status | QuestionImportChunkStatus | Lifecycle state from QuestionImportChunkStatus. |
| attemptCount | Int | Numeric value for attempt count. |
| rawResponse | Json? | Retained provider/model response. Optional. |
| usage | Json? | Provider/model usage metadata. Optional. |
| errorDetail | String? | Stored string value for error detail. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| completedAt | DateTime? | Timestamp for completed at. Optional. |
| items | QuestionImportItem[] | Inverse collection of related QuestionImportItem records. |

### QuestionImportItem

**Domain:** question import  
**Why this table exists:** A durable question import item record for the question import domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/question-imports/*
- Written by: /admin/question-imports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| batchId | String | Reference ID for batch. |
| batch | QuestionImportBatch | Relation to QuestionImportBatch. |
| chunkId | String? | Reference ID for chunk. Optional. |
| chunk | QuestionImportChunk? | Relation to QuestionImportChunk. Optional. |
| sequence | Int | Numeric value for sequence. |
| status | QuestionImportItemStatus | Lifecycle state from QuestionImportItemStatus. |
| rawOutput | Json? | Structured JSON for raw output. Optional. |
| normalizedOutput | Json? | Structured JSON for normalized output. Optional. |
| confidence | Float? | Numeric value for confidence. Optional. |
| warnings | Json? | Structured JSON for warnings. Optional. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| errorDetail | String? | Stored string value for error detail. Optional. |
| questionId | String? | Reference ID for question. Optional. |
| question | Question? | Relation to Question. Optional. |
| sourceNumber | String? | Stored string value for source number. Optional. |
| globalOrder | Int? | Numeric value for global order. Optional. |
| section | String? | Stored string value for section. Optional. |
| detectedType | String? | Stored string value for detected type. Optional. |
| exclusionReason | String? | Stored string value for exclusion reason. Optional. |
| answerOrigin | QuestionAnswerProvenance? | Controlled value from QuestionAnswerProvenance. Optional. |
| citedEvidenceKeys | Json? | Structured JSON for cited evidence keys. Optional. |
| reviewerCandidate | Json? | Structured JSON for reviewer candidate. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| reviewNote | String? | Reviewer rationale. Optional. |
| visualState | QuestionImportVisualResolutionState | Controlled value from QuestionImportVisualResolutionState. |
| visualEvidenceVersion | String? | Stored string value for visual evidence version. Optional. |
| answerContentValid | Boolean | Flag indicating whether answer content valid applies. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| mediaAssignments | QuestionImportMediaAssignment[] | Inverse collection of related QuestionImportMediaAssignment records. |
| visualRequirements | QuestionImportVisualRequirement[] | Inverse collection of related QuestionImportVisualRequirement records. |

### QuestionOption

**Domain:** question authoring  
**Why this table exists:** A durable question option record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: question-bank, question-source, and admin-question routes
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| body | String | Main authored text. |
| isCorrect | Boolean | Flag indicating whether is correct applies. |
| sortOrder | Int | Sibling display order. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| question | Question | Relation to Question. |
| attemptAnswers | StudentQuestionAttemptAnswer[] | Inverse collection of related StudentQuestionAttemptAnswer records. |
| contentBlocks | QuestionOptionContentBlock[] | Inverse collection of related QuestionOptionContentBlock records. |

### QuestionContentBlock

**Domain:** question authoring  
**Why this table exists:** A durable question content block record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| type | QuestionContentBlockType | Business classification from QuestionContentBlockType. |
| sortOrder | Int | Sibling display order. |
| text | String? | Stored string value for text. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| tableData | Json? | Structured JSON for table data. Optional. |
| latex | String? | Stored string value for latex. Optional. |
| mathml | String? | Stored string value for mathml. Optional. |
| caption | String? | Stored string value for caption. Optional. |
| altText | String? | Stored string value for alt text. Optional. |
| languageCode | String? | Stored string value for language code. Optional. |
| question | Question | Relation to Question. |
| asset | Asset? | Relation to Asset. Optional. |

### QuestionOptionContentBlock

**Domain:** question authoring  
**Why this table exists:** A durable question option content block record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionOptionId | String | Reference ID for question option. |
| type | QuestionContentBlockType | Business classification from QuestionContentBlockType. |
| sortOrder | Int | Sibling display order. |
| text | String? | Stored string value for text. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| tableData | Json? | Structured JSON for table data. Optional. |
| latex | String? | Stored string value for latex. Optional. |
| mathml | String? | Stored string value for mathml. Optional. |
| caption | String? | Stored string value for caption. Optional. |
| altText | String? | Stored string value for alt text. Optional. |
| languageCode | String? | Stored string value for language code. Optional. |
| questionOption | QuestionOption | Relation to QuestionOption. |
| asset | Asset? | Relation to Asset. Optional. |

### QuestionContextContentBlock

**Domain:** question authoring  
**Why this table exists:** A durable question context content block record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionContextId | String | Reference ID for question context. |
| type | QuestionContentBlockType | Business classification from QuestionContentBlockType. |
| sortOrder | Int | Sibling display order. |
| text | String? | Stored string value for text. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| tableData | Json? | Structured JSON for table data. Optional. |
| latex | String? | Stored string value for latex. Optional. |
| mathml | String? | Stored string value for mathml. Optional. |
| caption | String? | Stored string value for caption. Optional. |
| altText | String? | Stored string value for alt text. Optional. |
| languageCode | String? | Stored string value for language code. Optional. |
| questionContext | QuestionContext | Relation to QuestionContext. |
| asset | Asset? | Relation to Asset. Optional. |

### QuestionAsset

**Domain:** question authoring  
**Why this table exists:** A durable question asset record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access; question-bank, question-source, and admin-question routes
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| assetId | String | Reference ID for asset. |
| sortOrder | Int | Sibling display order. |
| createdAt | DateTime | Creation timestamp. |
| question | Question | Relation to Question. |
| asset | Asset | Relation to Asset. |

### QuestionVideoLink

**Domain:** question authoring  
**Why this table exists:** A durable question video link record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: question-bank, question-source, and admin-question routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| videoAssetId | String | Reference ID for video asset. |
| timestampSeconds | Int | Numeric value for timestamp seconds. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| question | Question | Relation to Question. |
| videoAsset | VideoAsset | Relation to VideoAsset. |

### QuestionPlacement

**Domain:** question authoring  
**Why this table exists:** Connects one question to one or more curriculum scopes.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| courseId | String? | Reference ID for course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| lessonId | String? | Reference ID for lesson. Optional. |
| sectionId | String? | Reference ID for section. Optional. |
| createdAt | DateTime | Creation timestamp. |
| question | Question | Relation to Question. |
| course | Course? | Relation to Course. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| lesson | Lesson? | Relation to Lesson. Optional. |
| section | Section? | Relation to Section. Optional. |

### Assessment

**Domain:** assessment  
**Why this table exists:** Assessment definition and parent of frozen delivery data.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| ownerType | AssessmentOwnerType | Controlled value from AssessmentOwnerType. |
| studentUserId | String? | Reference ID for student user. Optional. |
| student | StudentProfile? | Relation to StudentProfile. Optional. |
| createdByAdminId | String? | Reference ID for created by admin. Optional. |
| createdByAdmin | User? | Relation to User. Optional. |
| title | String | Human-readable title. |
| generationType | AssessmentGenerationType | Controlled value from AssessmentGenerationType. |
| mode | AssessmentMode | Controlled value from AssessmentMode. |
| isTimed | Boolean | Flag indicating whether is timed applies. |
| durationSeconds | Int? | Numeric value for duration seconds. Optional. |
| questionCount | Int | Numeric value for question count. |
| status | AssessmentStatus | Lifecycle state from AssessmentStatus. |
| questionBankId | String? | Reference ID for question bank. Optional. |
| questionBank | QuestionBank? | Relation to QuestionBank. Optional. |
| generationFilters | Json? | Structured JSON for generation filters. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| publishedAt | DateTime? | Publication timestamp. |
| archivedAt | DateTime? | Archive timestamp. |
| scopes | AssessmentScope[] | Inverse collection of related AssessmentScope records. |
| questionBanks | AssessmentQuestionBank[] | Inverse collection of related AssessmentQuestionBank records. |
| questions | AssessmentQuestion[] | Inverse collection of related AssessmentQuestion records. |
| contexts | AssessmentContext[] | Inverse collection of related AssessmentContext records. |
| attempts | AssessmentAttempt[] | Inverse collection of related AssessmentAttempt records. |
| aiQuizRun | AiQuizGenerationRun? | Relation to AiQuizGenerationRun. Optional. |

### AssessmentQuestionBank

**Domain:** assessment  
**Why this table exists:** A durable assessment question bank record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| assessmentId | String | Reference ID for assessment. |
| questionBankId | String | Reference ID for question bank. |
| assessment | Assessment | Relation to Assessment. |
| questionBank | QuestionBank | Relation to QuestionBank. |
| createdAt | DateTime | Creation timestamp. |

### AssessmentScope

**Domain:** assessment  
**Why this table exists:** A durable assessment scope record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentId | String | Reference ID for assessment. |
| assessment | Assessment | Relation to Assessment. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| lessonId | String? | Reference ID for lesson. Optional. |
| lesson | Lesson? | Relation to Lesson. Optional. |
| sectionId | String? | Reference ID for section. Optional. |
| section | Section? | Relation to Section. Optional. |
| createdAt | DateTime | Creation timestamp. |

### AssessmentQuestion

**Domain:** assessment  
**Why this table exists:** Question snapshot used by an assessment.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentId | String | Reference ID for assessment. |
| assessment | Assessment | Relation to Assessment. |
| sourceQuestionId | String | Reference ID for source question. |
| sortOrder | Int | Sibling display order. |
| type | QuestionType | Business classification from QuestionType. |
| body | String | Main authored text. |
| explanation | String? | Teaching/explanatory text. Optional. |
| maxPoints | Int | Maximum available score. |
| acceptedAnswers | Json? | Structured JSON for accepted answers. Optional. |
| gradingRubric | String? | Stored string value for grading rubric. Optional. |
| answerOrigin | QuestionAnswerProvenance? | Controlled value from QuestionAnswerProvenance. Optional. |
| videoAssetId | String? | Reference ID for video asset. Optional. |
| videoAssetName | String? | Stored string value for video asset name. Optional. |
| timestampSeconds | Int? | Numeric value for timestamp seconds. Optional. |
| structuredExplanation | Json? | Structured JSON for structured explanation. Optional. |
| options | AssessmentQuestionOption[] | Inverse collection of related AssessmentQuestionOption records. |
| answers | AssessmentAttemptAnswer[] | Inverse collection of related AssessmentAttemptAnswer records. |
| placements | AssessmentQuestionPlacement[] | Inverse collection of related AssessmentQuestionPlacement records. |
| contexts | AssessmentQuestionContext[] | Inverse collection of related AssessmentQuestionContext records. |
| attachments | AssessmentQuestionAsset[] | Inverse collection of related AssessmentQuestionAsset records. |
| contentBlocks | AssessmentQuestionContentBlock[] | Inverse collection of related AssessmentQuestionContentBlock records. |
| attributions | AssessmentQuestionAttribution[] | Inverse collection of related AssessmentQuestionAttribution records. |

### AssessmentQuestionAsset

**Domain:** assessment  
**Why this table exists:** A durable assessment question asset record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentQuestionId | String | Reference ID for assessment question. |
| assetId | String | Reference ID for asset. |
| assetKind | AssetKind | Controlled value from AssetKind. |
| assetName | String | Stored string value for asset name. |
| sortOrder | Int | Sibling display order. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |

### AssessmentQuestionContentBlock

**Domain:** assessment  
**Why this table exists:** A durable assessment question content block record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentQuestionId | String | Reference ID for assessment question. |
| type | QuestionContentBlockType | Business classification from QuestionContentBlockType. |
| sortOrder | Int | Sibling display order. |
| text | String? | Stored string value for text. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| assetKind | AssetKind? | Controlled value from AssetKind. Optional. |
| assetName | String? | Stored string value for asset name. Optional. |
| tableData | Json? | Structured JSON for table data. Optional. |
| latex | String? | Stored string value for latex. Optional. |
| mathml | String? | Stored string value for mathml. Optional. |
| caption | String? | Stored string value for caption. Optional. |
| altText | String? | Stored string value for alt text. Optional. |
| languageCode | String? | Stored string value for language code. Optional. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |

### AssessmentContext

**Domain:** assessment  
**Why this table exists:** A durable assessment context record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentId | String | Reference ID for assessment. |
| assessment | Assessment | Relation to Assessment. |
| sourceContextId | String | Reference ID for source context. |
| type | QuestionContextType | Business classification from QuestionContextType. |
| title | String? | Human-readable title. Optional. |
| body | String | Main authored text. |
| languageCode | String | Stored string value for language code. |
| sourceLocator | Json? | Structured JSON for source locator. Optional. |
| createdAt | DateTime | Creation timestamp. |
| questions | AssessmentQuestionContext[] | Inverse collection of related AssessmentQuestionContext records. |
| contentBlocks | AssessmentContextContentBlock[] | Inverse collection of related AssessmentContextContentBlock records. |

### AssessmentQuestionContext

**Domain:** assessment  
**Why this table exists:** A durable assessment question context record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| assessmentQuestionId | String | Reference ID for assessment question. |
| assessmentContextId | String | Reference ID for assessment context. |
| sortOrder | Int | Sibling display order. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |
| assessmentContext | AssessmentContext | Relation to AssessmentContext. |

### AssessmentContextContentBlock

**Domain:** assessment  
**Why this table exists:** A durable assessment context content block record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentContextId | String | Reference ID for assessment context. |
| type | QuestionContentBlockType | Business classification from QuestionContentBlockType. |
| sortOrder | Int | Sibling display order. |
| text | String? | Stored string value for text. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| assetKind | AssetKind? | Controlled value from AssetKind. Optional. |
| assetName | String? | Stored string value for asset name. Optional. |
| tableData | Json? | Structured JSON for table data. Optional. |
| latex | String? | Stored string value for latex. Optional. |
| mathml | String? | Stored string value for mathml. Optional. |
| caption | String? | Stored string value for caption. Optional. |
| altText | String? | Stored string value for alt text. Optional. |
| languageCode | String? | Stored string value for language code. Optional. |
| assessmentContext | AssessmentContext | Relation to AssessmentContext. |

### AssessmentQuestionPlacement

**Domain:** assessment  
**Why this table exists:** A durable assessment question placement record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentQuestionId | String | Reference ID for assessment question. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |
| subjectId | String | Reference ID for subject. |
| subjectTitle | String | Stored string value for subject title. |
| courseId | String | Reference ID for course. |
| courseTitle | String | Stored string value for course title. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapterTitle | String? | Stored string value for chapter title. Optional. |
| lessonId | String? | Reference ID for lesson. Optional. |
| lessonTitle | String? | Stored string value for lesson title. Optional. |
| sectionId | String? | Reference ID for section. Optional. |
| sectionTitle | String? | Stored string value for section title. Optional. |

### AssessmentQuestionOption

**Domain:** assessment  
**Why this table exists:** A durable assessment question option record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentQuestionId | String | Reference ID for assessment question. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |
| body | String | Main authored text. |
| isCorrect | Boolean | Flag indicating whether is correct applies. |
| sortOrder | Int | Sibling display order. |
| contentBlocks | AssessmentQuestionOptionContentBlock[] | Inverse collection of related AssessmentQuestionOptionContentBlock records. |

### AssessmentQuestionOptionContentBlock

**Domain:** assessment  
**Why this table exists:** A durable assessment question option content block record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentQuestionOptionId | String | Reference ID for assessment question option. |
| type | QuestionContentBlockType | Business classification from QuestionContentBlockType. |
| sortOrder | Int | Sibling display order. |
| text | String? | Stored string value for text. Optional. |
| assetId | String? | Reference ID for asset. Optional. |
| assetKind | AssetKind? | Controlled value from AssetKind. Optional. |
| assetName | String? | Stored string value for asset name. Optional. |
| tableData | Json? | Structured JSON for table data. Optional. |
| latex | String? | Stored string value for latex. Optional. |
| mathml | String? | Stored string value for mathml. Optional. |
| caption | String? | Stored string value for caption. Optional. |
| altText | String? | Stored string value for alt text. Optional. |
| languageCode | String? | Stored string value for language code. Optional. |
| assessmentQuestionOption | AssessmentQuestionOption | Relation to AssessmentQuestionOption. |

### AssessmentAttempt

**Domain:** assessment  
**Why this table exists:** One student run of an assessment.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /partners/analytics/*; /students/me and /admin/students/*
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentId | String | Reference ID for assessment. |
| assessment | Assessment | Relation to Assessment. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| status | AssessmentAttemptStatus | Lifecycle state from AssessmentAttemptStatus. |
| startedAt | DateTime | Timestamp for started at. |
| expiresAt | DateTime? | Validity expiry timestamp. Optional. |
| lastActivityAt | DateTime | Timestamp for last activity at. |
| submittedAt | DateTime? | Timestamp for submitted at. Optional. |
| score | Int? | Numeric value for score. Optional. |
| totalPoints | Int | Numeric value for total points. |
| totalQuestions | Int | Numeric value for total questions. |
| answers | AssessmentAttemptAnswer[] | Inverse collection of related AssessmentAttemptAnswer records. |

### AssessmentAttemptAnswer

**Domain:** assessment  
**Why this table exists:** A durable assessment attempt answer record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /student/learning/* and student content routes; student/parent performance routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| attemptId | String | Reference ID for attempt. |
| attempt | AssessmentAttempt | Relation to AssessmentAttempt. |
| assessmentQuestionId | String | Reference ID for assessment question. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |
| selectedOptionIds | String[] | Stored string value for selected option ids. |
| responseText | String? | Stored string value for response text. Optional. |
| inputMethod | AnswerInputMethod | Controlled value from AnswerInputMethod. |
| responseLanguageCode | String? | Stored string value for response language code. Optional. |
| transcriptionProvider | String? | Stored string value for transcription provider. Optional. |
| transcriptionConfidence | Float? | Numeric value for transcription confidence. Optional. |
| isCorrect | Boolean? | Flag indicating whether is correct applies. Optional. |
| outcome | AssessmentQuestionOutcome? | Controlled value from AssessmentQuestionOutcome. Optional. |
| awardedPoints | Int? | Numeric value for awarded points. Optional. |
| gradedAt | DateTime? | Timestamp for graded at. Optional. |
| gradedById | String? | Reference ID for graded by. Optional. |
| gradedBy | User? | Relation to User. Optional. |
| graderFeedback | String? | Stored string value for grader feedback. Optional. |
| activeSeconds | Int | Numeric value for active seconds. |
| answeredAt | DateTime | Timestamp for answered at. |
| updatedAt | DateTime | Last-update timestamp. |
| answerChanges | AssessmentAnswerChange[] | Inverse collection of related AssessmentAnswerChange records. |
| aiGradingRuns | AssessmentAnswerAiGradingRun[] | Inverse collection of related AssessmentAnswerAiGradingRun records. |

### AssessmentAnswerAiGradingRun

**Domain:** assessment  
**Why this table exists:** A durable assessment answer ai grading run record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| attemptAnswerId | String | Reference ID for attempt answer. |
| attemptAnswer | AssessmentAttemptAnswer | Relation to AssessmentAttemptAnswer. |
| status | AiRunStatus | Lifecycle state from AiRunStatus. |
| questionSnapshot | Json | Structured JSON for question snapshot. |
| responseSnapshot | String | Stored string value for response snapshot. |
| responseLanguageCode | String | Stored string value for response language code. |
| proposedPoints | Int? | Numeric value for proposed points. Optional. |
| proposedOutcome | AssessmentQuestionOutcome? | Controlled value from AssessmentQuestionOutcome. Optional. |
| feedback | String? | Stored string value for feedback. Optional. |
| highlights | Json? | Structured JSON for highlights. Optional. |
| model | String? | Stored string value for model. Optional. |
| promptVersion | String | Stored string value for prompt version. |
| rawResponse | Json? | Retained provider/model response. Optional. |
| usage | Json? | Provider/model usage metadata. Optional. |
| error | String? | Stored string value for error. Optional. |
| createdAt | DateTime | Creation timestamp. |
| completedAt | DateTime? | Timestamp for completed at. Optional. |

### AiQuizGenerationRun

**Domain:** platform operations  
**Why this table exists:** A durable ai quiz generation run record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| assessmentId | String? | Reference ID for assessment. Optional. |
| assessment | Assessment? | Relation to Assessment. Optional. |
| status | AiRunStatus | Lifecycle state from AiRunStatus. |
| prompt | String | Stored string value for prompt. |
| requestedFilters | Json | Structured JSON for requested filters. |
| normalizedPlan | Json? | Structured JSON for normalized plan. Optional. |
| rationale | String? | Stored string value for rationale. Optional. |
| eligibleQuestionIds | Json? | Structured JSON for eligible question ids. Optional. |
| selectedQuestionIds | Json? | Structured JSON for selected question ids. Optional. |
| model | String? | Stored string value for model. Optional. |
| promptVersion | String | Stored string value for prompt version. |
| rawResponse | Json? | Retained provider/model response. Optional. |
| usage | Json? | Provider/model usage metadata. Optional. |
| error | String? | Stored string value for error. Optional. |
| createdAt | DateTime | Creation timestamp. |
| completedAt | DateTime? | Timestamp for completed at. Optional. |

### QuestionReport

**Domain:** question authoring  
**Why this table exists:** A durable question report record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| questionId | String | Reference ID for question. |
| question | Question | Relation to Question. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| type | QuestionReportType | Business classification from QuestionReportType. |
| note | String? | Stored string value for note. Optional. |
| questionSnapshot | Json | Structured JSON for question snapshot. |
| status | QuestionReportStatus | Lifecycle state from QuestionReportStatus. |
| assignedToId | String? | Reference ID for assigned to. Optional. |
| assignedTo | User? | Relation to User. Optional. |
| resolutionNote | String? | Stored string value for resolution note. Optional. |
| resolvedAt | DateTime? | Timestamp for resolved at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| actions | QuestionReportAction[] | Inverse collection of related QuestionReportAction records. |

### QuestionReportAction

**Domain:** question authoring  
**Why this table exists:** A durable question report action record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| reportId | String | Reference ID for report. |
| report | QuestionReport | Relation to QuestionReport. |
| actorUserId | String | Reference ID for actor user. |
| actor | User | Relation to User. |
| fromStatus | QuestionReportStatus? | Controlled value from QuestionReportStatus. Optional. |
| toStatus | QuestionReportStatus | Controlled value from QuestionReportStatus. |
| note | String? | Stored string value for note. Optional. |
| createdAt | DateTime | Creation timestamp. |

### AssessmentAnswerChange

**Domain:** assessment  
**Why this table exists:** A durable assessment answer change record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student/parent performance routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| attemptAnswerId | String | Reference ID for attempt answer. |
| attemptAnswer | AssessmentAttemptAnswer | Relation to AssessmentAttemptAnswer. |
| fromOptionIds | String[] | Stored string value for from option ids. |
| toOptionIds | String[] | Stored string value for to option ids. |
| fromResponseText | String? | Stored string value for from response text. Optional. |
| toResponseText | String? | Stored string value for to response text. Optional. |
| fromOutcome | AssessmentQuestionOutcome | Controlled value from AssessmentQuestionOutcome. |
| toOutcome | AssessmentQuestionOutcome | Controlled value from AssessmentQuestionOutcome. |
| changedAt | DateTime | Timestamp for changed at. |

### LeaderboardWeek

**Domain:** platform operations  
**Why this table exists:** A durable leaderboard week record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /leaderboard/*
- Written by: /leaderboard/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| weekKey | String | Stored string value for week key. |
| startsAt | DateTime | Timestamp for starts at. |
| endsAt | DateTime | Timestamp for ends at. |
| finalizedAt | DateTime? | Timestamp for finalized at. Optional. |
| finalizedById | String? | Reference ID for finalized by. Optional. |
| finalizedBy | User? | Relation to User. Optional. |
| entries | LeaderboardEntry[] | Inverse collection of related LeaderboardEntry records. |
| createdAt | DateTime | Creation timestamp. |

### LeaderboardEntry

**Domain:** platform operations  
**Why this table exists:** A durable leaderboard entry record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| weekId | String | Reference ID for week. |
| week | LeaderboardWeek | Relation to LeaderboardWeek. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| academicGradeId | String? | Reference ID for academic grade. Optional. |
| displayName | String | Stored string value for display name. |
| rank | Int | Numeric value for rank. |
| quizzesCompleted | Int | Numeric value for quizzes completed. |
| totalQuestions | Int | Numeric value for total questions. |
| answeredQuestions | Int | Numeric value for answered questions. |
| correctAnswers | Int | Numeric value for correct answers. |
| smartScore | Float | Numeric value for smart score. |
| accuracyPercent | Float | Numeric value for accuracy percent. |
| award | LeaderboardAward? | Relation to LeaderboardAward. Optional. |
| createdAt | DateTime | Creation timestamp. |

### LeaderboardAward

**Domain:** platform operations  
**Why this table exists:** A durable leaderboard award record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| entryId | String | Reference ID for entry. |
| entry | LeaderboardEntry | Relation to LeaderboardEntry. |
| tier | String | Stored string value for tier. |
| label | String | Stored string value for label. |
| createdAt | DateTime | Creation timestamp. |

### StudentQuestionMark

**Domain:** student learning  
**Why this table exists:** A durable student question mark record for the student learning domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /student/learning/* and student content routes
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| questionId | String | Reference ID for question. |
| createdAt | DateTime | Creation timestamp. |
| student | StudentProfile | Relation to StudentProfile. |
| question | Question | Relation to Question. |

### StudentQuestionNote

**Domain:** student learning  
**Why this table exists:** A durable student question note record for the student learning domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /student/learning/* and student content routes
- Written by: /student/assessments/* and /admin/assessments/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| questionId | String | Reference ID for question. |
| body | String | Main authored text. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| student | StudentProfile | Relation to StudentProfile. |
| question | Question | Relation to Question. |

### QuestionCommunityStat

**Domain:** question authoring  
**Why this table exists:** A durable question community stat record for the question authoring domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| questionId | String | Reference ID for question. |
| totalResponses | Int | Numeric value for total responses. |
| correctResponses | Int | Numeric value for correct responses. |
| incorrectResponses | Int | Numeric value for incorrect responses. |
| incorrectRate | Float | Numeric value for incorrect rate. |
| difficultyBand | QuestionDifficultyBand | Controlled value from QuestionDifficultyBand. |
| calculatedAt | DateTime | Timestamp for calculated at. |
| question | Question | Relation to Question. |

### BunnyStreamWebhookEvent

**Domain:** platform operations  
**Why this table exists:** A durable bunny stream webhook event record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| eventKey | String | Stored string value for event key. |
| bunnyVideoId | String | Reference ID for bunny video. |
| status | Int | Lifecycle state from Int. |
| payload | Json | Structured JSON for payload. |
| receivedAt | DateTime | Timestamp for received at. |

### ContentPlacement

**Domain:** platform operations  
**Why this table exists:** Places reusable content at a curriculum node.

**Direct API use (static trace)**

- Read by: /catalog/* and student catalog; /admin/content-items/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| contentItemId | String | Reference ID for content item. |
| courseId | String? | Reference ID for course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| lessonId | String? | Reference ID for lesson. Optional. |
| sectionId | String? | Reference ID for section. Optional. |
| academicGradeId | String | Reference ID for academic grade. |
| subjectId | String | Reference ID for subject. |
| resolvedCourseId | String | Reference ID for resolved course. |
| resolvedChapterId | String? | Reference ID for resolved chapter. Optional. |
| resolvedLessonId | String? | Reference ID for resolved lesson. Optional. |
| resolvedSectionId | String? | Reference ID for resolved section. Optional. |
| sortOrder | Int | Sibling display order. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| contentItem | ContentItem | Relation to ContentItem. |
| course | Course? | Relation to Course. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| lesson | Lesson? | Relation to Lesson. Optional. |
| section | Section? | Relation to Section. Optional. |

### StudentContentProgress

**Domain:** student learning  
**Why this table exists:** A durable student content progress record for the student learning domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /catalog/* and student catalog; entitlement and content-access routes; /student/learning/* and student content routes
- Written by: /student/learning/* and student content routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| contentItemId | String | Reference ID for content item. |
| completedAt | DateTime | Timestamp for completed at. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| student | StudentProfile | Relation to StudentProfile. |
| contentItem | ContentItem | Relation to ContentItem. |

### StudentContentStudyState

**Domain:** student learning  
**Why this table exists:** A durable student content study state record for the student learning domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: entitlement and content-access routes; /student/learning/* and student content routes
- Written by: /student/learning/* and student content routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| contentItemId | String | Reference ID for content item. |
| lastOpenedAt | DateTime | Timestamp for last opened at. |
| playbackPositionSeconds | Int? | Numeric value for playback position seconds. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| student | StudentProfile | Relation to StudentProfile. |
| contentItem | ContentItem | Relation to ContentItem. |

### StudentQuestionAttempt

**Domain:** student learning  
**Why this table exists:** A durable student question attempt record for the student learning domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /student/assessments/* and /admin/assessments/*; /student/learning/* and student content routes; student/parent performance routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| questionId | String | Reference ID for question. |
| attemptNumber | Int | Numeric value for attempt number. |
| isCorrect | Boolean | Flag indicating whether is correct applies. |
| submittedAt | DateTime | Timestamp for submitted at. |
| student | StudentProfile | Relation to StudentProfile. |
| question | Question | Relation to Question. |
| answers | StudentQuestionAttemptAnswer[] | Inverse collection of related StudentQuestionAttemptAnswer records. |

### StudentQuestionAttemptAnswer

**Domain:** student learning  
**Why this table exists:** A durable student question attempt answer record for the student learning domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| attemptId | String | Reference ID for attempt. |
| optionId | String | Reference ID for option. |
| attempt | StudentQuestionAttempt | Relation to StudentQuestionAttempt. |
| option | QuestionOption | Relation to QuestionOption. |

### StudentEntitlement

**Domain:** platform operations  
**Why this table exists:** Authoritative grant/revocation history for access.

**Direct API use (static trace)**

- Read by: /catalog/* and student catalog; student cart/order/refund routes; entitlement and content-access routes; internal publication lifecycle; /admin/reports/*; /students/me and /admin/students/*
- Written by: entitlement and content-access routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| orderItemId | String? | Reference ID for order item. Optional. |
| orderItem | OrderItem? | Relation to OrderItem. Optional. |
| source | EntitlementSource | Controlled value from EntitlementSource. |
| status | EntitlementStatus | Lifecycle state from EntitlementStatus. |
| startsAt | DateTime | Timestamp for starts at. |
| expiresAt | DateTime? | Validity expiry timestamp. Optional. |
| revokedAt | DateTime? | Revocation timestamp. Optional. |
| grantedById | String | Reference ID for granted by. |
| grantedBy | User | Relation to User. |
| revokedById | String? | Reference ID for revoked by. Optional. |
| revokedBy | User? | Relation to User. Optional. |
| archivedAccessSnapshots | ArchivedAccessSnapshot[] | Inverse collection of related ArchivedAccessSnapshot records. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### ArchivedAccessSnapshot

**Domain:** platform operations  
**Why this table exists:** Retained access context for archived resources.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: internal publication lifecycle

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| resourceType | ArchivedAccessResourceType | Controlled value from ArchivedAccessResourceType. |
| resourceId | String | Reference ID for resource. |
| sourceEntitlementId | String | Reference ID for source entitlement. |
| sourceEntitlement | StudentEntitlement | Relation to StudentEntitlement. |
| archivedAt | DateTime | Archive timestamp. |
| revokedAt | DateTime? | Revocation timestamp. Optional. |
| revokedById | String? | Reference ID for revoked by. Optional. |
| revokedBy | User? | Relation to User. Optional. |
| createdAt | DateTime | Creation timestamp. |

### Cart

**Domain:** commerce  
**Why this table exists:** Student checkout basket.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| items | CartItem[] | Inverse collection of related CartItem records. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### CartItem

**Domain:** commerce  
**Why this table exists:** A durable cart item record for the commerce domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| cartId | String | Reference ID for cart. |
| cart | Cart | Relation to Cart. |
| targetType | CommerceTargetType | Controlled value from CommerceTargetType. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| createdAt | DateTime | Creation timestamp. |

### ManualPaymentMethod

**Domain:** commerce  
**Why this table exists:** A durable manual payment method record for the commerce domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| titleAr | String | Arabic display title. |
| instructionsAr | String | Stored string value for instructions ar. |
| titleEn | String? | English display title. Optional. |
| instructionsEn | String? | Stored string value for instructions en. Optional. |
| isActive | Boolean | Flag indicating whether is active applies. |
| sortOrder | Int | Sibling display order. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| orders | Order[] | Inverse collection of related Order records. |

### Order

**Domain:** commerce  
**Why this table exists:** Checkout record driving payment, access, refunds, and allocations.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes; /student/learning/* and student content routes; /admin/partner-finance/*; /admin/reports/*; /students/me and /admin/students/*
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| manualPaymentMethodId | String? | Reference ID for manual payment method. Optional. |
| manualPaymentMethod | ManualPaymentMethod? | Relation to ManualPaymentMethod. Optional. |
| paymentChannel | PaymentChannel | Controlled value from PaymentChannel. |
| paymentMethodSnapshot | Json | Structured JSON for payment method snapshot. |
| subtotalMinor | Int | Numeric value for subtotal minor. |
| discountMinor | Int | Numeric value for discount minor. |
| totalMinor | Int | Numeric value for total minor. |
| currency | String | Currency code for monetary values. |
| status | OrderStatus | Lifecycle state from OrderStatus. |
| items | OrderItem[] | Inverse collection of related OrderItem records. |
| submissions | ManualPaymentSubmission[] | Inverse collection of related ManualPaymentSubmission records. |
| paymentAttempts | PaymentAttempt[] | Inverse collection of related PaymentAttempt records. |
| couponReservation | CouponReservation? | Relation to CouponReservation. Optional. |
| receipt | PaymentReceipt? | Relation to PaymentReceipt. Optional. |
| referralAttribution | OrderReferralAttribution? | Relation to OrderReferralAttribution. Optional. |
| refundRequests | RefundRequest[] | Inverse collection of related RefundRequest records. |
| reconciliationOrders | PartnerFinanceReconciliationOrder[] | Inverse collection of related PartnerFinanceReconciliationOrder records. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| approvedAt | DateTime? | Timestamp for approved at. Optional. |
| cancelledAt | DateTime? | Timestamp for cancelled at. Optional. |
| paymentExpiresAt | DateTime? | Timestamp for payment expires at. Optional. |
| expiredAt | DateTime? | Timestamp for expired at. Optional. |

### OrderItem

**Domain:** commerce  
**Why this table exists:** A durable order item record for the commerce domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| targetType | CommerceTargetType | Controlled value from CommerceTargetType. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| titleSnapshot | String | Stored string value for title snapshot. |
| basePriceMinor | Int | Numeric value for base price minor. |
| discountMinor | Int | Numeric value for discount minor. |
| priceMinor | Int | Money in minor currency units. |
| currency | String | Currency code for monetary values. |
| appliedPromotionSnapshot | Json? | Structured JSON for applied promotion snapshot. Optional. |
| entitlement | StudentEntitlement? | Relation to StudentEntitlement. Optional. |
| allocations | PartnerAllocation[] | Inverse collection of related PartnerAllocation records. |
| refundRequestItem | RefundRequestItem? | Relation to RefundRequestItem. Optional. |
| reconciliationDiscrepancies | PartnerFinanceDiscrepancy[] | Inverse collection of related PartnerFinanceDiscrepancy records. |
| createdAt | DateTime | Creation timestamp. |

### PaymentAttempt

**Domain:** commerce  
**Why this table exists:** One provider/manual payment attempt.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes; /admin/reports/*
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| channel | PaymentChannel | Controlled value from PaymentChannel. |
| status | PaymentAttemptStatus | Lifecycle state from PaymentAttemptStatus. |
| attemptNumber | Int | Numeric value for attempt number. |
| merchantReference | String | Stored string value for merchant reference. |
| providerOrderId | String? | Reference ID for provider order. Optional. |
| providerTransactionId | String? | Reference ID for provider transaction. Optional. |
| checkoutUrl | String? | Stored string value for checkout url. Optional. |
| failureCode | String? | Stored string value for failure code. Optional. |
| failureMessage | String? | Stored string value for failure message. Optional. |
| providerPayload | Json? | Structured JSON for provider payload. Optional. |
| initiatedAt | DateTime | Timestamp for initiated at. |
| completedAt | DateTime? | Timestamp for completed at. Optional. |
| expiresAt | DateTime? | Validity expiry timestamp. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| receipt | PaymentReceipt? | Relation to PaymentReceipt. Optional. |

### PaymobWebhookEvent

**Domain:** platform operations  
**Why this table exists:** A durable paymob webhook event record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes; /admin/partner-finance/*
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| externalTransactionId | String | Reference ID for external transaction. |
| merchantReference | String? | Stored string value for merchant reference. Optional. |
| verified | Boolean | Flag indicating whether verified applies. |
| payloadHash | String | Stored string value for payload hash. |
| payload | Json? | Structured JSON for payload. Optional. |
| processingError | String? | Stored string value for processing error. Optional. |
| processedAt | DateTime? | Timestamp for processed at. Optional. |
| createdAt | DateTime | Creation timestamp. |

### DiscountCampaign

**Domain:** platform operations  
**Why this table exists:** A durable discount campaign record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| name | String | Stored string value for name. |
| note | String? | Stored string value for note. Optional. |
| kind | PromotionKind | Controlled value from PromotionKind. |
| amount | Int | Numeric value for amount. |
| startsAt | DateTime | Timestamp for starts at. |
| endsAt | DateTime | Timestamp for ends at. |
| priority | Int | Numeric value for priority. |
| isActive | Boolean | Flag indicating whether is active applies. |
| appliesToAll | Boolean | Flag indicating whether applies to all applies. |
| targets | DiscountCampaignTarget[] | Inverse collection of related DiscountCampaignTarget records. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| updatedById | String | Reference ID for updated by. |
| updatedBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### DiscountCampaignTarget

**Domain:** platform operations  
**Why this table exists:** A durable discount campaign target record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| campaignId | String | Reference ID for campaign. |
| campaign | DiscountCampaign | Relation to DiscountCampaign. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |

### Coupon

**Domain:** platform operations  
**Why this table exists:** A durable coupon record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| code | String | Stored string value for code. |
| name | String | Stored string value for name. |
| kind | PromotionKind | Controlled value from PromotionKind. |
| amount | Int | Numeric value for amount. |
| startsAt | DateTime | Timestamp for starts at. |
| endsAt | DateTime | Timestamp for ends at. |
| isActive | Boolean | Flag indicating whether is active applies. |
| appliesToAll | Boolean | Flag indicating whether applies to all applies. |
| minimumOrderMinor | Int | Numeric value for minimum order minor. |
| maximumDiscountMinor | Int? | Numeric value for maximum discount minor. Optional. |
| usageLimit | Int? | Numeric value for usage limit. Optional. |
| perStudentUsageLimit | Int? | Numeric value for per student usage limit. Optional. |
| targets | CouponTarget[] | Inverse collection of related CouponTarget records. |
| reservations | CouponReservation[] | Inverse collection of related CouponReservation records. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| updatedById | String | Reference ID for updated by. |
| updatedBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### CouponTarget

**Domain:** platform operations  
**Why this table exists:** A durable coupon target record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| couponId | String | Reference ID for coupon. |
| coupon | Coupon | Relation to Coupon. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |

### CouponReservation

**Domain:** platform operations  
**Why this table exists:** A durable coupon reservation record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| couponId | String | Reference ID for coupon. |
| coupon | Coupon | Relation to Coupon. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| status | CouponReservationStatus | Lifecycle state from CouponReservationStatus. |
| discountMinor | Int | Numeric value for discount minor. |
| snapshot | Json | Structured JSON for snapshot. |
| releasedAt | DateTime? | Timestamp for released at. Optional. |
| redeemedAt | DateTime? | Timestamp for redeemed at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### PaymentReceipt

**Domain:** commerce  
**Why this table exists:** A durable payment receipt record for the commerce domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| paymentAttemptId | String? | Reference ID for payment attempt. Optional. |
| paymentAttempt | PaymentAttempt? | Relation to PaymentAttempt. Optional. |
| reference | String | Stored string value for reference. |
| snapshot | Json | Structured JSON for snapshot. |
| issuedAt | DateTime | Timestamp for issued at. |
| createdAt | DateTime | Creation timestamp. |

### ManualPaymentSubmission

**Domain:** commerce  
**Why this table exists:** Payment proof and staff decision.

**Direct API use (static trace)**

- Read by: /admin/assets/* plus asset/cover access; student cart/order/refund routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| proofAssetId | String | Reference ID for proof asset. |
| proofAsset | Asset | Relation to Asset. |
| transactionReference | String? | Stored string value for transaction reference. Optional. |
| note | String? | Stored string value for note. Optional. |
| status | ManualPaymentSubmissionStatus | Lifecycle state from ManualPaymentSubmissionStatus. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| reviewedBy | User? | Relation to User. Optional. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| rejectionReason | String? | Stored string value for rejection reason. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### RefundRequest

**Domain:** platform operations  
**Why this table exists:** A durable refund request record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes; /admin/reports/*
- Written by: student cart/order/refund routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| status | RefundRequestStatus | Lifecycle state from RefundRequestStatus. |
| reason | String | Stored string value for reason. |
| eligibilitySnapshot | Json | Structured JSON for eligibility snapshot. |
| rejectionReason | String? | Stored string value for rejection reason. Optional. |
| reviewNote | String? | Reviewer rationale. Optional. |
| manualRefundReference | String? | Stored string value for manual refund reference. Optional. |
| reviewedById | String? | Reference ID for reviewed by. Optional. |
| reviewedBy | User? | Relation to User. Optional. |
| requestedAt | DateTime | Timestamp for requested at. |
| reviewedAt | DateTime? | Review timestamp. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| items | RefundRequestItem[] | Inverse collection of related RefundRequestItem records. |

### RefundRequestItem

**Domain:** platform operations  
**Why this table exists:** A durable refund request item record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/reports/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| refundRequestId | String | Reference ID for refund request. |
| refundRequest | RefundRequest | Relation to RefundRequest. |
| orderItemId | String | Reference ID for order item. |
| orderItem | OrderItem | Relation to OrderItem. |
| amountMinor | Int | Numeric value for amount minor. |
| currency | String | Currency code for monetary values. |
| createdAt | DateTime | Creation timestamp. |

### CommerceIdempotencyKey

**Domain:** commerce  
**Why this table exists:** A durable commerce idempotency key record for the commerce domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| studentUserId | String | Reference ID for student user. |
| operation | String | Stored string value for operation. |
| key | String | Stored string value for key. |
| resourceId | String | Reference ID for resource. |
| createdAt | DateTime | Creation timestamp. |

### PublisherAgreement

**Domain:** partner finance  
**Why this table exists:** A durable publisher agreement record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /partners/analytics/*; /admin/partner-finance/*; /partners/me and /admin/partners/*; /admin/publisher-agreements/*
- Written by: /admin/publisher-agreements/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| publisherUserId | String | Reference ID for publisher user. |
| publisher | PartnerProfile | Relation to PartnerProfile. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| lessonId | String? | Reference ID for lesson. Optional. |
| lesson | Lesson? | Relation to Lesson. Optional. |
| payoutKind | ReferralCommissionKind | Controlled value from ReferralCommissionKind. |
| revenueShareBps | Int? | Numeric value for revenue share bps. Optional. |
| fixedPayoutMinor | Int? | Numeric value for fixed payout minor. Optional. |
| currency | String | Currency code for monetary values. |
| contractReference | String? | Stored string value for contract reference. Optional. |
| signedDocumentAssetId | String? | Reference ID for signed document asset. Optional. |
| internalNote | String? | Stored string value for internal note. Optional. |
| version | Int | Numeric value for version. |
| supersedesId | String? | Reference ID for supersedes. Optional. |
| supersedes | PublisherAgreement? | Relation to PublisherAgreement. Optional. |
| replacements | PublisherAgreement[] | Inverse collection of related PublisherAgreement records. |
| startsAt | DateTime | Timestamp for starts at. |
| endsAt | DateTime? | Timestamp for ends at. Optional. |
| status | PublisherAgreementStatus | Lifecycle state from PublisherAgreementStatus. |
| isPrimary | Boolean | Flag indicating whether is primary applies. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| allocations | PartnerAllocation[] | Inverse collection of related PartnerAllocation records. |

### ReferralProgram

**Domain:** partner finance  
**Why this table exists:** A durable referral program record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /partners/me and /admin/partners/*; referral-program and reporting routes
- Written by: referral-program and reporting routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| partnerUserId | String | Reference ID for partner user. |
| partner | PartnerProfile | Relation to PartnerProfile. |
| name | String | Stored string value for name. |
| status | ReferralProgramStatus | Lifecycle state from ReferralProgramStatus. |
| startsAt | DateTime | Timestamp for starts at. |
| endsAt | DateTime? | Timestamp for ends at. Optional. |
| usageLimit | Int? | Numeric value for usage limit. Optional. |
| perStudentUsageLimit | Int? | Numeric value for per student usage limit. Optional. |
| appliesToAll | Boolean | Flag indicating whether applies to all applies. |
| courseId | String? | Reference ID for course. Optional. |
| course | Course? | Relation to Course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| chapter | Chapter? | Relation to Chapter. Optional. |
| createdById | String | Reference ID for created by. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| codes | ReferralCode[] | Inverse collection of related ReferralCode records. |
| rules | ReferralCommissionRule[] | Inverse collection of related ReferralCommissionRule records. |
| reviewRules | ReferralReviewRule[] | Inverse collection of related ReferralReviewRule records. |
| attributions | OrderReferralAttribution[] | Inverse collection of related OrderReferralAttribution records. |

### ReferralCode

**Domain:** partner finance  
**Why this table exists:** A durable referral code record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: referral-program and reporting routes
- Written by: referral-program and reporting routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| programId | String | Reference ID for program. |
| program | ReferralProgram | Relation to ReferralProgram. |
| code | String | Stored string value for code. |
| isActive | Boolean | Flag indicating whether is active applies. |
| startsAt | DateTime? | Timestamp for starts at. Optional. |
| endsAt | DateTime? | Timestamp for ends at. Optional. |
| usageLimit | Int? | Numeric value for usage limit. Optional. |
| perStudentUsageLimit | Int? | Numeric value for per student usage limit. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| attributions | OrderReferralAttribution[] | Inverse collection of related OrderReferralAttribution records. |

### ReferralCommissionRule

**Domain:** partner finance  
**Why this table exists:** A durable referral commission rule record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: referral-program and reporting routes
- Written by: referral-program and reporting routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| programId | String | Reference ID for program. |
| program | ReferralProgram | Relation to ReferralProgram. |
| version | Int | Numeric value for version. |
| kind | ReferralCommissionKind | Controlled value from ReferralCommissionKind. |
| percentageBps | Int? | Numeric value for percentage bps. Optional. |
| fixedCommissionMinor | Int? | Numeric value for fixed commission minor. Optional. |
| maximumCommissionMinor | Int? | Numeric value for maximum commission minor. Optional. |
| currency | String | Currency code for monetary values. |
| startsAt | DateTime | Timestamp for starts at. |
| endsAt | DateTime? | Timestamp for ends at. Optional. |
| isActive | Boolean | Flag indicating whether is active applies. |
| createdAt | DateTime | Creation timestamp. |
| allocations | PartnerAllocation[] | Inverse collection of related PartnerAllocation records. |
| orderReferralAttributions | OrderReferralAttribution[] | Inverse collection of related OrderReferralAttribution records. |

### ReferralReviewRule

**Domain:** partner finance  
**Why this table exists:** A durable referral review rule record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: referral-program and reporting routes
- Written by: referral-program and reporting routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| programId | String | Reference ID for program. |
| program | ReferralProgram | Relation to ReferralProgram. |
| name | String | Stored string value for name. |
| kind | ReferralReviewRuleKind | Controlled value from ReferralReviewRuleKind. |
| action | ReferralReviewAction | Controlled value from ReferralReviewAction. |
| threshold | Int | Numeric value for threshold. |
| isActive | Boolean | Flag indicating whether is active applies. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| flags | ReferralReviewFlag[] | Inverse collection of related ReferralReviewFlag records. |

### OrderReferralAttribution

**Domain:** commerce  
**Why this table exists:** Referral code/program credited to an order.

**Direct API use (static trace)**

- Read by: referral-program and reporting routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| orderId | String | Reference ID for order. |
| order | Order | Relation to Order. |
| studentUserId | String | Reference ID for student user. |
| student | StudentProfile | Relation to StudentProfile. |
| referralCodeId | String | Reference ID for referral code. |
| referralCode | ReferralCode | Relation to ReferralCode. |
| referralProgramId | String | Reference ID for referral program. |
| referralProgram | ReferralProgram | Relation to ReferralProgram. |
| ruleId | String | Reference ID for rule. |
| rule | ReferralCommissionRule | Relation to ReferralCommissionRule. |
| snapshot | Json | Structured JSON for snapshot. |
| createdAt | DateTime | Creation timestamp. |
| reviewFlags | ReferralReviewFlag[] | Inverse collection of related ReferralReviewFlag records. |

### ReferralReviewFlag

**Domain:** partner finance  
**Why this table exists:** A durable referral review flag record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: referral-program and reporting routes
- Written by: referral-program and reporting routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| attributionId | String | Reference ID for attribution. |
| attribution | OrderReferralAttribution | Relation to OrderReferralAttribution. |
| ruleId | String? | Reference ID for rule. Optional. |
| rule | ReferralReviewRule? | Relation to ReferralReviewRule. Optional. |
| source | ReferralReviewFlagSource | Controlled value from ReferralReviewFlagSource. |
| type | String | Business classification from String. |
| action | ReferralReviewAction | Controlled value from ReferralReviewAction. |
| observedValue | Int? | Numeric value for observed value. Optional. |
| threshold | Int? | Numeric value for threshold. Optional. |
| metadata | Json? | Extensible structured JSON metadata. Optional. |
| status | ReferralReviewStatus | Lifecycle state from ReferralReviewStatus. |
| assignedToId | String? | Reference ID for assigned to. Optional. |
| assignedTo | User? | Relation to User. Optional. |
| disposition | ReferralReviewDisposition? | Controlled value from ReferralReviewDisposition. Optional. |
| resolvedById | String? | Reference ID for resolved by. Optional. |
| resolvedBy | User? | Relation to User. Optional. |
| resolvedAt | DateTime? | Timestamp for resolved at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| notes | ReferralReviewNote[] | Inverse collection of related ReferralReviewNote records. |

### ReferralReviewNote

**Domain:** partner finance  
**Why this table exists:** A durable referral review note record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: referral-program and reporting routes

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| flagId | String | Reference ID for flag. |
| flag | ReferralReviewFlag | Relation to ReferralReviewFlag. |
| body | String | Main authored text. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |

### PartnerAllocation

**Domain:** partner finance  
**Why this table exists:** Amount owed to a partner from a commercial event.

**Direct API use (static trace)**

- Read by: /partners/analytics/*; /admin/partner-finance/*; /partners/me and /admin/partners/*; referral-program and reporting routes; /admin/reports/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| kind | PartnerAllocationKind | Controlled value from PartnerAllocationKind. |
| state | PartnerAllocationState | Controlled value from PartnerAllocationState. |
| partnerUserId | String | Reference ID for partner user. |
| partner | PartnerProfile | Relation to PartnerProfile. |
| orderItemId | String | Reference ID for order item. |
| orderItem | OrderItem | Relation to OrderItem. |
| publisherAgreementId | String? | Reference ID for publisher agreement. Optional. |
| publisherAgreement | PublisherAgreement? | Relation to PublisherAgreement. Optional. |
| referralRuleId | String? | Reference ID for referral rule. Optional. |
| referralRule | ReferralCommissionRule? | Relation to ReferralCommissionRule. Optional. |
| basisMinor | Int | Numeric value for basis minor. |
| amountMinor | Int | Numeric value for amount minor. |
| currency | String | Currency code for monetary values. |
| snapshot | Json | Structured JSON for snapshot. |
| idempotencyKey | String | Stored string value for idempotency key. |
| reversedAllocationId | String? | Reference ID for reversed allocation. Optional. |
| reversedAllocation | PartnerAllocation? | Relation to PartnerAllocation. Optional. |
| reversalOf | PartnerAllocation? | Relation to PartnerAllocation. Optional. |
| payableAt | DateTime | Timestamp for payable at. |
| paidAt | DateTime? | Timestamp for paid at. Optional. |
| reversedAt | DateTime? | Timestamp for reversed at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| settlementLines | PartnerSettlementLine[] | Inverse collection of related PartnerSettlementLine records. |
| reconciliationDiscrepancies | PartnerFinanceDiscrepancy[] | Inverse collection of related PartnerFinanceDiscrepancy records. |

### RefundPolicy

**Domain:** platform operations  
**Why this table exists:** A durable refund policy record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: student cart/order/refund routes
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| version | Int | Numeric value for version. |
| eligibilityWindowDays | Int | Numeric value for eligibility window days. |
| maximumConsumptionBps | Int | Numeric value for maximum consumption bps. |
| isActive | Boolean | Flag indicating whether is active applies. |
| updatedById | String | Reference ID for updated by. |
| updatedBy | User | Relation to User. |
| createdAt | DateTime | Creation timestamp. |

### PartnerFinanceReconciliationRun

**Domain:** partner finance  
**Why this table exists:** A durable partner finance reconciliation run record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/partner-finance/*
- Written by: /admin/partner-finance/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| pilotLabel | String | Stored string value for pilot label. |
| status | PartnerFinanceReconciliationStatus | Lifecycle state from PartnerFinanceReconciliationStatus. |
| summary | Json? | Structured JSON for summary. Optional. |
| createdById | String | Reference ID for created by. |
| createdBy | User | Relation to User. |
| startedAt | DateTime? | Timestamp for started at. Optional. |
| completedAt | DateTime? | Timestamp for completed at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |
| orders | PartnerFinanceReconciliationOrder[] | Inverse collection of related PartnerFinanceReconciliationOrder records. |
| discrepancies | PartnerFinanceDiscrepancy[] | Inverse collection of related PartnerFinanceDiscrepancy records. |

### PartnerFinanceReconciliationOrder

**Domain:** partner finance  
**Why this table exists:** A durable partner finance reconciliation order record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| runId | String | Reference ID for run. |
| orderId | String | Reference ID for order. |
| run | PartnerFinanceReconciliationRun | Relation to PartnerFinanceReconciliationRun. |
| order | Order | Relation to Order. |

### PartnerFinanceDiscrepancy

**Domain:** partner finance  
**Why this table exists:** A durable partner finance discrepancy record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /admin/partner-finance/*
- Written by: /admin/partner-finance/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| runId | String | Reference ID for run. |
| run | PartnerFinanceReconciliationRun | Relation to PartnerFinanceReconciliationRun. |
| type | String | Business classification from String. |
| expectedAmountMinor | Int? | Numeric value for expected amount minor. Optional. |
| actualAmountMinor | Int? | Numeric value for actual amount minor. Optional. |
| expectedBasisMinor | Int? | Numeric value for expected basis minor. Optional. |
| actualBasisMinor | Int? | Numeric value for actual basis minor. Optional. |
| currency | String? | Currency code for monetary values. Optional. |
| orderItemId | String? | Reference ID for order item. Optional. |
| orderItem | OrderItem? | Relation to OrderItem. Optional. |
| allocationId | String? | Reference ID for allocation. Optional. |
| allocation | PartnerAllocation? | Relation to PartnerAllocation. Optional. |
| partnerUserId | String? | Reference ID for partner user. Optional. |
| severity | PartnerFinanceDiscrepancySeverity | Controlled value from PartnerFinanceDiscrepancySeverity. |
| status | PartnerFinanceDiscrepancyStatus | Lifecycle state from PartnerFinanceDiscrepancyStatus. |
| assignedToId | String? | Reference ID for assigned to. Optional. |
| assignedTo | User? | Relation to User. Optional. |
| notes | String? | Stored string value for notes. Optional. |
| resolutionNote | String? | Stored string value for resolution note. Optional. |
| resolvedById | String? | Reference ID for resolved by. Optional. |
| resolvedBy | User? | Relation to User. Optional. |
| resolvedAt | DateTime? | Timestamp for resolved at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### PartnerSettlement

**Domain:** partner finance  
**Why this table exists:** Settlement grouping of payable allocations.

**Direct API use (static trace)**

- Read by: /admin/partner-finance/*; referral-program and reporting routes; /admin/reports/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| partnerUserId | String | Reference ID for partner user. |
| partner | PartnerProfile | Relation to PartnerProfile. |
| paymentReference | String | Stored string value for payment reference. |
| currency | String | Currency code for monetary values. |
| totalMinor | Int | Numeric value for total minor. |
| createdById | String | Reference ID for created by. |
| paidAt | DateTime? | Timestamp for paid at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| lines | PartnerSettlementLine[] | Inverse collection of related PartnerSettlementLine records. |

### PartnerSettlementLine

**Domain:** partner finance  
**Why this table exists:** Allocation-to-settlement link.

**Direct API use (static trace)**

- Read by: /admin/partner-finance/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| settlementId | String | Reference ID for settlement. |
| allocationId | String | Reference ID for allocation. |
| settlement | PartnerSettlement | Relation to PartnerSettlement. |
| allocation | PartnerAllocation | Relation to PartnerAllocation. |

### AssessmentQuestionAttribution

**Domain:** assessment  
**Why this table exists:** A durable assessment question attribution record for the assessment domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: None found as a direct Prisma delegate in non-test service code.
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| assessmentQuestionId | String | Reference ID for assessment question. |
| assessmentQuestion | AssessmentQuestion | Relation to AssessmentQuestion. |
| sourceId | String? | Reference ID for source. Optional. |
| sourceTitle | String? | Stored string value for source title. Optional. |
| sourceType | QuestionSourceType? | Controlled value from QuestionSourceType. Optional. |
| publisherUserId | String? | Reference ID for publisher user. Optional. |
| publisherDisplayName | String? | Stored string value for publisher display name. Optional. |
| role | AssessmentAttributionRole | Controlled value from AssessmentAttributionRole. |
| weightBps | Int | Numeric value for weight bps. |
| createdAt | DateTime | Creation timestamp. |

### PublisherUsageDailyRollup

**Domain:** partner finance  
**Why this table exists:** A durable publisher usage daily rollup record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /partners/analytics/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| usageDate | DateTime | Timestamp for usage date. |
| publisherUserId | String | Reference ID for publisher user. |
| publisher | PartnerProfile | Relation to PartnerProfile. |
| sourceId | String? | Reference ID for source. Optional. |
| sourceKey | String | Stored string value for source key. |
| sourceTitle | String? | Stored string value for source title. Optional. |
| scope | PublisherUsageScope | Controlled value from PublisherUsageScope. |
| scopeId | String? | Reference ID for scope. Optional. |
| scopeKey | String | Stored string value for scope key. |
| subjectId | String? | Reference ID for subject. Optional. |
| courseId | String? | Reference ID for course. Optional. |
| chapterId | String? | Reference ID for chapter. Optional. |
| lessonId | String? | Reference ID for lesson. Optional. |
| sectionId | String? | Reference ID for section. Optional. |
| presented | Int | Numeric value for presented. |
| solved | Int | Numeric value for solved. |
| uniqueSolvers | Int | Numeric value for unique solvers. |
| graded | Int | Numeric value for graded. |
| correct | Int | Numeric value for correct. |
| reattempts | Int | Numeric value for reattempts. |
| inputUpdatedAt | DateTime | Timestamp for input updated at. |
| calculatedAt | DateTime | Timestamp for calculated at. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### PublisherUsageDailySolver

**Domain:** partner finance  
**Why this table exists:** A durable publisher usage daily solver record for the partner finance domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /partners/analytics/*
- Written by: None found as a direct Prisma delegate in non-test service code.

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| usageDate | DateTime | Timestamp for usage date. |
| publisherUserId | String | Reference ID for publisher user. |
| publisher | PartnerProfile | Relation to PartnerProfile. |
| sourceKey | String | Stored string value for source key. |
| scopeKey | String | Stored string value for scope key. |
| studentFingerprint | String | Stored string value for student fingerprint. |
| createdAt | DateTime | Creation timestamp. |

### ReportExportJob

**Domain:** platform operations  
**Why this table exists:** Asynchronous report export lifecycle.

**Direct API use (static trace)**

- Read by: /admin/reports/*
- Written by: /admin/reports/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| requestedById | String | Reference ID for requested by. |
| requestedBy | User | Relation to User. |
| reportType | String | Stored string value for report type. |
| filters | Json | Structured JSON for filters. |
| columns | Json | Structured JSON for columns. |
| reason | String? | Stored string value for reason. Optional. |
| containsPii | Boolean | Flag indicating whether contains pii applies. |
| classification | ReportDataClassification | Controlled value from ReportDataClassification. |
| status | ReportExportStatus | Lifecycle state from ReportExportStatus. |
| storageKey | String? | Provider object key. Optional. |
| rowCount | Int? | Numeric value for row count. Optional. |
| error | String? | Stored string value for error. Optional. |
| expiresAt | DateTime? | Validity expiry timestamp. Optional. |
| downloadedAt | DateTime? | Timestamp for downloaded at. Optional. |
| cancelledAt | DateTime? | Timestamp for cancelled at. Optional. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### Governorate

**Domain:** platform operations  
**Why this table exists:** A durable governorate record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /auth/*; /geography/* and /admin/geography/*; /students/me and /admin/students/*
- Written by: /geography/* and /admin/geography/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| nameAr | String | Stored string value for name ar. |
| nameEn | String? | Stored string value for name en. Optional. |
| centers | Center[] | Inverse collection of related Center records. |
| students | StudentProfile[] | Inverse collection of related StudentProfile records. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

### Center

**Domain:** platform operations  
**Why this table exists:** A durable center record for the platform operations domain, separate so relationships, history, and queryability remain explicit.

**Direct API use (static trace)**

- Read by: /auth/*; /students/me and /admin/students/*
- Written by: /geography/* and /admin/geography/*

**Attributes**

| Attribute | Prisma type | Meaning |
| --- | --- | --- |
| id | String | Primary identifier. |
| governorateId | String | Reference ID for governorate. |
| governorate | Governorate | Relation to Governorate. |
| nameAr | String | Stored string value for name ar. |
| nameEn | String? | Stored string value for name en. Optional. |
| students | StudentProfile[] | Inverse collection of related StudentProfile records. |
| createdAt | DateTime | Creation timestamp. |
| updatedAt | DateTime | Last-update timestamp. |

## Change checklist

For any table change, review its relations, the API feature modules listed above, and the corresponding prisma/migrations SQL. Important lifecycle, partial-unique, and polymorphic-target constraints may be migration-only. Import workers, payment/video webhooks, report processing, and finance/leaderboard jobs can change tables outside the originating HTTP request.
