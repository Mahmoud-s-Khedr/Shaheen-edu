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
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { QuerySectionDto } from './dto/query-section.dto';
import { ReorderSectionDto } from './dto/reorder-section.dto';
import { MoveSectionDto } from './dto/move-section.dto';
import { UpdateAccessTypeDto } from '../../common/dto/update-access-type.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors.decorator';
import {
  SectionSummaryDto,
  PaginatedSectionResponseDto,
} from '../../common/dto/api-response.dto';

@ApiTags('admin/sections')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller({ path: 'admin/sections', version: '1' })
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a section' })
  @ApiCreatedResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateSectionDto) {
    return this.sectionsService.create(actor, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List sections',
    description:
      'Returns sections ordered by sortOrder using offset pagination.',
  })
  @ApiOkResponse({ type: PaginatedSectionResponseDto })
  @ApiStandardErrors(400, 401, 403)
  list(@CurrentUser() actor: RequestUser, @Query() query: QuerySectionDto) {
    return this.sectionsService.list(actor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a section by ID' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(401, 403, 404)
  getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.sectionsService.getById(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a section' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.sectionsService.update(actor, id, dto);
  }

  @Patch(':id/access')
  updateAccess(@CurrentUser() actor: RequestUser, @Param('id') id: string, @Body() dto: UpdateAccessTypeDto) {
    return this.sectionsService.updateAccess(actor, id, dto.accessType);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Atomically reorder sections within a lesson' })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  reorder(@CurrentUser() actor: RequestUser, @Body() dto: ReorderSectionDto) {
    return this.sectionsService.reorder(actor, dto);
  }

  @Post(':id/move')
  @ApiOperation({ summary: 'Move a section to a different lesson' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(400, 401, 403, 404, 409)
  move(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: MoveSectionDto,
  ) {
    return this.sectionsService.move(actor, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a section' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  publish(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.sectionsService.publish(actor, id);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a section' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  archive(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.sectionsService.archive(actor, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived section' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiStandardErrors(401, 403, 404, 409)
  restore(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.sectionsService.restore(actor, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft section' })
  @ApiStandardErrors(401, 403, 404, 409)
  delete(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,  ) {
    return this.sectionsService.delete(actor, id);
  }
}
