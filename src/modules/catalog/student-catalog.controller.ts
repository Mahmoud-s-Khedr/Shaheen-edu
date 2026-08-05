import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { StudentCatalogService } from './student-catalog.service';

@ApiTags('student/catalog')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.STUDENT)
@Controller({ path: 'student', version: '1' })
export class StudentCatalogController {
  constructor(private readonly catalog: StudentCatalogService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Get the authenticated student catalogue summary' })
  catalogSummary(@CurrentUser() user: RequestUser) {
    return this.catalog.summary(user.id);
  }

  @Get('catalog/subjects')
  @ApiOperation({ summary: 'List published subjects in the student grade' })
  subjects(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.catalog.subjects(user.id, query);
  }

  @Get('catalog/subjects/:subjectId/courses')
  @ApiOperation({ summary: 'List grade-scoped courses for a subject' })
  courses(
    @CurrentUser() user: RequestUser,
    @Param('subjectId') subjectId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.catalog.courses(user.id, subjectId, query);
  }

  @Get('catalog/courses/:courseId')
  @ApiOperation({ summary: 'Get a grade-scoped course' })
  course(
    @CurrentUser() user: RequestUser,
    @Param('courseId') courseId: string,
  ) {
    return this.catalog.course(user.id, courseId);
  }

  @Get('catalog/courses/:courseId/chapters')
  @ApiOperation({ summary: 'List published chapters in a grade-scoped course' })
  chapters(@CurrentUser() user: RequestUser, @Param('courseId') courseId: string, @Query() query: CursorPaginationQueryDto) { return this.catalog.chapters(user.id, courseId, query); }

  @Get('catalog/chapters/:chapterId/lessons')
  @ApiOperation({ summary: 'List published lessons in a grade-scoped chapter' })
  lessons(@CurrentUser() user: RequestUser, @Param('chapterId') chapterId: string, @Query() query: CursorPaginationQueryDto) { return this.catalog.lessons(user.id, chapterId, query); }

  @Get('catalog/lessons/:lessonId/sections')
  @ApiOperation({ summary: 'List published sections in a grade-scoped lesson' })
  sections(@CurrentUser() user: RequestUser, @Param('lessonId') lessonId: string, @Query() query: CursorPaginationQueryDto) { return this.catalog.sections(user.id, lessonId, query); }

  @Get('catalog/:resource/:id/content-items')
  @ApiOperation({ summary: 'List published content previews directly placed on a hierarchy node' })
  contentItems(@CurrentUser() user: RequestUser, @Param('resource') resource: string, @Param('id') id: string, @Query() query: CursorPaginationQueryDto) { return this.catalog.contentItems(user.id, resource, id, query); }

  @Get('library')
  @ApiOperation({ summary: 'List the student active library across grades' })
  library(@CurrentUser() user: RequestUser) {
    return this.catalog.library(user.id);
  }

  @Get('entitlements')
  @ApiOperation({
    summary: 'List the authenticated student active entitlements',
  })
  entitlements(
    @CurrentUser() user: RequestUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.catalog.entitlements(user.id, query);
  }
}
