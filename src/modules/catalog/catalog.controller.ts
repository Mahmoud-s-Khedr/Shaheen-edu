import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalStudentAuthGuard } from '../../common/guards/optional-student-auth.guard';
import type { RequestWithUser } from '../../common/types/request-with-user.types';
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

  @Get('courses/:id/outline')
  @ApiOperation({ summary: 'Get a published course outline with access locks' })
  outline(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.catalog.outline(
      id,
      request.user?.role === 'STUDENT' ? request.user.id : undefined,
    );
  }
}
