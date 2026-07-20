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
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { QueryLessonDto } from './dto/query-lesson.dto';
import { ReorderLessonDto } from './dto/reorder-lesson.dto';
import { MoveLessonDto } from './dto/move-lesson.dto';
import { UpdateAccessTypeDto } from '../../common/dto/update-access-type.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  LessonSummaryDto,
  PaginatedLessonResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/lessons')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/lessons', version: '1' })
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a lesson' })
  @ApiCreatedResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateLessonDto) {
    return this.lessonsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List lessons',
    description:
      'Returns lessons ordered by sortOrder using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedLessonResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(@CurrentUser() actor: RequestUser, @Query() query: QueryLessonDto) {
    return this.lessonsService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lesson by ID' })
  @ApiOkResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.lessonsService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a lesson' })
  @ApiOkResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.lessonsService.update(actor, id, dto);
  }

  @Patch(':id/access')
  updateAccess(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateAccessTypeDto) {
    return this.lessonsService.updateAccess(actor, id, dto.accessType);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder lessons within a chapter' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(@CurrentUser() actor: RequestUser, @Body() dto: ReorderLessonDto) {
    return this.lessonsService.reorder(actor, dto);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a lesson to a different chapter' })
  @ApiOkResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  move(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: MoveLessonDto,
  ) {
    return this.lessonsService.move(actor, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a lesson' })
  @ApiOkResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.lessonsService.publish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a lesson' })
  @ApiOkResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.lessonsService.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived lesson' })
  @ApiOkResponse({ type: LessonSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  restore(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.lessonsService.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft lesson' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.lessonsService.delete(actor, id);
  }
}
