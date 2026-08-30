-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PARTNER', 'STUDENT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('CONTENT_PUBLISHER', 'REFERRAL_PARTNER');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentItemType" AS ENUM ('TEXT', 'EXTERNAL_LINK', 'VIDEO', 'PDF', 'IMAGE', 'DOCUMENT', 'DOWNLOADABLE_FILE');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('PUBLIC', 'FREE', 'PAID', 'INHERIT');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('ADMIN', 'PROMOTION', 'MIGRATION', 'PAYMENT');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "CommerceTargetType" AS ENUM ('COURSE', 'CHAPTER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('MANUAL', 'PAYMOB');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'PENDING', 'PAID', 'DECLINED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "CouponReservationStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ManualPaymentSubmissionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PublisherAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "PartnerAllocationKind" AS ENUM ('PUBLISHER_SALE', 'REFERRAL_COMMISSION');

-- CreateEnum
CREATE TYPE "PartnerAllocationState" AS ENUM ('PENDING', 'PAYABLE', 'PAID', 'REVERSED');

-- CreateEnum
CREATE TYPE "PublisherUsageScope" AS ENUM ('ALL', 'SUBJECT', 'COURSE', 'CHAPTER', 'LESSON', 'SECTION');

-- CreateEnum
CREATE TYPE "PartnerFinanceReconciliationStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PartnerFinanceDiscrepancySeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "PartnerFinanceDiscrepancyStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ReferralProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReferralCommissionKind" AS ENUM ('PERCENTAGE', 'FIXED_PER_SALE', 'PERCENTAGE_CAPPED');

-- CreateEnum
CREATE TYPE "ReferralReviewRuleKind" AS ENUM ('STUDENT_PROGRAM_APPROVED_SALES', 'STUDENT_CODE_APPROVED_SALES');

-- CreateEnum
CREATE TYPE "ReferralReviewAction" AS ENUM ('BLOCK_CHECKOUT', 'QUEUE_REVIEW');

-- CreateEnum
CREATE TYPE "ReferralReviewFlagSource" AS ENUM ('AUTOMATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReferralReviewStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ReferralReviewDisposition" AS ENUM ('CLEARED', 'CONFIRMED_FRAUD', 'NO_ACTION', 'ESCALATED');

-- CreateEnum
CREATE TYPE "AssessmentAttributionRole" AS ENUM ('PRIMARY', 'CONTRIBUTOR', 'UNKNOWN_LEGACY');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportDataClassification" AS ENUM ('NON_PII', 'PII_RESTRICTED');

-- CreateEnum
CREATE TYPE "AssetProvider" AS ENUM ('BUNNY_STORAGE', 'BUNNY_STREAM');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('COVER_IMAGE', 'IMAGE', 'PAYMENT_PROOF', 'PDF', 'DOCUMENT', 'DOWNLOADABLE_FILE', 'VIDEO');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADING', 'UPLOADED_AWAITING_PROCESSING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssetReferenceType" AS ENUM ('CONTENT_ATTACHMENT');

-- CreateEnum
CREATE TYPE "ArchivedAccessResourceType" AS ENUM ('ACADEMIC_GRADE', 'SUBJECT', 'COURSE', 'CHAPTER', 'LESSON', 'SECTION');

-- CreateEnum
CREATE TYPE "VideoProcessingStatus" AS ENUM ('CREATED', 'UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionSourceType" AS ENUM ('PLATFORM', 'CONTENT_PUBLISHER', 'EXTERNAL_BOOK', 'PREVIOUS_EXAM', 'MINISTRY_MODEL');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER', 'FILL_IN_THE_BLANK', 'LONG_ANSWER');

-- CreateEnum
CREATE TYPE "QuestionContextType" AS ENUM ('TEXT', 'IMAGE', 'TABLE', 'EQUATION');

-- CreateEnum
CREATE TYPE "QuestionContentBlockType" AS ENUM ('TEXT', 'IMAGE', 'ASSET', 'TABLE', 'EQUATION');

-- CreateEnum
CREATE TYPE "QuestionExplanationOrigin" AS ENUM ('AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "QuestionAiExplanationRunMode" AS ENUM ('INFER', 'GROUNDED');

-- CreateEnum
CREATE TYPE "QuestionAiExplanationRunStatus" AS ENUM ('PENDING_REVIEW', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionAnswerOrigin" AS ENUM ('EXPLICIT', 'INFERRED');

-- CreateEnum
CREATE TYPE "QuestionAnswerProvenance" AS ENUM ('OFFICIAL', 'SOURCE_MARKED', 'AI_INFERRED', 'HUMAN_REVIEWED');

-- CreateEnum
CREATE TYPE "QuestionImportInputType" AS ENUM ('RAW_TEXT', 'ASSET');

-- CreateEnum
CREATE TYPE "QuestionImportStatus" AS ENUM ('QUEUED', 'EXTRACTING', 'TRANSCRIBING', 'SEGMENTING', 'AWAITING_REVIEW', 'GENERATING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionImportPageStatus" AS ENUM ('PENDING', 'PROCESSING', 'EXCLUDED', 'AI_TRANSCRIBED', 'REVIEW_REQUIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionImportPageKind" AS ENUM ('COVER_OR_INDEX', 'QUESTION', 'ANSWER_FORM');

-- CreateEnum
CREATE TYPE "QuestionImportChunkStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionImportItemStatus" AS ENUM ('PROCESSING', 'CREATED', 'REVIEW_REQUIRED', 'EXCLUDED', 'INVALID', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionImportMediaStatus" AS ENUM ('REVIEW_REQUIRED', 'ELIGIBLE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionImportMediaType" AS ENUM ('DIAGRAM', 'CHART', 'MAP', 'TABLE', 'EQUATION', 'PHOTO', 'OPTION_IMAGE', 'OTHER_INSTRUCTIONAL');

-- CreateEnum
CREATE TYPE "QuestionImportMediaDetectionSource" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "QuestionImportMediaAssignmentOwner" AS ENUM ('QUESTION', 'OPTION', 'CONTEXT');

-- CreateEnum
CREATE TYPE "QuestionImportMediaAssignmentStatus" AS ENUM ('PROPOSED', 'VERIFIED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionImportVisualRequirementKind" AS ENUM ('NONE', 'QUESTION_FIGURE', 'COMPOSITE_OPTION_FIGURE', 'OPTION_IMAGE_SET', 'SHARED_STIMULUS');

-- CreateEnum
CREATE TYPE "QuestionImportVisualResolutionState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RESOLVED', 'UNRESOLVED', 'AMBIGUOUS', 'INCOMPLETE_CROP');

-- CreateEnum
CREATE TYPE "QuestionImportMediaCropCompleteness" AS ENUM ('UNKNOWN', 'COMPLETE', 'POSSIBLY_CLIPPED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "AssessmentOwnerType" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssessmentGenerationType" AS ENUM ('STANDARD', 'CUSTOM', 'AI_PROMPT');

-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('TUTOR', 'EXAM');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentAttemptStatus" AS ENUM ('SUSPENDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AssessmentQuestionOutcome" AS ENUM ('CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'OMITTED', 'PENDING_GRADING', 'PENDING_AI_GRADING');

-- CreateEnum
CREATE TYPE "AnswerInputMethod" AS ENUM ('TEXT', 'VOICE_TRANSCRIPT');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuestionReportType" AS ENUM ('WRONG_ANSWER', 'UNCLEAR_WORDING', 'TYPO_LANGUAGE', 'MISSING_OR_BROKEN_MEDIA', 'DUPLICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestionReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionDifficultyBand" AS ENUM ('A_PLUS', 'A', 'B', 'C', 'D');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "loginIdentifier" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalIdHash" TEXT NOT NULL,
    "nationalIdEncrypted" TEXT,
    "nationalIdLast4" TEXT NOT NULL,
    "nationalIdKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "academicGradeId" TEXT,
    "governorate" TEXT NOT NULL,
    "center" TEXT,
    "governorateId" TEXT NOT NULL,
    "centerId" TEXT,
    "parentPhoneNormalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "userId" TEXT NOT NULL,
    "partnerType" "PartnerType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "phone" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "replacedBySessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentAccessSession" (
    "id" TEXT NOT NULL,
    "parentPhoneNormalized" TEXT NOT NULL,
    "activeStudentId" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentAccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicGrade" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "slug" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "coverAssetId" TEXT,

    CONSTRAINT "AcademicGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "academicGradeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "coverAssetId" TEXT,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'PAID',
    "priceMinor" INTEGER,
    "currency" TEXT,
    "isPurchasable" BOOLEAN NOT NULL DEFAULT false,
    "coverAssetId" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT',
    "priceMinor" INTEGER,
    "currency" TEXT,
    "isPurchasable" BOOLEAN,
    "coverAssetId" TEXT,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT',
    "priceMinor" INTEGER,
    "currency" TEXT,
    "isPurchasable" BOOLEAN,
    "coverAssetId" TEXT,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT',
    "coverAssetId" TEXT,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "type" "ContentItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "textBody" TEXT,
    "externalUrl" TEXT,
    "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT',
    "estimatedDuration" INTEGER,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "primaryAssetId" TEXT,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "provider" "AssetProvider" NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "originalFilename" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetReference" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetReferenceType" NOT NULL DEFAULT 'CONTENT_ATTACHMENT',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAsset" (
    "assetId" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "bunnyVideoId" TEXT NOT NULL,
    "processingStatus" "VideoProcessingStatus" NOT NULL DEFAULT 'CREATED',
    "processingProgress" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "thumbnailUrl" TEXT,
    "clientUploadCompletedAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "failureMetadata" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "VideoOutlineTopic" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSeconds" INTEGER,
    "endSeconds" INTEGER,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoOutlineTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoOutlineConcept" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoOutlineConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionSource" (
    "id" TEXT NOT NULL,
    "type" "QuestionSourceType" NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "noteAr" TEXT,
    "noteEn" TEXT,
    "publisherUserId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "QuestionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "body" TEXT NOT NULL,
    "explanation" TEXT,
    "maxPoints" INTEGER NOT NULL DEFAULT 1,
    "acceptedAnswers" JSONB,
    "gradingRubric" TEXT,
    "answerOrigin" "QuestionAnswerProvenance",
    "answerReviewedAt" TIMESTAMP(3),
    "answerReviewedById" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "replacesQuestionId" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionContext" (
    "id" TEXT NOT NULL,
    "type" "QuestionContextType" NOT NULL DEFAULT 'TEXT',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'ar',
    "sourceLocator" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionContextQuestion" (
    "questionId" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "QuestionContextQuestion_pkey" PRIMARY KEY ("questionId","contextId")
);

-- CreateTable
CREATE TABLE "QuestionExplanation" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'ar',
    "keywords" TEXT NOT NULL,
    "eliminationStrategy" TEXT NOT NULL,
    "whyCorrect" TEXT NOT NULL,
    "generalRule" TEXT NOT NULL,
    "whatIf" TEXT NOT NULL,
    "commonMistakes" TEXT NOT NULL,
    "origin" "QuestionExplanationOrigin" NOT NULL DEFAULT 'HUMAN',
    "model" TEXT,
    "confidence" DOUBLE PRECISION,
    "answerOrigin" "QuestionAnswerOrigin",
    "warnings" JSONB,
    "sourceFingerprint" TEXT,
    "staleAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAiExplanationRun" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "mode" "QuestionAiExplanationRunMode" NOT NULL,
    "status" "QuestionAiExplanationRunStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "questionSnapshot" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'ar',
    "suppliedAnswer" JSONB,
    "additionalContext" TEXT,
    "proposedAnswer" JSONB,
    "structuredExplanation" JSONB,
    "confidence" DOUBLE PRECISION,
    "warnings" JSONB,
    "conflictWarning" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rawResponse" JSONB,
    "usage" JSONB,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "applyAnswer" BOOLEAN,
    "applyExplanation" BOOLEAN,
    "appliedQuestionId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionAiExplanationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportBatch" (
    "id" TEXT NOT NULL,
    "inputType" "QuestionImportInputType" NOT NULL,
    "rawText" TEXT,
    "sourceAssetId" TEXT,
    "parentId" TEXT,
    "childSequence" INTEGER,
    "pageScope" JSONB,
    "bankId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "placements" JSONB NOT NULL,
    "status" "QuestionImportStatus" NOT NULL DEFAULT 'QUEUED',
    "normalizedText" TEXT,
    "extractionMetadata" JSONB,
    "segmentationRawOutput" JSONB,
    "segmentationUsage" JSONB,
    "segmentationWarnings" JSONB,
    "sourceTextEditedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "model" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "createdQuestions" INTEGER NOT NULL DEFAULT 0,
    "invalidItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "QuestionImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportPage" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "kind" "QuestionImportPageKind" NOT NULL DEFAULT 'QUESTION',
    "status" "QuestionImportPageStatus" NOT NULL DEFAULT 'PENDING',
    "aiText" TEXT,
    "canonicalText" TEXT,
    "confidence" DOUBLE PRECISION,
    "uncertainSpans" JSONB,
    "warnings" JSONB,
    "layoutEnvelopes" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerFileId" TEXT,
    "rawProviderResponse" JSONB,
    "initialAiText" TEXT,
    "initialCanonicalText" TEXT,
    "initialProviderResponse" JSONB,
    "initialUsage" JSONB,
    "verificationProviderResponse" JSONB,
    "verificationUsage" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "usage" JSONB,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportMedia" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "normalizedBounds" JSONB NOT NULL,
    "renderedBounds" JSONB NOT NULL,
    "pageDimensions" JSONB NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "renderDpi" INTEGER NOT NULL,
    "type" "QuestionImportMediaType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "warnings" JSONB,
    "validationFlags" JSONB,
    "cropCompleteness" "QuestionImportMediaCropCompleteness" NOT NULL DEFAULT 'UNKNOWN',
    "cropVerification" JSONB,
    "checksum" TEXT,
    "assetId" TEXT,
    "status" "QuestionImportMediaStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "materializedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportContext" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "firstBlock" TEXT NOT NULL,
    "lastBlock" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImportContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportMediaAssignment" (
    "id" TEXT NOT NULL,
    "importItemId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "assignmentKey" TEXT NOT NULL,
    "exclusiveOwnershipKey" TEXT,
    "owner" "QuestionImportMediaAssignmentOwner" NOT NULL,
    "ownerReference" TEXT NOT NULL,
    "placementAnchor" TEXT,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "status" "QuestionImportMediaAssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "scoreComponents" JSONB,
    "evidenceVersion" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "finalContentBlockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportMediaAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportVisualRequirement" (
    "id" TEXT NOT NULL,
    "importItemId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "kind" "QuestionImportVisualRequirementKind" NOT NULL,
    "sourcePage" INTEGER,
    "sourceEnvelope" JSONB,
    "owner" "QuestionImportMediaAssignmentOwner",
    "ownerReference" TEXT,
    "optionIndexes" JSONB,
    "expectedCardinality" INTEGER NOT NULL DEFAULT 0,
    "interpretationRequired" BOOLEAN NOT NULL DEFAULT true,
    "resolutionState" "QuestionImportVisualResolutionState" NOT NULL DEFAULT 'PENDING',
    "unresolvedReason" TEXT,
    "candidateRankings" JSONB,
    "evidenceVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportVisualRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportMediaDetection" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "source" "QuestionImportMediaDetectionSource" NOT NULL,
    "normalizedBounds" JSONB NOT NULL,
    "type" "QuestionImportMediaType" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "description" TEXT,
    "warnings" JSONB,
    "rawEvidence" JSONB,
    "validationFlags" JSONB,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImportMediaDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportSourceBlock" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "blockKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceLocator" JSONB,
    "envelope" JSONB,
    "assignment" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportSourceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportAnswerEvidence" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "firstBlock" TEXT NOT NULL,
    "lastBlock" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceLocator" JSONB,
    "questionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportAnswerEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportSkippedRange" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "firstBlock" TEXT NOT NULL,
    "lastBlock" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceLocator" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImportSkippedRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportChunk" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "sourceLocator" JSONB,
    "checksum" TEXT NOT NULL,
    "status" "QuestionImportChunkStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "rawResponse" JSONB,
    "usage" JSONB,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionImportChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImportItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "chunkId" TEXT,
    "sequence" INTEGER NOT NULL,
    "status" "QuestionImportItemStatus" NOT NULL,
    "rawOutput" JSONB,
    "normalizedOutput" JSONB,
    "confidence" DOUBLE PRECISION,
    "warnings" JSONB,
    "sourceLocator" JSONB,
    "errorDetail" TEXT,
    "questionId" TEXT,
    "sourceNumber" TEXT,
    "globalOrder" INTEGER,
    "section" TEXT,
    "detectedType" TEXT,
    "exclusionReason" TEXT,
    "answerOrigin" "QuestionAnswerProvenance",
    "citedEvidenceKeys" JSONB,
    "reviewerCandidate" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "visualState" "QuestionImportVisualResolutionState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "visualEvidenceVersion" TEXT,
    "answerContentValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionContentBlock" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "type" "QuestionContentBlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT,
    "assetId" TEXT,
    "tableData" JSONB,
    "latex" TEXT,
    "mathml" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "languageCode" TEXT,

    CONSTRAINT "QuestionContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOptionContentBlock" (
    "id" TEXT NOT NULL,
    "questionOptionId" TEXT NOT NULL,
    "type" "QuestionContentBlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT,
    "assetId" TEXT,
    "tableData" JSONB,
    "latex" TEXT,
    "mathml" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "languageCode" TEXT,

    CONSTRAINT "QuestionOptionContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionContextContentBlock" (
    "id" TEXT NOT NULL,
    "questionContextId" TEXT NOT NULL,
    "type" "QuestionContentBlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT,
    "assetId" TEXT,
    "tableData" JSONB,
    "latex" TEXT,
    "mathml" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "languageCode" TEXT,

    CONSTRAINT "QuestionContextContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAsset" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionVideoLink" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "videoAssetId" TEXT NOT NULL,
    "timestampSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionVideoLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPlacement" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "lessonId" TEXT,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "ownerType" "AssessmentOwnerType" NOT NULL,
    "studentUserId" TEXT,
    "createdByAdminId" TEXT,
    "title" TEXT NOT NULL,
    "generationType" "AssessmentGenerationType" NOT NULL,
    "mode" "AssessmentMode" NOT NULL DEFAULT 'EXAM',
    "isTimed" BOOLEAN NOT NULL DEFAULT false,
    "durationSeconds" INTEGER,
    "questionCount" INTEGER NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'READY',
    "questionBankId" TEXT,
    "generationFilters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionBank" (
    "assessmentId" TEXT NOT NULL,
    "questionBankId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestionBank_pkey" PRIMARY KEY ("assessmentId","questionBankId")
);

-- CreateTable
CREATE TABLE "AssessmentScope" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "lessonId" TEXT,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "body" TEXT NOT NULL,
    "explanation" TEXT,
    "maxPoints" INTEGER NOT NULL,
    "acceptedAnswers" JSONB,
    "gradingRubric" TEXT,
    "answerOrigin" "QuestionAnswerProvenance",
    "videoAssetId" TEXT,
    "videoAssetName" TEXT,
    "timestampSeconds" INTEGER,
    "structuredExplanation" JSONB,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionAsset" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetKind" "AssetKind" NOT NULL,
    "assetName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "AssessmentQuestionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionContentBlock" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "type" "QuestionContentBlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT,
    "assetId" TEXT,
    "assetKind" "AssetKind",
    "assetName" TEXT,
    "tableData" JSONB,
    "latex" TEXT,
    "mathml" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "languageCode" TEXT,

    CONSTRAINT "AssessmentQuestionContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentContext" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sourceContextId" TEXT NOT NULL,
    "type" "QuestionContextType" NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "sourceLocator" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionContext" (
    "assessmentQuestionId" TEXT NOT NULL,
    "assessmentContextId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AssessmentQuestionContext_pkey" PRIMARY KEY ("assessmentQuestionId","assessmentContextId")
);

-- CreateTable
CREATE TABLE "AssessmentContextContentBlock" (
    "id" TEXT NOT NULL,
    "assessmentContextId" TEXT NOT NULL,
    "type" "QuestionContentBlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT,
    "assetId" TEXT,
    "assetKind" "AssetKind",
    "assetName" TEXT,
    "tableData" JSONB,
    "latex" TEXT,
    "mathml" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "languageCode" TEXT,

    CONSTRAINT "AssessmentContextContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionPlacement" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectTitle" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterTitle" TEXT,
    "lessonId" TEXT,
    "lessonTitle" TEXT,
    "sectionId" TEXT,
    "sectionTitle" TEXT,

    CONSTRAINT "AssessmentQuestionPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionOption" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "AssessmentQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionOptionContentBlock" (
    "id" TEXT NOT NULL,
    "assessmentQuestionOptionId" TEXT NOT NULL,
    "type" "QuestionContentBlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT,
    "assetId" TEXT,
    "assetKind" "AssetKind",
    "assetName" TEXT,
    "tableData" JSONB,
    "latex" TEXT,
    "mathml" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "languageCode" TEXT,

    CONSTRAINT "AssessmentQuestionOptionContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "status" "AssessmentAttemptStatus" NOT NULL DEFAULT 'SUSPENDED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "totalPoints" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "responseText" TEXT,
    "responseVersion" INTEGER NOT NULL DEFAULT 0,
    "inputMethod" "AnswerInputMethod" NOT NULL DEFAULT 'TEXT',
    "responseLanguageCode" TEXT,
    "transcriptionProvider" TEXT,
    "transcriptionConfidence" DOUBLE PRECISION,
    "isCorrect" BOOLEAN,
    "outcome" "AssessmentQuestionOutcome",
    "awardedPoints" INTEGER,
    "gradedAt" TIMESTAMP(3),
    "gradedById" TEXT,
    "graderFeedback" TEXT,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswerAiGradingRun" (
    "id" TEXT NOT NULL,
    "attemptAnswerId" TEXT NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "questionSnapshot" JSONB NOT NULL,
    "responseSnapshot" TEXT NOT NULL,
    "responseVersion" INTEGER NOT NULL DEFAULT 0,
    "responseLanguageCode" TEXT NOT NULL,
    "proposedPoints" INTEGER,
    "proposedOutcome" "AssessmentQuestionOutcome",
    "feedback" TEXT,
    "highlights" JSONB,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "rawResponse" JSONB,
    "usage" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAnswerAiGradingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQuizGenerationRun" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT NOT NULL,
    "requestedFilters" JSONB NOT NULL,
    "normalizedPlan" JSONB,
    "rationale" TEXT,
    "eligibleQuestionIds" JSONB,
    "selectedQuestionIds" JSONB,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "rawResponse" JSONB,
    "usage" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiQuizGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "type" "QuestionReportType" NOT NULL,
    "note" TEXT,
    "questionSnapshot" JSONB NOT NULL,
    "status" "QuestionReportStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReportAction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" "QuestionReportStatus",
    "toStatus" "QuestionReportStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionReportAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswerChange" (
    "id" TEXT NOT NULL,
    "attemptAnswerId" TEXT NOT NULL,
    "fromOptionIds" TEXT[],
    "toOptionIds" TEXT[],
    "fromResponseText" TEXT,
    "toResponseText" TEXT,
    "fromOutcome" "AssessmentQuestionOutcome" NOT NULL,
    "toOutcome" "AssessmentQuestionOutcome" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAnswerChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardWeek" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "academicGradeId" TEXT,
    "displayName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "quizzesCompleted" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "answeredQuestions" INTEGER NOT NULL,
    "correctAnswers" INTEGER NOT NULL,
    "smartScore" DOUBLE PRECISION NOT NULL,
    "accuracyPercent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardAward" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestionMark" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentQuestionMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestionNote" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentQuestionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionCommunityStat" (
    "questionId" TEXT NOT NULL,
    "totalResponses" INTEGER NOT NULL DEFAULT 0,
    "correctResponses" INTEGER NOT NULL DEFAULT 0,
    "incorrectResponses" INTEGER NOT NULL DEFAULT 0,
    "incorrectRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficultyBand" "QuestionDifficultyBand" NOT NULL DEFAULT 'D',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionCommunityStat_pkey" PRIMARY KEY ("questionId")
);

-- CreateTable
CREATE TABLE "BunnyStreamWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "bunnyVideoId" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BunnyStreamWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPlacement" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "lessonId" TEXT,
    "sectionId" TEXT,
    "academicGradeId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "resolvedCourseId" TEXT NOT NULL,
    "resolvedChapterId" TEXT,
    "resolvedLessonId" TEXT,
    "resolvedSectionId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentContentProgress" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentContentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestionHighlight" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedText" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentQuestionHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentNotebookPage" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentNotebookPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectConstant" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectConstant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentContentStudyState" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL,
    "playbackPositionSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentContentStudyState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestionAttempt" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentQuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentQuestionAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "StudentQuestionAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEntitlement" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "orderItemId" TEXT,
    "source" "EntitlementSource" NOT NULL DEFAULT 'ADMIN',
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedAccessSnapshot" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "resourceType" "ArchivedAccessResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "sourceEntitlementId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedAccessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "targetType" "CommerceTargetType" NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPaymentMethod" (
    "id" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "instructionsAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "instructionsEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "manualPaymentMethodId" TEXT,
    "paymentChannel" "PaymentChannel" NOT NULL DEFAULT 'MANUAL',
    "paymentMethodSnapshot" JSONB NOT NULL,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "paymentExpiresAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "targetType" "CommerceTargetType" NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "basePriceMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "appliedPromotionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "attemptNumber" INTEGER NOT NULL,
    "merchantReference" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerTransactionId" TEXT,
    "checkoutUrl" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "providerPayload" JSONB,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymobWebhookEvent" (
    "id" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "merchantReference" TEXT,
    "verified" BOOLEAN NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB,
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymobWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "kind" "PromotionKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCampaignTarget" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,

    CONSTRAINT "DiscountCampaignTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PromotionKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "minimumOrderMinor" INTEGER NOT NULL DEFAULT 0,
    "maximumDiscountMinor" INTEGER,
    "usageLimit" INTEGER,
    "perStudentUsageLimit" INTEGER,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponTarget" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,

    CONSTRAINT "CouponTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponReservation" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "status" "CouponReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "discountMinor" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentAttemptId" TEXT,
    "reference" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPaymentSubmission" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "proofAssetId" TEXT NOT NULL,
    "transactionReference" TEXT,
    "note" TEXT,
    "status" "ManualPaymentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPaymentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "eligibilitySnapshot" JSONB NOT NULL,
    "rejectionReason" TEXT,
    "reviewNote" TEXT,
    "manualRefundReference" TEXT,
    "reviewedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequestItem" (
    "id" TEXT NOT NULL,
    "refundRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceIdempotencyKey" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherAgreement" (
    "id" TEXT NOT NULL,
    "publisherUserId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "lessonId" TEXT,
    "payoutKind" "ReferralCommissionKind" NOT NULL DEFAULT 'PERCENTAGE',
    "revenueShareBps" INTEGER,
    "fixedPayoutMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "contractReference" TEXT,
    "signedDocumentAssetId" TEXT,
    "internalNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "PublisherAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralProgram" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ReferralProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perStudentUsageLimit" INTEGER,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT true,
    "courseId" TEXT,
    "chapterId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perStudentUsageLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCommissionRule" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "ReferralCommissionKind" NOT NULL,
    "percentageBps" INTEGER,
    "fixedCommissionMinor" INTEGER,
    "maximumCommissionMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReviewRule" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ReferralReviewRuleKind" NOT NULL,
    "action" "ReferralReviewAction" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralReviewRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReferralAttribution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referralProgramId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReviewFlag" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "ruleId" TEXT,
    "source" "ReferralReviewFlagSource" NOT NULL,
    "type" TEXT NOT NULL,
    "action" "ReferralReviewAction" NOT NULL,
    "observedValue" INTEGER,
    "threshold" INTEGER,
    "metadata" JSONB,
    "status" "ReferralReviewStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "disposition" "ReferralReviewDisposition",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralReviewFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReviewNote" (
    "id" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAllocation" (
    "id" TEXT NOT NULL,
    "kind" "PartnerAllocationKind" NOT NULL,
    "state" "PartnerAllocationState" NOT NULL DEFAULT 'PAYABLE',
    "partnerUserId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "publisherAgreementId" TEXT,
    "referralRuleId" TEXT,
    "basisMinor" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversedAllocationId" TEXT,
    "payableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundPolicy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "eligibilityWindowDays" INTEGER NOT NULL,
    "maximumConsumptionBps" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerFinanceReconciliationRun" (
    "id" TEXT NOT NULL,
    "pilotLabel" TEXT NOT NULL,
    "status" "PartnerFinanceReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" JSONB,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerFinanceReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerFinanceReconciliationOrder" (
    "runId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "PartnerFinanceReconciliationOrder_pkey" PRIMARY KEY ("runId","orderId")
);

-- CreateTable
CREATE TABLE "PartnerFinanceDiscrepancy" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expectedAmountMinor" INTEGER,
    "actualAmountMinor" INTEGER,
    "expectedBasisMinor" INTEGER,
    "actualBasisMinor" INTEGER,
    "currency" TEXT,
    "orderItemId" TEXT,
    "allocationId" TEXT,
    "partnerUserId" TEXT,
    "severity" "PartnerFinanceDiscrepancySeverity" NOT NULL,
    "status" "PartnerFinanceDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "notes" TEXT,
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerFinanceDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSettlement" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "totalMinor" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSettlementLine" (
    "settlementId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,

    CONSTRAINT "PartnerSettlementLine_pkey" PRIMARY KEY ("settlementId","allocationId")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionAttribution" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceTitle" TEXT,
    "sourceType" "QuestionSourceType",
    "publisherUserId" TEXT,
    "publisherDisplayName" TEXT,
    "role" "AssessmentAttributionRole" NOT NULL DEFAULT 'PRIMARY',
    "weightBps" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestionAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherUsageDailyRollup" (
    "id" TEXT NOT NULL,
    "usageDate" DATE NOT NULL,
    "publisherUserId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "scope" "PublisherUsageScope" NOT NULL,
    "scopeId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "subjectId" TEXT,
    "courseId" TEXT,
    "chapterId" TEXT,
    "lessonId" TEXT,
    "sectionId" TEXT,
    "presented" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "uniqueSolvers" INTEGER NOT NULL DEFAULT 0,
    "graded" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "reattempts" INTEGER NOT NULL DEFAULT 0,
    "inputUpdatedAt" TIMESTAMP(3) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherUsageDailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherUsageDailySolver" (
    "id" TEXT NOT NULL,
    "usageDate" DATE NOT NULL,
    "publisherUserId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "studentFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublisherUsageDailySolver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportExportJob" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "reason" TEXT,
    "containsPii" BOOLEAN NOT NULL DEFAULT false,
    "classification" "ReportDataClassification" NOT NULL DEFAULT 'NON_PII',
    "status" "ReportExportStatus" NOT NULL DEFAULT 'QUEUED',
    "storageKey" TEXT,
    "rowCount" INTEGER,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Governorate" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Governorate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Center" (
    "id" TEXT NOT NULL,
    "governorateId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Center_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_loginIdentifier_key" ON "User"("loginIdentifier");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_role_createdAt_id_idx" ON "User"("role", "createdAt", "id");

-- CreateIndex
CREATE INDEX "User_deletedById_idx" ON "User"("deletedById");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_nationalIdHash_key" ON "StudentProfile"("nationalIdHash");

-- CreateIndex
CREATE INDEX "StudentProfile_parentPhoneNormalized_idx" ON "StudentProfile"("parentPhoneNormalized");

-- CreateIndex
CREATE INDEX "StudentProfile_parentPhoneNormalized_createdAt_userId_idx" ON "StudentProfile"("parentPhoneNormalized", "createdAt", "userId");

-- CreateIndex
CREATE INDEX "StudentProfile_academicGradeId_idx" ON "StudentProfile"("academicGradeId");

-- CreateIndex
CREATE INDEX "StudentProfile_governorateId_idx" ON "StudentProfile"("governorateId");

-- CreateIndex
CREATE INDEX "StudentProfile_centerId_idx" ON "StudentProfile"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_parentPhoneNormalized_key" ON "StudentProfile"("userId", "parentPhoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_replacedBySessionId_key" ON "AuthSession"("replacedBySessionId");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_familyId_idx" ON "AuthSession"("familyId");

-- CreateIndex
CREATE INDEX "ParentAccessSession_parentPhoneNormalized_idx" ON "ParentAccessSession"("parentPhoneNormalized");

-- CreateIndex
CREATE INDEX "ParentAccessSession_activeStudentId_idx" ON "ParentAccessSession"("activeStudentId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AcademicGrade_status_sortOrder_id_idx" ON "AcademicGrade"("status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicGrade_slug_key" ON "AcademicGrade"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicGrade_sortOrder_key" ON "AcademicGrade"("sortOrder");

-- CreateIndex
CREATE INDEX "Subject_academicGradeId_status_sortOrder_id_idx" ON "Subject"("academicGradeId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_academicGradeId_slug_key" ON "Subject"("academicGradeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_academicGradeId_sortOrder_key" ON "Subject"("academicGradeId", "sortOrder");

-- CreateIndex
CREATE INDEX "Course_subjectId_status_sortOrder_id_idx" ON "Course"("subjectId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_subjectId_slug_key" ON "Course"("subjectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Course_subjectId_sortOrder_key" ON "Course"("subjectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Chapter_courseId_status_sortOrder_id_idx" ON "Chapter"("courseId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_courseId_slug_key" ON "Chapter"("courseId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_courseId_sortOrder_key" ON "Chapter"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_chapterId_status_sortOrder_id_idx" ON "Lesson"("chapterId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_chapterId_slug_key" ON "Lesson"("chapterId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_chapterId_sortOrder_key" ON "Lesson"("chapterId", "sortOrder");

-- CreateIndex
CREATE INDEX "Section_lessonId_status_sortOrder_id_idx" ON "Section"("lessonId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Section_lessonId_slug_key" ON "Section"("lessonId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Section_lessonId_sortOrder_key" ON "Section"("lessonId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentItem_status_createdAt_id_idx" ON "ContentItem"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_status_kind_createdAt_idx" ON "Asset"("status", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetReference_contentItemId_assetId_key" ON "AssetReference"("contentItemId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetReference_contentItemId_sortOrder_key" ON "AssetReference"("contentItemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAsset_bunnyVideoId_key" ON "VideoAsset"("bunnyVideoId");

-- CreateIndex
CREATE INDEX "VideoAsset_processingStatus_idx" ON "VideoAsset"("processingStatus");

-- CreateIndex
CREATE INDEX "VideoOutlineTopic_contentItemId_idx" ON "VideoOutlineTopic"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoOutlineTopic_contentItemId_sortOrder_key" ON "VideoOutlineTopic"("contentItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "VideoOutlineConcept_topicId_idx" ON "VideoOutlineConcept"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoOutlineConcept_topicId_sortOrder_key" ON "VideoOutlineConcept"("topicId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionSource_status_type_createdAt_id_idx" ON "QuestionSource"("status", "type", "createdAt", "id");

-- CreateIndex
CREATE INDEX "QuestionSource_publisherUserId_idx" ON "QuestionSource"("publisherUserId");

-- CreateIndex
CREATE INDEX "QuestionBank_status_createdAt_id_idx" ON "QuestionBank"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "QuestionBank_subjectId_status_idx" ON "QuestionBank"("subjectId", "status");

-- CreateIndex
CREATE INDEX "Question_status_createdAt_id_idx" ON "Question"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Question_bankId_status_idx" ON "Question"("bankId", "status");

-- CreateIndex
CREATE INDEX "Question_sourceId_status_idx" ON "Question"("sourceId", "status");

-- CreateIndex
CREATE INDEX "Question_courseId_status_idx" ON "Question"("courseId", "status");

-- CreateIndex
CREATE INDEX "Question_replacesQuestionId_idx" ON "Question"("replacesQuestionId");

-- CreateIndex
CREATE INDEX "QuestionContext_type_createdAt_idx" ON "QuestionContext"("type", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionContextQuestion_contextId_idx" ON "QuestionContextQuestion"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionExplanation_questionId_key" ON "QuestionExplanation"("questionId");

-- CreateIndex
CREATE INDEX "QuestionAiExplanationRun_questionId_createdAt_idx" ON "QuestionAiExplanationRun"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAiExplanationRun_status_createdAt_idx" ON "QuestionAiExplanationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionImportBatch_status_createdAt_idx" ON "QuestionImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionImportBatch_createdById_createdAt_idx" ON "QuestionImportBatch"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionImportBatch_parentId_childSequence_idx" ON "QuestionImportBatch"("parentId", "childSequence");

-- CreateIndex
CREATE INDEX "QuestionImportPage_batchId_status_idx" ON "QuestionImportPage"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportPage_batchId_pageNumber_key" ON "QuestionImportPage"("batchId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportMedia_assetId_key" ON "QuestionImportMedia"("assetId");

-- CreateIndex
CREATE INDEX "QuestionImportMedia_batchId_pageNumber_status_idx" ON "QuestionImportMedia"("batchId", "pageNumber", "status");

-- CreateIndex
CREATE INDEX "QuestionImportMedia_batchId_checksum_idx" ON "QuestionImportMedia"("batchId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportMedia_batchId_mediaKey_key" ON "QuestionImportMedia"("batchId", "mediaKey");

-- CreateIndex
CREATE INDEX "QuestionImportContext_contextId_idx" ON "QuestionImportContext"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportContext_batchId_contextKey_key" ON "QuestionImportContext"("batchId", "contextKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportContext_batchId_contextId_key" ON "QuestionImportContext"("batchId", "contextId");

-- CreateIndex
CREATE INDEX "QuestionImportMediaAssignment_mediaId_status_idx" ON "QuestionImportMediaAssignment"("mediaId", "status");

-- CreateIndex
CREATE INDEX "QuestionImportMediaAssignment_importItemId_status_idx" ON "QuestionImportMediaAssignment"("importItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportMediaAssignment_importItemId_assignmentKey_key" ON "QuestionImportMediaAssignment"("importItemId", "assignmentKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportMediaAssignment_exclusiveOwnershipKey_key" ON "QuestionImportMediaAssignment"("exclusiveOwnershipKey");

-- CreateIndex
CREATE INDEX "QuestionImportVisualRequirement_importItemId_resolutionStat_idx" ON "QuestionImportVisualRequirement"("importItemId", "resolutionState");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportVisualRequirement_importItemId_requirementKey_key" ON "QuestionImportVisualRequirement"("importItemId", "requirementKey");

-- CreateIndex
CREATE INDEX "QuestionImportMediaDetection_mediaId_createdAt_idx" ON "QuestionImportMediaDetection"("mediaId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionImportSourceBlock_batchId_idx" ON "QuestionImportSourceBlock"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportSourceBlock_batchId_sequence_key" ON "QuestionImportSourceBlock"("batchId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportSourceBlock_batchId_blockKey_key" ON "QuestionImportSourceBlock"("batchId", "blockKey");

-- CreateIndex
CREATE INDEX "QuestionImportAnswerEvidence_batchId_idx" ON "QuestionImportAnswerEvidence"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportAnswerEvidence_batchId_evidenceKey_key" ON "QuestionImportAnswerEvidence"("batchId", "evidenceKey");

-- CreateIndex
CREATE INDEX "QuestionImportSkippedRange_batchId_idx" ON "QuestionImportSkippedRange"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportSkippedRange_batchId_sequence_key" ON "QuestionImportSkippedRange"("batchId", "sequence");

-- CreateIndex
CREATE INDEX "QuestionImportChunk_batchId_status_idx" ON "QuestionImportChunk"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportChunk_batchId_sequence_key" ON "QuestionImportChunk"("batchId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportItem_questionId_key" ON "QuestionImportItem"("questionId");

-- CreateIndex
CREATE INDEX "QuestionImportItem_batchId_status_idx" ON "QuestionImportItem"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImportItem_chunkId_sequence_key" ON "QuestionImportItem"("chunkId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_sortOrder_key" ON "QuestionOption"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionContentBlock_assetId_idx" ON "QuestionContentBlock"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionContentBlock_questionId_sortOrder_key" ON "QuestionContentBlock"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionOptionContentBlock_assetId_idx" ON "QuestionOptionContentBlock"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOptionContentBlock_questionOptionId_sortOrder_key" ON "QuestionOptionContentBlock"("questionOptionId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionContextContentBlock_assetId_idx" ON "QuestionContextContentBlock"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionContextContentBlock_questionContextId_sortOrder_key" ON "QuestionContextContentBlock"("questionContextId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAsset_questionId_assetId_key" ON "QuestionAsset"("questionId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAsset_questionId_sortOrder_key" ON "QuestionAsset"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionVideoLink_questionId_key" ON "QuestionVideoLink"("questionId");

-- CreateIndex
CREATE INDEX "QuestionVideoLink_videoAssetId_idx" ON "QuestionVideoLink"("videoAssetId");

-- CreateIndex
CREATE INDEX "QuestionPlacement_questionId_idx" ON "QuestionPlacement"("questionId");

-- CreateIndex
CREATE INDEX "QuestionPlacement_courseId_idx" ON "QuestionPlacement"("courseId");

-- CreateIndex
CREATE INDEX "QuestionPlacement_chapterId_idx" ON "QuestionPlacement"("chapterId");

-- CreateIndex
CREATE INDEX "QuestionPlacement_lessonId_idx" ON "QuestionPlacement"("lessonId");

-- CreateIndex
CREATE INDEX "QuestionPlacement_sectionId_idx" ON "QuestionPlacement"("sectionId");

-- CreateIndex
CREATE INDEX "Assessment_ownerType_studentUserId_status_createdAt_id_idx" ON "Assessment"("ownerType", "studentUserId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Assessment_ownerType_createdByAdminId_status_createdAt_id_idx" ON "Assessment"("ownerType", "createdByAdminId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Assessment_subjectId_status_createdAt_id_idx" ON "Assessment"("subjectId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Assessment_status_createdAt_id_idx" ON "Assessment"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Assessment_questionBankId_idx" ON "Assessment"("questionBankId");

-- CreateIndex
CREATE INDEX "AssessmentQuestionBank_questionBankId_idx" ON "AssessmentQuestionBank"("questionBankId");

-- CreateIndex
CREATE INDEX "AssessmentScope_assessmentId_idx" ON "AssessmentScope"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentScope_courseId_idx" ON "AssessmentScope"("courseId");

-- CreateIndex
CREATE INDEX "AssessmentScope_chapterId_idx" ON "AssessmentScope"("chapterId");

-- CreateIndex
CREATE INDEX "AssessmentScope_chapterId_assessmentId_idx" ON "AssessmentScope"("chapterId", "assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentScope_lessonId_idx" ON "AssessmentScope"("lessonId");

-- CreateIndex
CREATE INDEX "AssessmentScope_sectionId_idx" ON "AssessmentScope"("sectionId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_sortOrder_key" ON "AssessmentQuestion"("assessmentId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentQuestionAsset_assetId_idx" ON "AssessmentQuestionAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionAsset_assessmentQuestionId_assetId_key" ON "AssessmentQuestionAsset"("assessmentQuestionId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionAsset_assessmentQuestionId_sortOrder_key" ON "AssessmentQuestionAsset"("assessmentQuestionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentQuestionContentBlock_assetId_idx" ON "AssessmentQuestionContentBlock"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionContentBlock_assessmentQuestionId_sortOrd_key" ON "AssessmentQuestionContentBlock"("assessmentQuestionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentContext_assessmentId_idx" ON "AssessmentContext"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentContext_assessmentId_sourceContextId_key" ON "AssessmentContext"("assessmentId", "sourceContextId");

-- CreateIndex
CREATE INDEX "AssessmentQuestionContext_assessmentContextId_idx" ON "AssessmentQuestionContext"("assessmentContextId");

-- CreateIndex
CREATE INDEX "AssessmentContextContentBlock_assetId_idx" ON "AssessmentContextContentBlock"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentContextContentBlock_assessmentContextId_sortOrder_key" ON "AssessmentContextContentBlock"("assessmentContextId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentQuestionPlacement_assessmentQuestionId_idx" ON "AssessmentQuestionPlacement"("assessmentQuestionId");

-- CreateIndex
CREATE INDEX "AssessmentQuestionPlacement_subjectId_idx" ON "AssessmentQuestionPlacement"("subjectId");

-- CreateIndex
CREATE INDEX "AssessmentQuestionPlacement_chapterId_idx" ON "AssessmentQuestionPlacement"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionOption_assessmentQuestionId_sortOrder_key" ON "AssessmentQuestionOption"("assessmentQuestionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentQuestionOptionContentBlock_assetId_idx" ON "AssessmentQuestionOptionContentBlock"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionOptionContentBlock_assessmentQuestionOpti_key" ON "AssessmentQuestionOptionContentBlock"("assessmentQuestionOptionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_studentUserId_status_lastActivityAt_idx" ON "AssessmentAttempt"("studentUserId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_idx" ON "AssessmentAttempt"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_status_studentUserId_idx" ON "AssessmentAttempt"("assessmentId", "status", "studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_studentUserId_key" ON "AssessmentAttempt"("assessmentId", "studentUserId");

-- CreateIndex
CREATE INDEX "AssessmentAttemptAnswer_attemptId_idx" ON "AssessmentAttemptAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "AssessmentAttemptAnswer_outcome_answeredAt_idx" ON "AssessmentAttemptAnswer"("outcome", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttemptAnswer_attemptId_assessmentQuestionId_key" ON "AssessmentAttemptAnswer"("attemptId", "assessmentQuestionId");

-- CreateIndex
CREATE INDEX "AssessmentAnswerAiGradingRun_attemptAnswerId_createdAt_idx" ON "AssessmentAnswerAiGradingRun"("attemptAnswerId", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentAnswerAiGradingRun_status_createdAt_idx" ON "AssessmentAnswerAiGradingRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiQuizGenerationRun_assessmentId_key" ON "AiQuizGenerationRun"("assessmentId");

-- CreateIndex
CREATE INDEX "AiQuizGenerationRun_studentUserId_createdAt_idx" ON "AiQuizGenerationRun"("studentUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiQuizGenerationRun_status_createdAt_idx" ON "AiQuizGenerationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_status_createdAt_idx" ON "QuestionReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_status_idx" ON "QuestionReport"("questionId", "status");

-- CreateIndex
CREATE INDEX "QuestionReportAction_reportId_createdAt_idx" ON "QuestionReportAction"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentAnswerChange_attemptAnswerId_changedAt_idx" ON "AssessmentAnswerChange"("attemptAnswerId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardWeek_weekKey_key" ON "LeaderboardWeek"("weekKey");

-- CreateIndex
CREATE INDEX "LeaderboardWeek_startsAt_endsAt_idx" ON "LeaderboardWeek"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_weekId_academicGradeId_rank_idx" ON "LeaderboardEntry"("weekId", "academicGradeId", "rank");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_weekId_rank_idx" ON "LeaderboardEntry"("weekId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_weekId_studentUserId_key" ON "LeaderboardEntry"("weekId", "studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardAward_entryId_key" ON "LeaderboardAward"("entryId");

-- CreateIndex
CREATE INDEX "StudentQuestionMark_studentUserId_createdAt_idx" ON "StudentQuestionMark"("studentUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentQuestionMark_studentUserId_questionId_key" ON "StudentQuestionMark"("studentUserId", "questionId");

-- CreateIndex
CREATE INDEX "StudentQuestionNote_studentUserId_updatedAt_idx" ON "StudentQuestionNote"("studentUserId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentQuestionNote_studentUserId_questionId_key" ON "StudentQuestionNote"("studentUserId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionCommunityStat_difficultyBand_idx" ON "QuestionCommunityStat"("difficultyBand");

-- CreateIndex
CREATE UNIQUE INDEX "BunnyStreamWebhookEvent_eventKey_key" ON "BunnyStreamWebhookEvent"("eventKey");

-- CreateIndex
CREATE INDEX "BunnyStreamWebhookEvent_receivedAt_idx" ON "BunnyStreamWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPlacement_contentItemId_key" ON "ContentPlacement"("contentItemId");

-- CreateIndex
CREATE INDEX "ContentPlacement_courseId_sortOrder_id_idx" ON "ContentPlacement"("courseId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "ContentPlacement_chapterId_sortOrder_id_idx" ON "ContentPlacement"("chapterId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "ContentPlacement_lessonId_sortOrder_id_idx" ON "ContentPlacement"("lessonId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "ContentPlacement_sectionId_sortOrder_id_idx" ON "ContentPlacement"("sectionId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "ContentPlacement_subjectId_resolvedCourseId_resolvedChapter_idx" ON "ContentPlacement"("subjectId", "resolvedCourseId", "resolvedChapterId");

-- CreateIndex
CREATE INDEX "ContentPlacement_academicGradeId_subjectId_idx" ON "ContentPlacement"("academicGradeId", "subjectId");

-- CreateIndex
CREATE INDEX "StudentContentProgress_studentUserId_completedAt_idx" ON "StudentContentProgress"("studentUserId", "completedAt");

-- CreateIndex
CREATE INDEX "StudentContentProgress_contentItemId_idx" ON "StudentContentProgress"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContentProgress_studentUserId_contentItemId_key" ON "StudentContentProgress"("studentUserId", "contentItemId");

-- CreateIndex
CREATE INDEX "StudentQuestionHighlight_studentUserId_questionId_createdAt_idx" ON "StudentQuestionHighlight"("studentUserId", "questionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "StudentQuestionHighlight_questionId_idx" ON "StudentQuestionHighlight"("questionId");

-- CreateIndex
CREATE INDEX "StudentNotebookPage_studentUserId_updatedAt_id_idx" ON "StudentNotebookPage"("studentUserId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "SubjectConstant_subjectId_createdAt_id_idx" ON "SubjectConstant"("subjectId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectConstant_subjectId_key_key" ON "SubjectConstant"("subjectId", "key");

-- CreateIndex
CREATE INDEX "StudentContentStudyState_studentUserId_lastOpenedAt_id_idx" ON "StudentContentStudyState"("studentUserId", "lastOpenedAt", "id");

-- CreateIndex
CREATE INDEX "StudentContentStudyState_contentItemId_idx" ON "StudentContentStudyState"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentContentStudyState_studentUserId_contentItemId_key" ON "StudentContentStudyState"("studentUserId", "contentItemId");

-- CreateIndex
CREATE INDEX "StudentQuestionAttempt_studentUserId_submittedAt_idx" ON "StudentQuestionAttempt"("studentUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "StudentQuestionAttempt_questionId_submittedAt_idx" ON "StudentQuestionAttempt"("questionId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentQuestionAttempt_studentUserId_questionId_attemptNumb_key" ON "StudentQuestionAttempt"("studentUserId", "questionId", "attemptNumber");

-- CreateIndex
CREATE INDEX "StudentQuestionAttemptAnswer_optionId_idx" ON "StudentQuestionAttemptAnswer"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentQuestionAttemptAnswer_attemptId_optionId_key" ON "StudentQuestionAttemptAnswer"("attemptId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEntitlement_orderItemId_key" ON "StudentEntitlement"("orderItemId");

-- CreateIndex
CREATE INDEX "StudentEntitlement_studentUserId_status_startsAt_expiresAt_idx" ON "StudentEntitlement"("studentUserId", "status", "startsAt", "expiresAt");

-- CreateIndex
CREATE INDEX "StudentEntitlement_courseId_idx" ON "StudentEntitlement"("courseId");

-- CreateIndex
CREATE INDEX "StudentEntitlement_chapterId_idx" ON "StudentEntitlement"("chapterId");

-- CreateIndex
CREATE INDEX "ArchivedAccessSnapshot_studentUserId_revokedAt_idx" ON "ArchivedAccessSnapshot"("studentUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "ArchivedAccessSnapshot_resourceType_resourceId_idx" ON "ArchivedAccessSnapshot"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedAccessSnapshot_studentUserId_resourceType_resourceI_key" ON "ArchivedAccessSnapshot"("studentUserId", "resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_studentUserId_key" ON "Cart"("studentUserId");

-- CreateIndex
CREATE INDEX "CartItem_cartId_createdAt_idx" ON "CartItem"("cartId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_courseId_key" ON "CartItem"("cartId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_chapterId_key" ON "CartItem"("cartId", "chapterId");

-- CreateIndex
CREATE INDEX "ManualPaymentMethod_isActive_sortOrder_id_idx" ON "ManualPaymentMethod"("isActive", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentMethod_sortOrder_key" ON "ManualPaymentMethod"("sortOrder");

-- CreateIndex
CREATE INDEX "Order_studentUserId_createdAt_id_idx" ON "Order"("studentUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_id_idx" ON "Order"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_status_approvedAt_idx" ON "Order"("status", "approvedAt");

-- CreateIndex
CREATE INDEX "Order_status_paymentExpiresAt_idx" ON "Order"("status", "paymentExpiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_courseId_idx" ON "OrderItem"("courseId");

-- CreateIndex
CREATE INDEX "OrderItem_chapterId_idx" ON "OrderItem"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_merchantReference_key" ON "PaymentAttempt"("merchantReference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerTransactionId_key" ON "PaymentAttempt"("providerTransactionId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_status_createdAt_idx" ON "PaymentAttempt"("orderId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_orderId_attemptNumber_key" ON "PaymentAttempt"("orderId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymobWebhookEvent_externalTransactionId_key" ON "PaymobWebhookEvent"("externalTransactionId");

-- CreateIndex
CREATE INDEX "PaymobWebhookEvent_merchantReference_idx" ON "PaymobWebhookEvent"("merchantReference");

-- CreateIndex
CREATE INDEX "PaymobWebhookEvent_verified_processedAt_idx" ON "PaymobWebhookEvent"("verified", "processedAt");

-- CreateIndex
CREATE INDEX "DiscountCampaign_isActive_startsAt_endsAt_priority_idx" ON "DiscountCampaign"("isActive", "startsAt", "endsAt", "priority");

-- CreateIndex
CREATE INDEX "DiscountCampaignTarget_courseId_idx" ON "DiscountCampaignTarget"("courseId");

-- CreateIndex
CREATE INDEX "DiscountCampaignTarget_chapterId_idx" ON "DiscountCampaignTarget"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCampaignTarget_campaignId_courseId_key" ON "DiscountCampaignTarget"("campaignId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCampaignTarget_campaignId_chapterId_key" ON "DiscountCampaignTarget"("campaignId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_isActive_startsAt_endsAt_idx" ON "Coupon"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "CouponTarget_courseId_idx" ON "CouponTarget"("courseId");

-- CreateIndex
CREATE INDEX "CouponTarget_chapterId_idx" ON "CouponTarget"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponTarget_couponId_courseId_key" ON "CouponTarget"("couponId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponTarget_couponId_chapterId_key" ON "CouponTarget"("couponId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponReservation_orderId_key" ON "CouponReservation"("orderId");

-- CreateIndex
CREATE INDEX "CouponReservation_couponId_status_createdAt_idx" ON "CouponReservation"("couponId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CouponReservation_couponId_studentUserId_status_idx" ON "CouponReservation"("couponId", "studentUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_orderId_key" ON "PaymentReceipt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_paymentAttemptId_key" ON "PaymentReceipt"("paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_reference_key" ON "PaymentReceipt"("reference");

-- CreateIndex
CREATE INDEX "PaymentReceipt_issuedAt_idx" ON "PaymentReceipt"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentSubmission_proofAssetId_key" ON "ManualPaymentSubmission"("proofAssetId");

-- CreateIndex
CREATE INDEX "ManualPaymentSubmission_orderId_createdAt_idx" ON "ManualPaymentSubmission"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPaymentSubmission_status_createdAt_id_idx" ON "ManualPaymentSubmission"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ManualPaymentSubmission_transactionReference_idx" ON "ManualPaymentSubmission"("transactionReference");

-- CreateIndex
CREATE INDEX "RefundRequest_studentUserId_requestedAt_id_idx" ON "RefundRequest"("studentUserId", "requestedAt", "id");

-- CreateIndex
CREATE INDEX "RefundRequest_orderId_status_requestedAt_idx" ON "RefundRequest"("orderId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "RefundRequest_status_requestedAt_id_idx" ON "RefundRequest"("status", "requestedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequestItem_orderItemId_key" ON "RefundRequestItem"("orderItemId");

-- CreateIndex
CREATE INDEX "RefundRequestItem_refundRequestId_idx" ON "RefundRequestItem"("refundRequestId");

-- CreateIndex
CREATE INDEX "CommerceIdempotencyKey_createdAt_idx" ON "CommerceIdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceIdempotencyKey_studentUserId_operation_key_key" ON "CommerceIdempotencyKey"("studentUserId", "operation", "key");

-- CreateIndex
CREATE INDEX "PublisherAgreement_courseId_status_isPrimary_startsAt_endsA_idx" ON "PublisherAgreement"("courseId", "status", "isPrimary", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PublisherAgreement_chapterId_status_isPrimary_startsAt_ends_idx" ON "PublisherAgreement"("chapterId", "status", "isPrimary", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PublisherAgreement_lessonId_status_isPrimary_startsAt_endsA_idx" ON "PublisherAgreement"("lessonId", "status", "isPrimary", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "PublisherAgreement_publisherUserId_startsAt_idx" ON "PublisherAgreement"("publisherUserId", "startsAt");

-- CreateIndex
CREATE INDEX "PublisherAgreement_supersedesId_idx" ON "PublisherAgreement"("supersedesId");

-- CreateIndex
CREATE INDEX "ReferralProgram_partnerUserId_status_startsAt_endsAt_idx" ON "ReferralProgram"("partnerUserId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ReferralProgram_status_startsAt_endsAt_idx" ON "ReferralProgram"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_programId_isActive_idx" ON "ReferralCode"("programId", "isActive");

-- CreateIndex
CREATE INDEX "ReferralCommissionRule_programId_isActive_startsAt_endsAt_idx" ON "ReferralCommissionRule"("programId", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCommissionRule_programId_version_key" ON "ReferralCommissionRule"("programId", "version");

-- CreateIndex
CREATE INDEX "ReferralReviewRule_programId_isActive_idx" ON "ReferralReviewRule"("programId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReferralAttribution_orderId_key" ON "OrderReferralAttribution"("orderId");

-- CreateIndex
CREATE INDEX "OrderReferralAttribution_referralProgramId_createdAt_idx" ON "OrderReferralAttribution"("referralProgramId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderReferralAttribution_referralCodeId_createdAt_idx" ON "OrderReferralAttribution"("referralCodeId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderReferralAttribution_studentUserId_createdAt_idx" ON "OrderReferralAttribution"("studentUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralReviewFlag_status_createdAt_idx" ON "ReferralReviewFlag"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralReviewFlag_attributionId_idx" ON "ReferralReviewFlag"("attributionId");

-- CreateIndex
CREATE INDEX "ReferralReviewFlag_assignedToId_status_idx" ON "ReferralReviewFlag"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "ReferralReviewNote_flagId_createdAt_idx" ON "ReferralReviewNote"("flagId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerAllocation_idempotencyKey_key" ON "PartnerAllocation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerAllocation_reversedAllocationId_key" ON "PartnerAllocation"("reversedAllocationId");

-- CreateIndex
CREATE INDEX "PartnerAllocation_partnerUserId_state_createdAt_idx" ON "PartnerAllocation"("partnerUserId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerAllocation_publisherAgreementId_idx" ON "PartnerAllocation"("publisherAgreementId");

-- CreateIndex
CREATE INDEX "PartnerAllocation_referralRuleId_idx" ON "PartnerAllocation"("referralRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundPolicy_version_key" ON "RefundPolicy"("version");

-- CreateIndex
CREATE INDEX "RefundPolicy_isActive_createdAt_idx" ON "RefundPolicy"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerFinanceReconciliationRun_status_createdAt_idx" ON "PartnerFinanceReconciliationRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerFinanceDiscrepancy_runId_status_severity_idx" ON "PartnerFinanceDiscrepancy"("runId", "status", "severity");

-- CreateIndex
CREATE INDEX "PartnerFinanceDiscrepancy_orderItemId_idx" ON "PartnerFinanceDiscrepancy"("orderItemId");

-- CreateIndex
CREATE INDEX "PartnerFinanceDiscrepancy_allocationId_idx" ON "PartnerFinanceDiscrepancy"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerSettlement_paymentReference_key" ON "PartnerSettlement"("paymentReference");

-- CreateIndex
CREATE INDEX "PartnerSettlement_partnerUserId_createdAt_idx" ON "PartnerSettlement"("partnerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerSettlementLine_allocationId_key" ON "PartnerSettlementLine"("allocationId");

-- CreateIndex
CREATE INDEX "AssessmentQuestionAttribution_publisherUserId_createdAt_idx" ON "AssessmentQuestionAttribution"("publisherUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentQuestionAttribution_sourceId_idx" ON "AssessmentQuestionAttribution"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionAttribution_assessmentQuestionId_role_sou_key" ON "AssessmentQuestionAttribution"("assessmentQuestionId", "role", "sourceId", "publisherUserId");

-- CreateIndex
CREATE INDEX "PublisherUsageDailyRollup_publisherUserId_usageDate_scope_s_idx" ON "PublisherUsageDailyRollup"("publisherUserId", "usageDate", "scope", "scopeId");

-- CreateIndex
CREATE INDEX "PublisherUsageDailyRollup_publisherUserId_sourceKey_usageDa_idx" ON "PublisherUsageDailyRollup"("publisherUserId", "sourceKey", "usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherUsageDailyRollup_usageDate_publisherUserId_sourceK_key" ON "PublisherUsageDailyRollup"("usageDate", "publisherUserId", "sourceKey", "scopeKey");

-- CreateIndex
CREATE INDEX "PublisherUsageDailySolver_publisherUserId_sourceKey_scopeKe_idx" ON "PublisherUsageDailySolver"("publisherUserId", "sourceKey", "scopeKey", "usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherUsageDailySolver_usageDate_publisherUserId_sourceK_key" ON "PublisherUsageDailySolver"("usageDate", "publisherUserId", "sourceKey", "scopeKey", "studentFingerprint");

-- CreateIndex
CREATE INDEX "ReportExportJob_requestedById_status_createdAt_idx" ON "ReportExportJob"("requestedById", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReportExportJob_status_createdAt_idx" ON "ReportExportJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Governorate_nameAr_key" ON "Governorate"("nameAr");

-- CreateIndex
CREATE INDEX "Center_governorateId_idx" ON "Center"("governorateId");

-- CreateIndex
CREATE UNIQUE INDEX "Center_governorateId_nameAr_key" ON "Center"("governorateId", "nameAr");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "Governorate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_replacedBySessionId_fkey" FOREIGN KEY ("replacedBySessionId") REFERENCES "AuthSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentAccessSession" ADD CONSTRAINT "ParentAccessSession_activeStudentId_parentPhoneNormalized_fkey" FOREIGN KEY ("activeStudentId", "parentPhoneNormalized") REFERENCES "StudentProfile"("userId", "parentPhoneNormalized") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_primaryAssetId_fkey" FOREIGN KEY ("primaryAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoOutlineTopic" ADD CONSTRAINT "VideoOutlineTopic_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoOutlineConcept" ADD CONSTRAINT "VideoOutlineConcept_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "VideoOutlineTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSource" ADD CONSTRAINT "QuestionSource_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSource" ADD CONSTRAINT "QuestionSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSource" ADD CONSTRAINT "QuestionSource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_answerReviewedById_fkey" FOREIGN KEY ("answerReviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_replacesQuestionId_fkey" FOREIGN KEY ("replacesQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionContextQuestion" ADD CONSTRAINT "QuestionContextQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionContextQuestion" ADD CONSTRAINT "QuestionContextQuestion_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "QuestionContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionExplanation" ADD CONSTRAINT "QuestionExplanation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAiExplanationRun" ADD CONSTRAINT "QuestionAiExplanationRun_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportBatch" ADD CONSTRAINT "QuestionImportBatch_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportBatch" ADD CONSTRAINT "QuestionImportBatch_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportBatch" ADD CONSTRAINT "QuestionImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportPage" ADD CONSTRAINT "QuestionImportPage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportMedia" ADD CONSTRAINT "QuestionImportMedia_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportMedia" ADD CONSTRAINT "QuestionImportMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportContext" ADD CONSTRAINT "QuestionImportContext_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportContext" ADD CONSTRAINT "QuestionImportContext_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "QuestionContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportMediaAssignment" ADD CONSTRAINT "QuestionImportMediaAssignment_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "QuestionImportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportMediaAssignment" ADD CONSTRAINT "QuestionImportMediaAssignment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "QuestionImportMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportVisualRequirement" ADD CONSTRAINT "QuestionImportVisualRequirement_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "QuestionImportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportMediaDetection" ADD CONSTRAINT "QuestionImportMediaDetection_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "QuestionImportMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportSourceBlock" ADD CONSTRAINT "QuestionImportSourceBlock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportAnswerEvidence" ADD CONSTRAINT "QuestionImportAnswerEvidence_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportSkippedRange" ADD CONSTRAINT "QuestionImportSkippedRange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportChunk" ADD CONSTRAINT "QuestionImportChunk_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportItem" ADD CONSTRAINT "QuestionImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportItem" ADD CONSTRAINT "QuestionImportItem_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "QuestionImportChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImportItem" ADD CONSTRAINT "QuestionImportItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionContentBlock" ADD CONSTRAINT "QuestionContentBlock_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionContentBlock" ADD CONSTRAINT "QuestionContentBlock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOptionContentBlock" ADD CONSTRAINT "QuestionOptionContentBlock_questionOptionId_fkey" FOREIGN KEY ("questionOptionId") REFERENCES "QuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOptionContentBlock" ADD CONSTRAINT "QuestionOptionContentBlock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionContextContentBlock" ADD CONSTRAINT "QuestionContextContentBlock_questionContextId_fkey" FOREIGN KEY ("questionContextId") REFERENCES "QuestionContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionContextContentBlock" ADD CONSTRAINT "QuestionContextContentBlock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVideoLink" ADD CONSTRAINT "QuestionVideoLink_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionVideoLink" ADD CONSTRAINT "QuestionVideoLink_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "VideoAsset"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPlacement" ADD CONSTRAINT "QuestionPlacement_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionBank" ADD CONSTRAINT "AssessmentQuestionBank_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionBank" ADD CONSTRAINT "AssessmentQuestionBank_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionAsset" ADD CONSTRAINT "AssessmentQuestionAsset_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionContentBlock" ADD CONSTRAINT "AssessmentQuestionContentBlock_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentContext" ADD CONSTRAINT "AssessmentContext_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionContext" ADD CONSTRAINT "AssessmentQuestionContext_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionContext" ADD CONSTRAINT "AssessmentQuestionContext_assessmentContextId_fkey" FOREIGN KEY ("assessmentContextId") REFERENCES "AssessmentContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentContextContentBlock" ADD CONSTRAINT "AssessmentContextContentBlock_assessmentContextId_fkey" FOREIGN KEY ("assessmentContextId") REFERENCES "AssessmentContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionPlacement" ADD CONSTRAINT "AssessmentQuestionPlacement_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionOption" ADD CONSTRAINT "AssessmentQuestionOption_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionOptionContentBlock" ADD CONSTRAINT "AssessmentQuestionOptionContentBlock_assessmentQuestionOpt_fkey" FOREIGN KEY ("assessmentQuestionOptionId") REFERENCES "AssessmentQuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswerAiGradingRun" ADD CONSTRAINT "AssessmentAnswerAiGradingRun_attemptAnswerId_fkey" FOREIGN KEY ("attemptAnswerId") REFERENCES "AssessmentAttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQuizGenerationRun" ADD CONSTRAINT "AiQuizGenerationRun_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQuizGenerationRun" ADD CONSTRAINT "AiQuizGenerationRun_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReportAction" ADD CONSTRAINT "QuestionReportAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "QuestionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReportAction" ADD CONSTRAINT "QuestionReportAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswerChange" ADD CONSTRAINT "AssessmentAnswerChange_attemptAnswerId_fkey" FOREIGN KEY ("attemptAnswerId") REFERENCES "AssessmentAttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardWeek" ADD CONSTRAINT "LeaderboardWeek_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "LeaderboardWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardAward" ADD CONSTRAINT "LeaderboardAward_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LeaderboardEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionMark" ADD CONSTRAINT "StudentQuestionMark_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionMark" ADD CONSTRAINT "StudentQuestionMark_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionNote" ADD CONSTRAINT "StudentQuestionNote_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionNote" ADD CONSTRAINT "StudentQuestionNote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionCommunityStat" ADD CONSTRAINT "QuestionCommunityStat_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContentProgress" ADD CONSTRAINT "StudentContentProgress_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContentProgress" ADD CONSTRAINT "StudentContentProgress_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionHighlight" ADD CONSTRAINT "StudentQuestionHighlight_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionHighlight" ADD CONSTRAINT "StudentQuestionHighlight_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentNotebookPage" ADD CONSTRAINT "StudentNotebookPage_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectConstant" ADD CONSTRAINT "SubjectConstant_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContentStudyState" ADD CONSTRAINT "StudentContentStudyState_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentContentStudyState" ADD CONSTRAINT "StudentContentStudyState_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionAttempt" ADD CONSTRAINT "StudentQuestionAttempt_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionAttempt" ADD CONSTRAINT "StudentQuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionAttemptAnswer" ADD CONSTRAINT "StudentQuestionAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StudentQuestionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentQuestionAttemptAnswer" ADD CONSTRAINT "StudentQuestionAttemptAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedAccessSnapshot" ADD CONSTRAINT "ArchivedAccessSnapshot_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedAccessSnapshot" ADD CONSTRAINT "ArchivedAccessSnapshot_sourceEntitlementId_fkey" FOREIGN KEY ("sourceEntitlementId") REFERENCES "StudentEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivedAccessSnapshot" ADD CONSTRAINT "ArchivedAccessSnapshot_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentMethod" ADD CONSTRAINT "ManualPaymentMethod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_manualPaymentMethodId_fkey" FOREIGN KEY ("manualPaymentMethodId") REFERENCES "ManualPaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCampaignTarget" ADD CONSTRAINT "DiscountCampaignTarget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DiscountCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCampaignTarget" ADD CONSTRAINT "DiscountCampaignTarget_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCampaignTarget" ADD CONSTRAINT "DiscountCampaignTarget_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTarget" ADD CONSTRAINT "CouponTarget_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTarget" ADD CONSTRAINT "CouponTarget_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTarget" ADD CONSTRAINT "CouponTarget_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponReservation" ADD CONSTRAINT "CouponReservation_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_proofAssetId_fkey" FOREIGN KEY ("proofAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentSubmission" ADD CONSTRAINT "ManualPaymentSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequestItem" ADD CONSTRAINT "RefundRequestItem_refundRequestId_fkey" FOREIGN KEY ("refundRequestId") REFERENCES "RefundRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequestItem" ADD CONSTRAINT "RefundRequestItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PublisherAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCommissionRule" ADD CONSTRAINT "ReferralCommissionRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewRule" ADD CONSTRAINT "ReferralReviewRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewRule" ADD CONSTRAINT "ReferralReviewRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_referralProgramId_fkey" FOREIGN KEY ("referralProgramId") REFERENCES "ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReferralAttribution" ADD CONSTRAINT "OrderReferralAttribution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReferralCommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "OrderReferralAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReferralReviewRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewNote" ADD CONSTRAINT "ReferralReviewNote_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "ReferralReviewFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReviewNote" ADD CONSTRAINT "ReferralReviewNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_publisherAgreementId_fkey" FOREIGN KEY ("publisherAgreementId") REFERENCES "PublisherAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_referralRuleId_fkey" FOREIGN KEY ("referralRuleId") REFERENCES "ReferralCommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAllocation" ADD CONSTRAINT "PartnerAllocation_reversedAllocationId_fkey" FOREIGN KEY ("reversedAllocationId") REFERENCES "PartnerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundPolicy" ADD CONSTRAINT "RefundPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceReconciliationRun" ADD CONSTRAINT "PartnerFinanceReconciliationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceReconciliationOrder" ADD CONSTRAINT "PartnerFinanceReconciliationOrder_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PartnerFinanceReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceReconciliationOrder" ADD CONSTRAINT "PartnerFinanceReconciliationOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PartnerFinanceReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PartnerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinanceDiscrepancy" ADD CONSTRAINT "PartnerFinanceDiscrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSettlement" ADD CONSTRAINT "PartnerSettlement_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSettlementLine" ADD CONSTRAINT "PartnerSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PartnerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSettlementLine" ADD CONSTRAINT "PartnerSettlementLine_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PartnerAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionAttribution" ADD CONSTRAINT "AssessmentQuestionAttribution_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherUsageDailyRollup" ADD CONSTRAINT "PublisherUsageDailyRollup_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherUsageDailySolver" ADD CONSTRAINT "PublisherUsageDailySolver_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportExportJob" ADD CONSTRAINT "ReportExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Center" ADD CONSTRAINT "Center_governorateId_fkey" FOREIGN KEY ("governorateId") REFERENCES "Governorate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Arabic-aware search. This is intentionally part of the compacted baseline:
-- application startup and the public/admin list endpoints rely on this SQL
-- function and the trigram extension. Keep it in sync with
-- src/common/search/arabic-search.ts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION arabic_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      translate(lower(normalize(coalesce(input, ''), NFKC)),
        'أإآىیک٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹ـ',
        'اااييك01234567890123456789'),
      '[ً-ٰٟۖ-ۭ]', '', 'g'),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

-- Abort migration on a database that cannot correctly normalize Arabic text.
-- A C/POSIX LC_CTYPE would otherwise produce empty search expressions.
DO $$
BEGIN
  IF arabic_normalize('  إِلـى  یَوم ۱۲٣! ') <> 'الي يوم 123' THEN
    RAISE EXCEPTION 'arabic_normalize() is misbehaving on this database (got %). Check that the server was initialised with a UTF-8 LC_CTYPE, not C/POSIX.',
      arabic_normalize('  إِلـى  یَوم ۱۲٣! ');
  END IF;
  IF arabic_normalize('ﻣﺪﺭﺳﺔ') <> 'مدرسة' THEN
    RAISE EXCEPTION 'arabic_normalize() is not applying NFKC (got %).', arabic_normalize('ﻣﺪﺭﺳﺔ');
  END IF;
END $$;

-- Trigram indexes support partial/typo search; FTS indexes support token
-- search. They are created after all baseline tables and constraints exist.
CREATE INDEX "Subject_search_trgm_idx" ON "Subject" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Subject_search_fts_idx" ON "Subject" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "AcademicGrade_search_trgm_idx" ON "AcademicGrade" USING gin
  (arabic_normalize(coalesce("titleAr", '') || ' ' || coalesce("titleEn", '') || ' ' || coalesce(slug, '') || ' ' || coalesce("descriptionAr", '') || ' ' || coalesce("descriptionEn", '')) gin_trgm_ops);
CREATE INDEX "Course_search_trgm_idx" ON "Course" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Course_search_fts_idx" ON "Course" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "Chapter_search_trgm_idx" ON "Chapter" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Chapter_search_fts_idx" ON "Chapter" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "Lesson_search_trgm_idx" ON "Lesson" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Lesson_search_fts_idx" ON "Lesson" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "Section_search_trgm_idx" ON "Section" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "Section_search_fts_idx" ON "Section" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(slug, '') || ' ' || coalesce(description, ''))));
CREATE INDEX "ContentItem_search_trgm_idx" ON "ContentItem" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce("textBody", '')) gin_trgm_ops);
CREATE INDEX "ContentItem_search_fts_idx" ON "ContentItem" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce("textBody", ''))));
CREATE INDEX "Question_search_trgm_idx" ON "Question" USING gin
  (arabic_normalize(coalesce(body, '') || ' ' || coalesce(explanation, '')) gin_trgm_ops);
CREATE INDEX "Question_search_fts_idx" ON "Question" USING gin
  (to_tsvector('simple', arabic_normalize(coalesce(body, '') || ' ' || coalesce(explanation, ''))));
CREATE INDEX "QuestionBank_search_trgm_idx" ON "QuestionBank" USING gin
  (arabic_normalize(coalesce(title, '') || ' ' || coalesce(description, '')) gin_trgm_ops);
CREATE INDEX "QuestionSource_search_trgm_idx" ON "QuestionSource" USING gin
  (arabic_normalize(coalesce("titleAr", '') || ' ' || coalesce("titleEn", '') || ' ' || coalesce("noteAr", '') || ' ' || coalesce("noteEn", '')) gin_trgm_ops);
CREATE INDEX "Assessment_search_trgm_idx" ON "Assessment" USING gin
  (arabic_normalize(coalesce(title, '')) gin_trgm_ops);
CREATE INDEX "User_loginIdentifier_search_trgm_idx" ON "User" USING gin
  (arabic_normalize(coalesce("loginIdentifier", '')) gin_trgm_ops);
CREATE INDEX "ManualPaymentMethod_search_trgm_idx" ON "ManualPaymentMethod" USING gin
  (arabic_normalize(coalesce("titleAr", '') || ' ' || coalesce("titleEn", '') || ' ' || coalesce("instructionsAr", '') || ' ' || coalesce("instructionsEn", '')) gin_trgm_ops);
CREATE INDEX "Governorate_search_trgm_idx" ON "Governorate" USING gin
  (arabic_normalize(coalesce("nameAr", '') || ' ' || coalesce("nameEn", '')) gin_trgm_ops);
CREATE INDEX "Center_search_trgm_idx" ON "Center" USING gin
  (arabic_normalize(coalesce("nameAr", '') || ' ' || coalesce("nameEn", '')) gin_trgm_ops);
CREATE INDEX "StudentProfile_search_trgm_idx" ON "StudentProfile" USING gin
  (arabic_normalize(coalesce("fullName", '')) gin_trgm_ops);
CREATE INDEX "PartnerProfile_search_trgm_idx" ON "PartnerProfile" USING gin
  (arabic_normalize(coalesce("displayName", '') || ' ' || coalesce("legalName", '')) gin_trgm_ops);
