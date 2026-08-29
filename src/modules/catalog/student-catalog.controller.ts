import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CursorCatalogContentItemResponseDto,
  CursorCatalogNodeResponseDto,
  PaginatedCatalogNodeResponseDto,
  PaginatedMySubjectsResponseDto,
  PaginatedStudentEntitlementResponseDto,
  PaginatedStudentLibraryResponseDto,
  StudentCatalogCourseDetailResponseDto,
  StudentCatalogSearchResponseDto,
  StudentCatalogSummaryResponseDto,
} from './dto/student-catalog-response.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto, SearchPaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchCursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { StudentCatalogService } from './student-catalog.service';
import { StudentCatalogSearchDto } from './dto/student-catalog-search.dto';

@ApiTags('student/catalog')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class StudentCatalogController {
  constructor(private readonly catalog: StudentCatalogService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Get the authenticated student catalogue summary' })
  @ApiOkResponse({ type: StudentCatalogSummaryResponseDto })
  catalogSummary(@CurrentUser() user: RequestUser) {
    return this.catalog.summary(user.id);
  }

  @Get('catalog/subjects')
  @ApiOperation({ summary: 'List published subjects in the student grade' })
  @ApiOkResponse({ type: PaginatedCatalogNodeResponseDto })
  subjects(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchPaginationQueryDto,
  ) {
    return this.catalog.subjects(user.id, query);
  }

  @Get('catalog/subjects/:subjectId/courses')
  @ApiOperation({ summary: 'List grade-scoped courses for a subject' })
  @ApiOkResponse({ type: PaginatedCatalogNodeResponseDto })
  courses(
    @CurrentUser() user: RequestUser,
    @Param('subjectId') subjectId: string,
    @Query() query: SearchPaginationQueryDto,
  ) {
    return this.catalog.courses(user.id, subjectId, query);
  }

  @Get('catalog/search')
  @ApiOperation({
    summary:
      'Search published chapters, lessons, and sections within a subject',
  })
  @ApiOkResponse({ type: StudentCatalogSearchResponseDto })
  search(
    @CurrentUser() user: RequestUser,
    @Query() query: StudentCatalogSearchDto,
  ) {
    return this.catalog.search(user.id, query);
  }

  @Get('catalog/courses/:courseId')
  @ApiOperation({ summary: 'Get a grade-scoped course' })
  @ApiOkResponse({ type: StudentCatalogCourseDetailResponseDto })
  course(
    @CurrentUser() user: RequestUser,
    @Param('courseId') courseId: string,
  ) {
    return this.catalog.course(user.id, courseId);
  }

  @Get('catalog/courses/:courseId/chapters')
  @ApiOperation({ summary: 'List published chapters in a grade-scoped course' })
  @ApiOkResponse({ type: CursorCatalogNodeResponseDto })
  chapters(
    @CurrentUser() user: RequestUser,
    @Param('courseId') courseId: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.chapters(user.id, courseId, query);
  }

  @Get('catalog/chapters/:chapterId/lessons')
  @ApiOperation({ summary: 'List published lessons in a grade-scoped chapter' })
  @ApiOkResponse({ type: CursorCatalogNodeResponseDto })
  lessons(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.lessons(user.id, chapterId, query);
  }

  @Get('catalog/lessons/:lessonId/sections')
  @ApiOperation({ summary: 'List published sections in a grade-scoped lesson' })
  @ApiOkResponse({ type: CursorCatalogNodeResponseDto })
  sections(
    @CurrentUser() user: RequestUser,
    @Param('lessonId') lessonId: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.sections(user.id, lessonId, query);
  }

  @Get('catalog/:resource/:id/content-items')
  @ApiOperation({
    summary:
      'List published content previews directly placed on a hierarchy node',
  })
  @ApiOkResponse({ type: CursorCatalogContentItemResponseDto })
  contentItems(
    @CurrentUser() user: RequestUser,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.contentItems(user.id, resource, id, query);
  }

  @Get('library')
  @ApiOperation({ summary: 'List the student active library across grades' })
  @ApiOkResponse({ type: PaginatedStudentLibraryResponseDto })
  library(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchPaginationQueryDto,
  ) {
    return this.catalog.library(user.id, query);
  }

  @Get('my-subjects')
  @ApiOperation({
    summary:
      'List subjects with active course or chapter access and calculated progress',
  })
  @ApiOkResponse({ type: PaginatedMySubjectsResponseDto })
  mySubjects(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchPaginationQueryDto,
  ) {
    return this.catalog.mySubjects(user.id, query);
  }

  @Get('entitlements')
  @ApiOperation({
    summary: 'List the authenticated student active entitlements',
  })
  @ApiOkResponse({ type: PaginatedStudentEntitlementResponseDto })
  entitlements(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.catalog.entitlements(user.id, query);
  }
}
