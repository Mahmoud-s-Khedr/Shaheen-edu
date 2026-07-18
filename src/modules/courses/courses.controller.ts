import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/types/roles.enum';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCourseDto } from './dto/query-course.dto';
import { ReorderCourseDto } from './dto/reorder-course.dto';
import { MoveCourseDto } from './dto/move-course.dto';
import { VersionOnlyDto } from '../../common/dto/version-only.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  CourseSummaryDto,
  PaginatedCourseResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/courses')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/courses', version: '1' })
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a course' })
  @ApiCreatedResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List courses',
    description:
      'Returns courses ordered by sortOrder using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedCourseResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(@CurrentUser() actor: RequestUser, @Query() query: QueryCourseDto) {
    return this.coursesService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a course by ID' })
  @ApiOkResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.coursesService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a course' })
  @ApiOkResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(actor, id, dto);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder courses within a subject' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(@CurrentUser() actor: RequestUser, @Body() dto: ReorderCourseDto) {
    return this.coursesService.reorder(actor, dto);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a course to a different subject' })
  @ApiOkResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  move(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: MoveCourseDto,
  ) {
    return this.coursesService.move(actor, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a course' })
  @ApiOkResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.coursesService.publish(actor, id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a course' })
  @ApiOkResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.coursesService.archive(actor, id, dto);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived course' })
  @ApiOkResponse({ type: CourseSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  restore(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.coursesService.restore(actor, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft course' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: VersionOnlyDto,
  ) {
    return this.coursesService.delete(actor, id, dto);
  }
}
