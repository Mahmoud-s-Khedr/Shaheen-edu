import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountStatus,
  ContentStatus,
  PartnerType,
  Role,
  ContentItemType,
  AccessType,
  AssetKind,
  AssetStatus,
  VideoProcessingStatus,
} from '../types/roles.enum';

/** Localized values returned by persisted resources; migrated records may not have English yet. */
export class LocalizedResponseTextDto {
  @ApiProperty()
  ar!: string;

  @ApiProperty({ type: String, nullable: true })
  en!: string | null;
}

export class LocalizedNullableResponseTextDto {
  @ApiProperty({ type: String, nullable: true })
  ar!: string | null;

  @ApiProperty({ type: String, nullable: true })
  en!: string | null;
}

export class ManagedGeographyReferenceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: LocalizedResponseTextDto })
  name!: LocalizedResponseTextDto;
}

export class StudentProfileDetailsDto {
  @ApiProperty()
  fullName!: string;

  @ApiProperty({ type: ManagedGeographyReferenceDto, nullable: true })
  governorate!: ManagedGeographyReferenceDto | null;

  @ApiProperty({ type: ManagedGeographyReferenceDto, nullable: true })
  center!: ManagedGeographyReferenceDto | null;

  @ApiProperty()
  nationalIdLast4!: string;

  @ApiProperty({ type: String, nullable: true })
  academicGradeId!: string | null;

  @ApiProperty({ type: LocalizedResponseTextDto, nullable: true })
  academicGrade!: LocalizedResponseTextDto | null;

  @ApiProperty()
  parentPhone!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'UNAUTHORIZED.INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({
    example: { ar: 'بيانات تسجيل الدخول غير صحيحة', en: 'Invalid credentials' },
  })
  message!: { ar: string; en: string };

  @ApiProperty({ example: { ar: 'غير مصرح', en: 'Unauthorized' } })
  error!: { ar: string; en: string };

  @ApiPropertyOptional({
    type: 'array',
    example: [
      {
        field: 'phone',
        code: 'VALIDATION.ISSTRING',
        message: {
          ar: 'يجب أن تكون القيمة نصاً',
          en: 'phone must be a string',
        },
      },
    ],
  })
  details?: Array<{
    field: string;
    code: string;
    message: { ar: string; en: string };
  }>;

  @ApiProperty({ example: '3eb75610-8bc8-4fc2-b821-dc90d7f3f39a' })
  correlationId!: string;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ example: 'user@example.com' })
  loginIdentifier!: string;

  @ApiPropertyOptional()
  mustChangePassword?: boolean;
}

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class ParentAccessTokenResponseDto {
  @ApiProperty()
  accessToken!: string;
}

export class UserSummaryDto extends AuthUserDto {
  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastLoginAt?: Date | null;
}

export class AdminSummaryDto extends UserSummaryDto {}

export class PartnerSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty()
  loginIdentifier!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ enum: PartnerType, nullable: true })
  partnerType!: PartnerType | null;

  @ApiProperty({ type: String, nullable: true })
  displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  legalName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;
}

export class ParentChildDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  governorate!: string;

  @ApiProperty({ nullable: true })
  center!: string | null;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;
}

export class PaginatedAdminResponseDto {
  @ApiProperty({ type: [AdminSummaryDto] })
  data!: AdminSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedPartnerResponseDto {
  @ApiProperty({ type: [PartnerSummaryDto] })
  data!: PartnerSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedParentChildResponseDto {
  @ApiProperty({ type: [ParentChildDto] })
  data!: ParentChildDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class StudentProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty()
  loginIdentifier!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: StudentProfileDetailsDto, nullable: true })
  studentProfile!: StudentProfileDetailsDto | null;
}

export class AdminStudentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ enum: AccountStatus })
  status!: AccountStatus;

  @ApiProperty({ example: '1234' })
  nationalIdLast4!: string;

  @ApiProperty({ type: String, nullable: true })
  academicGradeId!: string | null;

  @ApiProperty({ type: LocalizedResponseTextDto, nullable: true })
  academicGrade!: LocalizedResponseTextDto | null;

  @ApiProperty({ type: ManagedGeographyReferenceDto, nullable: true })
  governorate!: ManagedGeographyReferenceDto | null;

  @ApiProperty({ type: ManagedGeographyReferenceDto, nullable: true })
  center!: ManagedGeographyReferenceDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;
}

export class AdminStudentDetailDto extends AdminStudentSummaryDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt!: Date | null;
}

export class PaginatedAdminStudentResponseDto {
  @ApiProperty({ type: [AdminStudentSummaryDto] })
  data!: AdminStudentSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PasswordResetResponseDto {
  @ApiProperty()
  temporaryPassword!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  passwordResetAt!: Date;
}

export class CurrentUserDto extends UserSummaryDto {}

export class HierarchySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiPropertyOptional({ enum: AccessType })
  accessType?: AccessType;

  @ApiPropertyOptional({ type: String, nullable: true })
  coverAssetId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  coverAssetName?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt?: Date | null;
}

export class AcademicGradeSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: LocalizedResponseTextDto })
  title!: LocalizedResponseTextDto;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: LocalizedNullableResponseTextDto })
  description!: LocalizedNullableResponseTextDto;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  coverAssetId?: string | null;

  @ApiProperty({
    example: true,
    description: 'Whether this grade has visible subject children.',
  })
  hasChildren!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt?: Date | null;
}

export class SubjectSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  academicGradeId!: string;

  @ApiProperty({ type: LocalizedResponseTextDto })
  academicGradeName!: LocalizedResponseTextDto;

  @ApiProperty({
    example: true,
    description: 'Whether this subject has visible course children.',
  })
  hasChildren!: boolean;
}

export class CourseSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this course has visible chapter children.',
  })
  hasChildren!: boolean;
}

export class EffectivePricingResolvedFromDto {
  @ApiPropertyOptional({ type: String })
  courseId?: string;

  @ApiPropertyOptional({ type: String })
  chapterId?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  courseName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  chapterName?: string | null;
}

export class EffectivePricingDto {
  @ApiProperty({ example: true })
  isPurchasable!: boolean;

  @ApiProperty({ type: Number, nullable: true, example: 20000 })
  priceMinor!: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'EGP' })
  currency!: string | null;

  @ApiProperty({ type: EffectivePricingResolvedFromDto })
  resolvedFrom!: EffectivePricingResolvedFromDto;
}

/** Returned by the admin course GET endpoints. */
export class AdminCourseReadDto extends CourseSummaryDto {
  @ApiProperty({ type: EffectivePricingDto })
  pricing!: EffectivePricingDto;
}

export class ChapterSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  courseId!: string;

  @ApiProperty()
  courseName!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this chapter has visible lesson children.',
  })
  hasChildren!: boolean;
}

/** Returned by the admin chapter GET endpoints. */
export class AdminChapterReadDto extends ChapterSummaryDto {
  @ApiProperty({ type: EffectivePricingDto })
  pricing!: EffectivePricingDto;
}

export class LessonSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  chapterId!: string;

  @ApiProperty()
  chapterName!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this lesson has visible section children.',
  })
  hasChildren!: boolean;
}

export class SectionSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  lessonId!: string;

  @ApiProperty()
  lessonName!: string;
}

export class PaginatedAcademicGradeResponseDto {
  @ApiProperty({ type: [AcademicGradeSummaryDto] })
  data!: AcademicGradeSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedSubjectResponseDto {
  @ApiProperty({ type: [SubjectSummaryDto] })
  data!: SubjectSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedCourseResponseDto {
  @ApiProperty({ type: [CourseSummaryDto] })
  data!: CourseSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedAdminCourseReadResponseDto {
  @ApiProperty({ type: [AdminCourseReadDto] })
  data!: AdminCourseReadDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedChapterResponseDto {
  @ApiProperty({ type: [ChapterSummaryDto] })
  data!: ChapterSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedAdminChapterReadResponseDto {
  @ApiProperty({ type: [AdminChapterReadDto] })
  data!: AdminChapterReadDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedLessonResponseDto {
  @ApiProperty({ type: [LessonSummaryDto] })
  data!: LessonSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedSectionResponseDto {
  @ApiProperty({ type: [SectionSummaryDto] })
  data!: SectionSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ContentPlacementSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  courseId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  courseName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  chapterId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  chapterName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lessonId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lessonName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  sectionId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  sectionName!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

export class ContentItemSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ContentItemType })
  type!: ContentItemType;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  textBody!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  externalUrl!: string | null;

  @ApiProperty({ enum: AccessType })
  accessType!: AccessType;

  @ApiPropertyOptional({ nullable: true })
  estimatedDuration!: number | null;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  primaryAssetId!: string | null;

  @ApiPropertyOptional({
    type: () => ContentPrimaryAssetSummaryDto,
    nullable: true,
  })
  primaryAsset!: ContentPrimaryAssetSummaryDto | null;

  @ApiProperty({ type: ContentPlacementSummaryDto })
  placement!: ContentPlacementSummaryDto;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt!: Date | null;
}

export class ContentPrimaryAssetSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty({ enum: AssetKind })
  kind!: AssetKind;

  @ApiProperty({ enum: AssetStatus })
  status!: AssetStatus;

  @ApiPropertyOptional({ enum: VideoProcessingStatus, nullable: true })
  processingStatus!: VideoProcessingStatus | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  processingProgress!: number | null;
}

export class ContentPrimaryAssetVideoDto {
  @ApiProperty({ enum: VideoProcessingStatus })
  processingStatus!: VideoProcessingStatus;

  @ApiProperty()
  processingProgress!: number;

  @ApiProperty()
  attempt!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  readyAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  failedAt!: Date | null;
}

export class ContentPrimaryAssetDetailDto extends ContentPrimaryAssetSummaryDto {
  @ApiPropertyOptional({
    type: () => ContentPrimaryAssetVideoDto,
    nullable: true,
  })
  video!: ContentPrimaryAssetVideoDto | null;
}

export class ContentAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AssetKind })
  kind!: AssetKind;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  sizeBytes!: number | null;

  @ApiProperty()
  sortOrder!: number;
}

export class VideoOutlineConceptDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  sortOrder!: number;
}

export class VideoOutlineTopicDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  startSeconds!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  endSeconds!: number | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ type: [VideoOutlineConceptDto] })
  concepts!: VideoOutlineConceptDto[];
}

export class VideoOutlineResponseDto {
  @ApiProperty()
  contentItemId!: string;

  @ApiProperty({ type: [VideoOutlineTopicDto] })
  videoOutline!: VideoOutlineTopicDto[];
}

/** Full admin read shape; list and mutation responses remain summaries. */
export class ContentItemDetailDto extends ContentItemSummaryDto {
  @ApiPropertyOptional({
    type: () => ContentPrimaryAssetDetailDto,
    nullable: true,
  })
  declare primaryAsset: ContentPrimaryAssetDetailDto | null;

  @ApiProperty({ type: [ContentAttachmentDto] })
  attachments!: ContentAttachmentDto[];

  @ApiProperty({ type: [VideoOutlineTopicDto] })
  videoOutline!: VideoOutlineTopicDto[];
}

export class PaginatedContentItemResponseDto {
  @ApiProperty({ type: [ContentItemSummaryDto] })
  data!: ContentItemSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
