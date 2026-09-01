import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalStudentAuthGuard } from '../../common/guards/optional-student-auth.guard';
import { SearchCursorPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';
import { CatalogService } from './catalog.service';
import { CatalogCoursesQueryDto } from './dto/catalog-courses-query.dto';
import { CatalogSubjectsQueryDto } from './dto/catalog-subjects-query.dto';

@ApiTags('catalog')
@Public()
@UseGuards(OptionalStudentAuthGuard)
@ApiBearerAuth()
@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('subjects')
  @ApiOperation({ summary: 'List published catalog subjects' })
  subjects(@Query() query: CatalogSubjectsQueryDto) {
    return this.catalog.subjects(query);
  }

  @Get('courses')
  @ApiOperation({ summary: 'List published catalog courses' })
  courses(@Query() query: CatalogCoursesQueryDto) {
    return this.catalog.courses(query);
  }

  @Get('courses/:id')
  @ApiOperation({ summary: 'Get published catalog course details' })
  course(@Param('id') id: string) {
    return this.catalog.course(id);
  }

  @Get('courses/:id/chapters')
  @ApiOperation({ summary: 'List published course chapters' })
  chapters(
    @Param('id') id: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.chapters(id, query);
  }

  @Get('chapters/:id/lessons')
  @ApiOperation({ summary: 'List published chapter lessons' })
  lessons(
    @Param('id') id: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.lessons(id, query);
  }

  @Get('lessons/:id/sections')
  @ApiOperation({ summary: 'List published lesson sections' })
  sections(
    @Param('id') id: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.sections(id, query);
  }

  @Get(':resource/:id/content-items')
  @ApiOperation({
    summary:
      'List published content previews directly placed on a hierarchy node',
  })
  contentItems(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Query() query: SearchCursorPaginationQueryDto,
  ) {
    return this.catalog.contentItems(resource, id, query);
  }
}
