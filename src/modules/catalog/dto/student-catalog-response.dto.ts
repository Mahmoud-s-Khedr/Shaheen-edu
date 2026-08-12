import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../../common/dto/api-response.dto';

/**
 * Response contracts for the student catalogue.
 *
 * Hand-rolled to match the convention already used by the other modules'
 * `Paginated*ResponseDto` classes rather than introducing a generic mixin,
 * which would emit differently-named schema components and leave `docs-json`
 * with two competing naming styles.
 */

export class LocalizedTextDto {
  @ApiProperty({ example: 'الصف الأول' })
  ar!: string;

  @ApiProperty({ example: 'Grade One' })
  en!: string;
}

/**
 * An academic-grade description always has both locale keys, whose values may
 * be absent.
 */
export class LocalizedDescriptionDto {
  @ApiProperty({ type: String, nullable: true, example: 'وصف اختياري' })
  ar!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Optional description' })
  en!: string | null;
}

export class CursorPageInfoDto {
  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'eyJzb3J0T3JkZXIiOjJ9',
  })
  nextCursor!: string | null;
}

export class CatalogNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ type: String, nullable: true })
  coverAssetId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  coverAssetName!: string | null;

  @ApiPropertyOptional({ description: 'Present when child counts were requested.' })
  hasChildren?: boolean;

  @ApiPropertyOptional({ description: 'Resolved access for the requesting student.' })
  access?: Record<string, unknown>;
}

export class AcademicGradeNodeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: LocalizedTextDto })
  title!: LocalizedTextDto;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: LocalizedDescriptionDto })
  description!: LocalizedDescriptionDto;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ type: String, nullable: true })
  coverAssetId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  coverAssetName!: string | null;
}

export class StudentCatalogSummaryCountsDto {
  @ApiProperty()
  subjects!: number;

  @ApiProperty()
  courses!: number;

  @ApiProperty()
  chapters!: number;
}

export class StudentCatalogSummaryResponseDto {
  @ApiProperty({ type: AcademicGradeNodeDto })
  academicGrade!: AcademicGradeNodeDto;

  @ApiProperty({ type: StudentCatalogSummaryCountsDto })
  summary!: StudentCatalogSummaryCountsDto;
}

export class PaginatedCatalogNodeResponseDto {
  @ApiProperty({ type: [CatalogNodeDto] })
  data!: CatalogNodeDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class CursorCatalogNodeResponseDto {
  @ApiPropertyOptional({ type: CatalogNodeDto, description: 'The parent the page was requested under.' })
  parent?: CatalogNodeDto;

  @ApiProperty({ type: [CatalogNodeDto] })
  data!: CatalogNodeDto[];

  @ApiProperty({ type: CursorPageInfoDto })
  pageInfo!: CursorPageInfoDto;
}

export class CatalogContentItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'TEXT' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  estimatedDuration!: number | null;

  @ApiProperty({ example: 'FREE' })
  accessType!: string;

  @ApiProperty()
  sortOrder!: number;
}

export class CursorCatalogContentItemResponseDto {
  @ApiPropertyOptional({ type: CatalogNodeDto })
  parent?: CatalogNodeDto;

  @ApiProperty({ type: [CatalogContentItemDto] })
  data!: CatalogContentItemDto[];

  @ApiProperty({ type: CursorPageInfoDto })
  pageInfo!: CursorPageInfoDto;
}

export class StudentCatalogSearchHitDto {
  @ApiProperty({ enum: ['CHAPTER', 'LESSON', 'SECTION'] })
  type!: string;

  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
}

export class StudentCatalogSearchResponseDto {
  @ApiProperty({ type: [StudentCatalogSearchHitDto] })
  data!: StudentCatalogSearchHitDto[];

  @ApiProperty({ type: CursorPageInfoDto })
  pageInfo!: CursorPageInfoDto;
}

export class StudentLibraryItemDto {
  @ApiPropertyOptional()
  entitlementId?: string;

  @ApiPropertyOptional({ description: 'Set on rows retained after the content was archived.' })
  archivedAccessSnapshotId?: string;

  @ApiProperty({ enum: ['COURSE', 'CHAPTER', 'ACADEMIC_GRADE', 'SUBJECT', 'LESSON', 'SECTION'] })
  targetType!: string;

  @ApiProperty({ type: CatalogNodeDto })
  target!: CatalogNodeDto;

  @ApiProperty({ type: CatalogNodeDto, nullable: true })
  course!: CatalogNodeDto | null;

  @ApiProperty({ type: CatalogNodeDto, nullable: true })
  subject!: CatalogNodeDto | null;

  @ApiProperty({ type: AcademicGradeNodeDto, nullable: true })
  academicGrade!: AcademicGradeNodeDto | null;

  @ApiPropertyOptional()
  retainedAccess?: boolean;
}

export class PaginatedStudentLibraryResponseDto {
  @ApiProperty({ type: [StudentLibraryItemDto] })
  data!: StudentLibraryItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class MySubjectDto {
  @ApiProperty({ type: CatalogNodeDto })
  subject!: CatalogNodeDto;

  @ApiPropertyOptional({ description: 'Completed / total content items for the student.' })
  progress?: Record<string, unknown>;
}

export class PaginatedMySubjectsResponseDto {
  @ApiProperty({ type: [MySubjectDto] })
  data!: MySubjectDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class StudentEntitlementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['COURSE', 'CHAPTER'] })
  targetType!: string;

  @ApiProperty({ type: String, nullable: true })
  targetId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  targetName!: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty()
  startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: Date | null;
}

export class PaginatedStudentEntitlementResponseDto {
  @ApiProperty({ type: [StudentEntitlementDto] })
  data!: StudentEntitlementDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
