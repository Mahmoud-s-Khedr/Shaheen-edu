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
import { AcademicGradesService } from './academic-grades.service';
import { CreateAcademicGradeDto } from './dto/create-academic-grade.dto';
import { UpdateAcademicGradeDto } from './dto/update-academic-grade.dto';
import { QueryAcademicGradeDto } from './dto/query-academic-grade.dto';
import { ReorderAcademicGradeDto } from './dto/reorder-academic-grade.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  AcademicGradeSummaryDto,
  PaginatedAcademicGradeResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/academic-grades')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/academic-grades', version: '1' })
export class AcademicGradesController {
  constructor(private readonly academicGradesService: AcademicGradesService) {}

  @Post()
  @ApiOperation({ summary: 'Create an academic grade' })
  @ApiCreatedResponse({ type: AcademicGradeSummaryDto })
  @ApiStandardErrors(400, 401, 403, 409)
  create(
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateAcademicGradeDto,
  ) {
    return this.academicGradesService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List academic grades',
    description:
      'Returns academic grades ordered by sortOrder using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedAcademicGradeResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(
    @CurrentUser() actor: RequestUser,
    @Query() query: QueryAcademicGradeDto,
  ) {
    return this.academicGradesService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an academic grade by ID' })
  @ApiOkResponse({ type: AcademicGradeSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.academicGradesService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an academic grade' })
  @ApiOkResponse({ type: AcademicGradeSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicGradeDto,
  ) {
    return this.academicGradesService.update(actor, id, dto);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder academic grades' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(
    @CurrentUser() actor: RequestUser,
    @Body() dto: ReorderAcademicGradeDto,
  ) {
    return this.academicGradesService.reorder(actor, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish an academic grade' })
  @ApiOkResponse({ type: AcademicGradeSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.academicGradesService.publish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive an academic grade' })
  @ApiOkResponse({ type: AcademicGradeSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.academicGradesService.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived academic grade' })
  @ApiOkResponse({ type: AcademicGradeSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  restore(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.academicGradesService.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft academic grade' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.academicGradesService.delete(actor, id);
  }
}
