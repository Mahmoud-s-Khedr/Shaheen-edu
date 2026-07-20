import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountStatus,
  ContentStatus,
  PartnerType,
  Role,
  ContentItemType,
  AccessType,
} from '../types/roles.enum';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({
    example: 'Unauthorized',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  @ApiProperty({ example: 'Unauthorized' })
  error!: string;

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

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  legalName!: string | null;

  @ApiProperty({ nullable: true })
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

  @ApiProperty({
    nullable: true,
    properties: {
      fullName: { type: 'string' },
      governorate: { type: 'string' },
      center: { type: 'string', nullable: true },
      nationalIdLast4: { type: 'string' },
      academicGradeId: { type: 'string', nullable: true },
    },
  })
  studentProfile!: object | null;
}

export class CurrentUserDto extends UserSummaryDto {}

export class HierarchySummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiPropertyOptional({ enum: AccessType })
  accessType?: AccessType;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  publishedAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  archivedAt?: Date | null;

}

export class AcademicGradeSummaryDto extends HierarchySummaryDto {}

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

  @ApiPropertyOptional({ nullable: true })
  courseId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  chapterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lessonId!: string | null;

  @ApiPropertyOptional({ nullable: true })
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

  @ApiPropertyOptional({ nullable: true })
  textBody!: string | null;

  @ApiPropertyOptional({ nullable: true })
  externalUrl!: string | null;

  @ApiProperty({ enum: AccessType })
  accessType!: AccessType;

  @ApiPropertyOptional({ nullable: true })
  estimatedDuration!: number | null;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;

  @ApiPropertyOptional({ nullable: true })
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

export class PaginatedContentItemResponseDto {
  @ApiProperty({ type: [ContentItemSummaryDto] })
  data!: ContentItemSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
