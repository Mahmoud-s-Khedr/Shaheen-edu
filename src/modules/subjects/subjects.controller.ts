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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';
import { ReorderSubjectDto } from './dto/reorder-subject.dto';
import { MoveSubjectDto } from './dto/move-subject.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  SubjectSummaryDto,
  PaginatedSubjectResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/subjects')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/subjects', version: '1' })
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a subject' })
  @ApiCreatedResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List subjects',
    description:
      'Returns subjects ordered by sortOrder using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedSubjectResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(@CurrentUser() actor: RequestUser, @Query() query: QuerySubjectDto) {
    return this.subjectsService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subject by ID' })
  @ApiOkResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.subjectsService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subject' })
  @ApiOkResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.subjectsService.update(actor, id, dto);
  }

  @Post('reorder')
  @ApiOperation({
    summary: 'Atomically reorder subjects within an academic grade',
  })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(@CurrentUser() actor: RequestUser, @Body() dto: ReorderSubjectDto) {
    return this.subjectsService.reorder(actor, dto);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a subject to a different academic grade' })
  @ApiOkResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  move(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: MoveSubjectDto,
  ) {
    return this.subjectsService.move(actor, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a subject' })
  @ApiOkResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.subjectsService.publish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a subject' })
  @ApiOkResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.subjectsService.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived subject' })
  @ApiOkResponse({ type: SubjectSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  restore(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.subjectsService.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft subject' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.subjectsService.delete(actor, id);
  }
}
