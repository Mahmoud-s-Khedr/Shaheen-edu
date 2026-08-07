import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountStatus,
  ContentStatus,
  PartnerType,
  Role,
  ContentItemType,
  AccessType,
  AssetKind,
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
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'UNAUTHORIZED.INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ example: { ar: 'بيانات تسجيل الدخول غير صحيحة', en: 'Invalid credentials' } })
  message!: { ar: string; en: string };

  @ApiProperty({ example: { ar: 'غير مصرح', en: 'Unauthorized' } })
  error!: { ar: string; en: string };

  @ApiPropertyOptional({ type: 'array', example: [{ field: 'phone', code: 'VALIDATION.ISSTRING', message: { ar: 'يجب أن تكون القيمة نصاً', en: 'phone must be a string' } }] })
  details?: Array<{ field: string; code: string; message: { ar: string; en: string } }>;

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

  @ApiProperty({ nullable: true })
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
}

export class CourseSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  subjectId!: string;
}

export class ChapterSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  courseId!: string;
}

export class LessonSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  chapterId!: string;
}

export class SectionSummaryDto extends HierarchySummaryDto {
  @ApiProperty()
  lessonId!: string;
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

export class PaginatedChapterResponseDto {
  @ApiProperty({ type: [ChapterSummaryDto] })
  data!: ChapterSummaryDto[];

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
  chapterId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lessonId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  sectionId!: string | null;

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

/** Full admin read shape; list and mutation responses remain summaries. */
export class ContentItemDetailDto extends ContentItemSummaryDto {
  @ApiProperty({ type: [ContentAttachmentDto] })
  attachments!: ContentAttachmentDto[];
}

export class PaginatedContentItemResponseDto {
  @ApiProperty({ type: [ContentItemSummaryDto] })
  data!: ContentItemSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
